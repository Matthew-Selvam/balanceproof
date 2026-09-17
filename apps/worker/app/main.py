"""BalanceProof parsing worker (FastAPI).

Security posture
----------------
* **Path confinement.** The legacy ``/parse`` endpoint accepts a path because the
  web app and worker share a volume. That path is resolved and verified to sit
  inside ``STORAGE_DIR`` before pdfplumber ever opens it, which closes the
  arbitrary-file-read hole (``/parse {"path": "/etc/passwd"}``).
* **PDF magic bytes.** A file named ``*.pdf`` is not necessarily a PDF; the first
  bytes must be ``%PDF-``.
* **API key.** When ``WORKER_API_KEY`` is set, every route except ``/healthz``
  requires a matching ``X-API-Key`` header. The worker is not meant to be
  internet-facing; this is defence in depth behind the web app.
* **No path from the client in the async API.** ``POST /jobs`` takes the file
  bytes directly and never persists a client-chosen filename.

Job model
---------
Jobs are held in memory. This is deliberate for the current single-container
deploy and is called out in the README; swapping in Redis or a Postgres-backed
queue changes :class:`JobStore` only.
"""

from __future__ import annotations

import os
import secrets
import threading
import time
import uuid
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from . import export as exporters
from .banks import REGISTRY
from .pipeline import parse_bytes, parse_statement

MAX_BYTES = 25 * 1024 * 1024
PDF_MAGIC = b"%PDF-"
JOB_TTL_SECONDS = 60 * 60 * 6
STORAGE_DIR = Path(os.environ.get("STORAGE_DIR", "/data/uploads")).resolve()
WORKER_API_KEY = os.environ.get("WORKER_API_KEY", "").strip()

app = FastAPI(title="BalanceProof worker", version="0.2.0")


# ---------------------------------------------------------------------------
# auth + guards
# ---------------------------------------------------------------------------

def require_key(x_api_key: str | None) -> None:
    if not WORKER_API_KEY:
        return
    if not x_api_key or not secrets.compare_digest(x_api_key, WORKER_API_KEY):
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


def confine_path(raw: str) -> Path:
    """Resolve ``raw`` and refuse anything outside STORAGE_DIR.

    ``Path.resolve()`` collapses ``..`` and follows symlinks, so a symlink
    inside the upload directory pointing at ``/etc`` is rejected too.
    """
    if not raw or "\x00" in raw:
        raise HTTPException(status_code=400, detail="Invalid path")
    candidate = Path(raw)
    if not candidate.is_absolute():
        candidate = STORAGE_DIR / candidate
    resolved = candidate.resolve()
    try:
        resolved.relative_to(STORAGE_DIR)
    except ValueError:
        raise HTTPException(status_code=403, detail="Path is outside the storage directory")
    if not resolved.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return resolved


def assert_is_pdf_bytes(data: bytes) -> None:
    if len(data) < 5 or not data.startswith(PDF_MAGIC):
        raise HTTPException(status_code=415, detail="File is not a PDF (bad magic bytes)")


# ---------------------------------------------------------------------------
# job store
# ---------------------------------------------------------------------------

class JobStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._jobs: dict[str, dict] = {}

    def create(self, filename: str) -> str:
        job_id = uuid.uuid4().hex
        with self._lock:
            self._jobs[job_id] = {
                "id": job_id,
                "filename": filename,
                "status": "queued",
                "created_at": time.time(),
                "result": None,
                "error": None,
                "stage": "queued",
            }
        self._evict()
        return job_id

    def update(self, job_id: str, **fields) -> None:
        with self._lock:
            if job_id in self._jobs:
                self._jobs[job_id].update(fields)

    def get(self, job_id: str) -> dict | None:
        with self._lock:
            job = self._jobs.get(job_id)
            return dict(job) if job else None

    def _evict(self) -> None:
        cutoff = time.time() - JOB_TTL_SECONDS
        with self._lock:
            stale = [k for k, v in self._jobs.items() if v["created_at"] < cutoff]
            for key in stale:
                self._jobs.pop(key, None)


jobs = JobStore()


def run_job(job_id: str, data: bytes, filename: str) -> None:
    jobs.update(job_id, status="running", stage="extracting")
    try:
        jobs.update(job_id, stage="parsing")
        result = parse_bytes(data, filename)
        jobs.update(job_id, status="done", stage="done", result=result)
    except ValueError as exc:
        jobs.update(job_id, status="error", stage="failed", error=str(exc))
    except Exception as exc:  # pragma: no cover - defensive
        jobs.update(job_id, status="error", stage="failed", error=f"Internal parse error: {exc}")


# ---------------------------------------------------------------------------
# routes
# ---------------------------------------------------------------------------

class ParseRequest(BaseModel):
    path: str
    filename: str | None = None


class ExportRequest(BaseModel):
    format: str = Field(default="csv")
    result: dict


class ExportRow(BaseModel):
    date: str = ""
    description: str = ""
    amount: float = 0.0
    balance: float | None = None
    flags: list[str] = Field(default_factory=list)
    page: int | None = None


@app.get("/healthz")
def healthz():
    return {
        "ok": True,
        "version": app.version,
        "banks": len(REGISTRY),
        "auth": bool(WORKER_API_KEY),
        "storage": str(STORAGE_DIR),
    }


@app.get("/banks")
def list_banks(x_api_key: str | None = Header(default=None)):
    require_key(x_api_key)
    return {
        "ok": True,
        "banks": [
            {
                "id": spec.id,
                "name": spec.name,
                "layout": spec.layout,
                "country": spec.country,
                "kind": spec.kind,
            }
            for spec in REGISTRY
        ],
    }


@app.post("/parse")
def parse(request: ParseRequest, x_api_key: str | None = Header(default=None)):
    """Legacy synchronous parse of a file already inside STORAGE_DIR."""
    require_key(x_api_key)
    resolved = confine_path(request.path)
    head = resolved.open("rb").read(5)
    if not head.startswith(PDF_MAGIC):
        raise HTTPException(status_code=415, detail="File is not a PDF (bad magic bytes)")
    try:
        result = parse_statement(str(resolved), request.filename or resolved.name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {"ok": True, **result}


@app.post("/jobs", status_code=202)
async def create_job(
    background: BackgroundTasks,
    file: UploadFile = File(...),
    x_api_key: str | None = Header(default=None),
):
    require_key(x_api_key)
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 25MB limit")
    assert_is_pdf_bytes(data)
    filename = (file.filename or "statement.pdf")[:200]
    job_id = jobs.create(filename)
    background.add_task(run_job, job_id, data, filename)
    return {"ok": True, "jobId": job_id, "status": "queued"}


@app.get("/jobs/{job_id}")
def get_job(job_id: str, x_api_key: str | None = Header(default=None)):
    require_key(x_api_key)
    job = jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "ok": job["status"] != "error",
        "jobId": job["id"],
        "status": job["status"],
        "stage": job["stage"],
        "filename": job["filename"],
        "result": job["result"],
        "error": job["error"],
    }


@app.post("/preview")
async def preview(
    file: UploadFile = File(...),
    pages: int = Form(default=2),
    x_api_key: str | None = Header(default=None),
):
    """Parse the first N pages only, for the free preview tier."""
    require_key(x_api_key)
    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds 25MB limit")
    assert_is_pdf_bytes(data)
    try:
        result = parse_bytes(data, file.filename or "preview.pdf")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    limit = max(1, min(pages, 10))
    result["transactions"] = [
        t for t in result["transactions"] if (t.get("page") or 1) <= limit
    ]
    result["preview"] = {"pages": limit, "truncated": True}
    result["summary"]["count"] = len(result["transactions"])
    result["summary"]["total"] = round(sum(t["amount"] for t in result["transactions"]), 2)
    return {"ok": True, **result}


@app.post("/export")
def export(payload: ExportRequest, x_api_key: str | None = Header(default=None)):
    """Render an already-parsed result into a download format."""
    require_key(x_api_key)
    fmt = (payload.format or "csv").lower()
    if fmt not in exporters.EXPORT_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format '{fmt}'. Use one of: {', '.join(exporters.EXPORT_FORMATS)}",
        )
    result = payload.result or {}
    transactions = result.get("transactions") or []
    summary = result.get("summary") or {}
    findings = result.get("findings") or []
    bank = result.get("bank") or {}
    bank_id = bank.get("id") if isinstance(bank, dict) else str(bank)
    balances = result.get("balances") or {}
    period = result.get("period") or {}

    if fmt == "json":
        return JSONResponse(transactions)
    if fmt == "csv":
        body: bytes | str = exporters.to_csv(transactions)
    elif fmt == "qbo":
        body = exporters.to_qbo(transactions)
    elif fmt == "ofx":
        body = exporters.to_ofx(
            transactions,
            bank_id=bank_id or "GENERIC",
            currency="USD",
            opening=balances.get("opening"),
            closing=balances.get("closing"),
            start=(period or {}).get("start"),
            end=(period or {}).get("end"),
        )
    elif fmt == "xlsx":
        body = exporters.to_xlsx(
            transactions,
            summary={**summary, "bank": bank.get("name") if isinstance(bank, dict) else bank},
            findings=findings,
        )
    else:  # pragma: no cover - guarded above
        raise HTTPException(status_code=400, detail="Unsupported format")

    filename = f"statement.{fmt}"
    return Response(
        content=body,
        media_type=exporters.CONTENT_TYPES[fmt],
        headers={
            "content-disposition": f'attachment; filename="{filename}"',
            "cache-control": "no-store",
        },
    )

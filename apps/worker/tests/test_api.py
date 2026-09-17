"""Worker HTTP API tests.

These cover the security boundary rather than parsing: path confinement, PDF
magic-byte checks, API-key enforcement and the export surface.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient

from app import main as worker_main
from tests.fixtures import build_chase_style, build_generic_style


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(worker_main, "STORAGE_DIR", tmp_path.resolve())
    monkeypatch.setattr(worker_main, "WORKER_API_KEY", "")
    with TestClient(worker_main.app) as c:
        yield c


@pytest.fixture()
def secured_client(tmp_path, monkeypatch):
    monkeypatch.setattr(worker_main, "STORAGE_DIR", tmp_path.resolve())
    monkeypatch.setattr(worker_main, "WORKER_API_KEY", "s3cret")
    with TestClient(worker_main.app) as c:
        yield c


def test_healthz_is_open_and_reports_bank_count(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["banks"] >= 25


def test_jobs_endpoint_parses_uploaded_pdf(client, tmp_path):
    r = client.post(
        "/jobs",
        files={"file": ("chase.pdf", build_chase_style(), "application/pdf")},
    )
    assert r.status_code == 202
    job_id = r.json()["jobId"]

    job = client.get(f"/jobs/{job_id}").json()
    assert job["status"] == "done"
    assert job["result"]["summary"]["reconciled"] is True
    assert job["result"]["summary"]["count"] == 5


def test_path_confinement_blocks_traversal(client, tmp_path):
    """The legacy /parse route must not become an arbitrary file reader."""
    (tmp_path / "ok.pdf").write_bytes(build_chase_style())
    for hostile in (
        "/etc/passwd",
        "../../../../etc/passwd",
        str(tmp_path / ".." / ".." / "etc" / "passwd"),
        "/etc/passwd\x00.pdf",
    ):
        r = client.post("/parse", json={"path": hostile})
        assert r.status_code in (400, 403, 404), (hostile, r.status_code)


def test_path_confinement_blocks_symlink_escape(client, tmp_path):
    outside = tmp_path.parent / "outside-secret.pdf"
    outside.write_bytes(build_chase_style())
    link = tmp_path / "sneaky.pdf"
    link.symlink_to(outside)
    try:
        r = client.post("/parse", json={"path": str(link)})
        assert r.status_code == 403
    finally:
        link.unlink(missing_ok=True)
        outside.unlink(missing_ok=True)


def test_path_confinement_allows_legitimate_upload(client, tmp_path):
    target = tmp_path / "legit.pdf"
    target.write_bytes(build_chase_style())
    r = client.post("/parse", json={"path": str(target), "filename": "legit.pdf"})
    assert r.status_code == 200
    assert r.json()["summary"]["reconciled"] is True


def test_non_pdf_bytes_are_rejected_by_magic_bytes(client):
    r = client.post("/jobs", files={"file": ("evil.pdf", b"#!/bin/sh\nrm -rf /\n", "application/pdf")})
    assert r.status_code == 415


def test_jobs_rejects_oversized_upload(client, monkeypatch):
    monkeypatch.setattr(worker_main, "MAX_BYTES", 1024)
    r = client.post("/jobs", files={"file": ("big.pdf", build_chase_style(), "application/pdf")})
    assert r.status_code == 413


def test_unknown_job_is_404(client):
    assert client.get("/jobs/nope").status_code == 404


def test_scan_error_surfaces_as_job_error(client):
    from tests.fixtures import build_textless

    r = client.post("/jobs", files={"file": ("scan.pdf", build_textless(), "application/pdf")})
    job = client.get(f"/jobs/{r.json()['jobId']}").json()
    assert job["status"] == "error"
    assert "scan" in (job["error"] or "").lower()


def test_api_key_is_enforced_when_configured(secured_client):
    assert secured_client.get("/banks").status_code == 401
    assert secured_client.post("/parse", json={"path": "x.pdf"}).status_code == 401
    ok = secured_client.get("/banks", headers={"X-API-Key": "s3cret"})
    assert ok.status_code == 200
    assert len(ok.json()["banks"]) >= 25


def test_healthz_stays_open_with_api_key_set(secured_client):
    assert secured_client.get("/healthz").status_code == 200


def test_wrong_api_key_is_rejected(secured_client):
    assert secured_client.get("/banks", headers={"X-API-Key": "nope"}).status_code == 401


def test_banks_endpoint_lists_metadata(client):
    banks = client.get("/banks").json()["banks"]
    ids = {b["id"] for b in banks}
    assert {"chase", "wells_fargo", "monzo", "hdfc"} <= ids
    assert all({"id", "name", "layout", "country", "kind"} <= set(b) for b in banks)


def test_export_endpoint_renders_every_format(client):
    parsed = client.post(
        "/jobs", files={"file": ("g.pdf", build_generic_style(), "application/pdf")}
    )
    result = client.get(f"/jobs/{parsed.json()['jobId']}").json()["result"]

    expectations = {
        "csv": ("text/csv", b"Date,Description"),
        "qbo": ("text/csv", b"Transaction Type"),
        "ofx": ("application/x-ofx", b"OFXHEADER"),
        "xlsx": ("spreadsheetml", b"PK"),
    }
    for fmt, (ctype, needle) in expectations.items():
        r = client.post("/export", json={"format": fmt, "result": result})
        assert r.status_code == 200, fmt
        assert ctype in r.headers["content-type"], fmt
        assert needle in r.content, fmt
        assert "attachment" in r.headers["content-disposition"]

    r = client.post("/export", json={"format": "json", "result": result})
    assert isinstance(r.json(), list) and len(r.json()) == 5


def test_export_rejects_unknown_format_with_helpful_error(client):
    r = client.post("/export", json={"format": "pdf", "result": {"transactions": []}})
    assert r.status_code == 400
    assert "Unsupported format" in r.json()["detail"]
    assert "csv" in r.json()["detail"]


def test_export_handles_empty_result(client):
    r = client.post("/export", json={"format": "csv", "result": {}})
    assert r.status_code == 200
    assert r.text.strip() == "Date,Description,Amount,Balance,Flags"


def test_preview_limits_to_requested_pages(client):
    r = client.post(
        "/preview",
        files={"file": ("c.pdf", build_chase_style(), "application/pdf")},
        data={"pages": "1"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["preview"]["truncated"] is True
    assert body["summary"]["count"] == len(body["transactions"])


def test_cors_absent_by_default_is_not_a_regression(client):
    """No permissive CORS header should appear unless explicitly configured."""
    r = client.get("/healthz", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in {k.lower() for k in r.headers}

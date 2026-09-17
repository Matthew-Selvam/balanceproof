"""Pipeline: PDF path -> validated parse result.

Two entry points:

* :func:`parse_statement` — the original synchronous API used by the web upload
  route. Returns the full ``ParseResult`` payload.
* :func:`parse_bytes` — parses from an in-memory upload, which is how the
  hardened worker consumes jobs without ever touching a path the caller chose.

Bank selection is a two-step: keyword ranking picks the institution, and the
institution's layout extracts rows. Row counts are compared against a couple of
alternative layouts and the winner is recorded in ``limitations`` when the
chosen layout looks thin — that is the observable signal that a layout is
drifting.
"""

from __future__ import annotations

import time

from . import extract
from .banks import GENERIC, candidates, parse_with, resolve
from .models import BankMatch, ParseResult
from .validate import validate_transactions

# If the chosen layout yields fewer than this fraction of the best alternative
# layout's row count, say so out loud rather than silently returning thin data.
LAYOUT_AGREEMENT = 0.85


def _run(pages: list[dict], meta: dict, bank_id: str):
    return parse_with(bank_id, pages, meta)


def parse_pages_to_result(
    pages: list[dict],
    meta: dict,
    *,
    filename: str,
    full_text: str,
    bank_match: BankMatch | None = None,
    parse_ms: int = 0,
) -> ParseResult:
    ranked = candidates(full_text, limit=3)
    chosen: BankMatch
    if bank_match is not None:
        chosen = bank_match
    else:
        chosen = ranked[0] if ranked else BankMatch(id=GENERIC.id, name=GENERIC.name)

    limitations: list[str] = []
    txns = _run(pages, meta, chosen.id)
    spec = resolve(chosen.id)

    if not txns:
        # Chosen layout produced nothing; fall back to generic before giving up.
        if chosen.id != GENERIC.id:
            limitations.append(
                f"The {spec.name} layout matched no rows; results below came from the "
                "generic fallback parser."
            )
            chosen = BankMatch(
                id=GENERIC.id, name=GENERIC.name, confidence=0.0,
                matched_on=chosen.matched_on,
            )
            txns = _run(pages, meta, GENERIC.id)
    else:
        # Layout sanity: does an alternative strategy agree on row count?
        alt_ids = [b.id for b in ranked if b.id != chosen.id][:2]
        if spec.layout != "two_dates":
            alt_ids.append("chase")
        for alt_id in alt_ids:
            if alt_id == chosen.id:
                continue
            try:
                alt = _run(pages, meta, alt_id)
            except Exception:
                continue
            if alt and len(txns) < len(alt) * LAYOUT_AGREEMENT:
                limitations.append(
                    f"Layout '{spec.layout}' found {len(txns)} rows but an alternative "
                    f"layout found {len(alt)}. Row coverage may be incomplete."
                )
                break

    if chosen.id == GENERIC.id and "Generic parsed this statement" not in limitations:
        limitations.append(
            "No bank-specific layout matched, so column detection is heuristic and "
            "confidence is reduced."
        )

    period = meta.get("period")
    if isinstance(period, dict):
        period = {k: v for k, v in period.items() if v}

    report = validate_transactions(txns, meta)
    summary = report.summary
    summary.pages = len(pages)
    summary.bank = chosen.name

    return ParseResult(
        filename=filename,
        pages=len(pages),
        bank=chosen,
        period=period or None,
        balances={"opening": meta.get("opening"), "closing": meta.get("closing")},
        transactions=report.transactions,
        findings=report.findings,
        summary=summary,
        parse_ms=parse_ms,
        limitations=limitations,
    )


def parse_bytes(data: bytes, filename: str) -> dict:
    """Parse an in-memory PDF. Used by the async job API.

    The caller never supplies a filesystem path, so there is no path to escape.
    """
    import io

    import pdfplumber

    started = time.perf_counter()
    pages: list[dict] = []
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        if len(pdf.pages) > 200:
            raise ValueError(
                f"Statement has {len(pdf.pages)} pages; the limit is 200."
            )
        if len(pdf.pages) == 0:
            raise ValueError("PDF contains no pages.")
        for index, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            try:
                tables = page.extract_tables() or []
            except Exception:
                tables = []
            pages.append({"page": index + 1, "text": text, "tables": tables})

    if not any(p.get("text", "").strip() for p in pages):
        salvaged = False
        for p in pages:
            flat = "\n".join(
                " ".join(cell or "" for cell in row)
                for table in p["tables"]
                for row in table
            )
            if flat.strip():
                p["text"] = flat
                salvaged = True
        if not salvaged:
            raise ValueError(extract.SCAN_WARNING)

    full_text = "\n".join(p.get("text") or "" for p in pages)
    meta = extract.extract_meta(full_text)
    result = parse_pages_to_result(
        pages,
        meta,
        filename=filename,
        full_text=full_text,
        parse_ms=int((time.perf_counter() - started) * 1000),
    )
    return result.model_dump()


def parse_statement(path: str, filename: str) -> dict:
    """Synchronous parse of an on-disk PDF. Returns a JSON-ready dict."""
    started = time.perf_counter()
    pages = extract.extract_pdf(path)
    full_text = "\n".join(p.get("text") or "" for p in pages)
    meta = extract.extract_meta(full_text)
    result = parse_pages_to_result(
        pages,
        meta,
        filename=filename,
        full_text=full_text,
        parse_ms=int((time.perf_counter() - started) * 1000),
    )
    return result.model_dump()

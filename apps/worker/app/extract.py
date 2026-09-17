"""PDF text + metadata extraction.

pdfplumber gives us two useful views of a statement: ``extract_text()`` for
line-oriented parsing and ``extract_tables()`` for statements drawn as ruled
tables. Bank parsers may use either. ``extract_pdf`` returns per-page dicts
carrying both, plus word boxes for parsers that need column geometry.
"""

from __future__ import annotations

import re
from datetime import date

import pdfplumber

MONEY_RE = re.compile(r"\(?-?\+?\$?[\d,]+\.\d{2}\)?")
# A money token that may also carry a trailing credit/debit marker.
MONEY_MARKED_RE = re.compile(r"\(?-?\+?\$?[\d,]+\.\d{2}\)?\s*(?:CR|DR)?$", re.I)

OPENING_RE = re.compile(
    r"(?i)(?:beginning|opening|previous|starting|prior)\s+balance[^0-9\n]{0,24}?"
    r"(\$?\s*\(?-?[\d,]+\.\d{2}\)?)"
)
CLOSING_RE = re.compile(
    r"(?i)(?:ending|closing|new|final|current)\s+balance[^0-9\n]{0,24}?"
    r"(\$?\s*\(?-?[\d,]+\.\d{2}\)?)"
)
PERIOD_RE = re.compile(
    r"(?i)(?:statement|account|billing)\s+(?:period|cycle)[:\s]+"
    r"([A-Za-z]{3,9}\s+\d{1,2},?\s*\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})"
    r"\s*(?:to|through|thru|-|\u2013|\u2014)\s*"
    r"([A-Za-z]{3,9}\s+\d{1,2},?\s*\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})"
)
# Looser fallback: "From January 1, 2026 to January 31, 2026"
PERIOD_ALT_RE = re.compile(
    r"(?i)(?:from|between)\s+([A-Za-z]{3,9}\s+\d{1,2},?\s*\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})"
    r"\s*(?:to|through|thru|-|\u2013|\u2014|and)\s*"
    r"([A-Za-z]{3,9}\s+\d{1,2},?\s*\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})"
)
ACCOUNT_RE = re.compile(r"(?i)account\s*(?:number|no\.?|#)?\s*[:#]?\s*([Xx*\u2022\d][Xx*\u2022\d\- ]{3,24})")

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

# Text on a page that produces no transactions but looks like a scan.
SCAN_WARNING = "No extractable text found (scanned PDF?). OCR is not supported yet."


def money_to_float(raw: str | None) -> float | None:
    """Parse a statement money token.

    Handles ``1,234.56``, ``$1,234.56``, ``(25.00)`` (negative), ``-10.00``,
    ``+482.56`` (explicit credit) and a trailing ``CR``/``DR`` marker.
    """
    if raw is None:
        return None
    s = raw.strip().replace("$", "").replace(",", "").replace(" ", "")
    marker = ""
    match = re.search(r"(?i)(cr|dr)$", s)
    if match:
        marker = match.group(1).lower()
        s = s[: match.start()]
    negative = marker == "dr"
    if s.startswith("(") and s.endswith(")"):
        negative = True
        s = s[1:-1]
    if s.startswith("-"):
        negative = True
        s = s[1:]
    elif s.startswith("+"):
        s = s[1:]
    # Money in a statement is either a whole number or has exactly two decimals.
    # Anything else ("12.345", "1.2.3") is a parse artefact, not a value.
    if not re.fullmatch(r"\d+(?:\.\d{2})?", s):
        return None
    value = float(s)
    return -value if negative else value


def extract_pdf(path: str, max_pages: int = 200) -> list[dict]:
    pages: list[dict] = []
    with pdfplumber.open(path) as pdf:
        if len(pdf.pages) > max_pages:
            raise ValueError(
                f"Statement has {len(pdf.pages)} pages; the limit is {max_pages}. "
                "Split the file or upgrade for batch processing."
            )
        for index, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            tables: list[list[list[str | None]]] = []
            try:
                tables = page.extract_tables() or []
            except Exception:  # pragma: no cover - pdfplumber edge cases
                tables = []
            pages.append({"page": index + 1, "text": text, "tables": tables,
                          "width": page.width, "height": page.height})
    if not any(p["text"].strip() for p in pages):
        # Keep any table text as a last resort before giving up.
        salvaged = []
        for p in pages:
            flat = "\n".join(
                " ".join(cell or "" for cell in row) for table in p["tables"] for row in table
            )
            salvaged.append(flat)
        if not any(s.strip() for s in salvaged):
            raise ValueError(SCAN_WARNING)
        for p, flat in zip(pages, salvaged):
            p["text"] = flat
    return pages


def _parse_flexible_date(raw: str) -> str | None:
    """Parse 'January 5, 2026' / 'Jan 5 2026' / '01/05/2026' into ISO."""
    s = raw.strip().replace(",", " ")
    s = re.sub(r"\s+", " ", s)
    m = re.match(r"(?i)([A-Za-z]{3,9})\s+(\d{1,2})\s+(\d{4})", s)
    if m:
        month = MONTHS.get(m.group(1)[:3].lower())
        if month:
            return "{:04d}-{:02d}-{:02d}".format(int(m.group(3)), month, int(m.group(2)))
        return None
    return normalize_date(s, None)


def extract_meta(text: str) -> dict:
    opening = closing = None
    match = OPENING_RE.search(text)
    if match:
        opening = money_to_float(match.group(1))
    match = CLOSING_RE.search(text)
    if match:
        closing = money_to_float(match.group(1))

    period = None
    for regex in (PERIOD_RE, PERIOD_ALT_RE):
        match = regex.search(text)
        if match:
            start = _parse_flexible_date(match.group(1))
            end = _parse_flexible_date(match.group(2))
            if start and end:
                period = {"start": start, "end": end}
                break
            if start or end:
                period = {"start": start, "end": end}
                break

    account = None
    match = ACCOUNT_RE.search(text)
    if match:
        raw = match.group(1).strip()
        # Only accept masked or digit-heavy account refs.
        if re.search(r"\d", raw) and len(re.sub(r"[^0-9Xx*\u2022]", "", raw)) >= 4:
            account = re.sub(r"\s+", "", raw)[:32]

    return {"opening": opening, "closing": closing, "period": period, "account": account}


def normalize_date(raw: str | None, year_hint: int | None) -> str | None:
    if not raw:
        return None
    s = raw.strip()
    m = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", s)
    if m:
        y, mo, d = (int(x) for x in m.groups())
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return "{:04d}-{:02d}-{:02d}".format(y, mo, d)
        return None
    m = re.fullmatch(r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})", s)
    if m:
        a, b, y = m.groups()
        mo, d = int(a), int(b)
        if mo > 12 and d <= 12:
            mo, d = d, mo
        y = int(y)
        if y < 100:
            y += 2000
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return "{:04d}-{:02d}-{:02d}".format(y, mo, d)
        return None
    m = re.fullmatch(r"(\d{1,2})[/-](\d{1,2})", s)
    if m:
        a, b = (int(x) for x in m.groups())
        mo, d = (a, b) if a <= 12 else (b, a)
        y = year_hint or date.today().year
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return "{:04d}-{:02d}-{:02d}".format(y, mo, d)
    return None


def year_from_meta(meta: dict, fallback: int | None = None) -> int:
    """Best-effort year for short dates like '01/05'.

    Prefers the period start so a Dec->Jan statement anchors correctly.
    """
    period = meta.get("period") or {}
    for key in ("start", "end"):
        value = period.get(key)
        if not value:
            continue
        match = re.search(r"(\d{4})", str(value))
        if match:
            return int(match.group(1))
    return fallback or date.today().year


def month_rollover(previous_month: int | None, month: int) -> bool:
    """True when a short date jumps from Dec/Nov back to Jan/Feb."""
    return previous_month is not None and previous_month >= 11 and month <= 2

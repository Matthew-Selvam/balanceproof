import re
from datetime import date

import pdfplumber

MONEY_RE = re.compile(r"\(?-?\$?[\d,]+\.\d{2}\)?")

OPENING_RE = re.compile(
    r"(?i)(?:beginning|opening|previous|starting)\s+balance[^0-9\n]*\$?\s*(\(?-?[\d,]+\.\d{2}\)?)"
)
CLOSING_RE = re.compile(
    r"(?i)(?:ending|closing|new|final)\s+balance[^0-9\n]*\$?\s*(\(?-?[\d,]+\.\d{2}\)?)"
)
PERIOD_RE = re.compile(
    r"(?i)(?:statement|account)\s+(?:period|cycle)[:\s]+"
    r"([A-Za-z]{3,9}\s+\d{1,2},?\s*\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})"
    r"\s*(?:to|through|thru|-|\u2013)\s*"
    r"([A-Za-z]{3,9}\s+\d{1,2},?\s*\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})"
)


def money_to_float(raw):
    if raw is None:
        return None
    s = raw.strip().replace("$", "").replace(",", "").replace(" ", "")
    negative = False
    if s.startswith("(") and s.endswith(")"):
        negative = True
        s = s[1:-1]
    if s.startswith("-"):
        negative = True
        s = s[1:]
    if not s.replace(".", "").isdigit():
        return None
    value = float(s)
    return -value if negative else value


def extract_pdf(path):
    pages = []
    with pdfplumber.open(path) as pdf:
        for index, page in enumerate(pdf.pages):
            pages.append({"page": index + 1, "text": page.extract_text() or ""})
    if not any(p["text"].strip() for p in pages):
        raise ValueError("No extractable text found (scanned PDF?). OCR is not supported yet.")
    return pages


def extract_meta(text):
    match = OPENING_RE.search(text)
    opening = money_to_float(match.group(1)) if match else None
    match = CLOSING_RE.search(text)
    closing = money_to_float(match.group(1)) if match else None
    match = PERIOD_RE.search(text)
    period = {"start": match.group(1), "end": match.group(2)} if match else None
    return {"opening": opening, "closing": closing, "period": period}


def normalize_date(raw, year_hint):
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

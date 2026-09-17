"""Reusable row-extraction layouts.

A *layout* turns the raw page text (or ruled tables) of one statement into
``Txn`` objects. Bank specs in ``registry.py`` pick a layout and supply the
naming/keyword data. Keeping layouts separate from bank identity means adding
bank #21 is a config entry, not a new parser.

Two extraction strategies, tried in order per page:

1. **Table strategy** — ``page["tables"]`` from pdfplumber, used when the
   statement is drawn with ruled columns. A header row is inspected to learn
   which column is the balance and whether debits/credits are split.
2. **Text strategy** — line-oriented regexes over ``page["text"]``.

Every transaction records the page it came from so the UI can point the user
back at the source.
"""

from __future__ import annotations

import re

from ..extract import MONEY_RE, money_to_float, normalize_date, year_from_meta, month_rollover
from ..models import Txn

# ---- date token shapes ------------------------------------------------------
DATE_TOKEN = r"(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|[A-Za-z]{3,9}\s+\d{1,2},?\s*\d{4})"
DATE_RE = re.compile(DATE_TOKEN)
SHORT_RE = re.compile(r"^(\d{1,2})[/-](\d{1,2})$")
ISO_RE = re.compile(r"^(\d{4})-(\d{1,2})-(\d{1,2})$")
LONG_RE = re.compile(r"^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$")

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

# A money token, optionally wrapped in parens (negative) and optionally
# followed by a CR/DR marker.
MONEY_TOKEN = r"\(?-?\$?[\d,]+\.\d{2}\)?(?:\s*(?:CR|DR))?"

# Text that is never a transaction row.
NOISE_RE = re.compile(
    r"(?i)^(?:page\s+\d+|continued|totals?|total\s+(?:credits?|debits?)|"
    r"beginning|ending|opening|closing|balance\s+forward|subtotal)"
)


class LineScanner:
    """Tracks the inferred year across short dates that roll over."""

    def __init__(self, meta: dict):
        self.year = year_from_meta(meta)
        self.previous_month: int | None = None
        self.previous_date: str | None = None

    def to_iso(self, raw: str) -> str | None:
        raw = raw.strip()
        iso = normalize_date(raw, self.year)
        if iso is None:
            m = re.match(r"(?i)([A-Za-z]{3,9})\s+(\d{1,2}),?\s*(\d{4})", raw)
            if m:
                month = MONTHS.get(m.group(1)[:3].lower())
                if month:
                    iso = "{:04d}-{:02d}-{:02d}".format(int(m.group(3)), month, int(m.group(2)))
        if iso is None:
            return None
        month = int(iso[5:7])
        if self.previous_date and month_rollover(self.previous_month, month):
            self.year += 1
            iso = "{:04d}{}".format(self.year, iso[4:])
        self.previous_month = month
        self.previous_date = iso
        return iso


def _money_positions(tokens: list[str]) -> list[int]:
    return [i for i, t in enumerate(tokens) if MONEY_RE.fullmatch(t)]


# ---------------------------------------------------------------------------
# Text strategy
# ---------------------------------------------------------------------------

def parse_text_rows(
    pages: list[dict],
    meta: dict,
    *,
    two_dates: bool = False,
    layout_flags: list[str] | None = None,
    suffix_marker: bool = False,
) -> list[Txn]:
    """Parse line-oriented rows.

    ``two_dates`` handles Chase-style ``MM/DD MM/DD DESC AMOUNT BALANCE``.
    ``suffix_marker`` treats a trailing ``CR``/``DR`` on the amount as a sign
    hint when the amount carries no explicit minus sign.
    """
    scanner = LineScanner(meta)
    flags = list(layout_flags or [])
    txns: list[Txn] = []
    for page in pages:
        for raw_line in (page.get("text") or "").splitlines():
            line = raw_line.strip()
            if not line or NOISE_RE.match(line):
                continue
            date_start = DATE_RE.match(line)
            if not date_start:
                continue
            first_date = date_start.group(0)
            rest = line[date_start.end():].strip()

            if two_dates:
                second = DATE_RE.match(rest)
                if not second:
                    continue
                rest = rest[second.end():].strip()

            iso = scanner.to_iso(first_date)
            if not iso:
                continue

            tokens: list[str] = str(rest).split()
            positions = _money_positions(tokens)
            if not positions:
                continue
            take = positions[-2:]
            amount_token = tokens[take[0]]
            balance_token = tokens[take[-1]] if len(take) == 2 else None
            desc_tokens = tokens[: take[0]]
            if not desc_tokens:
                continue

            amount = money_to_float(amount_token)
            if amount is None:
                continue
            if suffix_marker and amount > 0 and amount_token.upper().rstrip().endswith("DR"):
                amount = -amount

            txns.append(
                Txn(
                    date=iso,
                    description=" ".join(desc_tokens).strip(),
                    amount=amount,
                    balance=money_to_float(balance_token),
                    page=page.get("page"),
                    flags=list(flags),
                )
            )
    return txns


# ---------------------------------------------------------------------------
# Table strategy
# ---------------------------------------------------------------------------

HEADER_DATE = ("date", "trans date", "posted", "post date", "effective")
HEADER_DESC = ("description", "memo", "details", "payee", "transaction")
HEADER_BALANCE = ("balance", "running balance")
HEADER_AMOUNT = ("amount", "transaction amount")
HEADER_DEBIT = ("debit", "withdrawal", "withdrawals", "charges", "payments")
HEADER_CREDIT = ("credit", "deposit", "deposits")


def _classify_header(cells: list[str]) -> dict | None:
    """Map header cell text to column roles. Returns None if not a header."""
    roles: dict[str, int] = {}
    hits = 0
    for i, cell in enumerate(cells):
        text = (cell or "").strip().lower()
        if not text:
            continue
        if any(h in text for h in HEADER_DATE) and "date" not in roles:
            roles["date"] = i
            hits += 1
        elif any(h in text for h in HEADER_BALANCE) and "balance" not in roles:
            roles["balance"] = i
            hits += 1
        elif any(h in text for h in HEADER_DEBIT) and "debit" not in roles:
            roles["debit"] = i
            hits += 1
        elif any(h in text for h in HEADER_CREDIT) and "credit" not in roles:
            roles["credit"] = i
            hits += 1
        elif any(h in text for h in HEADER_AMOUNT) and "amount" not in roles:
            roles["amount"] = i
            hits += 1
        elif any(h in text for h in HEADER_DESC) and "desc" not in roles:
            roles["desc"] = i
            hits += 1
    if hits >= 2 and "date" in roles:
        return roles
    return None


def _cell_money(raw: str | None) -> float | None:
    if raw is None:
        return None
    token = raw.strip()
    if not token or token in {"-", "--", "\u2014"}:
        return None
    match = re.search(MONEY_TOKEN, token)
    if not match:
        return None
    value = money_to_float(match.group(0))
    if value is None:
        return None
    # A bare "(50.00)" in a debit column is a positive magnitude.
    return value


def parse_table_rows(
    pages: list[dict],
    meta: dict,
    *,
    layout_flags: list[str] | None = None,
) -> list[Txn]:
    """Parse ruled tables using header roles learned per table."""
    scanner = LineScanner(meta)
    flags = list(layout_flags or [])
    txns: list[Txn] = []
    for page in pages:
        for table in page.get("tables") or []:
            roles: dict | None = None
            for row in table:
                cells = [c or "" for c in row]
                if roles is None:
                    roles = _classify_header(cells)
                    continue
                if not any(c.strip() for c in cells):
                    continue
                date_cell = cells[roles["date"]] if roles["date"] < len(cells) else ""
                date_match = DATE_RE.search(date_cell or "")
                if not date_match:
                    continue
                iso = scanner.to_iso(date_match.group(0))
                if not iso:
                    continue

                amount = balance = None
                if "amount" in roles and roles["amount"] < len(cells):
                    amount = _cell_money(cells[roles["amount"]])
                if amount is None and ("debit" in roles or "credit" in roles):
                    debit = credit = None
                    if "debit" in roles and roles["debit"] < len(cells):
                        debit = _cell_money(cells[roles["debit"]])
                    if "credit" in roles and roles["credit"] < len(cells):
                        credit = _cell_money(cells[roles["credit"]])
                    if debit:
                        amount = -abs(debit)
                    elif credit:
                        amount = abs(credit)
                if "balance" in roles and roles["balance"] < len(cells):
                    balance = _cell_money(cells[roles["balance"]])
                if amount is None:
                    continue

                desc_cells = [
                    cells[i]
                    for i in range(len(cells))
                    if i != roles.get("date")
                    and i not in (roles.get("balance"), roles.get("amount"),
                                  roles.get("debit"), roles.get("credit"))
                    and (cells[i] or "").strip()
                ]
                description = " ".join(desc_cells).strip() or "(no description)"
                txns.append(
                    Txn(
                        date=iso,
                        description=description,
                        amount=amount,
                        balance=balance,
                        page=page.get("page"),
                        flags=list(flags),
                    )
                )
    return txns


def parse_pages(
    pages: list[dict],
    meta: dict,
    *,
    two_dates: bool = False,
    layout_flags: list[str] | None = None,
    prefer_tables: bool = True,
    suffix_marker: bool = False,
) -> list[Txn]:
    """Run the table strategy and fall back to the text strategy."""
    txns: list[Txn] = []
    if prefer_tables:
        try:
            txns = parse_table_rows(pages, meta, layout_flags=layout_flags)
        except Exception:  # pragma: no cover - pdfplumber table edge cases
            txns = []
    if not txns:
        txns = parse_text_rows(
            pages, meta, two_dates=two_dates, layout_flags=layout_flags,
            suffix_marker=suffix_marker,
        )
    return txns

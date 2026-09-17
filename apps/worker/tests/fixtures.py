"""Synthetic bank-statement PDF fixtures.

Real statements are customer PII and cannot live in a repo, so the suite builds
its own with reportlab. Each fixture exercises a distinct layout:

* ``chase``      — ``MM/DD MM/DD DESC AMOUNT BALANCE`` with a Dec->Jan rollover
* ``generic``    — ``MM/DD DESC AMOUNT BALANCE``, no institution keyword
* ``ruled``      — drawn grid with a real ``extract_tables`` grid
* ``mismatch``   — closing balance deliberately does not reconcile
* ``duplicate``  — two identical consecutive rows with a frozen balance
* ``textless``   — a PDF with no text layer at all
* ``history``    — a longer reconciling run, for history/aggregate tests

Every reconciling fixture is arithmetically closed: the running balance column,
the sum of the amounts, and the printed opening/closing balances all agree
exactly. Fixtures are deterministic so a failure is a regression, not drift.
"""

from __future__ import annotations

import io

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

Rows = list[str]

# Chase: opening 1000.00 -> closing 1247.16
#   -6.40 -21.00 +482.56 -128.00 -80.00 = +247.16
CHASE_ROWS: Rows = [
    "12/26 12/26 STARBUCKS STORE #0421            -6.40     993.60",
    "12/28 12/28 SQ *SQUARE INC                  -21.00     972.60",
    "01/02 01/02 PAYROLL DIRECT DEPOSIT         +482.56   1,455.16",
    "01/05 01/05 WHOLE FOODS MKT #1042          -128.00   1,327.16",
    "01/09 01/09 AUTOPAY TO CARD 4412            -80.00   1,247.16",
]

# Generic: opening 2000.00 -> closing 1846.51
#   -145.20 -46.11 -200.00 +12.82 +225.00 = -153.49
GENERIC_ROWS: Rows = [
    "01/03 HOMEDEPOT #6612 PURCHASE        -145.20     1,854.80",
    "01/07 SHELL OIL 5744                   -46.11     1,808.69",
    "01/12 ATM WITHDRAWAL BRANCH 009      -200.00     1,608.69",
    "01/19 INTEREST PAYMENT                 +12.82     1,621.51",
    "01/26 INSURANCE PREMIUM AUTOPAY       +225.00     1,846.51",
]


def _header(c: canvas.Canvas, title: str, period: str, opening: str, closing: str) -> float:
    _, height = LETTER
    c.setFont("Helvetica-Bold", 13)
    c.drawString(inch * 0.75, height - inch, title)
    c.setFont("Helvetica", 9)
    c.drawString(inch * 0.75, height - inch * 1.18, f"Statement period: {period}")
    c.drawString(inch * 0.75, height - inch * 1.32, f"Beginning balance: {opening}")
    c.drawString(inch * 0.75, height - inch * 1.46, f"Ending balance: {closing}")
    return height - inch * 1.75


def build_chase_style(
    *,
    closing: str = "1,247.16",
    title: str = "JPMorgan Chase Bank, N.A. Statement",
    period: str = "December 24, 2026 to January 23, 2027",
    opening: str = "$1,000.00",
    rows: Rows | None = None,
) -> bytes:
    rows = CHASE_ROWS if rows is None else rows
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=LETTER)
    y = _header(c, title, period, opening, closing)
    c.setFont("Courier", 9)
    c.drawString(
        inch * 0.75, y,
        "TRAN DATE POST DATE DESCRIPTION                     AMOUNT     BALANCE",
    )
    y -= 14
    for row in rows:
        c.drawString(inch * 0.75, y, row)
        y -= 12
    c.showPage()
    c.save()
    return buf.getvalue()


def build_generic_style(
    *,
    title: str = "First Local Community Bank - Account Statement",
    period: str = "January 1, 2026 to January 31, 2026",
    opening: str = "$2,000.00",
    closing: str = "1,846.51",
    rows: Rows | None = None,
) -> bytes:
    rows = GENERIC_ROWS if rows is None else rows
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=LETTER)
    y = _header(c, title, period, opening, closing)
    c.setFont("Courier", 9)
    c.drawString(
        inch * 0.75, y,
        "DATE  DESCRIPTION                        AMOUNT     BALANCE",
    )
    y -= 14
    for row in rows:
        c.drawString(inch * 0.75, y, row)
        y -= 12
    c.showPage()
    c.save()
    return buf.getvalue()


def build_ruled_table(
    *,
    title: str = "Capital One Account Statement",
    period: str = "February 1, 2026 to February 28, 2026",
    opening: str = "$5,000.00",
    closing: str = "4,712.44",
) -> bytes:
    """A statement drawn with an explicit grid so ``extract_tables`` has work to do."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=LETTER)
    y = _header(c, title, period, opening, closing)
    left = inch * 0.75
    col_w = [0.9 * inch, 2.6 * inch, 1.0 * inch, 1.0 * inch]
    headers = ["Date", "Description", "Amount", "Balance"]
    data = [
        ["02/03", "AMAZON MKTPLACE PMTS", "-88.40", "4,911.60"],
        ["02/09", "TRADER JOES #144", "-121.16", "4,790.44"],
        ["02/14", "REFUND - AMAZON", "22.00", "4,812.44"],
        ["02/21", "CITY UTILITIES AUTOPAY", "-100.00", "4,712.44"],
    ]
    row_h = 16
    c.setLineWidth(0.6)
    c.setFont("Helvetica-Bold", 9)
    x = left
    for i, head in enumerate(headers):
        c.rect(x, y - row_h, col_w[i], row_h, stroke=1, fill=0)
        c.drawString(x + 4, y - row_h + 5, head)
        x += col_w[i]
    y -= row_h
    c.setFont("Courier", 9)
    for row in data:
        x = left
        for i, cell in enumerate(row):
            c.rect(x, y - row_h, col_w[i], row_h, stroke=1, fill=0)
            c.drawString(x + 4, y - row_h + 5, cell)
            x += col_w[i]
        y -= row_h
    c.showPage()
    c.save()
    return buf.getvalue()


def build_mismatch() -> bytes:
    """Reconciles on the page but the printed closing balance is off by $42.13."""
    return build_generic_style(closing="1,888.64")


def build_duplicate_rows() -> bytes:
    """Two identical consecutive rows with a frozen balance — a double-post."""
    rows = [
        "03/04 CLOUD SUBSCRIPTION              -19.99     1,980.01",
        "03/04 CLOUD SUBSCRIPTION              -19.99     1,980.01",
    ]
    return build_generic_style(
        period="March 1, 2026 to March 31, 2026",
        opening="$2,000.00",
        closing="1,980.01",
        rows=rows,
    )


def build_textless() -> bytes:
    """Vector art only — stands in for a scanned statement with no text layer."""
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=LETTER)
    c.setFillColorRGB(0.85, 0.85, 0.85)
    c.rect(inch, inch, 4 * inch, 2 * inch, stroke=0, fill=1)
    c.showPage()
    c.save()
    return buf.getvalue()


def build_history(count: int = 6) -> bytes:
    """A longer statement with a consistent, exactly-reconciling run."""
    rows: Rows = []
    balance = 1000.00
    for i in range(count):
        amount = -25.00 if i % 2 == 0 else 125.50
        balance = round(balance + amount, 2)
        rows.append(
            f"01/{i + 1:02d} MERCHANT {i:04d} TXN            {amount:>9.2f}   {balance:>9,.2f}"
        )
    # 1000.00 + 3*(-25.00) + 3*(125.50) = 1301.50
    return build_generic_style(
        period="January 1, 2026 to January 31, 2026",
        opening="$1,000.00",
        closing="1,301.50",
        rows=rows,
    )


FIXTURES: dict[str, object] = {
    "chase": build_chase_style,
    "generic": build_generic_style,
    "ruled": build_ruled_table,
    "mismatch": build_mismatch,
    "duplicate": build_duplicate_rows,
    "textless": build_textless,
    "history": build_history,
}

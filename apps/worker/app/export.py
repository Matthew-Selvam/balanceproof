"""Export writers: CSV, XLSX, QBO (QuickBooks IIF/OFX-style) and OFX.

Two rules that matter more than they look:

1. **CSV injection.** Spreadsheet apps execute a cell that starts with
   ``= + - @`` or a control char. Statement descriptions come from an untrusted
   PDF, so every text field is neutralised with a leading apostrophe before it
   reaches a cell. This is why ``sanitize_cell`` exists and why the XLSX writer
   never writes a raw description.
2. **Money precision.** Amounts are rounded to cents with ``Decimal`` ROUND_HALF_UP
   so a value like ``-0.005`` cannot silently become ``-0.01`` differently in two
   writers.

QBO here is the QuickBooks Online CSV-import shape (the format accountants
actually import) and OFX is the SGML bank-statement format for Xero/QuickBooks
desktop.
"""

from __future__ import annotations

import csv
import io
import re
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

EXPORT_FORMATS = ("csv", "xlsx", "qbo", "ofx", "json")
CONTENT_TYPES = {
    "csv": "text/csv; charset=utf-8",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "qbo": "text/csv; charset=utf-8",
    "ofx": "application/x-ofx",
    "json": "application/json; charset=utf-8",
}

_FORMULA_PREFIX = ("=", "+", "-", "@", "\t", "\r")


def money(value) -> Decimal:
    if value is None:
        return Decimal("0.00")
    try:
        return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except Exception:
        return Decimal("0.00")


def money_str(value) -> str:
    return f"{money(value):.2f}"


def sanitize_cell(value) -> str:
    """Neutralise spreadsheet formula injection in an untrusted text cell."""
    text = "" if value is None else str(value)
    text = text.replace("\x00", "")
    if text.startswith(_FORMULA_PREFIX):
        return "'" + text
    return text


def to_csv(transactions: list[dict], *, include_source: bool = False) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    header = ["Date", "Description", "Amount", "Balance", "Flags"]
    if include_source:
        header = ["Date", "Description", "Amount", "Balance", "Flags", "Page"]
    writer.writerow(header)
    for t in transactions:
        row = [
            sanitize_cell(t.get("date", "")),
            sanitize_cell(t.get("description", "")),
            money_str(t.get("amount")),
            "" if t.get("balance") is None else money_str(t["balance"]),
            ";".join(t.get("flags") or []),
        ]
        if include_source:
            row.append(str(t.get("page") or ""))
        writer.writerow(row)
    return buffer.getvalue()


QBO_HEADER = [
    "Date",
    "Description",
    "Amount",
    "Balance",
    "Transaction Type",
    "Category",
    "Flags",
]


def to_qbo(transactions: list[dict]) -> str:
    """QuickBooks Online import CSV.

    ``Transaction Type`` is written as CREDIT/DEPOSIT for inflows and
    DEBIT/CHECK for outflows, which is what the QBO mapper keys off.
    """
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(QBO_HEADER)
    for t in transactions:
        amount = money(t.get("amount"))
        kind = "DEPOSIT" if amount >= 0 else "CHECK"
        writer.writerow(
            [
                sanitize_cell(t.get("date", "")),
                sanitize_cell(t.get("description", "")),
                f"{amount:.2f}",
                "" if t.get("balance") is None else money_str(t["balance"]),
                kind,
                "",
                ";".join(t.get("flags") or []),
            ]
        )
    return buffer.getvalue()


def _ofx_type(amount: Decimal) -> str:
    return "CREDIT" if amount >= 0 else "DEBIT"


def to_ofx(
    transactions: list[dict],
    *,
    bank_id: str = "GENERIC",
    account_id: str = "0000000000",
    currency: str = "USD",
    opening: float | None = None,
    closing: float | None = None,
    start: str | None = None,
    end: str | None = None,
    now: datetime | None = None,
) -> str:
    now = now or datetime.now(timezone.utc)
    stamp = now.strftime("%Y%m%d%H%M%S")
    dates: list[str] = [str(t.get("date")) for t in transactions if t.get("date")]
    dt_start = (start or (min(dates) if dates else now.strftime("%Y-%m-%d"))).replace("-", "")
    dt_end = (end or (max(dates) if dates else now.strftime("%Y-%m-%d"))).replace("-", "")
    lines = [
        "OFXHEADER:100",
        "DATA:OFXSGML",
        "VERSION:102",
        "SECURITY:NONE",
        "ENCODING:USASCII",
        "CHARSET:1252",
        "COMPRESSION:NONE",
        "OLDFILEUID:NONE",
        "NEWFILEUID:NONE",
        "",
        "<OFX>",
        " <SIGNONMSGSRSV1>",
        "  <SONRS>",
        "   <STATUS><CODE>0<SEVERITY>INFO</STATUS>",
        f"   <DTSERVER>{stamp}",
        "   <LANGUAGE>ENG",
        "  </SONRS>",
        " </SIGNONMSGSRSV1>",
        " <BANKMSGSRSV1>",
        "  <STMTTRNRS>",
        "   <TRNUID>1",
        "   <STATUS><CODE>0<SEVERITY>INFO</STATUS>",
        "   <STMTRS>",
        f"    <CURDEF>{currency}",
        "    <BANKACCTFROM>",
        f"     <BANKID>{_ofx_safe(bank_id).upper()}",
        f"     <ACCTID>{_ofx_safe(account_id)}",
        "     <ACCTTYPE>CHECKING",
        "    </BANKACCTFROM>",
        "    <BANKTRANLIST>",
        f"     <DTSTART>{dt_start}",
        f"     <DTEND>{dt_end}",
    ]
    for i, t in enumerate(transactions):
        amount = money(t.get("amount"))
        txn_id = f"{stamp}-{i + 1:05d}"
        lines += [
            "     <STMTTRN>",
            f"      <TRNTYPE>{_ofx_type(amount)}",
            f"      <DTPOSTED>{(t.get('date') or '').replace('-', '')}",
            f"      <TRNAMT>{amount:.2f}",
            f"      <FITID>{txn_id}",
            f"      <NAME>{_ofx_safe((t.get('description') or '')[:64])}",
            "     </STMTTRN>",
        ]
    lines += ["    </BANKTRANLIST>"]
    if opening is not None:
        lines.append(f"    <LEDGERBAL><BALAMT>{money(opening):.2f}<DTASOF>{dt_start}</LEDGERBAL>")
    if closing is not None:
        lines.append(f"    <LEDGERBAL><BALAMT>{money(closing):.2f}<DTASOF>{dt_end}</LEDGERBAL>")
    lines += [
        "   </STMTRS>",
        "  </STMTTRNRS>",
        " </BANKMSGSRSV1>",
        "</OFX>",
        "",
    ]
    return "\n".join(lines)


_SGML_UNSAFE_RE = re.compile(r"[<>&\r\n]")


def _ofx_safe(value: str) -> str:
    return _SGML_UNSAFE_RE.sub(" ", str(value or "")).strip()


def to_xlsx(
    transactions: list[dict],
    *,
    summary: dict | None = None,
    findings: list[dict] | None = None,
    statement_id: str | None = None,
) -> bytes:
    """Single-workbook export: Summary, Transactions, Findings, plus an audit sheet."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    head_font = Font(bold=True, color="FFFFFF")
    head_fill = PatternFill("solid", fgColor="111827")
    warn_fill = PatternFill("solid", fgColor="FFF4E5")
    bad_fill = PatternFill("solid", fgColor="FDE8E8")
    good_fill = PatternFill("solid", fgColor="E7F6EC")

    # ---- Summary sheet -----------------------------------------------------
    ws = wb.active
    assert ws is not None
    ws.title = "Summary"
    ws.append(["BalanceProof export"])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([])
    if statement_id:
        ws.append(["Statement ID", statement_id])
    s = summary or {}
    rows = [
        ("Bank", s.get("bank")),
        ("Transactions", s.get("count")),
        ("Total", s.get("total")),
        ("Opening balance", s.get("opening")),
        ("Closing balance", s.get("closing")),
        ("Reconciled", _yes_no(s.get("reconciled"))),
        ("Difference", s.get("difference")),
        ("Confidence", s.get("confidence")),
        ("Flagged rows", s.get("flagged")),
        ("Credits", s.get("credits")),
        ("Debits", s.get("debits")),
        ("Period", f"{s.get('first_date') or '?'} \u2192 {s.get('last_date') or '?'}"),
    ]
    for label, value in rows:
        if value is None:
            continue
        ws.append([label, value])
    ws.column_dimensions["A"].width = 22
    ws.column_dimensions["B"].width = 34

    # ---- Transactions sheet ------------------------------------------------
    ws = wb.create_sheet("Transactions")
    header = ["Date", "Description", "Amount", "Balance", "Flags", "Page"]
    ws.append(header)
    for col in range(1, len(header) + 1):
        c = ws.cell(row=1, column=col)
        c.font = head_font
        c.fill = head_fill
        c.alignment = Alignment(horizontal="left")
    for t in transactions:
        ws.append(
            [
                sanitize_cell(t.get("date", "")),
                sanitize_cell(t.get("description", "")),
                float(money(t.get("amount"))),
                None if t.get("balance") is None else float(money(t["balance"])),
                "; ".join(t.get("flags") or []),
                t.get("page"),
            ]
        )
        row_index = ws.max_row
        if t.get("flags"):
            for col in range(1, len(header) + 1):
                ws.cell(row=row_index, column=col).fill = warn_fill
        for col in (3, 4):
            ws.cell(row=row_index, column=col).number_format = "#,##0.00"
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = f"A1:{get_column_letter(len(header))}{max(ws.max_row, 1)}"
    for col, width in zip("ABCDEF", (12, 52, 14, 14, 26, 7)):
        ws.column_dimensions[col].width = width

    # ---- Findings sheet ----------------------------------------------------
    ws = wb.create_sheet("Findings")
    fheader = ["Severity", "Code", "Issue", "Rows", "Explanation"]
    ws.append(fheader)
    for col in range(1, len(fheader) + 1):
        c = ws.cell(row=1, column=col)
        c.font = head_font
        c.fill = head_fill
    for f in findings or []:
        ws.append(
            [
                f.get("severity", ""),
                f.get("code", ""),
                f.get("message", ""),
                f.get("count", 0),
                f.get("hint") or "",
            ]
        )
        row_index = ws.max_row
        fill = {"error": bad_fill, "warning": warn_fill, "info": good_fill}.get(
            f.get("severity", ""), good_fill
        )
        for col in range(1, len(fheader) + 1):
            ws.cell(row=row_index, column=col).fill = fill
    for col, width in zip("ABCDE", (10, 22, 40, 8, 70)):
        ws.column_dimensions[col].width = width
    ws.freeze_panes = "A2"

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def _yes_no(value) -> str | None:
    if value is None:
        return None
    return "Yes" if value else "No"

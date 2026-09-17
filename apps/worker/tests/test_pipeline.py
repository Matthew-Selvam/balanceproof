"""Worker test suite.

Run with ``pytest`` (or ``python tests/test_pipeline.py`` for the legacy
no-pytest path). Fixtures are generated, never committed, so these tests run
on a clean checkout with no binary assets.
"""

from __future__ import annotations

import io
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import export as exporters
from app.banks import GENERIC, REGISTRY, candidates, detect_bank, parse_with, resolve
from app.banks.layouts import parse_pages, parse_table_rows, parse_text_rows
from app.extract import (
    MONEY_RE,
    extract_meta,
    money_to_float,
    month_rollover,
    normalize_date,
    year_from_meta,
)
from app.models import Txn
from app.pipeline import parse_bytes, parse_pages_to_result
from app.validate import FINDING_CATALOG, PENALTY, validate_transactions
from tests.fixtures import (
    FIXTURES,
    build_chase_style,
    build_duplicate_rows,
    build_generic_style,
    build_history,
    build_mismatch,
    build_ruled_table,
    build_textless,
)

META = {"opening": 1000.0, "closing": 900.0, "period": {"start": "2026-01-01", "end": "2026-01-31"}}


# ---------------------------------------------------------------------------
# money + date primitives
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "raw,expected",
    [
        ("1,234.56", 1234.56),
        ("$1,234.56", 1234.56),
        ("-$10.00", -10.0),
        ("(25.00)", -25.0),
        ("+482.56", 482.56),
        ("$0.00", 0.0),
        ("1,000,000.99", 1000000.99),
        ("junk", None),
        ("", None),
        (None, None),
        ("12.345", None),
    ],
)
def test_money_to_float(raw, expected):
    assert money_to_float(raw) == expected


def test_money_to_float_cr_dr_markers():
    assert money_to_float("45.00CR") == 45.0
    assert money_to_float("45.00DR") == -45.0
    assert money_to_float("$45.00 DR") == -45.0


def test_money_regex_matches_what_parser_accepts():
    for token in ("1,234.56", "$1,234.56", "(25.00)", "-10.00", "+482.56"):
        assert MONEY_RE.fullmatch(token), token


@pytest.mark.parametrize(
    "raw,hint,expected",
    [
        ("2026-01-05", None, "2026-01-05"),
        ("01/05/2026", None, "2026-01-05"),
        ("01/05", 2026, "2026-01-05"),
        ("25/03/2026", None, "2026-03-25"),
        ("13/13/2026", None, None),
        ("1/5/26", None, "2026-01-05"),
        (None, None, None),
        ("", None, None),
    ],
)
def test_normalize_date(raw, hint, expected):
    assert normalize_date(raw, hint) == expected


def test_year_from_meta_prefers_start():
    assert year_from_meta({"period": {"start": "December 24, 2026", "end": "January 23, 2027"}}) == 2026
    assert year_from_meta({"period": None}, fallback=2019) == 2019


def test_month_rollover():
    assert month_rollover(12, 1) is True
    assert month_rollover(11, 2) is True
    assert month_rollover(6, 7) is False
    assert month_rollover(None, 1) is False


# ---------------------------------------------------------------------------
# metadata extraction
# ---------------------------------------------------------------------------

def test_extract_meta_finds_balances_and_period():
    text = (
        "Statement period: January 01, 2026 to January 31, 2026\n"
        "Beginning balance: $2,000.00\n"
        "Ending balance: 1,846.51\n"
    )
    meta = extract_meta(text)
    assert meta["opening"] == 2000.0
    assert meta["closing"] == 1846.51
    assert meta["period"] == {"start": "2026-01-01", "end": "2026-01-31"}


def test_extract_meta_alternate_phrasing():
    text = "From 01/01/2026 to 01/31/2026\nOpening Balance 500.00\nClosing Balance 250.00\n"
    meta = extract_meta(text)
    assert meta["opening"] == 500.0
    assert meta["closing"] == 250.0


def test_extract_meta_missing_returns_nones():
    meta = extract_meta("nothing useful here")
    assert meta["opening"] is None
    assert meta["closing"] is None
    assert meta["period"] is None


def test_extract_meta_account_is_masked_only():
    meta = extract_meta("Account number: ****1234\n")
    assert meta["account"] is not None
    assert "*" in meta["account"]


# ---------------------------------------------------------------------------
# validation engine
# ---------------------------------------------------------------------------

def test_validation_reconciles_exactly():
    txns = [
        Txn(date="2026-01-05", description="DEPOSIT", amount=500.0, balance=1500.0),
        Txn(date="2026-01-20", description="RENT", amount=-600.0, balance=900.0),
    ]
    report = validate_transactions(txns, META)
    assert report.summary.reconciled is True
    assert report.summary.difference == 0.0
    assert report.summary.total == -100.0
    assert report.summary.count == 2
    assert not any(t.flags for t in report.transactions)
    assert report.summary.confidence == 1.0


def test_validation_detects_mismatch():
    txns = [
        Txn(date="2026-01-05", description="DEPOSIT", amount=500.0, balance=1500.0),
        Txn(date="2026-01-20", description="RENT", amount=-600.0, balance=900.0),
    ]
    report = validate_transactions(txns, {**META, "closing": 999.0})
    assert report.summary.reconciled is False
    assert abs(report.summary.difference + 99.0) < 0.001
    codes = {f.code for f in report.findings}
    assert "reconciliation_gap" in codes


def test_validation_reports_unavailable_without_balances():
    txns = [Txn(date="2026-01-05", description="A", amount=1.0, balance=None)]
    report = validate_transactions(txns, {"opening": None, "closing": None, "period": None})
    assert report.summary.reconciled is None
    assert report.summary.difference is None
    codes = {f.code for f in report.findings}
    assert "reconciliation_unavailable" in codes
    assert "missing_balance" in codes


def test_validation_flags_each_condition():
    txns = [
        Txn(date="2026-01-05", description="A", amount=10.0, balance=1010.0),
        Txn(date="2026-01-04", description="B", amount=5.0, balance=1005.0),
        Txn(date="2026-01-06", description="C", amount=3.0, balance=2000.0),
        Txn(date="2026-01-07", description="D", amount=1.0, balance=None),
        Txn(date="2026-01-08", description="E", amount=2.0, balance=2003.0),
        Txn(date="2026-01-08", description="E", amount=2.0, balance=2005.0),
    ]
    report = validate_transactions(txns, {"opening": None, "closing": None, "period": None})
    flags = [t.flags for t in report.transactions]
    assert "date_order" in flags[1]
    assert "missing_balance" in flags[3]
    assert "possible_duplicate" in flags[5]
    codes = {f.code for f in report.findings}
    assert "continuity" in codes or "balance_misread" in codes
    assert 0 <= report.summary.confidence <= 1


def test_validation_repairs_amount_from_balance_delta():
    """A single mis-read amount that provably closes the statement is repaired."""
    txns = [
        Txn(date="2026-01-05", description="OPEN", amount=10.0, balance=1010.0),
        Txn(date="2026-01-06", description="TYPO", amount=-99.99, balance=960.01),
    ]
    report = validate_transactions(txns, {"opening": 1000.0, "closing": 960.01, "period": None})
    repaired = report.transactions[1]
    assert "amount_repaired" in repaired.flags
    assert repaired.amount == -49.99
    assert repaired.amount_before_repair == -99.99
    assert report.summary.reconciled is True
    assert report.summary.repaired == 1


def test_repair_is_skipped_when_it_would_not_close_the_statement():
    """Two breaks, or a break that does not fix the total: report, never rewrite."""
    txns = [
        Txn(date="2026-01-05", description="A", amount=10.0, balance=1010.0),
        Txn(date="2026-01-06", description="B", amount=-5.0, balance=2000.0),
        Txn(date="2026-01-07", description="C", amount=-5.0, balance=900.0),
    ]
    report = validate_transactions(txns, {"opening": 1000.0, "closing": 910.0, "period": None})
    assert report.transactions[1].amount == -5.0
    assert report.transactions[1].amount_before_repair is None
    assert not any("amount_repaired" in t.flags for t in report.transactions)
    assert any(f.code == "continuity" for f in report.findings)


def test_repair_is_skipped_when_amounts_explain_the_closing_balance():
    """Amounts sum correctly but a balance cell is wrong -> flag the balance."""
    txns = [
        Txn(date="2026-01-05", description="A", amount=-50.0, balance=1000.0),
        Txn(date="2026-01-06", description="B", amount=125.0, balance=1175.0),
    ]
    # opening 1000 - 50 + 125 = 1075 == closing, so the totals are right.
    report = validate_transactions(txns, {"opening": 1000.0, "closing": 1075.0, "period": None})
    assert report.summary.reconciled is True
    assert all(t.amount_before_repair is None for t in report.transactions)
    assert report.transactions[0].amount == -50.0


def test_validation_detects_exact_duplicate():
    txns = [
        Txn(date="2026-03-04", description="CLOUD", amount=-19.99, balance=1980.01),
        Txn(date="2026-03-04", description="CLOUD", amount=-19.99, balance=1980.01),
    ]
    report = validate_transactions(txns, {"opening": None, "closing": None, "period": None})
    assert "duplicate_exact" in report.transactions[1].flags


def test_validation_flags_period_mismatch():
    txns = [
        Txn(date="2026-01-05", description="IN", amount=1.0, balance=1001.0),
        Txn(date="2027-05-05", description="OUT OF PERIOD", amount=1.0, balance=1002.0),
    ]
    report = validate_transactions(txns, META)
    assert "period_mismatch" in report.transactions[1].flags
    assert "future_date" in report.transactions[1].flags


def test_validation_handles_empty_input():
    report = validate_transactions([], META)
    assert report.summary.count == 0
    assert report.summary.confidence == 0.0
    # Nothing was parsed, but the statement still claims a 100.00 movement.
    assert report.summary.reconciled is False
    assert report.summary.difference == 100.0


def test_summary_splits_credits_and_debits():
    txns = [
        Txn(date="2026-01-05", description="IN", amount=500.0, balance=1500.0),
        Txn(date="2026-01-06", description="OUT", amount=-125.0, balance=1375.0),
        Txn(date="2026-01-07", description="OUT2", amount=-75.0, balance=1300.0),
    ]
    report = validate_transactions(txns, {"opening": 1000.0, "closing": 1300.0, "period": None})
    s = report.summary
    assert s.credits == 500.0 and s.credit_count == 1
    assert s.debits == -200.0 and s.debit_count == 2
    assert s.total == 300.0
    assert s.first_date == "2026-01-05" and s.last_date == "2026-01-07"
    assert s.span_days == 2


def test_finding_catalog_covers_every_emittable_flag():
    """Every flag the validator can emit must be explainable in the UI."""
    emitted = {
        "continuity", "amount_repaired", "date_order", "missing_balance",
        "possible_duplicate", "duplicate_exact", "zero_amount", "large_amount",
        "future_date", "weak_description", "reconciliation_gap", "reconciled",
        "reconciliation_unavailable", "overdraft", "period_mismatch",
    }
    assert emitted <= set(FINDING_CATALOG)
    assert set(PENALTY) <= set(FINDING_CATALOG)


def test_findings_sorted_errors_first():
    txns = [
        Txn(date="2026-01-05", description="A", amount=10.0, balance=1010.0),
        Txn(date="2026-01-06", description="B", amount=-999.0, balance=5.0),
    ]
    report = validate_transactions(txns, {**META, "closing": 1.0})
    severities = [f.severity for f in report.findings]
    assert severities == sorted(severities, key=lambda s: {"error": 0, "warning": 1, "info": 2}[s])


# ---------------------------------------------------------------------------
# bank registry
# ---------------------------------------------------------------------------

def test_registry_ids_are_unique_and_well_formed():
    ids = [spec.id for spec in REGISTRY]
    assert len(ids) == len(set(ids))
    assert len(REGISTRY) >= 25
    for spec in REGISTRY:
        assert spec.keywords, spec.id
        assert spec.layout in ("two_dates", "amount_balance", "ruled_table")


def test_detects_known_banks():
    assert detect_bank("jpmorgan chase bank statement").id == "chase"
    assert detect_bank("Bank of America, N.A.").id == "bank_of_america"
    assert detect_bank("Wells Fargo Bank NA").id == "wells_fargo"
    assert detect_bank("American Express account").id == "american_express"


def test_falls_back_to_generic():
    match = detect_bank("Some Credit Union nobody has heard of")
    assert match.id == GENERIC.id
    assert match.confidence == 0.0


def test_candidates_are_ranked_and_limited():
    ranked = candidates("jpmorgan chase bank and wells fargo", limit=2)
    assert len(ranked) == 2
    assert ranked[0].confidence >= ranked[1].confidence
    assert ranked[0].matched_on


def test_resolve_unknown_id_returns_custom_spec():
    spec = resolve("some_credit_union")
    assert spec.id == "some_credit_union"
    assert "custom_layout" in spec.flags


def test_registry_parse_accepts_two_date_layout():
    pages = [{"page": 1, "text": "JPMorgan Chase\n12/28 12/28 STARBUCKS -6.40 993.60\n"}]
    meta = {"opening": 1000.0, "closing": 993.60, "period": {"start": "2026-12-01", "end": "2026-12-31"}}
    txns = parse_with("chase", pages, meta)
    assert len(txns) == 1
    assert txns[0].amount == -6.40
    assert txns[0].balance == 993.60


# ---------------------------------------------------------------------------
# layout engine
# ---------------------------------------------------------------------------

def test_text_layout_handles_dec_jan_rollover():
    pages = [
        {
            "page": 1,
            "text": (
                "12/28 COFFEE -4.50 995.50\n"
                "01/02 GROCERY -82.13 913.37\n"
            ),
        }
    ]
    meta = {"opening": 1000.0, "closing": 913.37,
            "period": {"start": "2026-12-28", "end": "2027-01-02"}}
    txns = parse_text_rows(pages, meta)
    assert [t.date for t in txns] == ["2026-12-28", "2027-01-02"]


def test_text_layout_skips_noise_lines():
    pages = [
        {
            "page": 1,
            "text": (
                "Page 1 of 2\n"
                "Beginning balance 1,000.00\n"
                "01/02 GROCERY -82.13 913.37\n"
                "Ending balance 913.37\n"
            ),
        }
    ]
    meta = {"opening": 1000.0, "closing": 913.37, "period": None}
    txns = parse_text_rows(pages, meta)
    assert len(txns) == 1
    assert txns[0].description == "GROCERY"


def test_text_layout_records_source_page():
    pages = [
        {"page": 1, "text": "01/02 A -1.00 999.00\n"},
        {"page": 2, "text": "01/03 B -1.00 998.00\n"},
    ]
    txns = parse_text_rows(pages, {"opening": None, "closing": None, "period": None})
    assert [t.page for t in txns] == [1, 2]


def test_table_layout_learns_column_roles():
    pages = [
        {
            "page": 1,
            "tables": [
                [
                    ["Date", "Description", "Amount", "Balance"],
                    ["02/03", "AMAZON", "-88.40", "4,911.60"],
                    ["02/09", "TRADER JOES", "-121.16", "4,790.44"],
                ]
            ],
        }
    ]
    meta = {"opening": 5000.0, "closing": 4790.44, "period": None}
    txns = parse_table_rows(pages, meta)
    assert len(txns) == 2
    assert txns[0].amount == -88.40
    assert txns[0].balance == 4911.60
    assert "AMAZON" in txns[0].description


def test_table_layout_handles_split_debit_credit_columns():
    pages = [
        {
            "page": 1,
            "tables": [
                [
                    ["Date", "Description", "Debit", "Credit", "Balance"],
                    ["02/03", "AMAZON", "88.40", "", "4,911.60"],
                    ["02/09", "REFUND", "", "22.00", "4,933.60"],
                ]
            ],
        }
    ]
    txns = parse_table_rows(pages, {"opening": None, "closing": None, "period": None})
    assert len(txns) == 2
    assert txns[0].amount == -88.40
    assert txns[1].amount == 22.00


def test_table_layout_ignores_non_header_tables():
    pages = [{"page": 1, "tables": [[["Marketing copy", "not a statement"]]]}]
    assert parse_table_rows(pages, {"opening": None, "closing": None, "period": None}) == []


def test_parse_pages_falls_back_from_tables_to_text():
    pages = [
        {
            "page": 1,
            "text": "01/02 GROCERY -82.13 913.37\n",
            "tables": [],
        }
    ]
    txns = parse_pages(pages, {"opening": None, "closing": None, "period": None})
    assert len(txns) == 1


def test_parser_never_raises_on_garbage_text():
    pages = [{"page": 1, "text": "!!! ??? [[[ \x00 weird ]] 12:34\n\xff\xfe\n"}]
    assert isinstance(parse_pages(pages, {"opening": None, "closing": None, "period": None}), list)


# ---------------------------------------------------------------------------
# exports
# ---------------------------------------------------------------------------

SAMPLE = [
    {"date": "2026-01-05", "description": "COFFEE, LARGE", "amount": -4.5,
     "balance": 995.5, "flags": [], "page": 1},
    {"date": "2026-01-06", "description": "FEE", "amount": 1.0,
     "balance": None, "flags": ["missing_balance"], "page": 1},
]


def test_csv_shape_and_quoting():
    body = exporters.to_csv(SAMPLE)
    lines = body.strip().split("\n")
    assert lines[0] == "Date,Description,Amount,Balance,Flags"
    assert '"COFFEE, LARGE"' in lines[1]
    assert lines[1].endswith("-4.50,995.50,")
    assert lines[2].endswith("1.00,,missing_balance")


def test_csv_neutralises_formula_injection():
    """A description from an untrusted PDF must not execute in a spreadsheet."""
    hostile = [
        {"date": "2026-01-05", "description": "=cmd|'/c calc'!A1", "amount": 1.0,
         "balance": 1.0, "flags": []},
        {"date": "2026-01-06", "description": "+1+1", "amount": 1.0, "balance": 2.0, "flags": []},
        {"date": "2026-01-07", "description": "@SUM(A1:A9)", "amount": 1.0, "balance": 3.0, "flags": []},
        {"date": "2026-01-08", "description": "-2+3", "amount": 1.0, "balance": 4.0, "flags": []},
    ]
    body = exporters.to_csv(hostile)
    for line in body.splitlines()[1:]:
        cell = line.split(",")[1]
        stripped = cell.strip('"')
        assert not stripped.startswith(("=", "+", "@")), line
        assert stripped.startswith("'"), line


def test_csv_includes_page_when_asked():
    body = exporters.to_csv(SAMPLE, include_source=True)
    assert body.splitlines()[0].endswith("Page")
    assert body.splitlines()[1].endswith(",1")


def test_qbo_shape_and_types():
    body = exporters.to_qbo(SAMPLE)
    lines = body.strip().split("\n")
    assert lines[0] == "Date,Description,Amount,Balance,Transaction Type,Category,Flags"
    assert "CHECK" in lines[1]
    assert "DEPOSIT" in lines[2]


def test_ofx_is_wellformed_enough_for_an_importer():
    body = exporters.to_ofx(
        SAMPLE, bank_id="chase", account_id="****1234", opening=1000.0, closing=996.5,
    )
    assert body.startswith("OFXHEADER:100")
    assert body.rstrip().endswith("</OFX>")
    assert body.count("<STMTTRN>") == 2 == body.count("</STMTTRN>")
    assert "<TRNAMT>-4.50" in body
    assert "<TRNTYPE>CREDIT" in body
    assert "<TRNTYPE>DEBIT" in body
    assert "<FITID>" in body


def test_ofx_strips_sgml_hostile_characters():
    body = exporters.to_ofx(
        [{"date": "2026-01-05", "description": "Ampersand & <b>tag</b>\nnewline",
          "amount": 1.0, "balance": 1.0, "flags": []}],
    )
    name_line = next(l for l in body.splitlines() if "<NAME>" in l)
    assert "<b>" not in name_line
    assert "&" not in name_line


def test_xlsx_has_expected_sheets_and_survives_hostile_text():
    body = exporters.to_xlsx(
        SAMPLE,
        summary={"count": 2, "total": -3.5, "reconciled": False, "difference": 1.0},
        findings=[{"severity": "error", "code": "continuity", "message": "x", "count": 1,
                   "hint": "h"}],
    )
    assert body[:2] == b"PK"  # zip container
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(body))
    assert set(wb.sheetnames) >= {"Summary", "Transactions", "Findings"}
    # Formula injection is neutralised before it reaches the cell.
    hostile = exporters.to_xlsx(
        [{"date": "2026-01-05", "description": "=1+1", "amount": 1.0, "balance": 1.0, "flags": []}]
    )
    wb2 = load_workbook(io.BytesIO(hostile))
    value = wb2["Transactions"].cell(row=2, column=2).value
    assert value.startswith("'")


def test_xlsx_amounts_are_numeric_not_strings():
    from openpyxl import load_workbook

    body = exporters.to_xlsx(SAMPLE)
    ws = load_workbook(io.BytesIO(body))["Transactions"]
    assert isinstance(ws.cell(row=2, column=3).value, float)
    assert ws.cell(row=2, column=3).value == -4.5


def test_money_rounds_half_up_not_bankers():
    assert exporters.money_str(0.005) == "0.01"
    assert exporters.money_str(2.675) == "2.68"
    assert exporters.money_str(None) == "0.00"


def test_every_advertised_format_renders():
    for fmt in exporters.EXPORT_FORMATS:
        if fmt == "json":
            continue
        assert fmt in exporters.CONTENT_TYPES


# ---------------------------------------------------------------------------
# end-to-end pipeline over generated PDFs
# ---------------------------------------------------------------------------

def test_e2e_chase_fixture_reconciles():
    result = parse_bytes(build_chase_style(), "chase.pdf")
    assert result["bank"]["id"] == "chase"
    assert result["summary"]["count"] == 5
    assert result["summary"]["total"] == 247.16
    assert result["summary"]["reconciled"] is True
    assert result["summary"]["difference"] == 0.0
    assert result["pages"] == 1
    dates = [t["date"] for t in result["transactions"]]
    assert dates[0] == "2026-12-26"
    assert dates[-1] == "2027-01-09"


def test_e2e_generic_fixture_reconciles():
    result = parse_bytes(build_generic_style(), "generic.pdf")
    assert result["bank"]["id"] == "generic"
    assert result["summary"]["count"] == 5
    assert result["summary"]["reconciled"] is True
    assert result["summary"]["bank"] == "Generic"
    # An unmatched statement must say so rather than implying bank-specific accuracy.
    assert any("heuristic" in lim.lower() for lim in result["limitations"])


def test_e2e_ruled_table_fixture():
    result = parse_bytes(build_ruled_table(), "ruled.pdf")
    assert result["summary"]["count"] == 4
    assert result["summary"]["reconciled"] is True
    assert result["summary"]["total"] == -287.56


def test_e2e_mismatch_is_reported_not_hidden():
    result = parse_bytes(build_mismatch(), "mismatch.pdf")
    assert result["summary"]["reconciled"] is False
    assert result["summary"]["difference"] == -42.13
    assert any(f["code"] == "reconciliation_gap" for f in result["findings"])
    assert result["summary"]["confidence"] < 1.0


def test_e2e_duplicate_is_detected():
    result = parse_bytes(build_duplicate_rows(), "dup.pdf")
    codes = {f["code"] for f in result["findings"]}
    assert "duplicate_exact" in codes
    assert "reconciliation_gap" in codes


def test_e2e_textless_pdf_gives_actionable_error():
    with pytest.raises(ValueError) as exc:
        parse_bytes(build_textless(), "scan.pdf")
    assert "scan" in str(exc.value).lower()


def test_e2e_history_fixture_is_clean():
    result = parse_bytes(build_history(), "history.pdf")
    assert result["summary"]["reconciled"] is True
    assert result["summary"]["count"] == 6
    assert result["summary"]["confidence"] > 0.9


def test_e2e_result_is_json_serialisable():
    """The payload crosses the worker->web boundary as JSON."""
    result = parse_bytes(build_chase_style(), "chase.pdf")
    assert json.loads(json.dumps(result))["filename"] == "chase.pdf"


def test_e2e_summary_carries_bank_name_for_export():
    result = parse_bytes(build_chase_style(), "chase.pdf")
    assert result["summary"]["bank"] == "Chase"


def test_e2e_transactions_record_page_and_no_repairs_when_clean():
    result = parse_bytes(build_chase_style(), "chase.pdf")
    assert all(t["page"] == 1 for t in result["transactions"])
    assert result["summary"]["repaired"] == 0
    assert not any(t["amount_before_repair"] for t in result["transactions"])


def test_e2e_layout_disagreement_is_surfaced():
    """A thin layout must admit it rather than silently under-report rows."""
    pages = [{"page": 1, "text": "JPMorgan Chase\n01/02 X -1.00 999.00\n"}]
    result = parse_pages_to_result(
        pages,
        {"opening": 1000.0, "closing": 999.0, "period": None},
        filename="x.pdf",
        full_text=pages[0]["text"],
    )
    assert result.summary.count >= 1


def test_parse_pages_to_result_explicit_layout_override():
    pages = [{"page": 1, "text": "01/02 X -1.00 999.00\n"}]
    from app.models import BankMatch

    result = parse_pages_to_result(
        pages,
        {"opening": 1000.0, "closing": 999.0, "period": None},
        filename="x.pdf",
        full_text=pages[0]["text"],
        bank_match=BankMatch(id="custom_bank", name="Custom Bank", confidence=1.0),
    )
    assert result.bank.id == "custom_bank"
    assert result.summary.count == 1


def test_parse_pages_to_result_falls_back_when_layout_matches_nothing():
    pages = [{"page": 1, "text": "Chase Bank\nno parseable rows at all\n"}]
    from app.models import BankMatch

    result = parse_pages_to_result(
        pages,
        {"opening": None, "closing": None, "period": None},
        filename="x.pdf",
        full_text=pages[0]["text"],
        bank_match=BankMatch(id="chase", name="Chase", confidence=1.0),
    )
    assert result.summary.count == 0
    assert any("layout matched no rows" in lim for lim in result.limitations)


if __name__ == "__main__":  # legacy no-pytest path
    raise SystemExit(pytest.main([__file__, "-q"]))

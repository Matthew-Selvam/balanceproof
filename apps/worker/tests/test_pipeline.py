import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.banks import chase, generic
from app.extract import money_to_float, normalize_date
from app.export import to_csv
from app.validate import Txn, validate_transactions

PASS = 0


def check(name, condition):
    global PASS
    assert condition, f"FAILED: {name}"
    PASS += 1


def test_money_to_float():
    check("plain", money_to_float("1,234.56") == 1234.56)
    check("dollar sign", money_to_float("$1,234.56") == 1234.56)
    check("negative dash", money_to_float("-$10.00") == -10.0)
    check("parentheses negative", money_to_float("(25.00)") == -25.0)
    check("junk is None", money_to_float("junk") is None)
    check("none is None", money_to_float(None) is None)


def test_normalize_date():
    check("iso", normalize_date("2026-01-05", None) == "2026-01-05")
    check("full us", normalize_date("01/05/2026", None) == "2026-01-05")
    check("short with hint", normalize_date("01/05", 2026) == "2026-01-05")
    check("day first swap", normalize_date("25/03/2026", None) == "2026-03-25")
    check("invalid month", normalize_date("13/13/2026", None) is None)


def _meta(opening, closing, start="January 02, 2026", end="February 01, 2026"):
    return {"opening": opening, "closing": closing, "period": {"start": start, "end": end}}


def test_validation_reconciles():
    txns = [
        Txn(date="2026-01-05", description="DEPOSIT", amount=500.0, balance=1500.0),
        Txn(date="2026-01-20", description="RENT", amount=-600.0, balance=900.0),
    ]
    report = validate_transactions(txns, _meta(1000.0, 900.0))
    check("reconciled", report.summary["reconciled"] is True)
    check("no flags", all(not t.flags for t in report.transactions))
    check("total", report.summary["total"] == -100.0)


def test_validation_detects_mismatch():
    txns = [
        Txn(date="2026-01-05", description="DEPOSIT", amount=500.0, balance=1500.0),
        Txn(date="2026-01-20", description="RENT", amount=-600.0, balance=900.0),
    ]
    report = validate_transactions(txns, _meta(1000.0, 999.0))
    check("mismatch found", report.summary["reconciled"] is False)
    check("difference", abs(report.summary["difference"] + 99.0) < 0.001)


def test_validation_flags():
    txns = [
        Txn(date="2026-01-05", description="A", amount=10.0, balance=1010.0),
        Txn(date="2026-01-04", description="B", amount=5.0, balance=1005.0),  # date_order
        Txn(date="2026-01-06", description="C", amount=3.0, balance=2000.0),  # continuity
        Txn(date="2026-01-07", description="D", amount=1.0, balance=None),  # missing_balance
        Txn(date="2026-01-08", description="E", amount=2.0, balance=2003.0),
        Txn(date="2026-01-08", description="E", amount=2.0, balance=2005.0),  # duplicate + continuity
    ]
    report = validate_transactions(txns, _meta(None, None))
    flags = [t.flags for t in report.transactions]
    check("date_order", "date_order" in flags[1])
    check("continuity", "continuity" in flags[2])
    check("missing_balance", "missing_balance" in flags[3])
    check("duplicate", "possible_duplicate" in flags[5])
    check("unknown balances -> reconciled None", report.summary["reconciled"] is None)
    check("confidence computed", 0 <= report.summary["confidence"] <= 1)


def test_generic_parser():
    pages = [
        {
            "page": 1,
            "text": (
                "Statement period: December 28, 2026 to January 03, 2027\n"
                "12/28 COFFEE SHOP PURCHASE -4.50 995.50\n"
                "01/02 GROCERY STORE -82.13 913.37\n"
            ),
        }
    ]
    meta = {
        "opening": 1000.0,
        "closing": None,
        "period": {"start": "December 28, 2026", "end": "January 03, 2027"},
    }
    txns = generic.parse(pages, meta)
    check("generic row count", len(txns) == 2)
    check("generic dec year from start", txns[0].date == "2026-12-28")
    check("generic jan rollover", txns[1].date == "2027-01-02")
    check("generic amounts", txns[0].amount == -4.5 and txns[1].amount == -82.13)
    check("generic flagged", all(t.flags == ["generic_parser"] for t in txns))


def test_chase_parser_rollover():
    pages = [
        {
            "page": 1,
            "text": (
                "JPMorgan Chase Bank Statement\n"
                "12/28 12/28 STARBUCKS 000123 -6.40 993.60\n"
                "01/02 01/02 SQ SQUARE INC -21.00 972.60\n"
            ),
        }
    ]
    meta = {
        "opening": 1000.0,
        "closing": None,
        "period": {"start": "December 24, 2026", "end": "January 23, 2027"},
    }
    check("chase detected", chase.matches(pages[0]["text"]) is True)
    txns = chase.parse(pages, meta)
    check("chase row count", len(txns) == 2)
    check("chase dec uses start year", txns[0].date == "2026-12-28")
    check("chase jan rolls forward", txns[1].date == "2027-01-02")


def test_export_csv():
    csv = to_csv(
        [
            {"date": "2026-01-05", "description": "COFFEE, LARGE", "amount": -4.5, "balance": 995.5, "flags": []},
            {"date": "2026-01-06", "description": "FEE", "amount": 1.0, "balance": None, "flags": ["missing_balance"]},
        ]
    )
    lines = csv.strip().split("\n")
    check("csv header", lines[0] == "Date,Description,Amount,Balance,Flags")
    check("csv quoting", '"COFFEE, LARGE"' in lines[1])
    check("csv empty balance", lines[2].endswith("missing_balance"))


if __name__ == "__main__":
    test_money_to_float()
    test_normalize_date()
    test_validation_reconciles()
    test_validation_detects_mismatch()
    test_validation_flags()
    test_generic_parser()
    test_chase_parser_rollover()
    test_export_csv()
    print(f"ALL {PASS} CHECKS PASSED")

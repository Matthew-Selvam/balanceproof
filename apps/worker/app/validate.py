"""Validation engine — the moat.

Design rules
------------
* Never raise on bad data. A statement that cannot be validated is still
  returned, with findings explaining why.
* Every flag emitted on a row has a matching entry in :data:`FINDING_CATALOG`,
  which is the single source of truth for message text and severity, and a
  penalty in :data:`PENALTY`. A flag with no catalog entry is a bug, and
  ``tests/test_pipeline.py`` asserts that every emittable flag is covered.
* **Amounts are never silently rewritten.** A row's amount is only replaced
  when doing so *provably* makes the whole statement reconcile (see
  :func:`_decide_amount_repairs`). Otherwise the discrepancy is flagged and the
  parsed values are left exactly as they came out of the PDF. Guessing which of
  ``amount`` or ``balance`` the bank actually mis-printed is not something this
  code can do from one row, so it does not try.

Passes
------
1. per-row structural checks (dates, duplicates, zero/weak/large values)
2. statement reconciliation (opening + sum == closing)
3. amount-repair decision, using (2) as corroboration
4. confidence + summary
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date as _date

from .models import Finding, Report, Severity, Summary, Txn

BALANCE_TOL = 0.005
RECON_TOL = 0.01
REPAIR_TOL = 0.01
DUPLICATE_TOL = 0.001
LARGE_AMOUNT = 50_000.0


def _close(a: float, b: float, tol: float) -> bool:
    """Compare two money values at cent tolerance.

    Rounding to six places first is not cosmetic: ``50.0 - 49.99`` is
    ``0.010000000000005`` in binary floating point, which is *greater* than a
    tolerance of ``0.01`` and would silently disable the repair path.
    """
    return abs(round(a - b, 6)) <= tol

# code -> (severity, message, hint)
FINDING_CATALOG: dict[str, tuple[Severity, str, str | None]] = {
    "continuity": (
        "error",
        "Running balance breaks on this row",
        "Previous balance + this amount does not equal this row's balance. "
        "Usually a mis-read amount, a missing row, or a re-ordered page.",
    ),
    "balance_misread": (
        "error",
        "Balance column does not continue",
        "The amounts on this statement sum to the printed closing balance, so "
        "the totals are right — but this row's balance value breaks the running "
        "balance. Treat the Balance column on this row as unreliable.",
    ),
    "amount_repaired": (
        "info",
        "Amount recomputed from the balance delta",
        "The parsed amount did not continue the running balance, and recomputing "
        "it from the balance delta makes the whole statement reconcile exactly. "
        "The original value is preserved in amount_before_repair, and the amount "
        "was only changed because it provably fixes the total.",
    ),
    "date_order": (
        "warning",
        "Out-of-order date",
        "This row is dated before the row above it. Check for a page-ordering "
        "problem or a mis-read date.",
    ),
    "missing_balance": (
        "warning",
        "No balance column on this row",
        "Without a running balance the row cannot be continuity-checked.",
    ),
    "possible_duplicate": (
        "warning",
        "Looks like a duplicate of the row above",
        "Same date, description and amount. Could be legitimate, could be a "
        "double-post or a retry loop.",
    ),
    "duplicate_exact": (
        "error",
        "Exact duplicate row",
        "Same date, description and amount as the previous row and the balance "
        "did not move. Almost certainly a double-posted transaction.",
    ),
    "zero_amount": ("info", "Zero-amount row", "No money moved; often a memo line."),
    "large_amount": (
        "info",
        "Unusually large amount",
        f"Absolute value over {LARGE_AMOUNT:,.0f}. Worth a second look on a "
        "typical personal or small-business account.",
    ),
    "future_date": (
        "warning",
        "Date is after today",
        "The row is dated in the future. Check the year inference on this "
        "statement.",
    ),
    "weak_description": (
        "info",
        "Very little description text",
        "The description is missing or shorter than three characters, so the "
        "row will be hard to categorise downstream.",
    ),
    "reconciliation_gap": (
        "error",
        "Statement does not reconcile",
        "Opening balance + sum of transactions does not equal the closing "
        "balance printed on the statement. Rows are missing or mis-read.",
    ),
    "reconciled": (
        "info",
        "Statement reconciles to the penny",
        "Opening + sum of transactions equals the printed closing balance "
        "within one cent.",
    ),
    "reconciliation_unavailable": (
        "warning",
        "Could not auto-reconcile",
        "The statement did not expose both an opening and a closing balance in "
        "a recognisable form, so totals are unproven.",
    ),
    "generic_parser": (
        "warning",
        "Parsed with the generic fallback parser",
        "No bank-specific layout matched, so column detection is heuristic. "
        "Treat the column mapping as unverified.",
    ),
    "overdraft": (
        "info",
        "Negative running balance",
        "The account went below zero on this row.",
    ),
    "period_mismatch": (
        "warning",
        "Dates fall outside the statement period",
        "One or more rows are dated outside the period printed on the statement "
        "— likely a year-inference error.",
    ),
}

# Confidence penalties, applied once per distinct code rather than per row.
PENALTY: dict[str, float] = {
    "continuity": 0.30,
    "balance_misread": 0.20,
    "reconciliation_gap": 0.25,
    "generic_parser": 0.18,
    "date_order": 0.08,
    "possible_duplicate": 0.06,
    "duplicate_exact": 0.12,
    "missing_balance": 0.12,
    "future_date": 0.06,
    "period_mismatch": 0.10,
    "weak_description": 0.03,
    "zero_amount": 0.02,
    "large_amount": 0.02,
    "reconciliation_unavailable": 0.10,
}
BONUS_RECONCILED = 0.08

SEVERITY_ORDER = {"error": 0, "warning": 1, "info": 2}


def _as_date(value) -> _date | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return _date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _d(value) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def validate_transactions(txns: list[Txn], meta: dict) -> Report:
    """Validate a parsed statement. Mutates ``txns`` flags in place by design."""
    counts: dict[str, list[int]] = defaultdict(list)
    info_only: set[str] = set()

    for i, txn in enumerate(txns):
        txn.index = i

    _check_rows(txns, counts)
    opening = _d(meta.get("opening"))
    closing = _d(meta.get("closing"))

    # Pre-repair reconciliation. The gap is what tells us whether a repair is
    # provably correct, so it has to be measured before anything is rewritten.
    total_before = round(sum(t.amount for t in txns), 2)
    difference_before, reconciled_before = _reconcile(opening, closing, total_before)

    violations = _continuity_violations(txns)
    _decide_amount_repairs(
        txns, violations, counts, difference_before,
        opening is not None and closing is not None,
    )

    # Final reconciliation, recomputed after any repair.
    total = round(sum(t.amount for t in txns), 2)
    difference, reconciled = _reconcile(opening, closing, total)
    if reconciled is None:
        info_only.add("reconciliation_unavailable")
    elif reconciled:
        info_only.add("reconciled")
    else:
        counts["reconciliation_gap"].append(0)

    _check_period(txns, meta, counts)
    confidence = _score(counts, info_only, reconciled, txns)
    summary = _summarise(txns, opening, closing, total, difference, reconciled, confidence, counts)
    return Report(transactions=txns, summary=summary, findings=_build_findings(counts, info_only))


# ---------------------------------------------------------------------------
# pass 1 — per-row structural checks
# ---------------------------------------------------------------------------

def _check_rows(txns: list[Txn], counts: dict[str, list[int]]) -> None:
    today = _date.today()
    previous: Txn | None = None
    for i, txn in enumerate(txns):
        if txn.amount == 0:
            txn.flag("zero_amount")
            counts["zero_amount"].append(i)
        if abs(txn.amount) > LARGE_AMOUNT:
            txn.flag("large_amount")
            counts["large_amount"].append(i)
        if len((txn.description or "").strip()) < 3:
            txn.flag("weak_description")
            counts["weak_description"].append(i)
        if txn.balance is None:
            txn.flag("missing_balance")
            counts["missing_balance"].append(i)
        elif txn.balance < 0:
            txn.flag("overdraft")
            counts["overdraft"].append(i)

        parsed = _as_date(txn.date)
        if parsed is not None and parsed > today:
            txn.flag("future_date")
            counts["future_date"].append(i)

        if previous is not None:
            if previous.date > txn.date:
                txn.flag("date_order")
                counts["date_order"].append(i)
            if _is_duplicate_of(previous, txn):
                if (
                    previous.balance is not None
                    and txn.balance is not None
                    and abs(previous.balance - txn.balance) < DUPLICATE_TOL
                ):
                    txn.flag("duplicate_exact")
                    counts["duplicate_exact"].append(i)
                else:
                    txn.flag("possible_duplicate")
                    counts["possible_duplicate"].append(i)
        previous = txn


def _is_duplicate_of(a: Txn, b: Txn) -> bool:
    return (
        a.date == b.date
        and (a.description or "").strip() == (b.description or "").strip()
        and abs(a.amount - b.amount) < DUPLICATE_TOL
    )


# ---------------------------------------------------------------------------
# pass 2 — reconciliation
# ---------------------------------------------------------------------------

def _reconcile(opening: float | None, closing: float | None, total: float):
    if opening is None or closing is None:
        return None, None
    difference = round(opening + total - closing, 2)
    return difference, abs(difference) <= RECON_TOL


# ---------------------------------------------------------------------------
# pass 3 — amount repair, only when provably correct
# ---------------------------------------------------------------------------

def _continuity_violations(txns: list[Txn]) -> list[tuple[int, float]]:
    """Rows whose amount does not continue the running balance.

    Returns ``(index, balance_delta)`` where the delta is what the amount would
    have to be for the row to continue the balance.
    """
    out: list[tuple[int, float]] = []
    for i in range(1, len(txns)):
        prev_bal = txns[i - 1].balance
        cur = txns[i]
        if prev_bal is None or cur.balance is None:
            continue
        if abs(prev_bal + cur.amount - cur.balance) > BALANCE_TOL:
            out.append((i, round(cur.balance - prev_bal, 2)))
    return out


def _decide_amount_repairs(
    txns: list[Txn],
    violations: list[tuple[int, float]],
    counts: dict[str, list[int]],
    difference: float | None,
    reconciled_available: bool,
) -> None:
    """Flag — or, only when provable, repair — every continuity violation.

    ``difference`` is the *pre-repair* reconciliation gap. A violation is
    repairable when:
      * the statement failed to reconcile by ``difference``, and
      * there is exactly one violating row across the whole statement, and
      * replacing that row's amount with its balance delta closes the gap
        exactly (``delta - amount == -difference``).

    Under those conditions the change is not a guess: it is the unique edit that
    makes the printed opening and closing balances agree with the row data. With
    two or more breaks the ambiguity is unresolvable from the data available and
    nothing is rewritten.
    """
    repairable = [
        (i, delta) for i, delta in violations
        if reconciled_available
        and difference is not None
        and difference != 0.0
        and _close(delta - txns[i].amount, -difference, REPAIR_TOL)
        and abs(delta) <= LARGE_AMOUNT
        and delta != 0.0
    ]

    if len(repairable) == 1 and len(violations) == 1:
        i, delta = repairable[0]
        original = txns[i].amount
        txns[i].amount_before_repair = original
        txns[i].amount = delta
        if not _close(delta, original, REPAIR_TOL):
            txns[i].flag("amount_repaired")
            counts["amount_repaired"].append(i)
        return
    # Otherwise: report, never rewrite. Pick the most useful code.
    code = "balance_misread" if (reconciled_available and difference == 0.0) else "continuity"
    for i, _delta in violations:
        txns[i].flag(code)
        counts[code].append(i)


# ---------------------------------------------------------------------------
# period + confidence + summary
# ---------------------------------------------------------------------------

def _check_period(txns: list[Txn], meta: dict, counts: dict[str, list[int]]) -> None:
    period = meta.get("period") or {}
    if not isinstance(period, dict):
        return
    start = _as_date(period.get("start"))
    end = _as_date(period.get("end"))
    if not (start and end):
        return
    for i, txn in enumerate(txns):
        parsed = _as_date(txn.date)
        if parsed is not None and (parsed < start or parsed > end):
            txn.flag("period_mismatch")
            counts["period_mismatch"].append(i)


def _score(
    counts: dict[str, list[int]],
    info_only: set[str],
    reconciled: bool | None,
    txns: list[Txn],
) -> float:
    if not txns:
        return 0.0
    confidence = 1.0
    for code in set(counts) | info_only:
        confidence -= PENALTY.get(code, 0.0)
    if reconciled is True:
        confidence += BONUS_RECONCILED
    coverage = sum(1 for t in txns if t.balance is not None) / len(txns)
    confidence -= 0.10 * (1.0 - coverage)
    return round(max(0.0, min(1.0, confidence)), 3)


def _summarise(
    txns: list[Txn],
    opening: float | None,
    closing: float | None,
    total: float,
    difference: float | None,
    reconciled: bool | None,
    confidence: float,
    counts: dict[str, list[int]],
) -> Summary:
    credits = [t.amount for t in txns if t.amount > 0]
    debits = [t.amount for t in txns if t.amount < 0]
    dates = sorted(t.date for t in txns if _as_date(t.date))
    first, last = (dates[0], dates[-1]) if dates else (None, None)
    span = None
    if first and last:
        d0, d1 = _as_date(first), _as_date(last)
        if d0 and d1:
            span = (d1 - d0).days
    return Summary(
        count=len(txns),
        total=total,
        opening=opening,
        closing=closing,
        reconciled=reconciled,
        difference=difference,
        confidence=confidence,
        flagged=sum(1 for t in txns if t.flags),
        credits=round(sum(credits), 2),
        debits=round(sum(debits), 2),
        credit_count=len(credits),
        debit_count=len(debits),
        first_date=first,
        last_date=last,
        span_days=span,
        repaired=len(counts.get("amount_repaired", [])),
    )


def _build_findings(
    counts: dict[str, list[int]], info_only: set[str]
) -> list[Finding]:
    findings: list[Finding] = []
    for code, indices in counts.items():
        findings.append(_finding(code, indices))
    for code in info_only:
        findings.append(_finding(code, []))
    findings.sort(key=lambda f: (SEVERITY_ORDER[f.severity], -f.count, f.code))
    return findings


def _finding(code: str, indices: list[int]) -> Finding:
    severity, message, hint = FINDING_CATALOG[code]
    return Finding(
        code=code,
        severity=severity,
        message=message,
        count=len(indices),
        indices=sorted(indices)[:200],
        hint=hint,
    )

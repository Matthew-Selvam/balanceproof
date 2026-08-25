from pydantic import BaseModel, Field

BALANCE_TOL = 0.005
RECON_TOL = 0.01


class Txn(BaseModel):
    date: str
    description: str
    amount: float
    balance: float | None = None
    flags: list[str] = Field(default_factory=list)


class Report(BaseModel):
    transactions: list[Txn]
    summary: dict


def validate_transactions(txns, meta):
    previous = None
    for txn in txns:
        if txn.balance is None:
            txn.flags.append("missing_balance")
        if previous is not None:
            if previous.date > txn.date:
                txn.flags.append("date_order")
            if (
                previous.balance is not None
                and txn.balance is not None
                and abs(previous.balance + txn.amount - txn.balance) > BALANCE_TOL
            ):
                txn.flags.append("continuity")
            if (
                previous.date == txn.date
                and previous.description == txn.description
                and abs(previous.amount - txn.amount) < 0.001
            ):
                txn.flags.append("possible_duplicate")
        previous = txn

    count = len(txns)
    total = round(sum(t.amount for t in txns), 2)
    opening = meta.get("opening")
    closing = meta.get("closing")
    difference = None
    reconciled = None
    if opening is not None and closing is not None:
        difference = round(opening + total - closing, 2)
        reconciled = abs(difference) <= RECON_TOL
    clean = sum(1 for t in txns if not t.flags)
    confidence = round(clean / count, 3) if count else 0.0
    summary = {
        "count": count,
        "total": total,
        "opening": opening,
        "closing": closing,
        "reconciled": reconciled,
        "difference": difference,
        "confidence": confidence,
    }
    return Report(transactions=txns, summary=summary)

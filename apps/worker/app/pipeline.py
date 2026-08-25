from . import extract
from .banks import detect_bank
from .validate import validate_transactions


def parse_statement(path, filename):
    pages = extract.extract_pdf(path)
    full_text = "\n".join(p["text"] for p in pages)
    bank = detect_bank(full_text)
    meta = extract.extract_meta(full_text)
    transactions = bank.parse(pages, meta)
    report = validate_transactions(transactions, meta)
    return {
        "filename": filename,
        "bank": bank.name,
        "period": meta.get("period"),
        "balances": {"opening": meta.get("opening"), "closing": meta.get("closing")},
        "transactions": [t.model_dump() for t in report.transactions],
        "summary": report.summary,
    }

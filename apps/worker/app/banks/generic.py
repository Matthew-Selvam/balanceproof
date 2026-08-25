import re
from datetime import date

from ..extract import MONEY_RE, money_to_float, normalize_date
from ..validate import Txn

name = "Generic"

DATE_PREFIX_RE = re.compile(
    r"^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s+(.+)$"
)


def matches(text):
    return True


def parse(pages, meta):
    year_hint = _year_from_meta(meta)
    txns = []
    for page in pages:
        for raw_line in page["text"].splitlines():
            line = raw_line.strip()
            date_match = DATE_PREFIX_RE.match(line)
            if not date_match:
                continue
            raw_date, rest = date_match.groups()
            iso = normalize_date(raw_date, year_hint)
            if not iso:
                continue
            tokens = rest.split()
            money_positions = [
                index for index, token in enumerate(tokens) if MONEY_RE.fullmatch(token)
            ]
            if not money_positions:
                continue
            take = money_positions[-2:]
            amount_token = tokens[take[-1]]
            balance_token = tokens[take[0]] if len(take) == 2 else None
            desc_tokens = tokens[: take[0]]
            if not desc_tokens:
                continue
            amount = money_to_float(amount_token)
            if amount is None:
                continue
            txns.append(
                Txn(
                    date=iso,
                    description=" ".join(desc_tokens),
                    amount=amount,
                    balance=money_to_float(balance_token),
                    flags=["generic_parser"],
                )
            )
    return txns


def _year_from_meta(meta):
    period = meta.get("period") or {}
    for value in (period.get("end"), period.get("start")):
        if not value:
            continue
        match = re.search(r"(\d{4})", value)
        if match:
            return int(match.group(1))
    return date.today().year

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


SHORT_DATE_RE = re.compile(r"^(\d{1,2})[/-](\d{1,2})$")


def parse(pages, meta):
    year = _year_from_meta(meta)
    last_short_month = None
    txns = []
    for page in pages:
        for raw_line in page["text"].splitlines():
            line = raw_line.strip()
            date_match = DATE_PREFIX_RE.match(line)
            if not date_match:
                continue
            raw_date, rest = date_match.groups()
            short = SHORT_DATE_RE.match(raw_date)
            if short:
                a, b = (int(x) for x in short.groups())
                month, day = (a, b) if a <= 12 else (b, a)
                if not (1 <= month <= 12 and 1 <= day <= 31):
                    continue
                if last_short_month is not None and last_short_month >= 11 and month <= 2:
                    year += 1
                last_short_month = month
                iso = "{:04d}-{:02d}-{:02d}".format(year, month, day)
            else:
                iso = normalize_date(raw_date, year)
            if not iso:
                continue
            tokens = rest.split()
            money_positions = [
                index for index, token in enumerate(tokens) if MONEY_RE.fullmatch(token)
            ]
            if not money_positions:
                continue
            take = money_positions[-2:]
            amount_token = tokens[take[0]]
            balance_token = tokens[take[-1]] if len(take) == 2 else None
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
    for value in (period.get("start"), period.get("end")):
        if not value:
            continue
        match = re.search(r"(\d{4})", value)
        if match:
            return int(match.group(1))
    return date.today().year

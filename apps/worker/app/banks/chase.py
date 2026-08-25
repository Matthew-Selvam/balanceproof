import re
from datetime import date

from ..extract import money_to_float
from ..validate import Txn

name = "Chase"

KEYWORDS = ("jpmorgan chase", "chase bank", "chase.com")

LINE_RE = re.compile(
    r"^(\d{2}/\d{2})\s+(\d{2}/\d{2})\s+(\S.*?)\s+"
    r"(-?\(?[\d,]+\.\d{2}\)?)\s+(-?\(?[\d,]+\.\d{2}\)?)\s*$"
)


def matches(text):
    lowered = text.lower()
    return any(k in lowered for k in KEYWORDS)


def parse(pages, meta):
    year = _infer_year(meta)
    txns = []
    last_month = None
    for page in pages:
        for raw_line in page["text"].splitlines():
            line = raw_line.strip()
            match = LINE_RE.match(line)
            if not match:
                continue
            post_date, _, description, amount_raw, balance_raw = match.groups()
            month = int(post_date.split("/")[0])
            day = int(post_date.split("/")[1])
            if last_month is not None and last_month >= 11 and month <= 2:
                year += 1
            last_month = month
            txns.append(
                Txn(
                    date="{:04d}-{:02d}-{:02d}".format(year, month, day),
                    description=description.strip(),
                    amount=money_to_float(amount_raw) or 0.0,
                    balance=money_to_float(balance_raw),
                )
            )
    return txns


def _infer_year(meta):
    period = meta.get("period") or {}
    for value in (period.get("start"), period.get("end")):
        if not value:
            continue
        match = re.search(r"(\d{4})", value)
        if match:
            return int(match.group(1))
    return date.today().year

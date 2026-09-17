"""Chase layout — ``MM/DD MM/DD DESCRIPTION AMOUNT BALANCE``.

Chase prints two dates per row (transaction date and posting date) using a
short ``MM/DD`` form, so the year has to be inferred from the statement period.
Kept as a named module for backwards compatibility; the real work is done by
the shared layout engine.
"""

import re

from ..models import Txn
from .layouts import DATE_RE, parse_pages

name = "Chase"
BANK_ID = "chase"

KEYWORDS = ("jpmorgan chase", "chase bank", "chase.com")

LINE_RE = re.compile(
    r"^(\d{2}/\d{2})\s+(\d{2}/\d{2})\s+(\S.*?)\s+"
    r"(-?\(?[\d,]+\.\d{2}\)?)\s+(-?\(?[\d,]+\.\d{2}\)?)\s*$"
)


def matches(text: str) -> bool:
    lowered = (text or "").lower()
    return any(k in lowered for k in KEYWORDS)


def parse(pages, meta) -> list[Txn]:
    return parse_pages(pages, meta, two_dates=True)


__all__ = ["DATE_RE", "LINE_RE", "KEYWORDS", "name", "BANK_ID", "matches", "parse"]

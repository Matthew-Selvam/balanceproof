"""Generic fallback layout.

Used when no institution keyword matches. Column detection is heuristic, so
every row is stamped ``generic_parser`` and the validator penalises confidence.
"""

from ..models import Txn
from .layouts import parse_pages

name = "Generic"
BANK_ID = "generic"


def matches(_text: str) -> bool:
    return True


def parse(pages, meta) -> list[Txn]:
    return parse_pages(pages, meta, layout_flags=["generic_parser"])


__all__ = ["name", "BANK_ID", "matches", "parse"]

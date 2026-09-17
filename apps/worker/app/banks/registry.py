"""Bank registry.

Adding a bank is a config entry here plus (optionally) a keyword list. The
registry produces a ranked list of candidates so the UI can show "matched on
'chase.com'" and the runner-up, which is how the accuracy claim stays honest.

Each ``BankSpec`` declares:
  * ``keywords``  — lowercase substrings that indicate this institution
  * ``layout``    — how rows look: "two_dates" (Chase), "amount_balance",
                    or "ruled_table"
  * ``flags``     — provenance flags stamped on every row this parser produces
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..models import BankMatch
from .layouts import parse_pages


@dataclass(frozen=True)
class BankSpec:
    id: str
    name: str
    keywords: tuple[str, ...]
    layout: str = "amount_balance"
    flags: list[str] = field(default_factory=list)
    # Institution family used for grouping in the UI / SEO pages.
    country: str = "US"
    kind: str = "bank"  # bank | credit_card | brokerage | fintech


REGISTRY: list[BankSpec] = [
    BankSpec(
        id="chase",
        name="Chase",
        keywords=("jpmorgan chase", "chase bank", "chase.com", "chase.com/"),
        layout="two_dates",
    ),
    BankSpec(
        id="bank_of_america",
        name="Bank of America",
        keywords=("bank of america", "bofa", "bankofamerica.com"),
        layout="amount_balance",
    ),
    BankSpec(
        id="wells_fargo",
        name="Wells Fargo",
        keywords=("wells fargo", "wellsfargo.com"),
        layout="amount_balance",
    ),
    BankSpec(
        id="capital_one",
        name="Capital One",
        keywords=("capital one", "capitalone.com"),
        layout="ruled_table",
        kind="credit_card",
    ),
    BankSpec(
        id="citi",
        name="Citi",
        keywords=("citibank", "citi.com", "citi cards"),
        layout="ruled_table",
    ),
    BankSpec(
        id="us_bank",
        name="U.S. Bank",
        keywords=("u.s. bank", "us bank", "usbank.com"),
        layout="amount_balance",
    ),
    BankSpec(
        id="usaa",
        name="USAA",
        keywords=("usaa", "usaa.com"),
        layout="amount_balance",
    ),
    BankSpec(
        id="pnc",
        name="PNC Bank",
        keywords=("pnc bank", "pnc.com"),
        layout="amount_balance",
    ),
    BankSpec(
        id="td_bank",
        name="TD Bank",
        keywords=("td bank", "tdbank.com"),
        layout="amount_balance",
    ),
    BankSpec(
        id="truist",
        name="Truist",
        keywords=("truist", "bb&t", "suntrust"),
        layout="amount_balance",
    ),
    BankSpec(
        id="ally",
        name="Ally Bank",
        keywords=("ally bank", "ally.com"),
        layout="amount_balance",
    ),
    BankSpec(
        id="discover",
        name="Discover",
        keywords=("discover card", "discover.com", "discover bank"),
        layout="ruled_table",
        kind="credit_card",
    ),
    BankSpec(
        id="american_express",
        name="American Express",
        keywords=("american express", "amex", "americanexpress.com"),
        layout="ruled_table",
        kind="credit_card",
    ),
    BankSpec(
        id="navy_federal",
        name="Navy Federal",
        keywords=("navy federal", "navyfederal.org"),
        layout="amount_balance",
    ),
    BankSpec(
        id="schwab",
        name="Charles Schwab",
        keywords=("charles schwab", "schwab.com"),
        layout="amount_balance",
        kind="brokerage",
    ),
    BankSpec(
        id="fidelity",
        name="Fidelity",
        keywords=("fidelity investments", "fidelity.com"),
        layout="amount_balance",
        kind="brokerage",
    ),
    BankSpec(
        id="regions",
        name="Regions Bank",
        keywords=("regions bank", "regions.com"),
        layout="amount_balance",
    ),
    BankSpec(
        id="fifth_third",
        name="Fifth Third Bank",
        keywords=("fifth third", "53.com"),
        layout="amount_balance",
    ),
    BankSpec(
        id="huntington",
        name="Huntington Bank",
        keywords=("huntington bank", "huntington.com"),
        layout="amount_balance",
    ),
    BankSpec(
        id="monzo",
        name="Monzo",
        keywords=("monzo", "monzo.com"),
        layout="ruled_table",
        country="UK",
        kind="fintech",
    ),
    BankSpec(
        id="barclays",
        name="Barclays",
        keywords=("barclays", "barclays.co.uk"),
        layout="ruled_table",
        country="UK",
    ),
    BankSpec(
        id="hsbc",
        name="HSBC",
        keywords=("hsbc", "hsbc.co.uk"),
        layout="ruled_table",
        country="UK",
    ),
    BankSpec(
        id="natwest",
        name="NatWest",
        keywords=("natwest", "natwest.com"),
        layout="ruled_table",
        country="UK",
    ),
    BankSpec(
        id="lloyds",
        name="Lloyds Bank",
        keywords=("lloyds bank", "lloydsbank.com"),
        layout="ruled_table",
        country="UK",
    ),
    BankSpec(
        id="rbc",
        name="RBC Royal Bank",
        keywords=("royal bank of canada", "rbc royal bank", "rbc.com"),
        layout="amount_balance",
        country="CA",
    ),
    BankSpec(
        id="scotiabank",
        name="Scotiabank",
        keywords=("scotiabank", "scotia online"),
        layout="amount_balance",
        country="CA",
    ),
    BankSpec(
        id="commonwealth",
        name="Commonwealth Bank",
        keywords=("commonwealth bank", "commbank"),
        layout="ruled_table",
        country="AU",
    ),
    BankSpec(
        id="hdfc",
        name="HDFC Bank",
        keywords=("hdfc bank", "hdfcbank"),
        layout="amount_balance",
        country="IN",
    ),
    BankSpec(
        id="icici",
        name="ICICI Bank",
        keywords=("icici bank", "icicibank"),
        layout="amount_balance",
        country="IN",
    ),
    BankSpec(
        id="sbi",
        name="State Bank of India",
        keywords=("state bank of india", "sbi.co.in", "onlinesbi"),
        layout="amount_balance",
        country="IN",
    ),
    BankSpec(
        id="revolut",
        name="Revolut",
        keywords=("revolut",),
        layout="ruled_table",
        kind="fintech",
    ),
    BankSpec(
        id="wise",
        name="Wise",
        keywords=("wise payments", "transferwise"),
        layout="ruled_table",
        kind="fintech",
    ),
]

GENERIC = BankSpec(
    id="generic",
    name="Generic",
    keywords=(),
    layout="amount_balance",
    flags=["generic_parser"],
)

_WHITESPACE_RE = re.compile(r"\s+")


def normalize(text: str) -> str:
    return _WHITESPACE_RE.sub(" ", (text or "").lower())


def candidates(text: str, limit: int = 3) -> list[BankMatch]:
    """Rank banks by keyword evidence. Highest score first, generic last."""
    haystack = normalize(text)
    scored: list[BankMatch] = []
    for spec in REGISTRY:
        best: str | None = None
        for keyword in spec.keywords:
            if keyword in haystack:
                if best is None or len(keyword) > len(best):
                    best = keyword
        if best is not None:
            # Longer, more specific keywords are stronger evidence.
            confidence = min(1.0, 0.55 + len(best) / 40.0)
            scored.append(
                BankMatch(id=spec.id, name=spec.name, confidence=round(confidence, 3),
                          matched_on=best)
            )
    scored.sort(key=lambda m: (-m.confidence, m.id))
    if not scored:
        scored.append(BankMatch(id=GENERIC.id, name=GENERIC.name, confidence=0.0,
                                matched_on=None))
    return scored[:limit]


def resolve(bank_id: str) -> BankSpec:
    """Look up a spec by id, or return a synthetic spec for user-configured banks."""
    for spec in REGISTRY:
        if spec.id == bank_id:
            return spec
    if bank_id == GENERIC.id:
        return GENERIC
    # Unknown id: custom/tenant bank config. Parse with the generic layout.
    return BankSpec(
        id=bank_id,
        name=bank_id.replace("_", " ").title(),
        keywords=(),
        layout="amount_balance",
        flags=["custom_layout"],
    )


def detect_bank(text: str) -> BankMatch:
    """Back-compat: the single best match."""
    return candidates(text, limit=1)[0]


def parse_with(bank_id: str, pages: list[dict], meta: dict):
    """Run the named bank's layout over the pages."""
    spec = resolve(bank_id)
    return parse_pages(
        pages,
        meta,
        two_dates=spec.layout == "two_dates",
        layout_flags=spec.flags or None,
        prefer_tables=spec.layout in ("ruled_table", "amount_balance"),
    )


def parse(pages: list[dict], meta: dict):
    """Back-compat shim for the old ``banks.detect_bank(...).parse(...)`` shape."""
    full_text = "\n".join(p.get("text") or "" for p in pages)
    return parse_with(detect_bank(full_text).id, pages, meta)

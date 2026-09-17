"""Bank parser package.

The supported institution list lives in :mod:`app.banks.registry`.
``chase`` and ``generic`` remain as thin compatibility shims over the layout
engine so existing call sites keep working.
"""

from . import chase, generic
from .registry import (
    GENERIC,
    REGISTRY,
    BankSpec,
    candidates,
    detect_bank,
    normalize,
    parse,
    parse_with,
    resolve,
)

__all__ = [
    "chase",
    "generic",
    "GENERIC",
    "REGISTRY",
    "BankSpec",
    "candidates",
    "detect_bank",
    "normalize",
    "parse",
    "parse_with",
    "resolve",
]

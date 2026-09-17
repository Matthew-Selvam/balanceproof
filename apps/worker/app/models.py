"""Shared data contracts for the BalanceProof worker.

Everything that crosses the process boundary (worker -> web -> browser) is
defined here so the TS types in apps/web/src/lib/types.ts stay in lockstep.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Severity = Literal["error", "warning", "info"]


class Txn(BaseModel):
    """A single statement line item."""

    index: int = 0
    date: str
    description: str
    amount: float
    balance: float | None = None
    flags: list[str] = Field(default_factory=list)
    page: int | None = None
    source: str | None = None
    amount_before_repair: float | None = None

    def flag(self, code: str) -> None:
        if code not in self.flags:
            self.flags.append(code)


class Finding(BaseModel):
    """An aggregated, human-readable observation produced by the validation pass.

    Findings are the product's differentiator: instead of a bare CSV, the user
    gets a set of named, counted, explained issues with row indices.
    """

    code: str
    severity: Severity
    message: str
    count: int = 0
    indices: list[int] = Field(default_factory=list)
    hint: str | None = None


class BankMatch(BaseModel):
    id: str
    name: str
    confidence: float = 1.0
    matched_on: str | None = None


class Summary(BaseModel):
    count: int = 0
    total: float = 0.0
    opening: float | None = None
    closing: float | None = None
    reconciled: bool | None = None
    difference: float | None = None
    confidence: float = 0.0
    flagged: int = 0
    credits: float = 0.0
    debits: float = 0.0
    credit_count: int = 0
    debit_count: int = 0
    first_date: str | None = None
    last_date: str | None = None
    span_days: int | None = None
    pages: int = 0
    repaired: int = 0
    bank: str | None = None


class ParseResult(BaseModel):
    filename: str
    pages: int = 0
    bank: BankMatch
    period: dict | None = None
    balances: dict = Field(default_factory=dict)
    transactions: list[Txn] = Field(default_factory=list)
    findings: list[Finding] = Field(default_factory=list)
    summary: Summary = Field(default_factory=Summary)
    parse_ms: int = 0
    limitations: list[str] = Field(default_factory=list)


class Report(BaseModel):
    transactions: list[Txn]
    summary: Summary
    findings: list[Finding] = Field(default_factory=list)

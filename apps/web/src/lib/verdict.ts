/**
 * The single source of truth for "what does this statement's state mean".
 *
 * Every surface — recon banner, badge, table row tint, stats page — derives its
 * verdict from `verdictOf` so a statement can never be green in one place and
 * amber in another.
 */

import type { Finding, ParseResult, Severity, Summary, Transaction } from "./types";

export type Verdict = "proven" | "review" | "unproven" | "unavailable";

export interface VerdictInfo {
  id: Verdict;
  label: string;
  headline: string;
  detail: string;
  /** Tailwind token classes, resolved through globals.css tokens. */
  tone: {
    text: string;
    bg: string;
    border: string;
    dot: string;
  };
  /** Sort weight: lower sorts first when scanning a list for problems. */
  weight: number;
}

const TONES = {
  proven: {
    text: "text-proof-400",
    bg: "bg-proof-500/10",
    border: "border-proof-500/35",
    dot: "bg-proof-400",
  },
  review: {
    text: "text-warn-400",
    bg: "bg-warn-500/10",
    border: "border-warn-500/35",
    dot: "bg-warn-400",
  },
  unproven: {
    text: "text-broken-400",
    bg: "bg-broken-500/10",
    border: "border-broken-500/35",
    dot: "bg-broken-400",
  },
  unavailable: {
    text: "text-fg-muted",
    bg: "bg-ink-700/40",
    border: "border-ink-600",
    dot: "bg-fg-subtle",
  },
} as const;

export const VERDICTS: Record<Verdict, VerdictInfo> = {
  proven: {
    id: "proven",
    label: "Proven",
    headline: "Reconciled to the penny",
    detail:
      "Opening balance plus every transaction equals the closing balance printed on the statement. The numbers in this export are arithmetically closed.",
    tone: TONES.proven,
    weight: 3,
  },
  review: {
    id: "review",
    label: "Needs review",
    headline: "Reconciled, with flagged rows",
    detail:
      "The totals close, but one or more rows carry a warning. The money is right; the details are worth a look.",
    tone: TONES.review,
    weight: 2,
  },
  unproven: {
    id: "unproven",
    label: "Does not reconcile",
    headline: "Totals do not close",
    detail:
      "Opening plus transactions does not equal the printed closing balance. Rows are missing or mis-read — do not import this export without fixing it.",
    tone: TONES.unproven,
    weight: 0,
  },
  unavailable: {
    id: "unavailable",
    label: "Unproven",
    headline: "No printed balances to check against",
    detail:
      "The statement did not expose a usable opening and closing balance, so the totals could not be verified either way.",
    tone: TONES.unavailable,
    weight: 1,
  },
};

/** Error-severity findings that describe a broken statement rather than a row. */
const STATEMENT_LEVEL = new Set(["reconciliation_gap", "reconciliation_unavailable"]);

export function verdictOf(
  summary: Pick<Summary, "reconciled" | "flagged" | "count"> | null | undefined,
  findings: Finding[] = [],
): VerdictInfo {
  if (!summary) return VERDICTS.unavailable;
  if (summary.reconciled === true) {
    // A repair is a change to the data, so it always deserves a look even when
    // the statement closes.
    const warnings = findings.filter(
      (f) =>
        f.severity !== "info" &&
        !STATEMENT_LEVEL.has(f.code) &&
        f.code !== "generic_parser",
    );
    const repaired = findings.some((f) => f.code === "amount_repaired");
    return warnings.length > 0 || repaired ? VERDICTS.review : VERDICTS.proven;
  }
  if (summary.reconciled === false) return VERDICTS.unproven;
  return VERDICTS.unavailable;
}

export function severityTone(severity: Severity): string {
  switch (severity) {
    case "error":
      return "text-broken-400 bg-broken-500/10 border-broken-500/30";
    case "warning":
      return "text-warn-400 bg-warn-500/10 border-warn-500/30";
    default:
      return "text-fg-muted bg-ink-700/40 border-ink-600";
  }
}

/** Flags that mean "a human should look at this row". */
const BENIGN_ROW_FLAGS = new Set(["generic_parser", "overdraft"]);

export function rowNeedsAttention(txn: Transaction): boolean {
  return txn.flags.some((f) => !BENIGN_ROW_FLAGS.has(f));
}

export function rowHasError(txn: Transaction): boolean {
  return txn.flags.some((f) =>
    ["continuity", "balance_misread", "duplicate_exact", "reconciliation_gap"].includes(f),
  );
}

export function countFlaggedRows(result: Pick<ParseResult, "transactions">): number {
  return result.transactions.filter(rowNeedsAttention).length;
}

/**
 * Wire types shared with the parsing worker (apps/worker/app/models.py).
 * If you change a field here, change it there too — the worker test suite
 * asserts the payload shape.
 */

export type Severity = "error" | "warning" | "info";

export interface Transaction {
  index: number;
  date: string;
  description: string;
  amount: number;
  balance: number | null;
  flags: string[];
  page: number | null;
  source?: string | null;
  amount_before_repair?: number | null;
}

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  count: number;
  indices: number[];
  hint: string | null;
}

export interface BankMatch {
  id: string;
  name: string;
  confidence: number;
  matched_on: string | null;
}

export interface Summary {
  count: number;
  total: number;
  opening: number | null;
  closing: number | null;
  reconciled: boolean | null;
  difference: number | null;
  confidence: number;
  flagged: number;
  credits: number;
  debits: number;
  credit_count: number;
  debit_count: number;
  first_date: string | null;
  last_date: string | null;
  span_days: number | null;
  pages: number;
  repaired: number;
  bank: string | null;
}

export interface ParseResult {
  filename: string;
  pages: number;
  bank: BankMatch;
  period: { start?: string | null; end?: string | null } | null;
  balances: { opening: number | null; closing: number | null };
  transactions: Transaction[];
  findings: Finding[];
  summary: Summary;
  parse_ms: number;
  limitations: string[];
  preview?: { pages: number; truncated: boolean };
}

export type StatementStatus = "processing" | "done" | "error";

export interface StatementRecord {
  id: string;
  filename: string;
  status: StatementStatus;
  error: string | null;
  createdAt: string;
  data: ParseResult | null;
}

/** A statement list row, without the (large) parse payload. */
export interface StatementListItem {
  id: string;
  filename: string;
  status: StatementStatus;
  error: string | null;
  createdAt: string;
  bank: string | null;
  count: number;
  reconciled: boolean | null;
  confidence: number;
  total: number;
}

export interface Stats {
  statements: number;
  transactions: number;
  reconciled: number;
  unresolved: number;
  broken: number;
  bankCount: number;
  averageConfidence: number;
  byStatus: { status: StatementStatus; count: number }[];
  byBank: { bank: string; count: number; reconciled: number }[];
  recentRuns: { id: string; filename: string; createdAt: string; reconciled: boolean | null }[];
}

export type ExportFormat = "csv" | "xlsx" | "qbo" | "ofx" | "json";

export const EXPORT_FORMATS: {
  id: ExportFormat;
  label: string;
  extension: string;
  description: string;
  audience: string;
}[] = [
  {
    id: "xlsx",
    label: "Excel workbook",
    extension: "xlsx",
    description: "Summary, transactions and findings on separate sheets.",
    audience: "Spreadsheet review",
  },
  {
    id: "csv",
    label: "CSV",
    extension: "csv",
    description: "Plain five-column file with flags inline.",
    audience: "Any tool",
  },
  {
    id: "qbo",
    label: "QuickBooks (QBO)",
    extension: "csv",
    description: "QuickBooks Online import shape with credit/check types.",
    audience: "QuickBooks Online",
  },
  {
    id: "ofx",
    label: "OFX",
    extension: "ofx",
    description: "Open Financial Exchange, for Xero and desktop QuickBooks.",
    audience: "Xero / QB desktop",
  },
  {
    id: "json",
    label: "JSON",
    extension: "json",
    description: "Raw parsed rows plus findings, for your own pipeline.",
    audience: "Automation",
  },
];

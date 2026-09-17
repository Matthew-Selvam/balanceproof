/** Number, currency and date formatting. One implementation, used everywhere. */

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const MONEY_ABS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return MONEY.format(value);
}

/** Signed money, with the sign always explicit — critical for ledger review. */
export function formatSignedMoney(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${MONEY_ABS.format(Math.abs(value))}`;
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

/** ISO date -> "12 Mar 2027". Falls back to the raw string, never "Invalid Date". */
export function formatDate(iso: string | null | undefined): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return iso ?? "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function formatRelative(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const seconds = Math.round((Date.now() - parsed.getTime()) / 1000);
  const table: [Intl.RelativeTimeFormatUnit, number][] = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 7],
    ["week", 4.5],
    ["month", 12],
  ];
  let unit: Intl.RelativeTimeFormatUnit = "second";
  let amount = seconds;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [nextUnit, divisor] of table) {
    if (Math.abs(amount) < divisor) {
      unit = nextUnit;
      break;
    }
    amount /= divisor;
    unit = nextUnit;
  }
  return rtf.format(-Math.round(amount), unit);
}

/**
 * Parse an ISO date, optionally with a time part, as UTC.
 *
 * `new Date("2026-01-05")` is parsed as UTC midnight while
 * `new Date("2026-01-05T00:00:00")` is parsed as *local* midnight, which shifts
 * the displayed day by one in negative-offset timezones. Statement dates are
 * calendar dates, so they must never be timezone-shifted.
 */
export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  const [, y, m, d] = match;
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** "USD 1,234.56" style label without the symbol, for export previews. */
export function formatMoneyPlain(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return MONEY_ABS.format(value).replace("$", "");
}

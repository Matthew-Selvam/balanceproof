/**
 * Query-string validation for the API routes.
 *
 * Hand-rolled rather than pulled in from a validation library: there are only
 * two shapes, and an illegal value must produce a helpful message instead of a
 * stack trace. Every route reads its parameters through here so that
 * `?limit=abc` or `?format=../../etc/passwd` is rejected at the boundary.
 */

export type ExportFormat = "csv" | "xlsx" | "qbo" | "ofx" | "json";

const EXPORT_FORMATS: readonly ExportFormat[] = ["csv", "xlsx", "qbo", "ofx", "json"];
export const DEFAULT_EXPORT_FORMAT: ExportFormat = "csv";

export interface ExportQuery {
  format: ExportFormat;
  onlyFlagged: boolean;
  label?: string;
  /** Rows carrying any of these flags are excluded. */
  hideInfo: boolean;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseExportQuery(params: URLSearchParams): ValidationResult<ExportQuery> {
  const raw = params.get("format") ?? DEFAULT_EXPORT_FORMAT;
  const format = raw.toLowerCase();
  if (!EXPORT_FORMATS.includes(format as ExportFormat)) {
    return {
      ok: false,
      error: `Unsupported format '${raw}'. Choose one of: ${EXPORT_FORMATS.join(", ")}.`,
    };
  }

  const label = params.get("label") ?? undefined;
  if (label !== undefined && !/^[A-Za-z0-9._-]{1,64}$/.test(label)) {
    return {
      ok: false,
      error: "Label may only contain letters, numbers, dot, dash and underscore (max 64 chars).",
    };
  }

  const truthy = new Set(["1", "true", "yes"]);
  return {
    ok: true,
    value: {
      format: format as ExportFormat,
      onlyFlagged: truthy.has((params.get("onlyFlagged") ?? "").toLowerCase()),
      hideInfo: truthy.has((params.get("hideInfo") ?? "").toLowerCase()),
      ...(label ? { label } : {}),
    },
  };
}

export interface ListQuery {
  limit: number;
  offset: number;
  status: "all" | "processing" | "done" | "error";
  bank?: string;
  search?: string;
}

const STATUSES = ["all", "processing", "done", "error"] as const;

export function parseListQuery(params: URLSearchParams): ValidationResult<ListQuery> {
  const limit = clampInt(params.get("limit"), 25, 1, 100);
  if (limit === null) return { ok: false, error: "limit must be a whole number between 1 and 100." };
  const offset = clampInt(params.get("offset"), 0, 0, 100_000);
  if (offset === null) return { ok: false, error: "offset must be a whole number." };

  const status = (params.get("status") ?? "all").toLowerCase();
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) {
    return { ok: false, error: `status must be one of: ${STATUSES.join(", ")}.` };
  }

  const bank = params.get("bank") ?? undefined;
  if (bank !== undefined && !/^[A-Za-z0-9_]{1,64}$/.test(bank)) {
    return { ok: false, error: "bank must be a bank id (letters, numbers, underscore)." };
  }

  const search = params.get("q") ?? undefined;
  if (search !== undefined && search.length > 120) {
    return { ok: false, error: "Search term is too long (max 120 characters)." };
  }

  return {
    ok: true,
    value: {
      limit,
      offset,
      status: status as ListQuery["status"],
      ...(bank ? { bank } : {}),
      ...(search ? { search } : {}),
    },
  };
}

function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number | null {
  if (raw === null || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  if (value < min || value > max) return fallback === 0 ? null : Math.min(Math.max(value, min), max);
  return value;
}

/** A UUID check that does not depend on a regex `v` flag for case handling. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

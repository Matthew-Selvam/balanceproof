/**
 * Client for the parsing worker.
 *
 * All worker access goes through here so that the base URL, API key, timeouts
 * and error shapes are handled in one place. Every function takes/returns
 * plain data and never throws for an expected failure (bad PDF, scan, timeout)
 * — it returns a discriminated result the caller can render.
 */

const BASE = (process.env.WORKER_URL ?? "http://localhost:8000").replace(/\/$/, "");
const API_KEY = process.env.WORKER_API_KEY ?? "";
const DEFAULT_TIMEOUT_MS = Number(process.env.WORKER_TIMEOUT_MS ?? 180_000);

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { ...extra };
  if (API_KEY) h["x-api-key"] = API_KEY;
  return h;
}

export type WorkerOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

async function parseError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") return body.detail;
    if (typeof body?.error === "string") return body.error;
    if (Array.isArray(body?.detail)) {
      return body.detail.map((d: { msg?: string }) => d.msg ?? "").join("; ");
    }
  } catch {
    /* fall through to the generic message */
  }
  return `Worker responded ${response.status}`;
}

/**
 * Parse by absolute path.
 *
 * The worker confines this path to its own STORAGE_DIR, so the web app must send
 * a file it wrote there itself.
 */
export async function parseByPath(
  absolutePath: string,
  filename: string,
): Promise<WorkerOutcome<Record<string, unknown>>> {
  try {
    const response = await fetch(`${BASE}/parse`, {
      method: "POST",
      headers: headers({ "content-type": "application/json" }),
      body: JSON.stringify({ path: absolutePath, filename }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false, error: await parseError(response), status: response.status };
    }
    return { ok: true, data: await response.json() };
  } catch (error) {
    return { ok: false, error: describeFetchFailure(error), status: 502 };
  }
}

export interface WorkerHealth {
  ok: boolean;
  version?: string;
  banks?: number;
  auth?: boolean;
}

export async function workerHealth(): Promise<WorkerHealth> {
  try {
    const response = await fetch(`${BASE}/healthz`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return { ok: false };
    return { ok: true, ...(await response.json()) };
  } catch {
    return { ok: false };
  }
}

export async function workerBanks(): Promise<
  { id: string; name: string; layout: string; country: string; kind: string }[]
> {
  try {
    const response = await fetch(`${BASE}/banks`, {
      headers: headers(),
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return [];
    const body = await response.json();
    return Array.isArray(body?.banks) ? body.banks : [];
  } catch {
    return [];
  }
}

/** Render an already-stored result into a download format, server-side. */
export async function exportViaWorker(
  format: string,
  result: unknown,
): Promise<WorkerOutcome<{ body: ArrayBuffer; contentType: string }>> {
  try {
    const response = await fetch(`${BASE}/export`, {
      method: "POST",
      headers: headers({ "content-type": "application/json" }),
      body: JSON.stringify({ format, result }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false, error: await parseError(response), status: response.status };
    }
    return {
      ok: true,
      data: {
        body: await response.arrayBuffer(),
        contentType: response.headers.get("content-type") ?? "application/octet-stream",
      },
    };
  } catch (error) {
    return { ok: false, error: describeFetchFailure(error), status: 502 };
  }
}

function describeFetchFailure(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return "The parsing worker timed out. Very large or complex statements can exceed the limit — try splitting the file.";
    }
    if (error.message.includes("ECONNREFUSED") || error.message.includes("fetch failed")) {
      return "The parsing worker is unreachable. Check that the worker container is running.";
    }
    return error.message;
  }
  return "Unknown worker error";
}

import { ensureSchema, sql } from "@/lib/db";
import { clientKey, LIMITS, rateLimit } from "@/lib/rate-limit";
import { parseListQuery } from "@/lib/schemas";
import { saveUpload } from "@/lib/storage";
import type { ParseResult } from "@/lib/types";
import { inspectBatch, inspectPdf } from "@/lib/upload";
import { parseByPath } from "@/lib/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/statements — paginated history for the dashboard. */
export async function GET(request: Request) {
  const limited = rateLimit(clientKey(request), LIMITS.read.limit, LIMITS.read.windowMs);
  if (!limited.allowed) {
    return Response.json(
      { error: "Too many requests. Slow down for a moment." },
      { status: 429, headers: { "retry-after": "30" } },
    );
  }

  const parsed = parseListQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const { limit, offset, status, bank, search } = parsed.value;

  await ensureSchema();

  // jsonb extraction keeps the list query off the (much larger) results blob.
  const rows = await sql`
    select
      s.id,
      s.filename,
      s.status,
      s.error,
      s.created_at,
      r.data ->> 'bank' as bank_raw,
      coalesce((r.data -> 'summary' ->> 'count')::int, 0) as txn_count,
      (r.data -> 'summary' ->> 'reconciled')::boolean as reconciled,
      coalesce((r.data -> 'summary' ->> 'confidence')::float, 0) as confidence,
      coalesce((r.data -> 'summary' ->> 'total')::float, 0) as total
    from statements s
    left join results r on r.statement_id = s.id
    where (${status} = 'all' or s.status = ${status})
      and (${bank ?? null}::text is null or r.data -> 'bank' ->> 'id' = ${bank ?? null})
      and (${search ?? null}::text is null or s.filename ilike ${"%" + (search ?? "") + "%"})
    order by s.created_at desc
    limit ${limit} offset ${offset}
  `;

  const counts = await sql`
    select count(*)::int as total from statements
    where (${status} = 'all' or status = ${status})
      and (${search ?? null}::text is null or filename ilike ${"%" + (search ?? "") + "%"})
  `;

  return Response.json({
    statements: rows.map((row) => ({
      id: row.id,
      filename: row.filename,
      status: row.status,
      error: row.error,
      createdAt: row.created_at,
      bank: extractBankName(row.bank_raw),
      count: row.txn_count ?? 0,
      reconciled: row.reconciled ?? null,
      confidence: row.confidence ?? 0,
      total: row.total ?? 0,
    })),
    total: counts[0]?.total ?? 0,
    limit,
    offset,
  });
}

/**
 * Uploads are stored as jsonb in `results.data.bank`, which can be either an
 * object (current worker) or a bare string (older payloads). Normalise both.
 */
function extractBankName(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && "name" in parsed) {
        return String((parsed as { name?: unknown }).name ?? "") || null;
      }
      return raw || null;
    } catch {
      return raw || null;
    }
  }
  if (typeof raw === "object" && raw !== null && "name" in raw) {
    return String((raw as { name?: unknown }).name ?? "") || null;
  }
  return null;
}

/** POST /api/statements — validate, store and parse one uploaded PDF. */
export async function POST(request: Request) {
  const limited = rateLimit(clientKey(request), LIMITS.upload.limit, LIMITS.upload.windowMs);
  if (!limited.allowed) {
    return Response.json(
      {
        error: `Upload limit reached (${limited.limit} per minute). Try again shortly.`,
      },
      { status: 429, headers: { "retry-after": "60" } },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data." }, { status: 400 });
  }

  const raw = form.get("file");
  if (!(raw instanceof File)) {
    return Response.json({ error: "No file was included in the request." }, { status: 400 });
  }

  const batch = inspectBatch([{ name: raw.name, size: raw.size }]);
  if (!batch.ok) return Response.json({ error: batch.error }, { status: 400 });

  const buffer = Buffer.from(await raw.arrayBuffer());
  const inspection = inspectPdf(buffer);
  if (!inspection.ok) {
    return Response.json(
      {
        error: inspection.problems[0]?.message ?? "That file could not be accepted.",
        problems: inspection.problems.map((p) => p.code),
      },
      { status: 415 },
    );
  }

  await ensureSchema();
  const saved = await saveUpload(buffer, raw.name);
  const inserted = await sql`
    insert into statements (filename, byte_size, sha256, storage_path, attempts)
    values (${raw.name.slice(0, 200)}, ${saved.byteSize}, ${saved.sha256}, ${saved.absolutePath}, 1)
    returning id
  `;
  const id = inserted[0]!.id as string;

  const outcome = await parseByPath(saved.absolutePath, raw.name);
  if (!outcome.ok) {
    await sql`
      update statements set status = 'error', error = ${outcome.error}
      where id = ${id}::uuid
    `;
    // 200 with a structured failure: the row exists and is pollable, and the
    // client renders the error against the file it uploaded.
    return Response.json({
      id,
      filename: raw.name,
      status: "error",
      error: outcome.error,
      warnings: inspection.warnings,
    });
  }

  const result = outcome.data as unknown as ParseResult;
  await sql`
    update statements set status = 'done', error = null where id = ${id}::uuid
  `;
  await sql`
    insert into results (statement_id, data) values (${id}::uuid, ${sql.json(result as never)})
    on conflict (statement_id) do update set data = excluded.data, created_at = now()
  `;

  return Response.json(
    {
      id,
      filename: raw.name,
      status: "done",
      summary: result.summary,
      bank: result.bank,
      findings: result.findings?.length ?? 0,
      warnings: inspection.warnings,
    },
    { status: 201 },
  );
}

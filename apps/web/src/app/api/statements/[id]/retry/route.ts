import { ensureSchema, sql } from "@/lib/db";
import { clientKey, LIMITS, rateLimit } from "@/lib/rate-limit";
import { isUuid } from "@/lib/schemas";
import type { ParseResult } from "@/lib/types";
import { parseByPath } from "@/lib/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_ATTEMPTS = 5;

/**
 * POST /api/statements/[id]/retry
 *
 * Re-runs the parser against the file already on disk. The original upload is
 * kept (`storage_path`), so re-parsing never asks the user to find the PDF
 * again — the common case when a parse fails for a transient reason (worker was
 * restarting) or when a bank layout has since been fixed.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(clientKey(request), LIMITS.upload.limit, LIMITS.upload.windowMs);
  if (!limited.allowed) {
    return Response.json({ error: "Too many requests." }, { status: 429 });
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return Response.json({ error: "Not a valid statement id." }, { status: 400 });
  }

  await ensureSchema();
  const rows = await sql`
    select id, filename, status, storage_path, attempts
    from statements where id = ${id}::uuid limit 1
  `;
  if (!rows.length) {
    return Response.json({ error: "Statement not found." }, { status: 404 });
  }

  const row = rows[0]!;
  if (!row.storage_path) {
    return Response.json(
      {
        error:
          "The original upload is no longer on disk, so this statement cannot be re-parsed. Upload the PDF again.",
      },
      { status: 409 },
    );
  }
  if (Number(row.attempts ?? 0) >= MAX_ATTEMPTS) {
    return Response.json(
      { error: `This statement has already been parsed ${MAX_ATTEMPTS} times. Upload it again to reset.` },
      { status: 429 },
    );
  }

  const outcome = await parseByPath(row.storage_path as string, row.filename as string);
  await sql`update statements set attempts = attempts + 1 where id = ${id}::uuid`;

  if (!outcome.ok) {
    await sql`
      update statements set status = 'error', error = ${outcome.error} where id = ${id}::uuid
    `;
    return Response.json({ id, status: "error", error: outcome.error }, { status: 200 });
  }

  const result = outcome.data as unknown as ParseResult;
  await sql`update statements set status = 'done', error = null where id = ${id}::uuid`;
  await sql`
    insert into results (statement_id, data) values (${id}::uuid, ${sql.json(result as never)})
    on conflict (statement_id) do update set data = excluded.data, created_at = now()
  `;

  return Response.json({ id, status: "done", summary: result.summary, bank: result.bank });
}

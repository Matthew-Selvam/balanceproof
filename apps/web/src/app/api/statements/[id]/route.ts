import { ensureSchema, sql } from "@/lib/db";
import { clientKey, LIMITS, rateLimit } from "@/lib/rate-limit";
import { isUuid } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/statements/[id]
 *
 * In Next.js 15 route `params` is a Promise and must be awaited. Reading it
 * synchronously yields `undefined` at runtime, which previously turned every
 * poll into a 404.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(clientKey(request), LIMITS.read.limit, LIMITS.read.windowMs);
  if (!limited.allowed) {
    return Response.json({ error: "Too many requests." }, { status: 429 });
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return Response.json({ error: "Not a valid statement id." }, { status: 400 });
  }

  await ensureSchema();
  const rows = await sql`
    select s.id, s.filename, s.status, s.error, s.created_at, s.byte_size, r.data
    from statements s
    left join results r on r.statement_id = s.id
    where s.id = ${id}::uuid
    limit 1
  `;
  if (!rows.length) {
    return Response.json({ error: "Statement not found." }, { status: 404 });
  }

  const row = rows[0]!;
  return Response.json(
    {
      id: row.id,
      filename: row.filename,
      status: row.status,
      error: row.error,
      createdAt: row.created_at,
      byteSize: row.byte_size,
      data: row.data,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

/** DELETE /api/statements/[id] — remove a statement and its result. */
export async function DELETE(
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
  // results cascades from statements (fk on delete cascade).
  const deleted = await sql`
    delete from statements where id = ${id}::uuid returning id
  `;
  if (!deleted.length) {
    return Response.json({ error: "Statement not found." }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}

import { ensureSchema, sql } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  await ensureSchema();
  const rows = await sql`
    select s.id, s.filename, s.status, s.error, s.created_at, r.data
    from statements s left join results r on r.statement_id = s.id
    where s.id = ${params.id}::uuid
    limit 1
  `;
  if (!rows.length) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const row = rows[0];
  return Response.json({
    id: row.id,
    filename: row.filename,
    status: row.status,
    error: row.error,
    createdAt: row.created_at,
    data: row.data,
  });
}

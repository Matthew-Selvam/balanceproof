import { ensureSchema, sql } from "@/lib/db";
import { clientKey, LIMITS, rateLimit } from "@/lib/rate-limit";
import type { StatementStatus } from "@/lib/types";
import { workerHealth } from "@/lib/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/stats — aggregate health across every statement this instance has
 * processed. This is the "is the product working" view: reconciliation rate,
 * confidence, and which banks are showing up.
 */
export async function GET(request: Request) {
  const limited = rateLimit(clientKey(request), LIMITS.read.limit, LIMITS.read.windowMs);
  if (!limited.allowed) {
    return Response.json({ error: "Too many requests." }, { status: 429 });
  }

  await ensureSchema();

  const [totals] = await sql`
    select
      count(*)::int as statements,
      count(*) filter (where status = 'done')::int as done,
      count(*) filter (where status = 'error')::int as errors,
      count(*) filter (where status = 'processing')::int as processing
    from statements
  `;

  const [txnTotals] = await sql`
    select
      coalesce(sum((data -> 'summary' ->> 'count')::int), 0)::int as transactions,
      coalesce(
        count(*) filter (where (data -> 'summary' ->> 'reconciled') = 'true'), 0
      )::int as reconciled,
      coalesce(
        count(*) filter (where (data -> 'summary' ->> 'reconciled') = 'false'), 0
      )::int as broken,
      coalesce(
        count(*) filter (where data -> 'summary' ->> 'reconciled' is null), 0
      )::int as unproven,
      coalesce(avg((data -> 'summary' ->> 'confidence')::float), 0)::float as avg_confidence
    from results
  `;

  const byBank = await sql`
    select
      coalesce(data -> 'summary' ->> 'bank', data -> 'bank' ->> 'name', 'Unknown') as bank,
      count(*)::int as count,
      count(*) filter (where (data -> 'summary' ->> 'reconciled') = 'true')::int as reconciled
    from results
    group by 1
    order by count desc
    limit 8
  `;

  const recent = await sql`
    select s.id, s.filename, s.created_at, (r.data -> 'summary' ->> 'reconciled')::boolean as reconciled
    from statements s
    left join results r on r.statement_id = s.id
    order by s.created_at desc
    limit 8
  `;

  const statusRows = await sql`
    select status, count(*)::int as count from statements group by status
  `;

  const health = await workerHealth();

  return Response.json(
    {
      statements: totals?.statements ?? 0,
      transactions: txnTotals?.transactions ?? 0,
      reconciled: txnTotals?.reconciled ?? 0,
      broken: txnTotals?.broken ?? 0,
      unproven: txnTotals?.unproven ?? 0,
      bankCount: byBank.length,
      averageConfidence: Number(txnTotals?.avg_confidence ?? 0),
      byStatus: statusRows.map((r) => ({
        status: r.status as StatementStatus,
        count: r.count as number,
      })),
      byBank: byBank.map((r) => ({
        bank: r.bank as string,
        count: r.count as number,
        reconciled: r.reconciled as number,
      })),
      recentRuns: recent.map((r) => ({
        id: r.id as string,
        filename: r.filename as string,
        createdAt: r.created_at as string,
        reconciled: (r.reconciled ?? null) as boolean | null,
      })),
      worker: health,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

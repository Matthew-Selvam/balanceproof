import Link from "next/link";
import { Activity, Percent, ServerCog, ShieldCheck } from "lucide-react";

import { Badge, Card, CardTitle, EmptyState } from "@/components/ui/card";
import { ensureSchema, sql } from "@/lib/db";
import { formatNumber, formatRelative } from "@/lib/format";
import type { StatementStatus } from "@/lib/types";
import { workerHealth } from "@/lib/worker";

export const dynamic = "force-dynamic";

export const metadata = { title: "Accuracy insights" };

export default async function InsightsPage() {
  await ensureSchema();

  const [totals] = await sql`
    select
      count(*)::int as statements,
      count(*) filter (where status = 'error')::int as errors
    from statements
  `;

  const [r] = await sql`
    select
      coalesce(sum((data -> 'summary' ->> 'count')::int), 0)::int as transactions,
      count(*) filter (where (data -> 'summary' ->> 'reconciled') = 'true')::int as reconciled,
      count(*) filter (where (data -> 'summary' ->> 'reconciled') = 'false')::int as broken,
      count(*) filter (where data -> 'summary' ->> 'reconciled' is null)::int as unproven,
      coalesce(avg((data -> 'summary' ->> 'confidence')::float), 0)::float as avg_confidence,
      coalesce(sum((data -> 'summary' ->> 'repaired')::int), 0)::int as repaired
    from results
  `;

  const byBank = await sql`
    select
      coalesce(data -> 'summary' ->> 'bank', data -> 'bank' ->> 'name', 'Unknown') as bank,
      count(*)::int as total,
      count(*) filter (where (data -> 'summary' ->> 'reconciled') = 'true')::int as reconciled
    from results group by 1 order by total desc limit 12
  `;

  const topFindings = await sql`
    select
      f ->> 'code' as code,
      max(f ->> 'message') as message,
      sum((f ->> 'count')::int)::int as occurrences
    from results r,
         jsonb_array_elements(coalesce(r.data -> 'findings', '[]'::jsonb)) f
    where f ->> 'code' <> 'reconciled'
    group by 1 order by occurrences desc limit 8
  `;

  const health = await workerHealth();

  const processed = (r?.reconciled ?? 0) + (r?.broken ?? 0) + (r?.unproven ?? 0);
  const reconciliationRate = processed ? (r?.reconciled ?? 0) / processed : null;

  const empty = (totals?.statements ?? 0) === 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Accuracy insights</h1>
          <p className="mt-2 max-w-2xl text-fg-muted">
            Live numbers from this deployment, not a marketing claim. If the
            reconciliation rate drops after a parser change, it shows up here.
          </p>
        </div>
        <Badge tone={health.ok ? "proof" : "broken"}>
          <ServerCog className="size-3.5" aria-hidden="true" />
          worker {health.ok ? `v${health.version ?? "?"}` : "offline"}
        </Badge>
      </header>

      {empty ? (
        <div className="mt-8">
          <EmptyState
            icon={<Activity className="size-5" aria-hidden="true" />}
            title="No data yet"
            body="These figures populate as soon as this deployment parses its first statement."
            action={
              <Link
                href="/upload"
                className="inline-flex h-10 items-center rounded-lg bg-accent-500 px-4 text-sm font-medium text-white hover:bg-accent-400"
              >
                Convert a statement
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <dl className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile
              label="Reconciliation rate"
              value={reconciliationRate === null ? "—" : `${Math.round(reconciliationRate * 100)}%`}
              sub={`${r?.reconciled ?? 0} of ${processed} proven`}
              tone="proof"
            />
            <Tile
              label="Mean confidence"
              value={`${Math.round((r?.avg_confidence ?? 0) * 100)}%`}
              sub="across parsed statements"
            />
            <Tile
              label="Statements"
              value={formatNumber(totals?.statements ?? 0)}
              sub={`${totals?.errors ?? 0} failed to parse`}
            />
            <Tile
              label="Rows checked"
              value={formatNumber(r?.transactions ?? 0)}
              sub={`${r?.repaired ?? 0} amounts repaired`}
            />
          </dl>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <CardTitle
                hint="Where statements fail to close, and how often."
                action={<Percent className="size-4 text-fg-subtle" aria-hidden="true" />}
              >
                Most common findings
              </CardTitle>
              {topFindings.length === 0 ? (
                <p className="text-sm text-fg-muted">
                  No findings recorded yet — every statement so far has been clean.
                </p>
              ) : (
                <ul className="space-y-3">
                  {topFindings.map((f) => {
                    const max = Number(topFindings[0]!.occurrences) || 1;
                    const pct = Math.max(4, Math.round((Number(f.occurrences) / max) * 100));
                    return (
                      <li key={f.code}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="truncate text-fg" title={f.message ?? ""}>
                            {f.message ?? f.code}
                          </span>
                          <span className="tabular shrink-0 text-fg-muted">
                            {f.occurrences}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-700">
                          <div
                            className="h-full rounded-full bg-warn-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card>
              <CardTitle hint="Per-layout reconciliation, worst first.">
                By bank layout
              </CardTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-fg-subtle">
                      <th scope="col" className="py-2 pr-4 font-medium">Bank</th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">Files</th>
                      <th scope="col" className="py-2 text-right font-medium">Proven</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byBank.map((b) => {
                      const rate = b.total ? b.reconciled / b.total : 0;
                      return (
                        <tr key={b.bank} className="border-b border-ink-800/70 last:border-0">
                          <td className="py-2 pr-4 text-fg">{b.bank}</td>
                          <td className="tabular py-2 pr-4 text-right text-fg-muted">{b.total}</td>
                          <td className="py-2 text-right">
                            <span
                              className={`tabular ${
                                rate === 1 ? "text-proof-400" : rate >= 0.5 ? "text-warn-400" : "text-broken-400"
                              }`}
                            >
                              {Math.round(rate * 100)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <Card className="mt-6">
            <CardTitle hint="The newest files this deployment handled.">
              Recent activity
            </CardTitle>
            <ul className="divide-y divide-ink-800">
              {(await recentRuns()).map((run) => (
                <li key={run.id} className="flex items-center justify-between gap-4 py-2.5">
                  <Link
                    href={`/statements/${run.id}`}
                    className="truncate text-sm text-fg hover:text-accent-400"
                  >
                    {run.filename}
                  </Link>
                  <span className="flex shrink-0 items-center gap-3 text-xs">
                    <span className="text-fg-subtle">{formatRelative(run.createdAt)}</span>
                    <span
                      className={
                        run.reconciled === true
                          ? "text-proof-400"
                          : run.reconciled === false
                            ? "text-broken-400"
                            : "text-fg-subtle"
                      }
                    >
                      {run.reconciled === true
                        ? "proven"
                        : run.reconciled === false
                          ? "did not reconcile"
                          : "unproven"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <p className="mt-6 flex items-start gap-2 text-xs text-fg-subtle">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Reconciliation rate counts only statements that exposed both an
            opening and a closing balance. Statements with no printed balances
            are reported as unproven rather than counted as successes.
          </p>
        </>
      )}
    </div>
  );
}

async function recentRuns() {
  const rows = await sql`
    select s.id, s.filename, s.created_at,
           (r.data -> 'summary' ->> 'reconciled')::boolean as reconciled
    from statements s
    left join results r on r.statement_id = s.id
    order by s.created_at desc limit 6
  `;
  return rows.map((row) => ({
    id: row.id as string,
    filename: row.filename as string,
    createdAt: row.created_at as string,
    reconciled: (row.reconciled ?? null) as boolean | null,
  }));
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "proof";
}) {
  return (
    <div className="panel p-4">
      <dt className="text-xs uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className={`tabular mt-1 text-2xl font-semibold ${tone === "proof" ? "text-proof-400" : "text-fg"}`}>
        {value}
      </dd>
      {sub ? <dd className="mt-0.5 text-xs text-fg-subtle">{sub}</dd> : null}
    </div>
  );
}

export type { StatementStatus };
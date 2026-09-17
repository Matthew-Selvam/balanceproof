import Link from "next/link";
import { ArrowRight, FileText, Inbox } from "lucide-react";

import { StatementFilterBar } from "@/components/statement-filters";
import { Badge, EmptyState, Card } from "@/components/ui/card";
import { ensureSchema, sql } from "@/lib/db";
import { formatMoney, formatRelative } from "@/lib/format";
import type { StatementListItem, StatementStatus } from "@/lib/types";
import { verdictOf } from "@/lib/verdict";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function StatementsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const status = (["all", "processing", "done", "error"].includes(params.status ?? "")
    ? params.status
    : "all") as StatementStatus | "all";
  const search = (params.q ?? "").slice(0, 120);

  await ensureSchema();

  const rows = await sql`
    select
      s.id, s.filename, s.status, s.error, s.created_at,
      coalesce(r.data -> 'summary' ->> 'bank', r.data -> 'bank' ->> 'name') as bank,
      coalesce((r.data -> 'summary' ->> 'count')::int, 0) as txn_count,
      (r.data -> 'summary' ->> 'reconciled')::boolean as reconciled,
      coalesce((r.data -> 'summary' ->> 'confidence')::float, 0) as confidence,
      coalesce((r.data -> 'summary' ->> 'total')::float, 0) as total
    from statements s
    left join results r on r.statement_id = s.id
    where (${status} = 'all' or s.status = ${status})
      and (${search || null}::text is null or s.filename ilike ${"%" + search + "%"})
    order by s.created_at desc
    limit ${PAGE_SIZE} offset ${(page - 1) * PAGE_SIZE}
  `;

  const [{ total }] = await sql`
    select count(*)::int as total from statements
    where (${status} = 'all' or status = ${status})
      and (${search || null}::text is null or filename ilike ${"%" + search + "%"})
  `;

  const statements: StatementListItem[] = rows.map((row) => ({
    id: row.id as string,
    filename: row.filename as string,
    status: row.status as StatementStatus,
    error: (row.error ?? null) as string | null,
    createdAt: row.created_at as string,
    bank: (row.bank ?? null) as string | null,
    count: (row.txn_count ?? 0) as number,
    reconciled: (row.reconciled ?? null) as boolean | null,
    confidence: (row.confidence ?? 0) as number,
    total: (row.total ?? 0) as number,
  }));

  const pageCount = Math.max(1, Math.ceil((total ?? 0) / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Statements</h1>
          <p className="mt-2 text-fg-muted">
            Every file this deployment has parsed, newest first. A statement that
            did not reconcile stays visible — that is the point.
          </p>
        </div>
        <Link
          href="/upload"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-accent-500 px-4 text-sm font-medium text-white transition-colors hover:bg-accent-400"
        >
          Convert a statement
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </header>

      <div className="mt-6">
        <StatementFilterBar status={status} search={search} />
      </div>

      {statements.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={<Inbox className="size-5" aria-hidden="true" />}
            title={search || status !== "all" ? "No statements match" : "No statements yet"}
            body={
              search || status !== "all"
                ? "Try clearing the search or switching back to all statuses."
                : "Upload a PDF and it will appear here with its reconciliation verdict."
            }
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
        <ul className="mt-6 space-y-2.5">
          {statements.map((statement) => (
            <li key={statement.id}>
              <StatementRow statement={statement} />
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 ? (
        <nav className="mt-8 flex items-center justify-between text-sm" aria-label="Pagination">
          <span className="text-fg-muted">
            Page <span className="tabular text-fg">{page}</span> of{" "}
            <span className="tabular text-fg">{pageCount}</span> ·{" "}
            <span className="tabular text-fg">{total}</span> statements
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={buildHref({ page: page - 1, status, q: search })}
                className="rounded-lg border border-ink-600 px-3 py-1.5 text-fg hover:border-ink-500"
              >
                Newer
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link
                href={buildHref({ page: page + 1, status, q: search })}
                className="rounded-lg border border-ink-600 px-3 py-1.5 text-fg hover:border-ink-500"
              >
                Older
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function buildHref({ page, status, q }: { page: number; status: string; q: string }) {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (status !== "all") params.set("status", status);
  if (q) params.set("q", q);
  const query = params.toString();
  return `/statements${query ? `?${query}` : ""}`;
}

function StatementRow({ statement }: { statement: StatementListItem }) {
  const verdict = verdictOf({
    reconciled: statement.reconciled,
    flagged: 0,
    count: statement.count,
  });
  const isFailed = statement.status === "error";
  const isProcessing = statement.status === "processing";

  const tone = isFailed
    ? { text: "text-broken-400", dot: "bg-broken-400" }
    : isProcessing
      ? { text: "text-fg-muted", dot: "bg-fg-subtle" }
      : { text: verdict.tone.text, dot: verdict.tone.dot };

  return (
    <Link
      href={`/statements/${statement.id}`}
      className="panel group flex flex-wrap items-center gap-x-5 gap-y-3 p-4 transition-colors hover:border-ink-500 hover:bg-ink-800/50"
    >
      <span className={`size-2 shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />

      <span className="flex min-w-0 flex-1 items-center gap-3">
        <FileText className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-fg" title={statement.filename}>
            {statement.filename}
          </span>
          <span className="mt-0.5 block text-xs text-fg-subtle">
            {formatRelative(statement.createdAt)}
            {statement.bank ? ` · ${statement.bank}` : ""}
          </span>
        </span>
      </span>

      <span className="flex items-center gap-6">
        <span className="text-right">
          <span className="tabular block text-sm text-fg">
            {isFailed || isProcessing ? "—" : formatMoney(statement.total)}
          </span>
          <span className="block text-xs text-fg-subtle">
            {isFailed || isProcessing ? "" : `${statement.count} rows`}
          </span>
        </span>

        <span className="w-28 text-right">
          {isFailed ? (
            <Badge tone="broken">parse failed</Badge>
          ) : isProcessing ? (
            <Badge tone="neutral">processing</Badge>
          ) : (
            <span className={`text-sm font-medium ${tone.text}`}>{verdict.label}</span>
          )}
        </span>

        <ArrowRight
          className="size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}

export type { Card };

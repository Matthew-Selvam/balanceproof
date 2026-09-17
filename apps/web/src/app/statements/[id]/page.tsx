import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, CalendarRange, Clock, FileText, Layers } from "lucide-react";

import { ExportBar } from "@/components/export-bar";
import { FindingsPanel } from "@/components/findings-panel";
import { ReconBanner } from "@/components/recon-banner";
import { RetryButton } from "@/components/retry-button";
import { TransactionsTable } from "@/components/transactions-table";
import { Badge, Card, CardTitle } from "@/components/ui/card";
import { ensureSchema, sql } from "@/lib/db";
import { formatDateTime, formatDuration, formatMoney, formatNumber } from "@/lib/format";
import type { ParseResult } from "@/lib/types";
import { countFlaggedRows, rowNeedsAttention } from "@/lib/verdict";

export const dynamic = "force-dynamic";

async function loadStatement(id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }
  await ensureSchema();
  const rows = await sql`
    select s.id, s.filename, s.status, s.error, s.created_at, s.byte_size, r.data
    from statements s
    left join results r on r.statement_id = s.id
    where s.id = ${id}::uuid
    limit 1
  `;
  return rows[0] ?? null;
}

export default async function StatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await loadStatement(id);
  if (!row) notFound();

  const result = (row.data ?? null) as ParseResult | null;

  if (row.status !== "done" || !result) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
        <BackLink />
        <Card className="mt-6">
          <h1 className="text-lg font-semibold tracking-tight">
            {row.status === "error" ? "This statement could not be parsed" : "Still processing"}
          </h1>
          <p className="mt-2 text-sm text-fg-muted">
            {row.status === "error"
              ? "The parser stopped on this file. The message below is what it reported."
              : "Parsing has not finished for this statement yet."}
          </p>
          {row.error ? (
            <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-lg border border-broken-500/30 bg-broken-500/10 p-3 text-xs text-broken-400">
              {row.error}
            </pre>
          ) : null}
          <div className="mt-5 flex flex-wrap gap-2">
            <RetryButton statementId={row.id as string} />
            <Link
              href="/upload"
              className="inline-flex h-9 items-center rounded-lg border border-ink-600 px-3 text-sm text-fg hover:border-ink-500"
            >
              Upload a different file
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const flagged = countFlaggedRows(result);
  const findings = result.findings ?? [];
  const errors = findings.filter((f) => f.severity === "error" && f.count > 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <BackLink />

      <header className="mt-5 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl" title={row.filename}>
            {row.filename}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted">
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="size-3.5" aria-hidden="true" />
              {result.bank?.name ?? "Unknown"}
              {result.bank?.matched_on ? (
                <span className="text-fg-subtle">(matched “{result.bank.matched_on}”)</span>
              ) : null}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Layers className="size-3.5" aria-hidden="true" />
              {result.pages} {result.pages === 1 ? "page" : "pages"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" aria-hidden="true" />
              {formatDuration(result.parse_ms)} parse
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarRange className="size-3.5" aria-hidden="true" />
              {formatDateTime(row.created_at as string)}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {errors.length > 0 ? <Badge tone="broken">{errors.length} issue{errors.length === 1 ? "" : "s"}</Badge> : null}
          {flagged > 0 ? <Badge tone="warn">{flagged} flagged rows</Badge> : null}
          {result.bank?.id === "generic" ? <Badge tone="neutral">heuristic layout</Badge> : null}
        </div>
      </header>

      <ReconBanner
        summary={result.summary}
        findings={findings}
        filename={row.filename as string}
        period={result.period}
      />

      {/* Stat strip */}
      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Money in" value={formatMoney(result.summary.credits)} sub={`${result.summary.credit_count} credits`} tone="proof" />
        <Stat label="Money out" value={formatMoney(result.summary.debits)} sub={`${result.summary.debit_count} debits`} />
        <Stat label="Rows" value={formatNumber(result.summary.count)} sub={`${result.summary.pages} pages`} />
        <Stat
          label="Repaired"
          value={formatNumber(result.summary.repaired)}
          sub={result.summary.repaired > 0 ? "amounts recomputed" : "no rows changed"}
          tone={result.summary.repaired > 0 ? "warn" : undefined}
        />
      </dl>

      {/* Limitations / caveats the parser itself reported */}
      {result.limitations?.length ? (
        <section className="mt-6" aria-labelledby="limits-heading">
          <h2 id="limits-heading" className="mb-2 text-sm font-semibold text-fg">
            Parser caveats
          </h2>
          <ul className="space-y-2">
            {result.limitations.map((limitation) => (
              <li
                key={limitation}
                className="rounded-lg border border-warn-500/25 bg-warn-500/[0.07] px-3.5 py-2.5 text-sm text-warn-400"
              >
                {limitation}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:items-start">
        <div className="space-y-6">
          <section aria-labelledby="findings-heading">
            <h2 id="findings-heading" className="mb-3 text-sm font-semibold text-fg">
              Findings
              <span className="ml-2 font-normal text-fg-subtle">
                {findings.filter((f) => f.code !== "reconciled").length} reported
              </span>
            </h2>
            <FindingsPanel findings={findings} />
          </section>

          <section aria-labelledby="rows-heading">
            <h2 id="rows-heading" className="mb-3 text-sm font-semibold text-fg">
              Transactions
            </h2>
            <TransactionsTable transactions={result.transactions} />
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20">
          <ExportBar
            statementId={row.id as string}
            rowCount={result.transactions.length}
            flaggedCount={flagged}
          />

          <Card>
            <CardTitle hint="Account and period, as read from the statement.">
              Source details
            </CardTitle>
            <dl className="space-y-2.5 text-sm">
              <Detail label="Bank layout" value={result.bank?.name ?? "—"} />
              <Detail
                label="Match confidence"
                value={
                  result.bank ? `${Math.round((result.bank.confidence ?? 0) * 100)}%` : "—"
                }
              />
              <Detail
                label="Period"
                value={
                  result.period?.start && result.period?.end
                    ? `${result.period.start} → ${result.period.end}`
                    : "not detected"
                }
              />
              <Detail
                label="Dates covered"
                value={
                  result.summary.first_date && result.summary.last_date
                    ? `${result.summary.first_date} → ${result.summary.last_date}`
                    : "—"
                }
              />
              <Detail
                label="Span"
                value={
                  result.summary.span_days === null
                    ? "—"
                    : `${result.summary.span_days} days`
                }
              />
              <Detail
                label="Flagged rows"
                value={`${flagged} of ${result.summary.count}`}
              />
            </dl>
          </Card>

          <Card>
            <CardTitle hint="A statement that does not reconcile usually needs one of these.">
              If something looks wrong
            </CardTitle>
            <ul className="space-y-2.5 text-sm text-fg-muted">
              <li className="flex gap-2">
                <FileText className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                Compare the flagged row numbers against the same rows in your PDF.
              </li>
              <li className="flex gap-2">
                <FileText className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                Re-run the parse if the layout has since been updated —
                <span className="ml-1">
                  <RetryButton statementId={row.id as string} variant="link" />
                </span>
              </li>
              <li className="flex gap-2">
                <FileText className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
                Export only the flagged rows to hand a short list to a reviewer.
              </li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/statements"
      className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"
    >
      <ArrowLeft className="size-3.5" aria-hidden="true" />
      All statements
    </Link>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "proof" | "warn";
}) {
  return (
    <div className="panel p-3.5">
      <dt className="text-xs uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd
        className={`tabular mt-1 text-lg font-semibold ${
          tone === "proof" ? "text-proof-400" : tone === "warn" ? "text-warn-400" : "text-fg"
        }`}
      >
        {value}
      </dd>
      {sub ? <dd className="mt-0.5 text-xs text-fg-subtle">{sub}</dd> : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-fg-subtle">{label}</dt>
      <dd className="truncate text-right text-fg" title={value}>
        {value}
      </dd>
    </div>
  );
}

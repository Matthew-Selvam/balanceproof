"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from "lucide-react";

import { UploadDropzone, UploadQueue } from "@/components/upload-queue";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import type { Summary } from "@/lib/types";
import { useUploader } from "@/lib/use-uploader";
import { verdictOf } from "@/lib/verdict";

interface BankInfo {
  id: number | string;
  name: string;
  country: string;
}

export default function UploadPage() {
  const { items, busy, start, clear, remove } = useUploader();
  const [banks, setBanks] = useState<BankInfo[]>([]);
  const [workerUp, setWorkerUp] = useState<boolean | null>(null);

  // Surface a dead worker before the user uploads and waits for a failure.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/banks", { cache: "no-store" })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        setWorkerUp(Boolean(body.available));
        setBanks(Array.isArray(body.banks) ? body.banks : []);
      })
      .catch(() => {
        if (!cancelled) setWorkerUp(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const done = items.filter((i) => i.phase === "done");
  const failed = items.filter((i) => i.phase === "error");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Convert a bank statement
        </h1>
        <p className="mt-2 max-w-2xl text-fg-muted">
          PDF in, reconciled export out. Every statement is checked against its
          own printed balances before you download anything.
        </p>
      </header>

      {workerUp === false ? (
        <div
          role="alert"
          className="mt-6 flex items-start gap-3 rounded-card border border-broken-500/35 bg-broken-500/10 p-4"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-broken-400" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-medium text-broken-400">The parsing worker is not reachable.</p>
            <p className="mt-1 text-fg-muted">
              Uploads will fail until it is running. Start it with{" "}
              <code className="rounded bg-ink-900 px-1.5 py-0.5 font-mono text-xs">
                docker compose up worker
              </code>{" "}
              or run{" "}
              <code className="rounded bg-ink-900 px-1.5 py-0.5 font-mono text-xs">
                uvicorn app.main:app
              </code>{" "}
              in apps/worker.
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-8">
        <UploadDropzone onFiles={(files) => void start(files)} busy={busy} />
      </div>

      {items.length > 0 ? (
        <section className="mt-8" aria-labelledby="queue-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="queue-heading" className="text-sm font-semibold text-fg">
              Queue
              <span className="tabular ml-2 text-fg-subtle">{items.length}</span>
            </h2>
            {!busy ? (
              <button
                type="button"
                onClick={clear}
                className="text-xs text-fg-muted hover:text-fg"
              >
                Clear finished
              </button>
            ) : null}
          </div>
          <UploadQueue items={items} onRemove={remove} />
        </section>
      ) : null}

      {done.length > 0 ? (
        <section className="mt-10" aria-labelledby="results-heading">
          <h2 id="results-heading" className="text-sm font-semibold text-fg">
            Parsed statements
          </h2>
          <ul className="mt-3 space-y-3">
            {done.map((item) => (
              <li key={item.localId}>
                <ResultCard
                  statementId={item.statementId!}
                  filename={item.file.name}
                  summary={item.summary!}
                  bankName={item.bank?.name ?? "Unknown layout"}
                  warnings={item.warnings ?? []}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {failed.length > 0 ? (
        <section className="mt-10" aria-labelledby="failed-heading">
          <h2 id="failed-heading" className="text-sm font-semibold text-fg">
            Could not be parsed
          </h2>
          <ul className="mt-3 space-y-2">
            {failed.map((item) => (
              <li key={item.localId}>
                <Card className="border-broken-500/30">
                  <p className="flex items-center gap-2 text-sm font-medium text-broken-400">
                    <XCircle className="size-4" aria-hidden="true" />
                    {item.file.name}
                  </p>
                  <p className="mt-1.5 text-sm text-fg-muted">{item.error}</p>
                  {item.statementId ? (
                    <Link
                      href={`/statements/${item.statementId}`}
                      className="mt-2 inline-block text-xs text-accent-400 hover:underline"
                    >
                      Open the record →
                    </Link>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-12" aria-labelledby="banks-heading">
        <h2 id="banks-heading" className="text-sm font-semibold text-fg">
          Supported institutions
        </h2>
        <p className="mt-1.5 text-sm text-fg-muted">
          Bank-specific layouts are matched by keyword. Anything else falls
          through to the generic parser, which is labelled as heuristic.
        </p>
        {workerUp === null ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-fg-muted">
            <Spinner className="size-3.5" label="Loading banks" />
            Loading the bank list…
          </div>
        ) : banks.length === 0 ? (
          <p className="mt-4 text-sm text-fg-subtle">
            The bank list is unavailable while the worker is offline.
          </p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {banks.map((bank) => (
              <li
                key={bank.id}
                className="rounded-pill border border-ink-600 bg-ink-800/60 px-2.5 py-1 text-xs text-fg-muted"
              >
                {bank.name}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ResultCard({
  statementId,
  filename,
  summary,
  bankName,
  warnings,
}: {
  statementId: string;
  filename: string;
  summary: Summary;
  bankName: string;
  warnings: string[];
}) {
  const verdict = verdictOf(summary);
  const Icon =
    verdict.id === "proven"
      ? CheckCircle2
      : verdict.id === "unproven"
        ? XCircle
        : verdict.id === "review"
          ? AlertTriangle
          : HelpCircle;

  return (
    <Card className={`border ${verdict.tone.border} ${verdict.tone.bg}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <Icon className={`mt-0.5 size-5 shrink-0 ${verdict.tone.text}`} aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-fg" title={filename}>
              {filename}
            </p>
            <p className={`mt-0.5 text-sm font-medium ${verdict.tone.text}`}>
              {verdict.headline}
            </p>
            <p className="mt-1 text-xs text-fg-muted">
              {bankName} · <span className="tabular">{summary.count}</span> rows ·{" "}
              <span className="tabular">{formatMoney(summary.total)}</span> net ·{" "}
              confidence <span className="tabular">{Math.round(summary.confidence * 100)}%</span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <Link
            href={`/statements/${statementId}`}
            className="rounded-lg border border-ink-600 bg-ink-800 px-3 py-1.5 text-xs font-medium text-fg hover:border-ink-500"
          >
            Review &amp; export
          </Link>
          <a
            href={`/api/statements/${statementId}/export?format=xlsx`}
            className="rounded-lg border border-ink-600 px-3 py-1.5 text-xs font-medium text-fg-muted hover:border-ink-500 hover:text-fg"
          >
            Excel
          </a>
        </div>
      </div>

      {warnings.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-ink-700 pt-3">
          {warnings.map((warning) => (
            <li key={warning} className="text-xs text-warn-400">
              {warning}
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

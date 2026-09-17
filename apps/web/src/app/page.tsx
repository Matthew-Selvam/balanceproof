import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Braces,
  Building2,
  FileSpreadsheet,
  GitCompareArrows,
  ScanLine,
  ShieldCheck,
  Sigma,
  Sparkles,
} from "lucide-react";

import { Badge, Card } from "@/components/ui/card";

const STEPS = [
  {
    icon: ScanLine,
    title: "Drop the PDF",
    body: "Up to 25 files at once. Layout-aware extraction handles ruled tables, split debit/credit columns and two-date rows.",
  },
  {
    icon: Sigma,
    title: "We prove the arithmetic",
    body: "Opening balance + every transaction must equal the closing balance printed on the statement — checked to the cent, per file.",
  },
  {
    icon: GitCompareArrows,
    title: "You get the exceptions, not a mystery",
    body: "Every row is checked for running-balance continuity, duplicates, date order and mis-read amounts. Breaks are named, numbered and explained.",
  },
];

const PROOF_POINTS = [
  {
    icon: BadgeCheck,
    title: "Reconciliation is the gate",
    body: "A statement that does not close is labelled as not closing. It is never quietly exported as if it were fine.",
  },
  {
    icon: Sigma,
    title: "Continuity per row",
    body: "Each row must continue the previous balance. A single wrong amount is caught even when the totals happen to agree.",
  },
  {
    icon: GitCompareArrows,
    title: "Duplicates and reordering",
    body: "Double-posts, frozen balances and out-of-order dates are flagged with the row numbers that caused them.",
  },
  {
    icon: Sparkles,
    title: "Provable repairs only",
    body: "When one row's amount provably makes the statement close, it is recomputed from the balance delta — with the original value kept and shown.",
  },
  {
    icon: FileSpreadsheet,
    title: "Five export formats",
    body: "Excel with a findings sheet, plain CSV, QuickBooks QBO, OFX for Xero and desktop QB, and raw JSON for your pipeline.",
  },
  {
    icon: Braces,
    title: "Self-hosted parsing",
    body: "Statements are parsed by a worker you run. No third-party API sees your clients' account numbers.",
  },
];

const FORMATS = ["Excel", "CSV", "QuickBooks", "OFX", "JSON"];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
        <div className="max-w-3xl">
          <Badge tone="proof" className="mb-5">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Reconciliation-checked exports
          </Badge>

          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Bank statement conversions that
            <span className="text-proof-400"> prove themselves.</span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-fg-muted">
            Most converters hand you a spreadsheet and hope. BalanceProof checks
            that the opening balance plus every transaction equals the closing
            balance printed on the statement — then tells you exactly which rows
            it could not prove, with row numbers and a reason.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/upload"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-accent-500 px-6 text-sm font-medium text-white shadow-[0_10px_30px_-12px_rgb(59_130_246_/_0.9)] transition-colors hover:bg-accent-400"
            >
              Convert a statement
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex h-12 items-center rounded-xl border border-ink-600 bg-ink-800 px-6 text-sm font-medium text-fg transition-colors hover:border-ink-500 hover:bg-ink-700"
            >
              See a real reconciliation
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-fg-muted">
            {FORMATS.map((format) => (
              <li key={format} className="flex items-center gap-1.5">
                <span className="size-1 rounded-full bg-proof-400" aria-hidden="true" />
                {format}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* The arithmetic, shown rather than claimed */}
      <section className="border-y border-ink-800 bg-ink-900/40 py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                The check is simple. Almost nobody runs it.
              </h2>
              <p className="mt-4 text-fg-muted">
                A statement is a closed system: it starts at a balance, lists
                movements, and ends at a balance. If the three don&apos;t agree,
                something was missed — a page, a row, a minus sign. We make that
                disagreement the headline instead of hiding it.
              </p>
              <p className="mt-4 text-fg-muted">
                When a statement reconciles and every row continues the running
                balance, we can say so with confidence. When it doesn&apos;t, you
                get the residual, the row numbers, and a suggested cause.
              </p>
            </div>

            <Card className="font-mono text-sm">
              <p className="mb-3 font-sans text-xs uppercase tracking-wide text-fg-subtle">
                Reconciliation report
              </p>
              <dl className="space-y-2.5">
                <Row label="Opening balance" value="1,000.00" />
                <Row label="Sum of transactions" value="+247.16" />
                <Row label="Expected closing" value="1,247.16" />
                <Row label="Printed closing" value="1,247.16" />
                <div className="mt-3 flex items-center justify-between border-t border-ink-700 pt-3">
                  <dt className="text-proof-400">Residual</dt>
                  <dd className="tabular rounded bg-proof-500/10 px-2 py-0.5 text-proof-400">
                    0.00 — proven
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-fg-subtle">Rows checked</dt>
                  <dd className="tabular text-fg">5 / 5</dd>
                </div>
              </dl>
              <p className="mt-4 border-t border-ink-700 pt-3 font-sans text-xs text-fg-muted">
                Every row also passed continuity: previous balance + amount =
                this row&apos;s balance.
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          How a conversion runs
        </h2>
        <ol className="mt-10 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="relative">
              <div className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-full border border-ink-600 bg-ink-800 text-sm font-medium text-fg">
                  {index + 1}
                </span>
                <step.icon className="size-4 text-accent-400" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-base font-medium">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-fg-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Why trust it */}
      <section className="border-y border-ink-800 bg-ink-900/40 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              What &ldquo;verified&rdquo; actually means here
            </h2>
            <p className="mt-4 text-fg-muted">
              Six specific checks, each with a defined failure mode. No vague
              accuracy percentages, no black-box confidence score you have to
              take on faith.
            </p>
          </div>

          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PROOF_POINTS.map((point) => (
              <li key={point.title}>
                <Card className="h-full">
                  <point.icon className="size-5 text-accent-400" aria-hidden="true" />
                  <h3 className="mt-3 text-sm font-semibold">{point.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-fg-muted">{point.body}</p>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Honest limitations */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Where it stops being magic
            </h2>
            <p className="mt-4 text-fg-muted">
              Being clear about the edges is the point. These are the cases
              where the product tells you it cannot help rather than guessing.
            </p>
          </div>
          <ul className="space-y-3">
            {[
              "Scanned statements with no text layer. The parser says so instead of returning an empty file.",
              "No printed opening/closing balance. Totals are marked unproven rather than marked correct.",
              "Password-protected PDFs are rejected up front.",
              "A statement with a genuinely missing page cannot be reconciled. You get the residual so you can see how much is missing.",
              "Unrecognised layouts fall back to heuristic column detection, which is labelled as such and lowers the confidence score.",
            ].map((item) => (
              <li key={item} className="flex gap-3 text-sm text-fg-muted">
                <span
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn-400"
                  aria-hidden="true"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <div className="panel-raised flex flex-col items-start justify-between gap-6 p-8 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">
              Bring one statement. See the proof.
            </h2>
            <p className="mt-2 max-w-xl text-sm text-fg-muted">
              Upload a PDF and you&apos;ll have a reconciliation report and a
              validated export in seconds — including when the answer is
              &ldquo;this one doesn&apos;t add up&rdquo;.
            </p>
          </div>
          <Link
            href="/upload"
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-accent-500 px-5 text-sm font-medium text-white transition-colors hover:bg-accent-400"
          >
            Convert a statement
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>

        <p className="mt-6 flex items-center gap-2 text-xs text-fg-subtle">
          <Building2 className="size-3.5" aria-hidden="true" />
          Built for bookkeepers managing many clients — batch upload, statement
          history and per-file audit trails are included.
        </p>
      </section>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="tabular text-fg">{value}</dd>
    </div>
  );
}

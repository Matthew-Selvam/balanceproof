import Link from "next/link";
import { ArrowRight, CheckCircle2, XCircle } from "lucide-react";

import { Badge, Card } from "@/components/ui/card";

export const metadata = {
  title: "How it works",
  description:
    "How BalanceProof extracts, validates and reconciles a PDF bank statement — including where it refuses to guess.",
};

const CHECKS = [
  {
    name: "Statement reconciliation",
    severity: "error",
    question: "Does opening + every transaction equal the printed closing balance?",
    failure:
      "Reported as a residual amount. The export is still produced, but labelled as not reconciling. This is the check that catches a missing page.",
  },
  {
    name: "Running-balance continuity",
    severity: "error",
    question: "Does each row continue from the previous row's balance?",
    failure:
      "The row is flagged with its index. If the statement's totals still close, the balance cell on that row is called out as unreliable rather than the amount.",
  },
  {
    name: "Amount repair (provable only)",
    severity: "info",
    question:
      "If one row's amount is wrong, does recomputing it from the balance delta make the statement close exactly?",
    failure:
      "When the answer is yes, the amount is recomputed and the original value is kept and shown in the export. When two or more rows are broken, nothing is rewritten — the ambiguity is reported instead.",
  },
  {
    name: "Duplicate detection",
    severity: "error",
    question:
      "Is this row identical to the previous one in date, description and amount?",
    failure:
      "If the balance also did not move, it is an exact duplicate (a double-post). If the balance did move, it is a softer warning — it might be legitimate.",
  },
  {
    name: "Date ordering",
    severity: "warning",
    question: "Is this row dated before the row above it?",
    failure:
      "Flagged as out-of-order, which usually means a page-order problem or a mis-read date.",
  },
  {
    name: "Period containment",
    severity: "warning",
    question: "Do the rows fall inside the statement period printed on the page?",
    failure:
      "Flagged as a period mismatch — the usual cause is a wrong year on a short date like `01/05`.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
      <header>
        <Badge tone="accent" className="mb-4">
          Method
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          What actually happens to your PDF
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-fg-muted">
          Four stages. The interesting one is the third, because it is the only
          stage allowed to say &ldquo;no&rdquo;.
        </p>
      </header>

      <ol className="mt-12 space-y-8">
        <Stage
          n="1"
          title="Text and table extraction"
          body={
            <>
              pdfplumber gives us two views of every page: the raw text lines and
              any ruled tables. Statements drawn with column borders are read
              from the table grid; everything else is read line-by-line. A page
              with no text layer at all is rejected immediately — we tell you it
              looks like a scan rather than returning an empty spreadsheet.
            </>
          }
        />
        <Stage
          n="2"
          title="Layout matching"
          body={
            <>
              Statement text is matched against a registry of institution
              keywords. A match selects a layout — two-date rows (Chase style),
              amount-plus-balance rows, or a ruled-table reader. With no match,
              the generic parser runs and every row it produces is stamped{" "}
              <code className="rounded bg-ink-900 px-1.5 py-0.5 font-mono text-xs">
                generic_parser
              </code>
              , which lowers the confidence score and adds a caveat to the result.
            </>
          }
        />
        <Stage
          n="3"
          title="Validation and reconciliation"
          body={
            <>
              Six checks, listed below. Each one either passes, or produces a
              named finding with a count, the affected row numbers and a
              suggested cause. The verdict shown at the top of a statement is
              derived from these findings — never from a separate heuristic.
            </>
          }
        />
        <Stage
          n="4"
          title="Export with the caveats attached"
          body={
            <>
              The five export formats all include the flags. The Excel workbook
              carries a dedicated Findings sheet; the CSV writes a Flags column;
              OFX and QBO carry your rows. Nothing is stripped to make the output
              look cleaner than the input.
            </>
          }
        />
      </ol>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight">The six checks</h2>
        <div className="mt-6 space-y-3">
          {CHECKS.map((check) => (
            <Card key={check.name}>
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-semibold text-fg">{check.name}</h3>
                <span
                  className={
                    check.severity === "error"
                      ? "rounded-pill border border-broken-500/35 bg-broken-500/10 px-2 py-0.5 text-[11px] text-broken-400"
                      : check.severity === "warning"
                        ? "rounded-pill border border-warn-500/35 bg-warn-500/10 px-2 py-0.5 text-[11px] text-warn-400"
                        : "rounded-pill border border-ink-600 bg-ink-700/40 px-2 py-0.5 text-[11px] text-fg-muted"
                  }
                >
                  {check.severity}
                </span>
              </div>
              <p className="mt-2.5 text-sm text-fg-muted">{check.question}</p>
              <p className="mt-2 text-sm leading-relaxed text-fg-subtle">{check.failure}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight">
          What we deliberately don&apos;t do
        </h2>
        <ul className="mt-6 space-y-4">
          {[
            [
              "Guess a missing page's transactions",
              "A statement that is short by a page cannot be reconstructed. You get the size of the gap so you can go and find the page.",
            ],
            [
              "Silently drop unparseable lines",
              "Lines that look like transactions but fail to parse are reported as a layout limitation, so a thin row count is visible.",
            ],
            [
              "Repair more than one broken amount",
              "With two wrong amounts, any repair is a guess about which one is wrong. The ambiguity is reported instead.",
            ],
            [
              "Invent a progress percentage",
              "Extraction and validation happen in one call, so the UI shows an indeterminate stage rather than a bar that means nothing.",
            ],
          ].map(([title, body]) => (
            <li key={title} className="flex gap-3">
              <XCircle className="mt-0.5 size-4 shrink-0 text-broken-400" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-fg">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-fg-muted">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight">And what we do</h2>
        <ul className="mt-6 space-y-4">
          {[
            "Keep the original upload on disk so a statement can be re-parsed without asking you to find the PDF again.",
            "Store the full parse result, including findings, so the audit trail survives a parser upgrade.",
            "Report the reconciliation residual in currency, not as a boolean.",
            "Show the arithmetic in the interface so you can check the check.",
          ].map((item) => (
            <li key={item} className="flex gap-3 text-sm text-fg-muted">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-proof-400" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-16 flex flex-wrap gap-3">
        <Link
          href="/upload"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent-500 px-5 text-sm font-medium text-white transition-colors hover:bg-accent-400"
        >
          Try it on a statement
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <Link
          href="/banks"
          className="inline-flex h-11 items-center rounded-xl border border-ink-600 px-5 text-sm font-medium text-fg transition-colors hover:border-ink-500"
        >
          See supported banks
        </Link>
      </div>
    </div>
  );
}

function Stage({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <li className="grid gap-4 sm:grid-cols-[3rem_minmax(0,1fr)]">
      <span className="flex size-10 items-center justify-center rounded-xl border border-ink-600 bg-ink-800 font-mono text-sm text-accent-400">
        {n}
      </span>
      <div>
        <h3 className="text-lg font-medium">{title}</h3>
        <p className="mt-2 leading-relaxed text-fg-muted">{body}</p>
      </div>
    </li>
  );
}

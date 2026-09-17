import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from "lucide-react";

import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import type { Finding, Summary } from "@/lib/types";
import { verdictOf } from "@/lib/verdict";

const ICONS = {
  proven: CheckCircle2,
  review: AlertTriangle,
  unproven: XCircle,
  unavailable: HelpCircle,
} as const;

/**
 * The reconciliation banner — the reason this product exists.
 *
 * It always shows the *arithmetic*, not just a verdict, so the user can check
 * the check: opening + transactions = closing, with the residual printed. A
 * verdict without the numbers is just another badge to distrust.
 */
export function ReconBanner({
  summary,
  findings = [],
  filename,
  period,
}: {
  summary: Summary;
  findings?: Finding[];
  filename?: string;
  period?: { start?: string | null; end?: string | null } | null;
}) {
  const verdict = verdictOf(summary, findings);
  const Icon = ICONS[verdict.id];
  const opening = summary.opening;
  const closing = summary.closing;
  const residual = summary.difference;

  return (
    <section
      className={cn("rounded-card border p-5 sm:p-6", verdict.tone.border, verdict.tone.bg)}
      aria-labelledby="recon-heading"
    >
      <div className="flex items-start gap-4">
        <span className={cn("mt-0.5 shrink-0", verdict.tone.text)}>
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 id="recon-heading" className={cn("text-base font-semibold", verdict.tone.text)}>
              {verdict.headline}
            </h2>
            <span className="rounded-pill border border-ink-600 bg-ink-900/60 px-2 py-0.5 text-xs text-fg-muted">
              {verdict.label}
            </span>
          </div>

          {filename ? (
            <p className="mt-1 truncate text-sm text-fg-muted" title={filename}>
              {filename}
              {period?.start && period?.end ? (
                <span className="text-fg-subtle"> · {period.start} → {period.end}</span>
              ) : null}
            </p>
          ) : null}

          {/* The arithmetic, spelled out. */}
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Figure label="Opening" value={opening} />
            <Figure label="Transactions" value={summary.total} signed />
            <Figure label="Expected close" value={opening !== null ? opening + summary.total : null} />
            <Figure
              label="Printed close"
              value={closing}
              emphasis={verdict.id === "unproven"}
            />
          </dl>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {residual !== null ? (
              <span className="text-fg-muted">
                Residual:{" "}
                <span
                  className={cn(
                    "tabular font-medium",
                    Math.abs(residual) <= 0.01 ? "text-proof-400" : "text-broken-400",
                  )}
                >
                  {formatMoney(residual)}
                </span>
              </span>
            ) : null}
            <span className="text-fg-muted">
              Rows: <span className="tabular font-medium text-fg">{summary.count}</span>
            </span>
            <span className="text-fg-muted">
              Flagged:{" "}
              <span
                className={cn(
                  "tabular font-medium",
                  summary.flagged > 0 ? "text-warn-400" : "text-proof-400",
                )}
              >
                {summary.flagged}
              </span>
            </span>
            <span className="text-fg-muted">
              Confidence:{" "}
              <span className="tabular font-medium text-fg">
                {Math.round(summary.confidence * 100)}%
              </span>
            </span>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-fg-muted">{verdict.detail}</p>
        </div>
      </div>
    </section>
  );
}

function Figure({
  label,
  value,
  signed = false,
  emphasis = false,
}: {
  label: string;
  value: number | null;
  signed?: boolean;
  emphasis?: boolean;
}) {
  const display =
    value === null
      ? "—"
      : signed
        ? `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatMoney(Math.abs(value))}`
        : formatMoney(value);
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd
        className={cn(
          "tabular mt-1 text-sm font-medium",
          emphasis ? "text-broken-400" : "text-fg",
        )}
      >
        {display}
      </dd>
    </div>
  );
}

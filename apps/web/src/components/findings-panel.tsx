"use client";

import { useState } from "react";
import { AlertTriangle, ChevronDown, Info, Lightbulb, XCircle } from "lucide-react";

import { cn } from "@/lib/cn";
import type { Finding, Severity } from "@/lib/types";
import { severityTone } from "@/lib/verdict";

const ICONS: Record<Severity, typeof Info> = {
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

/**
 * Findings: the "explain yourself" half of the product.
 *
 * Each finding is collapsed by default so the page leads with the verdict, then
 * expands to the affected row numbers and a suggested next step. Rows are
 * linked to the table below by index rather than duplicated here.
 */
export function FindingsPanel({ findings }: { findings: Finding[] }) {
  const actionable = findings.filter((f) => f.code !== "reconciled");
  if (actionable.length === 0) {
    return (
      <div className="panel flex items-start gap-3 p-4">
        <span className="mt-0.5 text-proof-400">
          <Info className="size-4" aria-hidden="true" />
        </span>
        <p className="text-sm text-fg-muted">
          No issues found. Every row continues the running balance and the
          statement reconciles.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {actionable.map((finding) => (
        <FindingRow key={finding.code} finding={finding} />
      ))}
    </ul>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(finding.severity === "error" && finding.count > 0);
  const Icon = ICONS[finding.severity];
  const tone = severityTone(finding.severity);
  const rows = finding.indices ?? [];

  return (
    <li className="panel overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-ink-800/60"
      >
        <span className={cn("shrink-0 rounded-md border p-1", tone)}>
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-fg">{finding.message}</span>
          <span className="mt-0.5 block text-xs text-fg-subtle">
            {finding.count} {finding.count === 1 ? "row" : "rows"}
            {rows.length > 0 && rows.length < finding.count
              ? ` · showing rows ${rows.slice(0, 8).map((i) => i + 1).join(", ")}${rows.length > 8 ? "…" : ""}`
              : null}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-fg-subtle transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open ? (
        <div className="border-t border-ink-700 px-4 py-3">
          {finding.hint ? (
            <p className="flex gap-2 text-sm leading-relaxed text-fg-muted">
              <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-warn-400" aria-hidden="true" />
              <span>{finding.hint}</span>
            </p>
          ) : null}
          {rows.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Affected rows">
              {rows.slice(0, 40).map((index) => (
                <span
                  key={index}
                  className="tabular rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 text-[11px] text-fg-muted"
                >
                  row {index + 1}
                </span>
              ))}
              {rows.length > 40 ? (
                <span className="text-[11px] text-fg-subtle">
                  +{rows.length - 40} more
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

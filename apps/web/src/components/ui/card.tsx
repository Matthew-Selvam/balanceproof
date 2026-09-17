import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/cn";

export function Card({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li";
}) {
  return (
    <Tag className={cn("panel p-5 sm:p-6", className)}>{children}</Tag>
  );
}

export function CardTitle({
  children,
  hint,
  action,
}: {
  children: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-fg">{children}</h2>
        {hint ? <p className="mt-1 text-sm text-fg-muted">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Badge({
  children,
  className,
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: "neutral" | "proof" | "warn" | "broken" | "accent";
}) {
  const tones: Record<string, string> = {
    neutral: "border-ink-600 bg-ink-700/40 text-fg-muted",
    proof: "border-proof-500/35 bg-proof-500/10 text-proof-400",
    warn: "border-warn-500/35 bg-warn-500/10 text-warn-400",
    broken: "border-broken-500/35 bg-broken-500/10 text-broken-400",
    accent: "border-accent-500/35 bg-accent-500/10 text-accent-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusDot({ className }: { className?: string }) {
  return <span className={cn("size-1.5 rounded-full", className)} aria-hidden="true" />;
}

/** Empty state: icon, explanation and a next action — never a bare sentence. */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-ink-600 px-6 py-14 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-full border border-ink-600 bg-ink-800 text-fg-subtle">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-fg-muted">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function InlineLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="font-medium text-accent-400 underline decoration-accent-500/40 underline-offset-2 hover:decoration-accent-400"
    >
      {children}
    </Link>
  );
}

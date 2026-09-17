import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { Badge, Card } from "@/components/ui/card";

export const metadata = {
  title: "Pricing",
  description:
    "Simple per-volume pricing for bank statement conversion with reconciliation checks.",
};

const TIERS = [
  {
    name: "Preview",
    price: "$0",
    unit: "no account needed",
    blurb: "Prove the reconciliation works before you pay anything.",
    features: [
      "Parse the first pages of a statement",
      "Full reconciliation report and findings",
      "Row-level flags with explanations",
      "Confidence score and parser caveats",
    ],
    cta: "Convert a statement",
    href: "/upload",
    highlight: false,
  },
  {
    name: "Credit pack",
    price: "$9",
    unit: "one-time",
    blurb: "For one-off conversions or a single client's back catalogue.",
    features: [
      "100 statement pages",
      "All five export formats",
      "Statement history and re-parse",
      "Credits never expire",
    ],
    cta: "Buy credits",
    href: "/upload",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$19",
    unit: "per month",
    blurb: "The working bookkeeper's plan.",
    features: [
      "500 pages per month",
      "Batch upload up to 25 files",
      "Flagged-only exports for fast review",
      "Accuracy insights dashboard",
      "Priority parsing queue",
    ],
    cta: "Start Pro",
    href: "/upload",
    highlight: true,
  },
  {
    name: "Firm",
    price: "$79",
    unit: "per month",
    blurb: "For practices managing dozens of clients.",
    features: [
      "Everything in Pro",
      "Client folders and per-client history",
      "Programmatic API access",
      "Custom bank layouts on request",
      "Priority support",
    ],
    cta: "Talk to us",
    href: "/upload",
    highlight: false,
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="max-w-2xl">
        <Badge tone="warn" className="mb-4">
          Beta — pricing not yet enforced
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Pay for volume, not for trust
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-fg-muted">
          Reconciliation, findings and flagged-row exports are in every tier
          including free. Charging separately for the validation would rather
          defeat the point of building it.
        </p>
      </header>

      <div className="mt-12 grid gap-4 lg:grid-cols-4 sm:grid-cols-2">
        {TIERS.map((tier) => (
          <Card
            key={tier.name}
            className={
              tier.highlight
                ? "border-accent-500/45 ring-1 ring-accent-500/25"
                : undefined
            }
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium uppercase tracking-wide text-fg-subtle">
                {tier.name}
              </h2>
              {tier.highlight ? <Badge tone="accent">most common</Badge> : null}
            </div>

            <p className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tracking-tight">{tier.price}</span>
              <span className="text-sm text-fg-subtle">{tier.unit}</span>
            </p>

            <p className="mt-2 min-h-10 text-sm text-fg-muted">{tier.blurb}</p>

            <ul className="mt-5 space-y-2.5">
              {tier.features.map((feature) => (
                <li key={feature} className="flex gap-2 text-sm text-fg-muted">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-proof-400" aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>

            <Link
              href={tier.href}
              className={`mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors ${
                tier.highlight
                  ? "bg-accent-500 text-white hover:bg-accent-400"
                  : "border border-ink-600 text-fg hover:border-ink-500 hover:bg-ink-800"
              }`}
            >
              {tier.cta}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </Card>
        ))}
      </div>

      <section className="mt-14">
        <h2 className="text-xl font-semibold tracking-tight">Questions worth answering up front</h2>
        <dl className="mt-6 grid gap-6 sm:grid-cols-2">
          {[
            [
              "What counts as a page?",
              "One PDF page. A 12-page statement uses 12 pages whether it yields 30 rows or 400 — we charge for the work the parser does, not the rows you get.",
            ],
            [
              "What happens to a statement that fails to parse?",
              "It isn't billed. You can see it in your history with the parser's error message, and re-parse it for free at any time.",
            ],
            [
              "Do you keep my clients' statements?",
              "The worker runs in your deployment and files are not sent to any third-party API. Retention is whatever your STORAGE_DIR policy is.",
            ],
            [
              "Are the numbers real yet?",
              "The prices above are the intended beta pricing and are not enforced in this build. The accuracy insights page shows live figures from your own deployment rather than a marketing number.",
            ],
          ].map(([question, answer]) => (
            <div key={question}>
              <dt className="text-sm font-medium text-fg">{question}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-fg-muted">{answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="panel-raised mt-14 flex flex-col items-start justify-between gap-5 p-7 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            Not sure whether we support your bank?
          </h2>
          <p className="mt-1.5 text-sm text-fg-muted">
            Upload a statement. If no layout matches, the generic parser will
            still run — and it will tell you that it was a fallback.
          </p>
        </div>
        <Link
          href="/banks"
          className="inline-flex h-11 shrink-0 items-center rounded-xl border border-ink-600 px-5 text-sm font-medium text-fg transition-colors hover:border-ink-500"
        >
          Supported banks
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";
import { ArrowRight, ServerCog } from "lucide-react";

import { Badge, Card, EmptyState } from "@/components/ui/card";
import type { BankSpec } from "@/lib/bank-types";
import { workerBanks, workerHealth } from "@/lib/worker";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Supported banks",
  description:
    "Institutions with a dedicated layout, and what happens when yours isn't listed.",
};

export default async function BanksPage() {
  const [banks, health] = await Promise.all([workerBanks(), workerHealth()]);

  const byCountry = new Map<string, BankSpec[]>();
  for (const bank of banks) {
    const list = byCountry.get(bank.country) ?? [];
    list.push(bank);
    byCountry.set(bank.country, list);
  }
  const countries = [...byCountry.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
      <header>
        <Badge tone={health.ok ? "proof" : "broken"}>
          <ServerCog className="size-3.5" aria-hidden="true" />
          worker {health.ok ? `v${health.version ?? "?"}` : "offline"}
        </Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
          Supported banks
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-fg-muted">
          These institutions have a dedicated layout, which means column
          detection is driven by their actual statement format rather than by
          guesswork.
        </p>
      </header>

      {!health.ok ? (
        <div className="mt-8">
          <EmptyState
            icon={<ServerCog className="size-5" aria-hidden="true" />}
            title="The parsing worker is offline"
            body="The bank list is served by the worker, so it can't be shown right now. Start the worker and reload."
          />
        </div>
      ) : (
        <>
          <div className="mt-10 space-y-8">
            {countries.map(([country, list]) => (
              <section key={country}>
                <h2 className="text-sm font-medium uppercase tracking-wide text-fg-subtle">
                  {COUNTRY_NAMES[country] ?? country}
                  <span className="ml-2 text-fg-subtle/70">{list.length}</span>
                </h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {list
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((bank) => (
                      <li key={bank.id}>
                        <Card className="flex items-center justify-between gap-3 p-3.5">
                          <span className="truncate text-sm text-fg">{bank.name}</span>
                          <span className="shrink-0 rounded border border-ink-600 bg-ink-900 px-1.5 py-0.5 font-mono text-[10px] uppercase text-fg-subtle">
                            {bank.kind === "credit_card"
                              ? "card"
                              : bank.kind === "brokerage"
                                ? "broker"
                                : bank.kind === "fintech"
                                  ? "fintech"
                                  : "bank"}
                          </span>
                        </Card>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>

          <section className="mt-14">
            <h2 className="text-xl font-semibold tracking-tight">
              My bank isn&apos;t listed
            </h2>
            <div className="mt-4 space-y-4 text-fg-muted">
              <p>
                The generic parser still runs. It finds the date at the start of
                each line, then treats the last two money-shaped values as the
                amount and the balance.
              </p>
              <p>
                That heuristic works more often than you would expect, but it is
                a heuristic — so every row it produces is stamped{" "}
                <code className="rounded bg-ink-900 px-1.5 py-0.5 font-mono text-xs text-fg">
                  generic_parser
                </code>
                , the statement carries an explicit caveat, and the confidence
                score is reduced. The reconciliation check still runs at full
                strength, which is what tells you whether the guess was right.
              </p>
              <p>
                Adding a layout is a config entry in the worker&apos;s registry —
                no new parser code for most institutions.
              </p>
            </div>
          </section>
        </>
      )}

      <div className="mt-12 flex flex-wrap gap-3">
        <Link
          href="/upload"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent-500 px-5 text-sm font-medium text-white transition-colors hover:bg-accent-400"
        >
          Convert a statement
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <Link
          href="/how-it-works"
          className="inline-flex h-11 items-center rounded-xl border border-ink-600 px-5 text-sm font-medium text-fg transition-colors hover:border-ink-500"
        >
          How the checks work
        </Link>
      </div>
    </div>
  );
}

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States",
  UK: "United Kingdom",
  CA: "Canada",
  AU: "Australia",
  IN: "India",
};

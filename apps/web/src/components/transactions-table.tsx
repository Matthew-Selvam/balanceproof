"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { rowHasError, rowNeedsAttention } from "@/lib/verdict";

type SortKey = "index" | "date" | "description" | "amount" | "balance";
type Filter = "all" | "flagged" | "errors" | "credits" | "debits";

const PAGE_SIZE = 100;

const FILTERS: { id: Filter; label: string; test: (t: Transaction) => boolean }[] = [
  { id: "all", label: "All rows", test: () => true },
  { id: "flagged", label: "Flagged", test: rowNeedsAttention },
  { id: "errors", label: "Errors", test: rowHasError },
  { id: "credits", label: "Money in", test: (t) => t.amount > 0 },
  { id: "debits", label: "Money out", test: (t) => t.amount < 0 },
];

export function TransactionsTable({ transactions }: { transactions: Transaction[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "index",
    dir: "asc",
  });
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const test = FILTERS.find((f) => f.id === filter)?.test ?? (() => true);
    const rows = transactions.filter((t) => {
      if (!test(t)) return false;
      if (!needle) return true;
      return (
        t.description.toLowerCase().includes(needle) ||
        t.date.includes(needle) ||
        String(t.amount).includes(needle) ||
        t.flags.some((f) => f.includes(needle))
      );
    });

    const direction = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av === null && bv === null) return 0;
      if (av === null) return 1; // nulls last, regardless of direction
      if (bv === null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * direction;
      return String(av).localeCompare(String(bv)) * direction;
    });
  }, [transactions, query, filter, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    setPage(0);
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "amount" || key === "balance" ? "desc" : "asc" },
    );
  };

  const flaggedCount = transactions.filter(rowNeedsAttention).length;

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-ink-700 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Search description, amount or flag"
            aria-label="Search transactions"
            className="h-9 w-full rounded-lg border border-ink-600 bg-ink-900 pl-9 pr-3 text-sm text-fg placeholder:text-fg-subtle focus:border-accent-500/60 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto" role="group" aria-label="Filter rows">
          <SlidersHorizontal className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
          {FILTERS.map((f) => {
            const count =
              f.id === "all" ? transactions.length : transactions.filter(f.test).length;
            if (f.id !== "all" && count === 0) return null;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setFilter(f.id);
                  setPage(0);
                }}
                aria-pressed={filter === f.id}
                className={cn(
                  "whitespace-nowrap rounded-pill border px-2.5 py-1 text-xs transition-colors",
                  filter === f.id
                    ? "border-accent-500/50 bg-accent-500/15 text-accent-400"
                    : "border-ink-600 text-fg-muted hover:border-ink-500 hover:text-fg",
                )}
              >
                {f.label}
                <span className="tabular ml-1.5 text-fg-subtle">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-fg-muted">
          No rows match{query ? ` “${query}”` : " this filter"}.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <caption className="sr-only">
              Parsed transactions. Use the column headers to sort.
            </caption>
            <thead>
              <tr className="border-b border-ink-700 text-left text-xs uppercase tracking-wide text-fg-subtle">
                <SortableTh label="#" onClick={() => toggleSort("index")} sort={sort} sortKey="index" className="w-14" align="right" />
                <SortableTh label="Date" onClick={() => toggleSort("date")} sort={sort} sortKey="date" className="w-28" />
                <SortableTh label="Description" onClick={() => toggleSort("description")} sort={sort} sortKey="description" />
                <SortableTh label="Amount" onClick={() => toggleSort("amount")} sort={sort} sortKey="amount" align="right" className="w-28" />
                <SortableTh label="Balance" onClick={() => toggleSort("balance")} sort={sort} sortKey="balance" align="right" className="w-28" />
                <th scope="col" className="px-4 py-2.5 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => {
                const erroneous = rowHasError(t);
                return (
                  <tr
                    key={`${t.index}-${t.date}-${t.description}`}
                    className={cn(
                      "border-b border-ink-800/70 last:border-0",
                      erroneous && "bg-broken-500/[0.07]",
                      !erroneous && rowNeedsAttention(t) && "bg-warn-500/[0.05]",
                    )}
                  >
                    <td className="tabular px-4 py-2 text-right text-xs text-fg-subtle">
                      {t.index + 1}
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-2 text-fg-muted">{t.date}</td>
                    <td className="max-w-md px-4 py-2">
                      <span className="line-clamp-2 break-words text-fg" title={t.description}>
                        {t.description || <span className="text-fg-subtle">(no description)</span>}
                      </span>
                      {t.amount_before_repair !== null && t.amount_before_repair !== undefined ? (
                        <span className="mt-0.5 block text-xs text-warn-400">
                          Amount recomputed from {formatMoney(t.amount_before_repair)}
                        </span>
                      ) : null}
                    </td>
                    <td
                      className={cn(
                        "tabular whitespace-nowrap px-4 py-2 text-right",
                        t.amount < 0 ? "text-fg-muted" : "text-proof-400",
                      )}
                    >
                      {formatMoney(t.amount)}
                    </td>
                    <td className="tabular whitespace-nowrap px-4 py-2 text-right text-fg-muted">
                      {t.balance === null ? "—" : formatMoney(t.balance)}
                    </td>
                    <td className="px-4 py-2">
                      {t.flags.length === 0 ? (
                        <span className="text-fg-subtle">—</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {t.flags.map((flag) => (
                            <span
                              key={flag}
                              className={cn(
                                "rounded-pill border px-1.5 py-0.5 text-[11px]",
                                rowHasError(t)
                                  ? "border-broken-500/35 bg-broken-500/10 text-broken-400"
                                  : "border-warn-500/30 bg-warn-500/10 text-warn-400",
                              )}
                            >
                              {flag.replaceAll("_", " ")}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-ink-700 p-4 text-sm text-fg-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          Showing{" "}
          <span className="tabular text-fg">
            {visible.length === 0 ? 0 : safePage * PAGE_SIZE + 1}–
            {safePage * PAGE_SIZE + visible.length}
          </span>{" "}
          of <span className="tabular text-fg">{filtered.length}</span> rows
          {flaggedCount > 0 ? (
            <>
              {" · "}
              <span className="text-warn-400">{flaggedCount} need attention</span>
            </>
          ) : null}
        </p>

        {pageCount > 1 ? (
          <nav className="flex items-center gap-2" aria-label="Pagination">
            <Button
              size="sm"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
              Prev
            </Button>
            <span className="tabular text-xs text-fg-muted">
              {safePage + 1} / {pageCount}
            </span>
            <Button
              size="sm"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              aria-label="Next page"
            >
              Next
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </Button>
          </nav>
        ) : null}
      </div>
    </div>
  );
}

function SortableTh({
  label,
  onClick,
  sort,
  sortKey,
  align = "left",
  className,
}: {
  label: string;
  onClick: () => void;
  sort: { key: SortKey; dir: "asc" | "desc" };
  sortKey: SortKey;
  align?: "left" | "right";
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      scope="col"
      className={cn("px-4 py-2.5 font-medium", className)}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-fg",
          align === "right" && "flex-row-reverse",
          active ? "text-fg" : "text-fg-subtle",
        )}
      >
        {label}
        {active ? (
          sort.dir === "asc" ? (
            <ArrowUp className="size-3" aria-hidden="true" />
          ) : (
            <ArrowDown className="size-3" aria-hidden="true" />
          )
        ) : null}
      </button>
    </th>
  );
}

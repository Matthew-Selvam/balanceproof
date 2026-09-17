"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/cn";

const STATUSES = [
  { id: "all", label: "All" },
  { id: "done", label: "Parsed" },
  { id: "error", label: "Failed" },
  { id: "processing", label: "Processing" },
] as const;

/** Status + filename filter for the history list. Kept in the URL so a filtered view is shareable and reload-safe. */
export function StatementFilterBar({
  status,
  search,
}: {
  status: string;
  search: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(search);

  // Keep the input in sync when navigation changes the URL from outside.
  useEffect(() => setQuery(search), [search]);

  function push(next: { status?: string; q?: string }) {
    const merged = new URLSearchParams(params.toString());
    const nextStatus = next.status ?? status;
    const nextQuery = next.q ?? search;
    if (nextStatus && nextStatus !== "all") merged.set("status", nextStatus);
    else merged.delete("status");
    if (nextQuery) merged.set("q", nextQuery);
    else merged.delete("q");
    merged.delete("page"); // any filter change resets pagination
    startTransition(() => {
      router.push(`/statements${merged.toString() ? `?${merged}` : ""}`);
    });
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-1.5" role="group" aria-label="Filter by status">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={status === s.id}
            onClick={() => push({ status: s.id })}
            className={cn(
              "rounded-pill border px-3 py-1.5 text-xs transition-colors",
              status === s.id
                ? "border-accent-500/50 bg-accent-500/15 text-accent-400"
                : "border-ink-600 text-fg-muted hover:border-ink-500 hover:text-fg",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          push({ q: query.trim() });
        }}
        className="relative sm:w-72"
        role="search"
      >
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by filename"
          aria-label="Filter statements by filename"
          className="h-9 w-full rounded-lg border border-ink-600 bg-ink-900 pl-9 pr-3 text-sm text-fg placeholder:text-fg-subtle focus:border-accent-500/60 focus:outline-none"
        />
        {pending ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-subtle">
            …
          </span>
        ) : null}
      </form>
    </div>
  );
}

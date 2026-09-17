"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { cn } from "@/lib/cn";

const NAV = [
  { href: "/upload", label: "Convert" },
  { href: "/statements", label: "History" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-ink-800 bg-ink-950/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="BalanceProof home">
          <span className="flex size-7 items-center justify-center rounded-md bg-proof-500/15 text-proof-400 ring-1 ring-proof-500/30">
            <ShieldCheck className="size-4" aria-hidden="true" />
          </span>
          <span className="text-sm font-semibold tracking-tight">BalanceProof</span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-ink-800 text-fg"
                    : "text-fg-muted hover:bg-ink-800/60 hover:text-fg",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <Link
          href="/upload"
          className="inline-flex h-9 items-center rounded-lg bg-accent-500 px-3.5 text-sm font-medium text-white transition-colors hover:bg-accent-400 sm:px-4"
        >
          Convert a statement
        </Link>
      </div>

      {/* Mobile nav: a horizontal scroller keeps every destination reachable
          without a JS drawer, which is the usual source of a11y bugs. */}
      <nav
        aria-label="Main (compact)"
        className="flex gap-1 overflow-x-auto border-t border-ink-800 px-4 py-2 sm:hidden"
      >
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-xs",
                active ? "bg-ink-800 text-fg" : "text-fg-muted",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

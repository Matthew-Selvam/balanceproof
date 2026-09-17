import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-ink-800">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <p className="text-sm font-semibold tracking-tight">BalanceProof</p>
          <p className="mt-2 max-w-sm text-sm text-fg-muted">
            PDF bank statements into exports that reconcile — and that say so
            when they don&apos;t.
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Product</p>
          <ul className="mt-3 space-y-2 text-sm text-fg-muted">
            <li><Link href="/upload" className="hover:text-fg">Convert a statement</Link></li>
            <li><Link href="/statements" className="hover:text-fg">Statement history</Link></li>
            <li><Link href="/insights" className="hover:text-fg">Accuracy insights</Link></li>
            <li><Link href="/how-it-works" className="hover:text-fg">How it works</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Reference</p>
          <ul className="mt-3 space-y-2 text-sm text-fg-muted">
            <li><Link href="/banks" className="hover:text-fg">Supported banks</Link></li>
            <li><Link href="/pricing" className="hover:text-fg">Pricing</Link></li>
            <li>
              <a
                href="https://github.com/Matthew-Selvam/balanceproof"
                className="hover:text-fg"
                rel="noreferrer noopener"
                target="_blank"
              >
                Source
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-ink-800 px-4 py-6 text-center text-xs text-fg-subtle sm:px-6">
        Built for bookkeepers who are tired of re-keying. Parsing is done by a
        self-hosted worker; files never leave your deployment.
      </div>
    </footer>
  );
}

import Link from "next/link";

const steps = [
  {
    n: "1",
    title: "Upload your PDF",
    body: "Drag in a statement from any of 20+ supported banks. No account needed for preview.",
  },
  {
    n: "2",
    title: "We parse & validate",
    body: "Layout-aware extraction, then every row is checked: running balance, duplicates, date order.",
  },
  {
    n: "3",
    title: "Export clean data",
    body: "Download CSV that reconciles to the penny — or get flagged rows so you know exactly what to fix.",
  },
];

const features = [
  { title: "Reconciliation guarantee", body: "Opening + Σ transactions = closing, verified on every export.", soon: false },
  { title: "Running-balance checks", body: "Each row must continue from the last. Silent errors become visible.", soon: false },
  { title: "Duplicate detection", body: "Retry loops and double-posts get flagged before they hit your books.", soon: false },
  { title: ".qbo / OFX export", body: "Import straight into QuickBooks and Xero.", soon: true },
  { title: "Batch & ZIP upload", body: "A whole year of statements in one pass.", soon: true },
  { title: "Firm API + client folders", body: "Built for bookkeepers managing dozens of clients.", soon: true },
];

const tiers = [
  { name: "Preview", price: "$0", note: "first page + validation report", cta: "Try now" },
  { name: "Credit pack", price: "$9", note: "100 pages, one-time", cta: "Buy credits" },
  { name: "Pro", price: "$19/mo", note: "500 pages · batch · all formats", cta: "Go Pro" },
  { name: "Firm", price: "$79/mo", note: "API · client folders · priority", cta: "Contact us" },
];

export default function Home() {
  return (
    <main>
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold tracking-tight">BalanceProof</span>
          <nav className="flex items-center gap-6 text-sm text-neutral-600">
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <Link href="/upload" className="rounded-lg bg-neutral-900 px-3 py-1.5 font-medium text-white hover:bg-neutral-700">
              Convert a statement
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
          Bank statements,
          <br />
          proven accurate.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-600">
          PDF → Excel & CSV in seconds. Every export passes a reconciliation check before you
          download it — no more silent conversion errors in your books.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/upload"
            className="rounded-xl bg-neutral-900 px-6 py-3 font-medium text-white shadow-sm transition hover:bg-neutral-700"
          >
            Try it free
          </Link>
          <a href="#pricing" className="rounded-xl border border-neutral-300 bg-white px-6 py-3 font-medium hover:bg-neutral-100">
            See pricing
          </a>
        </div>
        <p className="mt-6 text-sm text-neutral-500">
          Balance-checked exports · Running-balance validation · Nothing leaves your export unverified
        </p>
      </section>

      <section id="how" className="border-y border-neutral-200 bg-white py-20">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 sm:grid-cols-3">
          {steps.map((s) => (
            <div key={s.n}>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 font-medium text-white">{s.n}</div>
              <h3 className="mt-4 text-lg font-medium">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-3xl font-semibold tracking-tight">Why trust the output?</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-neutral-200 bg-white p-6">
              <h3 className="font-medium">
                {f.title}
                {f.soon && <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">soon</span>}
              </h3>
              <p className="mt-2 text-sm text-neutral-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="border-t border-neutral-200 bg-white py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-semibold tracking-tight">Pricing</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {tiers.map((t) => (
              <div key={t.name} className="rounded-xl border border-neutral-200 p-6">
                <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-500">{t.name}</h3>
                <p className="mt-3 text-2xl font-semibold">{t.price}</p>
                <p className="mt-1 text-sm text-neutral-600">{t.note}</p>
                <Link
                  href="/upload"
                  className="mt-6 block rounded-lg border border-neutral-300 py-2 text-center text-sm font-medium hover:bg-neutral-50"
                >
                  {t.cta}
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-neutral-500">Pricing goes live with beta — early users keep founder rates.</p>
        </div>
      </section>

      <footer className="py-10 text-center text-sm text-neutral-400">
        © BalanceProof — built for bookkeepers who hate re-keying.
      </footer>
    </main>
  );
}

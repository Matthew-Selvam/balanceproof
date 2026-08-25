"use client";

import { useCallback, useRef, useState } from "react";

interface Transaction {
  date: string;
  description: string;
  amount: number;
  balance: number | null;
  flags: string[];
}

interface ParsedResult {
  bank: string;
  balances: { opening: number | null; closing: number | null };
  transactions: Transaction[];
  summary: {
    count: number;
    total: number;
    reconciled: boolean | null;
    difference: number | null;
    confidence: number;
  };
}

export default function UploadPage() {
  const [phase, setPhase] = useState<"idle" | "working" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [statementId, setStatementId] = useState<string | null>(null);
  const [result, setResult] = useState<ParsedResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const convert = useCallback(async (file: File) => {
    setPhase("working");
    setError(null);
    setResult(null);
    setStatementId(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/statements", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok || body.error) throw new Error(body.error ?? "Upload failed");
      setStatementId(body.id);
      for (let attempt = 0; attempt < 90; attempt++) {
        await new Promise((r) => setTimeout(r, 1000));
        const poll = await (await fetch(`/api/statements/${body.id}`)).json();
        if (poll.status === "done") {
          setResult(poll.data);
          setPhase("done");
          return;
        }
        if (poll.status === "error") throw new Error(poll.error ?? "Conversion failed");
      }
      throw new Error("Timed out waiting for conversion");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, []);

  const s = result?.summary;
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <a href="/" className="text-sm text-neutral-500 hover:text-neutral-800">← Back</a>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Convert a bank statement</h1>
      <p className="mt-2 text-neutral-600">PDF in, validated CSV out. Your data is checked row-by-row before download.</p>

      <label
        className={`mt-8 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-12 text-center transition ${
          phase === "idle" ? "border-neutral-300 hover:bg-white" : "border-neutral-200 bg-white"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          disabled={phase === "working"}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void convert(file);
          }}
        />
        {phase === "working" ? (
          <>
            <p className="font-medium">Converting… this usually takes under a minute.</p>
            <p className="mt-1 text-sm text-neutral-500">Parsing layout → extracting rows → validating balances.</p>
          </>
        ) : (
          <>
            <p className="font-medium">Drop your PDF here, or click to browse</p>
            <p className="mt-1 text-sm text-neutral-500">Up to 25 MB · text-based PDFs (scans not supported yet)</p>
          </>
        )}
      </label>

      {phase === "error" && error && (
        <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>
      )}

      {phase === "done" && result && s && (
        <div className="mt-10">
          <div
            className={`rounded-xl border p-4 ${
              s.reconciled === true
                ? "border-emerald-200 bg-emerald-50"
                : s.reconciled === false
                  ? "border-amber-200 bg-amber-50"
                  : "border-neutral-200 bg-white"
            }`}
          >
            <p className="font-medium">
              {s.reconciled === true
                ? `✓ Reconciled — opening + Σ = closing, to the penny (${s.count} transactions)`
                : s.reconciled === false
                  ? `⚠ Mismatch of ${s.difference} detected — review flagged rows below`
                  : `Parsed ${s.count} transactions — statement balances not found, could not auto-reconcile`}
            </p>
            <p className="mt-1 text-sm text-neutral-600">
              Bank: {result.bank} · Confidence: {Math.round(s.confidence * 100)}% · Net total: {s.total.toFixed(2)}
            </p>
          </div>

          {statementId && (
            <a
              href={`/api/statements/${statementId}/export`}
              className="mt-4 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Download CSV
            </a>
          )}

          <div className="mt-6 overflow-x-auto rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3">Flags</th>
                </tr>
              </thead>
              <tbody>
                {result.transactions.slice(0, 150).map((t, i) => (
                  <tr key={i} className={`border-b border-neutral-100 ${t.flags.length ? "bg-rose-50/60" : ""}`}>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums">{t.date}</td>
                    <td className="max-w-xs truncate px-4 py-2">{t.description}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${t.amount < 0 ? "text-rose-600" : ""}`}>
                      {t.amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{t.balance == null ? "—" : t.balance.toFixed(2)}</td>
                    <td className="px-4 py-2">
                      {t.flags.length ? (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">{t.flags.join(", ")}</span>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.transactions.length > 150 && (
            <p className="mt-2 text-sm text-neutral-500">Showing first 150 of {result.transactions.length} rows — full set included in the CSV.</p>
          )}
        </div>
      )}
    </main>
  );
}

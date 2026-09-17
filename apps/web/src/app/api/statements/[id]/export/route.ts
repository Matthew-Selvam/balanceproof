import { ensureSchema, sql } from "@/lib/db";
import { buildFilename } from "@/lib/export-name";
import { clientKey, LIMITS, rateLimit } from "@/lib/rate-limit";
import { isUuid, parseExportQuery } from "@/lib/schemas";
import type { ParseResult, Transaction } from "@/lib/types";
import { exportViaWorker } from "@/lib/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Flags that are informational only and should not block a clean import. */
const BENIGN = new Set(["generic_parser", "overdraft", "zero_amount", "large_amount"]);

/**
 * GET /api/statements/[id]/export?format=xlsx&onlyFlagged=1
 *
 * Rendering happens in the worker (single implementation of every writer, and
 * the CSV-injection and OFX-escaping rules live next to the format code). This
 * route is responsible for fetching, filtering and naming the download.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(clientKey(request), LIMITS.export.limit, LIMITS.export.windowMs);
  if (!limited.allowed) {
    return Response.json({ error: "Too many export requests." }, { status: 429 });
  }

  const { id } = await params;
  if (!isUuid(id)) {
    return Response.json({ error: "Not a valid statement id." }, { status: 400 });
  }

  const parsed = parseExportQuery(new URL(request.url).searchParams);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  const { format, onlyFlagged, label, hideInfo } = parsed.value;

  await ensureSchema();
  const rows = await sql`
    select s.filename, s.status, r.data
    from statements s
    left join results r on r.statement_id = s.id
    where s.id = ${id}::uuid
    limit 1
  `;
  if (!rows.length) {
    return Response.json({ error: "Statement not found." }, { status: 404 });
  }
  const row = rows[0]!;
  if (row.status !== "done" || !row.data) {
    return Response.json(
      { error: `This statement is not ready to export (status: ${row.status}).` },
      { status: 409 },
    );
  }

  const result = row.data as ParseResult;
  const transactions = filterTransactions(result.transactions ?? [], {
    onlyFlagged,
    hideInfo,
  });

  if (transactions.length === 0) {
    return Response.json(
      {
        error: onlyFlagged
          ? "No rows need attention, so there is nothing to export with the flagged-rows filter on."
          : "This statement produced no transactions.",
      },
      { status: 409 },
    );
  }

  const payload: ParseResult = { ...result, transactions };
  const outcome = await exportViaWorker(format, payload);
  if (!outcome.ok) {
    return Response.json({ error: outcome.error }, { status: outcome.status });
  }

  const filename = buildFilename(label ?? result.filename, format, onlyFlagged);
  return new Response(outcome.data.body, {
    headers: {
      "content-type": outcome.data.contentType,
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
      "x-row-count": String(transactions.length),
    },
  });
}

function filterTransactions(
  transactions: Transaction[],
  opts: { onlyFlagged: boolean; hideInfo: boolean },
): Transaction[] {
  let out = transactions.filter((t) => t && typeof t.amount === "number");
  if (opts.onlyFlagged) {
    out = out.filter((t) => t.flags.some((f) => !BENIGN.has(f)));
  } else if (opts.hideInfo) {
    out = out.filter((t) => t.flags.length === 0);
  }
  return out;
}

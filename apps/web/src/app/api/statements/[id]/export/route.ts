import { ensureSchema, sql } from "@/lib/db";

interface ExportTxn {
  date: string;
  description: string;
  amount: number;
  balance: number | null;
  flags: string[];
}

function escapeCsv(value: string): string {
  return value.includes(",") || value.includes('"') || value.includes("\n")
    ? `"${value.replaceAll('"', '""')}"`
    : value;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  await ensureSchema();
  const rows = await sql`
    select data from results where statement_id = ${params.id}::uuid limit 1
  `;
  if (!rows.length) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const transactions = ((rows[0].data?.transactions ?? []) as ExportTxn[]).map((t) => ({
    date: t.date ?? "",
    description: t.description ?? "",
    amount: Number(t.amount ?? 0),
    balance: t.balance == null ? null : Number(t.balance),
    flags: Array.isArray(t.flags) ? t.flags : [],
  }));

  const url = new URL(request.url);
  if (url.searchParams.get("format") === "json") {
    return Response.json({ transactions });
  }

  const lines = [
    "Date,Description,Amount,Balance,Flags",
    ...transactions.map((t) =>
      [
        t.date,
        escapeCsv(t.description),
        t.amount.toFixed(2),
        t.balance == null ? "" : t.balance.toFixed(2),
        t.flags.join("; "),
      ].join(",")
    ),
  ];
  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="statement-${params.id}.csv"`,
    },
  });
}

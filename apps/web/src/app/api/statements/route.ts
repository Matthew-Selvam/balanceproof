import { ensureSchema, sql } from "@/lib/db";
import { saveUpload } from "@/lib/storage";

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Missing file field" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    return Response.json({ error: "Only PDF statements are supported" }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "File exceeds 25MB limit" }, { status: 413 });
  }

  await ensureSchema();
  const buffer = Buffer.from(await file.arrayBuffer());
  const saved = await saveUpload(buffer, file.name);
  const inserted = await sql`
    insert into statements (filename) values (${file.name}) returning id
  `;
  const id = inserted[0].id as string;

  try {
    const workerUrl = process.env.WORKER_URL ?? "http://localhost:8000";
    const response = await fetch(`${workerUrl}/parse`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: saved.absolutePath, filename: file.name }),
      signal: AbortSignal.timeout(120_000),
    });
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.detail ?? payload.error ?? "Parsing failed");

    await sql`update statements set status = 'done' where id = ${id}::uuid`;
    await sql`
      insert into results (statement_id, data) values (${id}::uuid, ${sql.json(payload)})
      on conflict (statement_id) do update set data = excluded.data
    `;
    return Response.json({ id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sql`update statements set status = 'error', error = ${message} where id = ${id}::uuid`;
    return Response.json({ id, error: message });
  }
}

import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/postgres";

export const sql = postgres(connectionString, { max: 5 });

let schemaPromise: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await sql`
        create table if not exists statements (
          id uuid primary key default gen_random_uuid(),
          filename text not null,
          status text not null default 'processing',
          error text,
          created_at timestamptz not null default now()
        )
      `;
      await sql`
        create table if not exists results (
          statement_id uuid primary key references statements(id) on delete cascade,
          data jsonb not null,
          created_at timestamptz not null default now()
        )
      `;
    })();
  }
  return schemaPromise;
}

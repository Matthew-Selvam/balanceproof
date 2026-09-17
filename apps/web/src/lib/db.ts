import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL ?? "postgresql://localhost:5432/postgres";

declare global {
  // Reuse one pool across hot reloads in dev, and across route handlers.
  // eslint-disable-next-line no-var
  var __balanceproofSql: ReturnType<typeof postgres> | undefined;
  // eslint-disable-next-line no-var
  var __balanceproofSchema: Promise<void> | undefined;
}

export const sql =
  globalThis.__balanceproofSql ??
  postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    // Keep timestamps as ISO strings so the API payload is stable.
    transform: { undefined: null },
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__balanceproofSql = sql;
}

/**
 * Idempotent schema setup.
 *
 * Runs once per process and is cached on globalThis so concurrent requests in
 * the same process share one migration instead of racing. Every statement is
 * `if not exists`, so a partially-applied schema self-heals on the next boot.
 */
export function ensureSchema(): Promise<void> {
  if (!globalThis.__balanceproofSchema) {
    globalThis.__balanceproofSchema = (async () => {
      // gen_random_uuid() needs pgcrypto before PG13; harmless afterwards.
      await sql`create extension if not exists pgcrypto`;
      await sql`
        create table if not exists statements (
          id uuid primary key default gen_random_uuid(),
          filename text not null,
          status text not null default 'processing',
          error text,
          byte_size integer,
          sha256 text,
          storage_path text,
          attempts integer not null default 0,
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
      // Listing and stats query on these two; without them the history page
      // does a sequential scan once a user has a few hundred statements.
      await sql`create index if not exists statements_created_at_idx on statements (created_at desc)`;
      await sql`create index if not exists statements_status_idx on statements (status)`;
      // De-duplication: the same file uploaded twice shouldn't parse twice.
      await sql`create index if not exists statements_sha256_idx on statements (sha256)`;
      // Self-healing migration for databases created before these columns existed.
      await sql`alter table statements add column if not exists storage_path text`;
      await sql`alter table statements add column if not exists attempts integer not null default 0`;
    })().catch((error) => {
      // Don't cache a failed migration, or the app stays broken until restart.
      globalThis.__balanceproofSchema = undefined;
      throw error;
    });
  }
  return globalThis.__balanceproofSchema;
}

export type Sql = typeof sql;

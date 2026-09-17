import { workerBanks, workerHealth } from "@/lib/worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/banks — the supported-institution list, straight from the worker. */
export async function GET() {
  const [banks, health] = await Promise.all([workerBanks(), workerHealth()]);
  return Response.json(
    {
      banks,
      worker: health,
      // Surfaced so the UI can show "the parser is down" instead of an empty
      // bank list, which would look like we support nothing.
      available: health.ok && banks.length > 0,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

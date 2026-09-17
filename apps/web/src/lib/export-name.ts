/**
 * Download filename construction.
 *
 * Kept out of the route file because Next.js route modules may only export
 * HTTP handlers and route config — exporting a helper from one makes the
 * generated route types fail to compile.
 *
 * `My Statement (Jan).pdf` -> `balanceproof-my-statement-jan-xlsx.xlsx`
 * The extension always matches the requested format, so a user who picks OFX
 * does not end up with a file named `.pdf` on disk.
 */
export function buildFilename(
  sourceName: string,
  format: string,
  onlyFlagged: boolean,
): string {
  const base =
    sourceName
      .replace(/\.[a-z0-9]{1,5}$/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "statement";
  const suffix = onlyFlagged ? "-flagged" : "";
  return `balanceproof-${base}${suffix}.${format}`;
}

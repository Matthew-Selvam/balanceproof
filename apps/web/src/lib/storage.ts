import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const STORAGE_DIR = process.env.STORAGE_DIR ?? "./data/uploads";

/**
 * Absolute path of the upload root.
 *
 * The worker is told about this directory too (via STORAGE_DIR) and refuses to
 * open anything outside it, so this constant defines the one directory both
 * processes agree is safe to read.
 */
export function storageRoot(): string {
  return path.resolve(STORAGE_DIR);
}

/** Strip directory components and anything that isn't a safe filename char. */
export function sanitizeFilename(originalName: string): string {
  const base = path.basename(originalName || "statement.pdf");
  const cleaned = base
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim();
  const safe = cleaned || "statement.pdf";
  // Keep the extension visible but cap total length for filesystem safety.
  return safe.slice(-120);
}

export function sha256(buffer: Buffer | Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export interface SavedUpload {
  absolutePath: string;
  storedName: string;
  sha256: string;
  byteSize: number;
}

/**
 * Persist an upload under a generated name.
 *
 * The stored filename is a fresh UUID plus a sanitised original name, so two
 * users uploading `statement.pdf` never collide and a crafted filename can
 * never escape the directory (no separators survive `sanitizeFilename`, and the
 * UUID prefix means the result can never be `.` or `..`).
 */
export async function saveUpload(
  buffer: Buffer,
  originalName: string,
): Promise<SavedUpload> {
  const root = storageRoot();
  await mkdir(root, { recursive: true });
  const safeName = sanitizeFilename(originalName);
  const storedName = `${randomUUID()}-${safeName}`;
  const absolutePath = path.join(root, storedName);
  // Defence in depth: never write outside the root even if the above is wrong.
  if (!path.resolve(absolutePath).startsWith(root + path.sep)) {
    throw new Error("Refusing to write outside the storage directory");
  }
  await writeFile(absolutePath, buffer);
  return {
    absolutePath,
    storedName,
    sha256: sha256(buffer),
    byteSize: buffer.byteLength,
  };
}

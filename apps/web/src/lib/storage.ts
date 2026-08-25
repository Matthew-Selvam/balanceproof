import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const STORAGE_DIR = process.env.STORAGE_DIR ?? "./data/uploads";

export async function saveUpload(buffer: Buffer, originalName: string) {
  await mkdir(STORAGE_DIR, { recursive: true });
  const safeName = originalName.replace(/[^\w.-]+/g, "_").slice(-80);
  const fileName = `${randomUUID()}-${safeName}`;
  const absolutePath = path.join(STORAGE_DIR, fileName);
  await writeFile(absolutePath, buffer);
  return { absolutePath, fileName };
}

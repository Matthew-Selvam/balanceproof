import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

const STORAGE_DIR = process.env.STORAGE_DIR ?? "./data/uploads";

export async function saveUpload(buffer: Buffer, originalName: string) {
  const storageDir = path.resolve(STORAGE_DIR);
  await mkdir(storageDir, { recursive: true });
  const safeName = originalName.replace(/[^\w.-]+/g, "_").slice(-80);
  const fileName = `${randomUUID()}-${safeName}`;
  const absolutePath = path.join(storageDir, fileName);
  await writeFile(absolutePath, buffer);
  return { absolutePath, fileName };
}

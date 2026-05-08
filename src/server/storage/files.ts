import path from "node:path";
import { mkdir, unlink } from "node:fs/promises";
import { env } from "@/lib/env";

export function filesDir(): string {
  return path.join(env().DATA_DIR, "files");
}

export function tmpDir(): string {
  return path.join(env().DATA_DIR, "tmp");
}

export async function ensureDataDirs() {
  await mkdir(filesDir(), { recursive: true, mode: 0o700 });
  await mkdir(tmpDir(), { recursive: true, mode: 0o700 });
}

/**
 * Resolve a file id to its encrypted on-disk path.
 * Rejects any id that would escape the files directory.
 */
export function storagePathForId(fileId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) {
    throw new Error("invalid file id");
  }
  const p = path.join(filesDir(), `${fileId}.enc`);
  const normalized = path.normalize(p);
  if (!normalized.startsWith(filesDir() + path.sep)) {
    throw new Error("path traversal detected");
  }
  return normalized;
}

export function tmpPathForSession(sessionId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) {
    throw new Error("invalid session id");
  }
  const p = path.join(tmpDir(), `${sessionId}.zip`);
  const normalized = path.normalize(p);
  if (!normalized.startsWith(tmpDir() + path.sep)) {
    throw new Error("path traversal detected");
  }
  return normalized;
}

export async function removeIfExists(p: string): Promise<boolean> {
  try {
    await unlink(p);
    return true;
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return false;
    throw e;
  }
}

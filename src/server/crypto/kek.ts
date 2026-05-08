import crypto from "node:crypto";
import { env } from "@/lib/env";

let kekCache: Buffer | null = null;

function getKek(): Buffer {
  if (kekCache) return kekCache;
  const raw = Buffer.from(env().MASTER_KEK, "base64");
  if (raw.length !== 32) {
    throw new Error("MASTER_KEK must decode to exactly 32 bytes");
  }
  kekCache = raw;
  return raw;
}

/**
 * Wrap a DEK (or any small secret) with the master KEK using AES-256-GCM.
 * Binds `aad` (e.g. the file id) into the authentication tag so a wrapped key
 * cannot be swapped onto a different record.
 *
 * Output layout: nonce(12) || ciphertext || tag(16)
 */
export function wrapDek(dek: Buffer, aad: string): Buffer {
  if (dek.length !== 32) throw new Error("DEK must be 32 bytes");
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKek(), nonce);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, ct, tag]);
}

export function unwrapDek(wrapped: Buffer, aad: string): Buffer {
  if (wrapped.length < 12 + 16 + 1) throw new Error("wrapped DEK too short");
  const nonce = wrapped.subarray(0, 12);
  const tag = wrapped.subarray(wrapped.length - 16);
  const ct = wrapped.subarray(12, wrapped.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKek(), nonce);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/**
 * Wrap a short string (like a TOTP secret) by UTF-8 encoding it first.
 * Returns the wrapped ciphertext blob; decode with `unwrapString`.
 */
export function wrapString(plaintext: string, aad: string): Buffer {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKek(), nonce);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, ct, tag]);
}

export function unwrapString(wrapped: Buffer, aad: string): string {
  const nonce = wrapped.subarray(0, 12);
  const tag = wrapped.subarray(wrapped.length - 16);
  const ct = wrapped.subarray(12, wrapped.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKek(), nonce);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function generateDek(): Buffer {
  return crypto.randomBytes(32);
}

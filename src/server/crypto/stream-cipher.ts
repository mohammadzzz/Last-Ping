import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Transform, type Readable } from "node:stream";
import { createWriteStream, createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

export interface EncryptResult {
  nonce: Buffer;
  authTag: Buffer;
  sha256: string;      // plaintext hash
  sizeBytes: number;   // plaintext byte count
}

/**
 * Stream-encrypt a readable (e.g. request body) into `destPath` using AES-256-GCM.
 * Caller supplies `dek` (32 bytes). `aad` binds ciphertext to a file identity.
 * Returns the nonce, GCM tag, and plaintext SHA-256.
 */
export async function encryptToFile(
  source: Readable,
  destPath: string,
  dek: Buffer,
  aad: string,
): Promise<EncryptResult> {
  if (dek.length !== 32) throw new Error("DEK must be 32 bytes");
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", dek, nonce);
  cipher.setAAD(Buffer.from(aad, "utf8"));

  const hash = crypto.createHash("sha256");
  let size = 0;
  const tap = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      hash.update(chunk);
      cb(null, chunk);
    },
  });

  await pipeline(source, tap, cipher, createWriteStream(destPath, { mode: 0o600 }));

  return {
    nonce,
    authTag: cipher.getAuthTag(),
    sha256: hash.digest("hex"),
    sizeBytes: size,
  };
}

/**
 * Open a decrypting readable for the given encrypted file.
 * The GCM tag is only verified once the stream is fully consumed;
 * callers MUST consume to completion and handle stream errors before
 * treating bytes as authentic.
 */
export function createDecryptStream(
  srcPath: string,
  dek: Buffer,
  nonce: Buffer,
  authTag: Buffer,
  aad: string,
): Readable {
  if (dek.length !== 32) throw new Error("DEK must be 32 bytes");
  const decipher = crypto.createDecipheriv("aes-256-gcm", dek, nonce);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(authTag);
  const src = createReadStream(srcPath);
  src.on("error", (e) => decipher.destroy(e));
  return src.pipe(decipher);
}

export async function encryptedFileSize(path: string): Promise<number> {
  const s = await stat(path);
  return s.size;
}

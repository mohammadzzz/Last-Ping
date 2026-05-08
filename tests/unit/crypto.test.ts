import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import { mkdtempSync, createReadStream, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  encryptToFile,
  createDecryptStream,
} from "../../src/server/crypto/stream-cipher";
import { wrapDek, unwrapDek, generateDek } from "../../src/server/crypto/kek";

function bufReadable(buf: Buffer): Readable {
  return Readable.from([buf]);
}

async function drain(r: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of r) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks);
}

describe("stream-cipher", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "lp-crypto-"));

  it("round-trips data through encrypt+decrypt", async () => {
    const plain = Buffer.from("hello world — привет — 🧬".repeat(1000));
    const dest = path.join(dir, "a.enc");
    const dek = generateDek();
    const aad = "file:test-id";

    const { nonce, authTag, sha256, sizeBytes } = await encryptToFile(
      bufReadable(plain),
      dest,
      dek,
      aad,
    );
    expect(sizeBytes).toBe(plain.length);

    const out = await drain(createDecryptStream(dest, dek, nonce, authTag, aad));
    expect(out.equals(plain)).toBe(true);

    // ciphertext differs from plaintext
    expect(readFileSync(dest).equals(plain)).toBe(false);
    expect(sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects wrong AAD (file_id binding)", async () => {
    const plain = Buffer.from("secret");
    const dest = path.join(dir, "b.enc");
    const dek = generateDek();
    const { nonce, authTag } = await encryptToFile(bufReadable(plain), dest, dek, "file:A");

    const bad = createDecryptStream(dest, dek, nonce, authTag, "file:B");
    await expect(drain(bad)).rejects.toThrow();
  });

  it("rejects tampered ciphertext", async () => {
    const plain = Buffer.from("abcdefgh".repeat(64));
    const dest = path.join(dir, "c.enc");
    const dek = generateDek();
    const { nonce, authTag } = await encryptToFile(bufReadable(plain), dest, dek, "file:X");

    // Flip a byte.
    const raw = readFileSync(dest);
    raw[0] ^= 0xff;
    require("node:fs").writeFileSync(dest, raw);

    const bad = createDecryptStream(dest, dek, nonce, authTag, "file:X");
    await expect(drain(bad)).rejects.toThrow();
  });
});

describe("kek envelope", () => {
  it("wraps and unwraps a DEK with AAD binding", () => {
    const dek = generateDek();
    const wrapped = wrapDek(dek, "file:abc");
    const got = unwrapDek(wrapped, "file:abc");
    expect(got.equals(dek)).toBe(true);

    expect(() => unwrapDek(wrapped, "file:xyz")).toThrow();
  });
});

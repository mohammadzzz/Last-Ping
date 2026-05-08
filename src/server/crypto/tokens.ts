import crypto from "node:crypto";

/** Generate a URL-safe random token. 32 bytes → 43 base64url chars. */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** SHA-256 the token (hex) for storage. Tokens are high-entropy so a plain hash
 *  is sufficient — we use this rather than argon2 to keep lookups O(index). */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time compare on hex strings of equal length. */
export function constantTimeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Hash a client IP with a per-install salt; raw IPs never hit the DB. */
export function hashIp(ip: string, salt: string): string {
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/** Generate a numeric OTP code (default 6 digits). */
export function generateOtp(digits = 6): string {
  const max = 10 ** digits;
  // Rejection-sample to avoid modulo bias.
  for (;;) {
    const n = crypto.randomInt(0, 10 ** digits);
    if (n < max) return n.toString().padStart(digits, "0");
  }
}

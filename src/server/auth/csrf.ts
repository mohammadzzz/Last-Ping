import crypto from "node:crypto";
import { getOwnerSession, type OwnerSession } from "@/server/auth/session";
import type { IronSession } from "iron-session";

export function mintCsrfToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

/**
 * For route handlers only: ensures the session has a csrfToken, writing it if
 * missing. Server Components must NOT call this (Next 15 forbids cookie
 * writes outside route handlers / server actions).
 */
export async function ensureCsrfTokenInHandler(
  s?: IronSession<OwnerSession>,
): Promise<string> {
  const sess = s ?? (await getOwnerSession());
  if (!sess.csrfToken) {
    sess.csrfToken = mintCsrfToken();
    await sess.save();
  }
  return sess.csrfToken;
}

/** Pure read, safe in Server Components. Returns null if not minted yet. */
export async function getCsrfToken(): Promise<string | null> {
  const s = await getOwnerSession();
  return s.csrfToken ?? null;
}

export async function verifyCsrf(submitted: string | null | undefined): Promise<boolean> {
  if (!submitted) return false;
  const s = await getOwnerSession();
  if (!s.csrfToken) return false;
  const a = Buffer.from(s.csrfToken, "utf8");
  const b = Buffer.from(submitted, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

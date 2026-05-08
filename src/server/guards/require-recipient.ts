import { prisma } from "@/server/db";
import { getRecipientSession } from "@/server/auth/session";
import { hashToken } from "@/server/crypto/tokens";

/**
 * Resolve a release-recipient by its raw URL token. Never trust the token
 * alone for reading content — callers must additionally verify the session
 * matches the same releaseRecipientId.
 */
export async function lookupByToken(rawToken: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(rawToken)) return null;
  const tokenHash = hashToken(rawToken);
  return prisma.releaseRecipient.findUnique({
    where: { downloadTokenHash: tokenHash },
    include: { recipient: true, release: true },
  });
}

/**
 * Enforced gate for every authenticated recipient route. Returns the release
 * recipient row (+ its Recipient + Release) iff:
 *   - the URL token exists
 *   - the session has been verified
 *   - the session's releaseRecipientId matches the one resolved from the token
 *   - the release hasn't been EXPIRED or DELETED
 */
export async function requireVerifiedRecipient(rawToken: string) {
  const rr = await lookupByToken(rawToken);
  if (!rr) return { error: "not_found" as const };
  if (rr.status === "EXPIRED" || rr.status === "DELETED") {
    return { error: "gone" as const };
  }
  const s = await getRecipientSession();
  if (!s.releaseRecipientId || !s.verifiedAt) {
    return { error: "unverified" as const };
  }
  if (s.releaseRecipientId !== rr.id) {
    return { error: "forbidden" as const };
  }
  return { rr };
}

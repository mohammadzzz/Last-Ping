import { getOwnerSession } from "@/server/auth/session";
import { prisma } from "@/server/db";

export async function requireOwner() {
  const s = await getOwnerSession();
  if (!s.ownerId) return null;
  const owner = await prisma.owner.findUnique({ where: { id: s.ownerId } });
  if (!owner) return null;
  return { session: s, owner };
}

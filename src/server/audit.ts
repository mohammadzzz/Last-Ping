import { prisma } from "@/server/db";

export type Actor = "owner" | "system" | `recipient:${string}`;

export async function audit(
  actor: Actor,
  action: string,
  opts: { targetType?: string; targetId?: string; metadata?: Record<string, unknown> } = {},
) {
  try {
    await prisma.auditLog.create({
      data: {
        actor,
        action,
        targetType: opts.targetType,
        targetId: opts.targetId,
        metadata: opts.metadata ? (opts.metadata as object) : undefined,
      },
    });
  } catch (err) {
    // Audit failures must never break the request flow.
    console.error("audit write failed", { action, err });
  }
}

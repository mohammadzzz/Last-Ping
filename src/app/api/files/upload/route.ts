import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { unlink } from "node:fs/promises";
import { prisma } from "@/server/db";
import { requireOwner } from "@/server/guards/require-owner";
import { verifyCsrf } from "@/server/auth/csrf";
import { audit } from "@/server/audit";
import { ensureDataDirs, storagePathForId } from "@/server/storage/files";
import { encryptToFile } from "@/server/crypto/stream-cipher";
import { generateDek, wrapDek } from "@/server/crypto/kek";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Next's App Router reads multipart via formData(); but for 5GB files we need
// a direct body stream. We accept one file per request as the raw body, with
// metadata in query params/headers.

/**
 * POST /api/files/upload?name=<originalName>&mime=<mimeType>
 * Header: x-csrf-token
 * Body: raw binary of the file
 *
 * One file per request. Streams body -> AES-256-GCM -> /data/files/<uuid>.enc.
 * Never buffers the whole file in memory.
 */
export async function POST(req: NextRequest) {
  const ctx = await requireOwner();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await verifyCsrf(req.headers.get("x-csrf-token")))) {
    return NextResponse.json({ error: "csrf" }, { status: 403 });
  }
  if (!req.body) return NextResponse.json({ error: "empty body" }, { status: 400 });

  const url = new URL(req.url);
  const originalName = (url.searchParams.get("name") ?? "upload.bin").slice(0, 255);
  const mimeType = (url.searchParams.get("mime") ?? "application/octet-stream").slice(0, 127);

  if (/[\/\\\0]/.test(originalName)) {
    return NextResponse.json({ error: "invalid filename" }, { status: 400 });
  }

  await ensureDataDirs();

  const fileId = crypto.randomUUID();
  const destPath = storagePathForId(fileId);
  const dek = generateDek();
  const aad = `file:${fileId}`;

  const nodeSource = Readable.fromWeb(req.body as unknown as import("stream/web").ReadableStream);

  try {
    const { nonce, authTag, sha256, sizeBytes } = await encryptToFile(
      nodeSource,
      destPath,
      dek,
      aad,
    );

    await prisma.mediaFile.create({
      data: {
        id: fileId,
        originalName,
        mimeType,
        sizeBytes: BigInt(sizeBytes),
        storagePath: destPath,
        nonce,
        authTag,
        wrappedDek: wrapDek(dek, aad),
        sha256,
      },
    });

    await audit("owner", "FILE_UPLOAD", {
      targetType: "file",
      targetId: fileId,
      metadata: { originalName, mimeType, sizeBytes },
    });

    return NextResponse.json({
      id: fileId,
      originalName,
      mimeType,
      sizeBytes,
      sha256,
    });
  } catch (err) {
    // Partial write: clean up.
    await unlink(destPath).catch(() => {});
    // Best-effort scrub of DEK in memory.
    dek.fill(0);
    throw err;
  }
}

export async function GET() {
  const ctx = await requireOwner();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const files = await prisma.mediaFile.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      isSample: true,
      _count: { select: { assignments: true } },
    },
  });
  return NextResponse.json({
    files: files.map((f) => ({
      ...f,
      sizeBytes: Number(f.sizeBytes),
      assignmentCount: f._count.assignments,
    })),
  });
}

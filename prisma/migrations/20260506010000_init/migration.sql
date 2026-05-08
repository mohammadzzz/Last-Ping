-- CreateEnum
CREATE TYPE "AppMode" AS ENUM ('ACTIVE', 'WARNING', 'RELEASED');

-- CreateEnum
CREATE TYPE "OtpChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "ReleaseTrigger" AS ENUM ('INACTIVITY', 'MANUAL', 'TEST');

-- CreateEnum
CREATE TYPE "ReleaseStatus" AS ENUM ('PENDING', 'VERIFIED', 'DOWNLOADING', 'DOWNLOADED', 'EXPIRED', 'DELETED');

-- CreateEnum
CREATE TYPE "CheckinSource" AS ENUM ('LOGIN', 'LINK');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('EMAIL', 'TELEGRAM', 'SMS', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "NotifPurpose" AS ENUM ('WARNING', 'RELEASE', 'OTP', 'REMINDER', 'TEST');

-- CreateEnum
CREATE TYPE "NotifStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "totpSecretEnc" BYTEA NOT NULL,
    "totpEnrolled" BOOLEAN NOT NULL DEFAULT false,
    "checkinPinHash" TEXT NOT NULL,
    "checkinLinkToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppState" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "mode" "AppMode" NOT NULL DEFAULT 'ACTIVE',
    "testMode" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckinAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "warningStartedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipient" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "telegramChatId" TEXT,
    "whatsappNumber" TEXT,
    "preferredOtpChannel" "OtpChannel" NOT NULL DEFAULT 'EMAIL',
    "personalMessage" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaFile" (
    "id" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "nonce" BYTEA NOT NULL,
    "authTag" BYTEA NOT NULL,
    "wrappedDek" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipientFileAssignment" (
    "recipientId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipientFileAssignment_pkey" PRIMARY KEY ("recipientId","fileId")
);

-- CreateTable
CREATE TABLE "Release" (
    "id" TEXT NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trigger" "ReleaseTrigger" NOT NULL,
    "isTest" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReleaseRecipient" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "downloadTokenHash" TEXT NOT NULL,
    "status" "ReleaseStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "downloadCompletedAt" TIMESTAMP(3),
    "deleteAfter" TIMESTAMP(3),
    "zipPath" TEXT,
    "zipSizeBytes" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleaseRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationCode" (
    "id" TEXT NOT NULL,
    "releaseRecipientId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "channel" "OtpChannel" NOT NULL,
    "sentTo" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DownloadSession" (
    "id" TEXT NOT NULL,
    "releaseRecipientId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "bytesServed" BIGINT NOT NULL DEFAULT 0,
    "bytesExpected" BIGINT NOT NULL,
    "clientIpHash" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,

    CONSTRAINT "DownloadSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckinRecord" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "CheckinSource" NOT NULL,
    "ipHash" TEXT NOT NULL,

    CONSTRAINT "CheckinRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationAttempt" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT,
    "channel" "Channel" NOT NULL,
    "purpose" "NotifPurpose" NOT NULL,
    "status" "NotifStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "error" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeletionJob" (
    "id" TEXT NOT NULL,
    "releaseRecipientId" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,

    CONSTRAINT "DeletionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Owner_email_key" ON "Owner"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Owner_checkinLinkToken_key" ON "Owner"("checkinLinkToken");

-- CreateIndex
CREATE UNIQUE INDEX "ReleaseRecipient_downloadTokenHash_key" ON "ReleaseRecipient"("downloadTokenHash");

-- CreateIndex
CREATE INDEX "ReleaseRecipient_recipientId_idx" ON "ReleaseRecipient"("recipientId");

-- CreateIndex
CREATE INDEX "ReleaseRecipient_status_idx" ON "ReleaseRecipient"("status");

-- CreateIndex
CREATE INDEX "VerificationCode_releaseRecipientId_idx" ON "VerificationCode"("releaseRecipientId");

-- CreateIndex
CREATE INDEX "DownloadSession_releaseRecipientId_idx" ON "DownloadSession"("releaseRecipientId");

-- CreateIndex
CREATE INDEX "NotificationAttempt_recipientId_idx" ON "NotificationAttempt"("recipientId");

-- CreateIndex
CREATE INDEX "NotificationAttempt_purpose_attemptedAt_idx" ON "NotificationAttempt"("purpose", "attemptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeletionJob_releaseRecipientId_key" ON "DeletionJob"("releaseRecipientId");

-- CreateIndex
CREATE INDEX "DeletionJob_status_scheduledFor_idx" ON "DeletionJob"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_actor_idx" ON "AuditLog"("actor");

-- AddForeignKey
ALTER TABLE "RecipientFileAssignment" ADD CONSTRAINT "RecipientFileAssignment_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipientFileAssignment" ADD CONSTRAINT "RecipientFileAssignment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "MediaFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseRecipient" ADD CONSTRAINT "ReleaseRecipient_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReleaseRecipient" ADD CONSTRAINT "ReleaseRecipient_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationCode" ADD CONSTRAINT "VerificationCode_releaseRecipientId_fkey" FOREIGN KEY ("releaseRecipientId") REFERENCES "ReleaseRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownloadSession" ADD CONSTRAINT "DownloadSession_releaseRecipientId_fkey" FOREIGN KEY ("releaseRecipientId") REFERENCES "ReleaseRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "public"."EmailType" AS ENUM ('VERIFICATION', 'PASSWORD_RESET', 'WELCOME', 'NOTIFICATION');

-- CreateEnum
CREATE TYPE "public"."EmailStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED', 'OPENED');

-- CreateTable
CREATE TABLE "public"."email_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "emailType" "public"."EmailType" NOT NULL,
    "resendEmailId" TEXT,
    "subject" TEXT,
    "otpCode" TEXT,
    "status" "public"."EmailStatus" NOT NULL DEFAULT 'PENDING',
    "statusMessage" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_logs_userId_emailType_idx" ON "public"."email_logs"("userId", "emailType");

-- CreateIndex
CREATE INDEX "email_logs_email_emailType_idx" ON "public"."email_logs"("email", "emailType");

-- CreateIndex
CREATE INDEX "email_logs_status_sentAt_idx" ON "public"."email_logs"("status", "sentAt");

-- CreateIndex
CREATE INDEX "email_logs_resendEmailId_idx" ON "public"."email_logs"("resendEmailId");

-- AddForeignKey
ALTER TABLE "public"."email_logs" ADD CONSTRAINT "email_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

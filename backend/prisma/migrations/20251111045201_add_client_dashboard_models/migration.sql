/*
  Warnings:

  - The values [STRATEGY_ADMIN,SUPER_ADMIN] on the enum `UserRole` will be removed. If these variants are still used in the database, this will fail.

*/
-- CreateEnum
CREATE TYPE "public"."AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
BEGIN;
CREATE TYPE "public"."UserRole_new" AS ENUM ('REGULAR', 'QUANT', 'CLIENT', 'ADMIN');
ALTER TABLE "public"."users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "public"."users" ALTER COLUMN "role" TYPE "public"."UserRole_new" USING ("role"::text::"public"."UserRole_new");
ALTER TYPE "public"."UserRole" RENAME TO "UserRole_old";
ALTER TYPE "public"."UserRole_new" RENAME TO "UserRole";
DROP TYPE "public"."UserRole_old";
ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT 'REGULAR';
COMMIT;

-- AlterTable
ALTER TABLE "public"."strategies" ADD COLUMN     "clientId" TEXT;

-- CreateTable
CREATE TABLE "public"."strategy_invite_links" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "inviteCode" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_invite_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."strategy_access_requests" (
    "id" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inviteLinkId" TEXT NOT NULL,
    "status" "public"."AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "respondedByUserId" TEXT,
    "rejectionReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strategy_access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "strategy_invite_links_inviteCode_key" ON "public"."strategy_invite_links"("inviteCode");

-- CreateIndex
CREATE INDEX "strategy_invite_links_strategyId_idx" ON "public"."strategy_invite_links"("strategyId");

-- CreateIndex
CREATE INDEX "strategy_invite_links_inviteCode_idx" ON "public"."strategy_invite_links"("inviteCode");

-- CreateIndex
CREATE INDEX "strategy_access_requests_strategyId_status_idx" ON "public"."strategy_access_requests"("strategyId", "status");

-- CreateIndex
CREATE INDEX "strategy_access_requests_userId_status_idx" ON "public"."strategy_access_requests"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "strategy_access_requests_userId_strategyId_key" ON "public"."strategy_access_requests"("userId", "strategyId");

-- CreateIndex
CREATE INDEX "strategies_clientId_idx" ON "public"."strategies"("clientId");

-- AddForeignKey
ALTER TABLE "public"."strategies" ADD CONSTRAINT "strategies_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."strategy_invite_links" ADD CONSTRAINT "strategy_invite_links_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "public"."strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."strategy_invite_links" ADD CONSTRAINT "strategy_invite_links_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."strategy_access_requests" ADD CONSTRAINT "strategy_access_requests_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "public"."strategies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."strategy_access_requests" ADD CONSTRAINT "strategy_access_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."strategy_access_requests" ADD CONSTRAINT "strategy_access_requests_inviteLinkId_fkey" FOREIGN KEY ("inviteLinkId") REFERENCES "public"."strategy_invite_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."strategy_access_requests" ADD CONSTRAINT "strategy_access_requests_respondedByUserId_fkey" FOREIGN KEY ("respondedByUserId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "public"."InviteLinkType" AS ENUM ('ONE_TIME', 'PERMANENT');

-- AlterTable
ALTER TABLE "public"."strategy_invite_links" ADD COLUMN     "type" "public"."InviteLinkType" NOT NULL DEFAULT 'PERMANENT';

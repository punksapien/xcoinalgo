-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('REGULAR', 'QUANT');

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "role" "public"."UserRole" NOT NULL DEFAULT 'REGULAR';

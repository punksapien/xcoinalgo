/*
  Warnings:

  - You are about to alter the column `tags` on the `strategies` table. The data in that column could be lost. The data in that column will be cast from `VarChar(255)` to `Text`.
  - You are about to alter the column `validationErrors` on the `strategies` table. The data in that column could be lost. The data in that column will be cast from `VarChar(255)` to `Text`.

*/
-- AlterTable
ALTER TABLE "public"."strategies" ALTER COLUMN "tags" SET DATA TYPE TEXT;
ALTER TABLE "public"."strategies" ALTER COLUMN "validationErrors" SET DATA TYPE TEXT;

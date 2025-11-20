/*
  Warnings:

  - You are about to alter the column `code` on the `strategies` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(100)`.

*/
-- AlterTable
ALTER TABLE "public"."strategies" ALTER COLUMN "code" SET DATA TYPE VARCHAR(100);

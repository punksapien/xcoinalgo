-- AlterTable
ALTER TABLE "public"."strategies" ADD COLUMN     "authorId" TEXT;

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "name" TEXT,
ADD COLUMN     "phoneNumber" TEXT;

-- CreateIndex
CREATE INDEX "strategies_authorId_idx" ON "public"."strategies"("authorId");

-- AddForeignKey
ALTER TABLE "public"."strategies" ADD CONSTRAINT "strategies_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "ai_messages" ADD COLUMN     "vehicle_id" TEXT;

-- CreateIndex
CREATE INDEX "ai_messages_vehicle_id_idx" ON "ai_messages"("vehicle_id");

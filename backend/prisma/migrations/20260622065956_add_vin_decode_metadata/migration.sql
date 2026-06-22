-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "is_partial_decode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vin_confidence" TEXT,
ADD COLUMN     "vin_country" TEXT,
ADD COLUMN     "vin_decode_source" TEXT,
ADD COLUMN     "vin_decode_type" TEXT;

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'ON_SITE';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "waAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "waDispatchedAt" TIMESTAMP(3),
ADD COLUMN     "waError" TEXT,
ADD COLUMN     "whatsappUpdates" BOOLEAN NOT NULL DEFAULT false;


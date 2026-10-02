-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "trackingToken" TEXT NOT NULL,
ALTER COLUMN "deliveryFee" DROP NOT NULL,
ALTER COLUMN "deliveryFee" DROP DEFAULT;

-- AlterTable
ALTER TABLE "StoreSettings" DROP COLUMN "deliveryFee",
ADD COLUMN     "pixHolderName" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_trackingToken_key" ON "Order"("trackingToken");


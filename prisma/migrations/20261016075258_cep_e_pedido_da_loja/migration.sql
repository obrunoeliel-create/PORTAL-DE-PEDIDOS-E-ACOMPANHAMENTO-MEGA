-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "addressZip" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "addressZip" TEXT,
ADD COLUMN     "createdBy" TEXT;


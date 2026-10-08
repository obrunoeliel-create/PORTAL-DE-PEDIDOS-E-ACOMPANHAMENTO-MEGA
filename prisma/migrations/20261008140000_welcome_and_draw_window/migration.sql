-- AlterTable
ALTER TABLE "CampanhaNatal" ADD COLUMN     "drawEndMinute" INTEGER NOT NULL DEFAULT 1350,
ADD COLUMN     "drawStartMinute" INTEGER NOT NULL DEFAULT 1080;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "email" TEXT,
ADD COLUMN     "welcomeEmailAt" TIMESTAMP(3),
ADD COLUMN     "welcomeError" TEXT,
ADD COLUMN     "welcomeWaAt" TIMESTAMP(3);


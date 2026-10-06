-- AlterTable
ALTER TABLE "StoreSettings" ADD COLUMN     "instagram" TEXT;


-- Instagram oficial da loja
UPDATE "StoreSettings" SET "instagram" = 'megaesfiha_jurema' WHERE "instagram" IS NULL;

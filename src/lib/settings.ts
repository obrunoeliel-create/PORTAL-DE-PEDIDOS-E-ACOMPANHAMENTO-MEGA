import "server-only";
import { prisma } from "./prisma";

export async function getStoreSettings() {
  return prisma.storeSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, storeName: "OrderFlow OS" },
  });
}

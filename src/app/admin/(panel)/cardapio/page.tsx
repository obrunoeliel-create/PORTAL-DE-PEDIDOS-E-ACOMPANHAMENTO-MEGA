import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/auth";
import { MenuManager } from "@/components/admin/MenuManager";

export const dynamic = "force-dynamic";

export default async function MenuAdminPage() {
  await requirePageSession();
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      products: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          price: true,
          active: true,
          variants: { orderBy: { sortOrder: "asc" }, select: { name: true, price: true } },
        },
      },
    },
  });
  return <MenuManager categories={categories} />;
}

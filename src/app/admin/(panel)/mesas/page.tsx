import { toString as qrToSvg } from "qrcode";
import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/auth";
import { publicUrlFromRequest } from "@/lib/public-url";
import { tableQrUrl } from "@/lib/tables";
import { TableQrSheet } from "@/components/admin/TableQrSheet";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mesas e QR Codes" };

export default async function TablesPage() {
  await requirePageSession(["MANAGER"]);
  const base = await publicUrlFromRequest();
  const tables = await prisma.diningTable.findMany({ where: { active: true }, orderBy: { number: "asc" } });

  const cards = await Promise.all(
    tables.map(async (t) => {
      const url = tableQrUrl(base, t.number, t.token);
      return { number: t.number, url, svg: await qrToSvg(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" }) };
    }),
  );

  return <TableQrSheet tables={cards} />;
}

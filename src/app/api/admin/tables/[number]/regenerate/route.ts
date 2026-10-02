import { NextResponse } from "next/server";
import { toString as qrToSvg } from "qrcode";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { generateTableToken, tableQrUrl } from "@/lib/tables";
import { publicUrlFromRequest } from "@/lib/public-url";

export const runtime = "nodejs";

// Gera um novo QR Code para a mesa: o QR antigo para de funcionar na hora (ex: foi fotografado e vazou).
export async function POST(_req: Request, { params }: { params: Promise<{ number: string }> }) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;

  const raw = (await params).number;
  const number = /^\d{1,3}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(number) || number < 1) return jsonError("Mesa inválida.", 404);

  const exists = await prisma.diningTable.findUnique({ where: { number } });
  if (!exists) return jsonError("Mesa não encontrada.", 404);

  const table = await prisma.diningTable.update({ where: { number }, data: { token: generateTableToken() } });
  const url = tableQrUrl(await publicUrlFromRequest(), table.number, table.token);
  const svg = await qrToSvg(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  return NextResponse.json({ number: table.number, url, svg });
}

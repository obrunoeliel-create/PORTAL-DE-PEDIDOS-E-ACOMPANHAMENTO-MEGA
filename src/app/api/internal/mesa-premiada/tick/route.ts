import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { autoDrawTick } from "@/lib/mesa-premiada";
import { emitToStaff } from "@/lib/socket-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Relógio do sorteio automático da Mesa Premiada. Só o próprio servidor chama (a cada minuto, ver server.ts),
 * com um segredo gerado na hora em que ele liga — de fora, sempre 404.
 */
export async function POST(req: Request) {
  const expected = process.env.INTERNAL_TICK_SECRET ?? "";
  const got = req.headers.get("x-internal-secret") ?? "";
  const ok = expected.length >= 32 && got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  if (!ok) return new NextResponse("Not found", { status: 404 });

  const draw = await autoDrawTick();
  // Avisa as telas abertas de Comandas para destacar a mesa sorteada (só a equipe recebe).
  if (draw) emitToStaff("campaign:updated", { tableNumber: draw.tableNumber });
  return NextResponse.json({ drawn: draw ? draw.tableNumber : null });
}

import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { robotTick } from "@/lib/wa/robot";
import { processQueue } from "@/lib/wa/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const g = globalThis as unknown as { __waPurgeAt?: number };

/**
 * Relógio do robô do WhatsApp. Só o próprio servidor chama (a cada 20 s, ver server.ts), com um segredo
 * gerado na hora em que ele liga — de fora, sempre 404.
 */
export async function POST(req: Request) {
  const expected = process.env.INTERNAL_TICK_SECRET ?? "";
  const got = req.headers.get("x-internal-secret") ?? "";
  const ok = expected.length >= 32 && got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  if (!ok) return new NextResponse("Not found", { status: 404 });

  await robotTick().catch((err) => console.error("[whatsapp] robô:", err instanceof Error ? err.message : err));
  await processQueue().catch((err) => console.error("[whatsapp] fila:", err instanceof Error ? err.message : err));

  // Campanha que não tem mais nada na fila: concluída.
  const sending = await prisma.waCampaign.findMany({ where: { status: "SENDING" }, select: { id: true } });
  for (const c of sending) {
    const left = await prisma.waMessage.count({ where: { campaignId: c.id, status: { in: ["QUEUED", "SENDING"] } } });
    if (!left) await prisma.waCampaign.update({ where: { id: c.id }, data: { status: "DONE" } });
  }

  // Uma vez por dia: apaga registros antigos (LGPD: guarda só o necessário). Mensagens 180 dias, eventos 60.
  if (!g.__waPurgeAt || Date.now() - g.__waPurgeAt > 86_400_000) {
    g.__waPurgeAt = Date.now();
    const day = 86_400_000;
    await prisma.waMessage.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 180 * day) }, status: { notIn: ["QUEUED", "SENDING"] } } });
    await prisma.waEvent.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 60 * day) } } });
  }
  return NextResponse.json({ ok: true });
}

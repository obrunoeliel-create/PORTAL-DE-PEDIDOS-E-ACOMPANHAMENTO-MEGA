import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";
import { cuidParam } from "@/lib/validators";
import { startCampaign } from "@/lib/wa/automations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["send", "cancel"]) }).strict();

/** Enviar (coloca na fila, um cliente por vez) ou cancelar o que ainda não saiu. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  const id = cuidParam.safeParse((await params).id);
  if (!id.success) return jsonError("Campanha não encontrada.", 404);
  let body: unknown;
  try {
    body = await readJson(req, 1024);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  if (parsed.data.action === "send") {
    try {
      const total = await startCampaign(id.data, auth.user.name);
      await prisma.waEvent.create({ data: { kind: "CAMPAIGN", detail: `Campanha enviada por ${auth.user.name} para ${total} clientes` } });
      return NextResponse.json({ total });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "Não foi possível enviar.", 409);
    }
  }

  const c = await prisma.waCampaign.findUnique({ where: { id: id.data } });
  if (!c) return jsonError("Campanha não encontrada.", 404);
  if (c.status === "DONE" || c.status === "CANCELED") return jsonError("Esta campanha já terminou.", 409);
  const { count } = await prisma.waMessage.updateMany({
    where: { campaignId: c.id, status: "QUEUED" },
    data: { status: "CANCELED", error: `Campanha cancelada por ${auth.user.name}.` },
  });
  await prisma.waCampaign.update({ where: { id: c.id }, data: { status: "CANCELED" } });
  return NextResponse.json({ canceled: count });
}

/** Apagar um rascunho. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  const id = cuidParam.safeParse((await params).id);
  if (!id.success) return jsonError("Campanha não encontrada.", 404);
  const { count } = await prisma.waCampaign.deleteMany({ where: { id: id.data, status: "DRAFT" } });
  if (!count) return jsonError("Só dá para apagar campanhas que ainda não foram enviadas.", 409);
  return NextResponse.json({ ok: true });
}

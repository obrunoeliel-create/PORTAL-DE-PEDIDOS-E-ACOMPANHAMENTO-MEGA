import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { cuidParam } from "@/lib/validators";
import { resend } from "@/lib/wa/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reenviar uma mensagem (falhou ou o cliente pediu de novo). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  const id = cuidParam.safeParse((await params).id);
  if (!id.success) return jsonError("Mensagem não encontrada.", 404);
  const m = await prisma.waMessage.findUnique({ where: { id: id.data }, select: { phone: true } });
  if (!m) return jsonError("Mensagem não encontrada.", 404);
  const contact = await prisma.waContact.findUnique({ where: { phone: m.phone } });
  if (contact?.optOutAt) return jsonError("Este cliente pediu para não receber mensagens (respondeu SAIR).", 409);
  const copy = await resend(id.data, auth.user.name);
  return NextResponse.json({ id: copy?.id ?? null }, { status: 201 });
}

/** Cancelar uma mensagem que ainda está na fila (ex: campanha ou cupom agendado). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;
  const id = cuidParam.safeParse((await params).id);
  if (!id.success) return jsonError("Mensagem não encontrada.", 404);
  const { count } = await prisma.waMessage.updateMany({
    where: { id: id.data, status: "QUEUED" },
    data: { status: "CANCELED", error: `Cancelada por ${auth.user.name}.` },
  });
  if (!count) return jsonError("Esta mensagem não está mais na fila.", 409);
  return NextResponse.json({ ok: true });
}

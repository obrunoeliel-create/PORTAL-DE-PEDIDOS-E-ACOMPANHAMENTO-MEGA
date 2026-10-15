import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { cuidParam } from "@/lib/validators";
import { jsonError } from "@/lib/http";
import { broadcastTableCalls } from "@/lib/table-calls";

export const runtime = "nodejs";

// Equipe foi até a mesa: o chamado sai da tela de todos os aparelhos.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const id = cuidParam.safeParse((await params).id);
  if (!id.success) return jsonError("Chamado não encontrado.", 404);
  await prisma.tableCall.updateMany({ where: { id: id.data, attendedAt: null }, data: { attendedAt: new Date(), attendedBy: auth.user.name } });
  await broadcastTableCalls();
  return NextResponse.json({ ok: true });
}

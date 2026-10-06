import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { closeTableSchema, cuidParam } from "@/lib/validators";
import { PayloadError, jsonError, readJson, validationError } from "@/lib/http";
import { TableSessionError, closeTableSession } from "@/lib/table-sessions";
import { orderInclude, toBoardOrder } from "@/lib/orders";
import { emitToStaff } from "@/lib/socket-server";

export const runtime = "nodejs";

// Caixa confirmou o pagamento e o cliente vai embora: fecha a comanda; a mesa volta a ficar zerada.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;

  const id = cuidParam.safeParse((await params).id);
  if (!id.success) return jsonError("Comanda não encontrada.", 404);

  let body: unknown;
  try {
    body = await readJson(req, 256);
  } catch (err) {
    return jsonError(err instanceof PayloadError ? err.message : "Requisição inválida.", 400);
  }
  const parsed = closeTableSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const result = await closeTableSession(id.data, parsed.data.paidWith, auth.user.name);
    // Pedidos concluídos no fechamento somem das colunas ativas do painel em tempo real.
    if (result.completedOrderIds.length) {
      const orders = await prisma.order.findMany({ where: { id: { in: result.completedOrderIds } }, include: orderInclude });
      for (const o of orders) emitToStaff("order:updated", toBoardOrder(o));
    }
    return NextResponse.json({ ok: true, tableNumber: result.tableNumber, total: result.total });
  } catch (err) {
    if (err instanceof TableSessionError) return jsonError(err.message, 409);
    throw err;
  }
}

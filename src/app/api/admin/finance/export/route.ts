import { prisma } from "@/lib/prisma";
import { requireApiSession } from "@/lib/auth";
import { ORDER_TYPE_LABEL, PAYMENT_LABEL, STATUS_LABEL } from "@/lib/labels";
import { first, parsePayment, parsePeriod, parseType } from "@/lib/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 50_000;
const dateTime = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Célula de CSV: aspas escapadas e proteção contra fórmulas (=, +, -, @) vindas de texto do cliente. */
function cell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
const money = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));

/** Planilha (CSV para Excel) com os pedidos do período escolhido no Financeiro. Só gerente. */
export async function GET(req: Request) {
  const auth = await requireApiSession(["MANAGER"]);
  if (!auth.ok) return auth.response;

  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const period = parsePeriod(sp);
  const type = parseType(first(sp.tipo));
  const payment = parsePayment(first(sp.pag));

  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: period.start, lt: period.end },
      ...(type ? { type } : {}),
      ...(payment ? { paymentMethod: payment } : {}),
    },
    include: { items: true, driver: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
    take: MAX_ROWS,
  });

  const header = ["Pedido", "Data e hora", "Situação", "Canal", "Mesa", "Cliente", "Telefone", "Bairro", "Endereço", "Pagamento", "Subtotal", "Taxa de entrega", "Total", "Entregador", "Itens", "Observações"];
  const lines = orders.map((o) =>
    [
      o.number,
      dateTime.format(o.createdAt),
      STATUS_LABEL[o.status],
      ORDER_TYPE_LABEL[o.type],
      o.tableNumber ?? "",
      o.customerName,
      o.customerPhone,
      o.addressDistrict,
      o.addressStreet ? `${o.addressStreet}, ${o.addressNumber ?? "s/n"}` : "",
      PAYMENT_LABEL[o.paymentMethod],
      money(o.subtotal),
      money(o.deliveryFee),
      money(o.total),
      o.driver?.name,
      o.items.map((i) => `${i.quantity}x ${i.categoryLabel ? `${i.categoryLabel} ` : ""}${i.halfProductName ? `1/2 ${i.productName} + 1/2 ${i.halfProductName}` : i.productName}`).join(" | "),
      o.notes,
    ]
      .map(cell)
      .join(";"),
  );

  // BOM + ponto e vírgula: abre certo no Excel em português, com acentos.
  const csv = `﻿${header.map(cell).join(";")}\r\n${lines.join("\r\n")}\r\n`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pedidos-${period.from}-a-${period.to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

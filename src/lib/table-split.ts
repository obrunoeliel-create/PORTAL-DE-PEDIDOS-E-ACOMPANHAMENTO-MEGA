// Conta da mesa separada por pessoa: cada pedido traz o nome de quem pediu.
// Usado na tela de Comandas e na impressão da conta (subtotal por nome + total da mesa).

type SplitOrder = { customerName: string; status: string; total: number };

export type PersonShare<O extends SplitOrder> = { name: string; orders: O[]; subtotal: number };

const key = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

/** Agrupa os pedidos por nome (sem diferenciar maiúsculas/acentos), na ordem em que cada pessoa pediu pela primeira vez. */
export function splitByPerson<O extends SplitOrder>(orders: O[]): PersonShare<O>[] {
  const groups = new Map<string, PersonShare<O>>();
  for (const o of orders) {
    const k = key(o.customerName) || "-";
    let g = groups.get(k);
    if (!g) {
      g = { name: o.customerName.trim() || "Sem nome", orders: [], subtotal: 0 };
      groups.set(k, g);
    }
    g.orders.push(o);
    if (o.status !== "CANCELED") g.subtotal += o.total;
  }
  return [...groups.values()];
}

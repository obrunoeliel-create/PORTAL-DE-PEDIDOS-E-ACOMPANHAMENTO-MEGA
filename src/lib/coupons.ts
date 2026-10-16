import "server-only";
import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/** Código normalizado: maiúsculas, sem espaços. */
export const normalizeCode = (code: string) => code.trim().toUpperCase().replace(/\s+/g, "");

/** Desconto do cupom sobre o subtotal dos itens (nunca maior que o subtotal). */
export function couponDiscount(coupon: { kind: string; value: number }, subtotal: number): number {
  const raw = coupon.kind === "PERCENT" ? Math.round((subtotal * coupon.value) / 100) : coupon.value;
  return Math.max(0, Math.min(raw, subtotal));
}

export type CouponCheck =
  | { ok: true; code: string; discount: number; label: string }
  | { ok: false; error: string };

export const couponLabel = (c: { kind: string; value: number }) =>
  c.kind === "PERCENT" ? `${c.value}%` : `R$ ${(c.value / 100).toFixed(2).replace(".", ",")}`;

/** Confere se o cupom vale para este cliente e este subtotal (sem consumir o uso). */
export async function checkCoupon(rawCode: string, phone: string, subtotal: number): Promise<CouponCheck> {
  const code = normalizeCode(rawCode);
  if (!/^[A-Z0-9-]{3,30}$/.test(code)) return { ok: false, error: "Cupom inválido." };
  const c = await prisma.coupon.findUnique({ where: { code } });
  if (!c || !c.active) return { ok: false, error: "Cupom não encontrado ou desativado." };
  if (c.validUntil.getTime() < Date.now()) return { ok: false, error: "Este cupom já venceu." };
  if (c.usedCount >= c.maxUses) return { ok: false, error: "Este cupom já foi usado." };
  if (c.phone && c.phone !== phone) return { ok: false, error: "Este cupom é pessoal e vale só para o WhatsApp que o recebeu." };
  if (subtotal < c.minOrder) {
    return { ok: false, error: `Este cupom vale para pedidos a partir de R$ ${(c.minOrder / 100).toFixed(2).replace(".", ",")}.` };
  }
  return { ok: true, code, discount: couponDiscount(c, subtotal), label: couponLabel(c) };
}

/** Consome um uso do cupom dentro da transação do pedido (falha se outro pedido usou o último). */
export async function consumeCoupon(tx: Prisma.TransactionClient, code: string) {
  const { count } = await tx.coupon.updateMany({
    where: { code, active: true, validUntil: { gte: new Date() }, usedCount: { lt: prisma.coupon.fields.maxUses } },
    data: { usedCount: { increment: 1 } },
  });
  return count > 0;
}

/** Cupom pessoal de "volte sempre": VOLTE10-K7Q2. */
export async function createPersonalCoupon(opts: { prefix: string; percent: number; validityDays: number; minOrder: number; phone: string; source: string }) {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < 5; i++) {
    const suffix = Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join("");
    const code = `${normalizeCode(opts.prefix)}${opts.percent}-${suffix}`;
    const validUntil = new Date(Date.now() + opts.validityDays * 86_400_000);
    validUntil.setUTCHours(26, 59, 59, 0); // fim do dia em Brasília (UTC-3)
    try {
      return await prisma.coupon.create({
        data: { code, kind: "PERCENT", value: opts.percent, minOrder: opts.minOrder, validUntil, maxUses: 1, phone: opts.phone, source: opts.source },
      });
    } catch {
      // código repetido: tenta outro
    }
  }
  throw new Error("Não foi possível gerar o cupom.");
}

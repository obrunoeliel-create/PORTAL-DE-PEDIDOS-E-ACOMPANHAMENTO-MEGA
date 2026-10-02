import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";

/** 18 bytes aleatórios em base64url (24 caracteres) — impossível de adivinhar. */
export function generateTableToken(): string {
  return randomBytes(18).toString("base64url");
}

export const TABLE_TOKEN_RE = /^[A-Za-z0-9_-]{24}$/;

/** Confere se o token lido do QR Code pertence à mesa informada (e se a mesa está ativa). */
export async function verifyTableToken(number: number, token: string): Promise<boolean> {
  if (!Number.isInteger(number) || number < 1 || number > 999 || !TABLE_TOKEN_RE.test(token)) return false;
  const table = await prisma.diningTable.findUnique({ where: { number } });
  if (!table?.active) return false;
  const a = Buffer.from(table.token);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Endereço que vai no QR Code da mesa. */
export function tableQrUrl(baseUrl: string, number: number, token: string): string {
  return `${baseUrl}/?mesa=${number}&t=${token}`;
}

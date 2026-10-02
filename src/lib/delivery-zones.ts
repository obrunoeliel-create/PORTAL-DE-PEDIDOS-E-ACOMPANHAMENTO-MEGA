import "server-only";
import { prisma } from "./prisma";
import { sanitizeText } from "./sanitize";

export const zoneSelect = { id: true, name: true, fee: true, active: true } as const;

export async function listZones(onlyActive = false) {
  return prisma.deliveryZone.findMany({
    where: onlyActive ? { active: true } : undefined,
    select: zoneSelect,
    orderBy: { name: "asc" },
  });
}

/** Mesmo bairro com outra grafia ("CENTRO", "centro ") não vira duplicata. */
export function findZoneByName(name: string) {
  return prisma.deliveryZone.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
}

export type ParsedZone = { name: string; fee: number };

/**
 * Lê uma lista colada (uma linha por bairro), aceitando formatos comuns:
 *   "Centro;7,00"   "Centro - R$ 7,00"   "Centro	7"   "Jd. Jurema: 8.50"
 */
export function parseZoneList(text: string): { zones: ParsedZone[]; invalid: string[] } {
  const zones = new Map<string, ParsedZone>();
  const invalid: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(.+?)[\s;:|\t–-]+(?:R\$\s*)?(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:reais)?$/i);
    if (!m) {
      invalid.push(line.slice(0, 80));
      continue;
    }
    const name = sanitizeText(m[1].replace(/[;:|\t–-]+$/, "")).slice(0, 80);
    const fee = Math.round(Number(m[2].replace(",", ".")) * 100);
    if (name.length < 2 || !Number.isFinite(fee) || fee < 0 || fee > 20_000) {
      invalid.push(line.slice(0, 80));
      continue;
    }
    zones.set(name.toLowerCase(), { name, fee });
  }
  return { zones: [...zones.values()], invalid };
}

import { z } from "zod";

// Validação do que o gerente cadastra no painel do clube (recompensas, missões e campanhas de pontos).

const tier = z.enum(["BRONZE", "PRATA", "OURO", "DIAMANTE"]);
const name = z.string().trim().min(2, "Informe o nome.").max(60);
const description = z.string().trim().max(200);
const emoji = z.string().min(1).max(8);
const dateTime = z.string().datetime({ offset: true, message: "Data inválida." });

const reward = z.object({
  name,
  description,
  kind: z.enum(["PRODUCT", "DISCOUNT", "PERCENT"]),
  value: z.number().int().min(0).max(100_000),
  pointsCost: z.number().int().min(1).max(1_000_000),
  minTier: tier.default("BRONZE"),
  emoji: emoji.default("🎁"),
  stock: z.number().int().min(0).max(1_000_000).nullable().default(null),
  active: z.boolean().default(true),
  sort: z.number().int().min(0).max(999).default(0),
});

const mission = z.object({
  name,
  description,
  emoji: emoji.default("🎯"),
  kind: z.enum(["ORDERS", "SPEND", "DISTINCT_PRODUCTS", "WEEKDAY", "MIN_TICKET", "REFERRALS"]),
  target: z.number().int().min(1).max(10_000_000),
  weekday: z.number().int().min(0).max(6).nullable().default(null),
  periodDays: z.number().int().min(1).max(365).nullable().default(null),
  rewardPoints: z.number().int().min(1).max(100_000),
  minTier: tier.default("BRONZE"),
  repeatable: z.boolean().default(false),
  startsAt: dateTime.optional(),
  endsAt: dateTime.nullable().optional(),
  active: z.boolean().default(true),
  sort: z.number().int().min(0).max(999).default(0),
});

const campaign = z.object({
  name,
  multiplier: z.number().int().min(110).max(1000),
  startsAt: dateTime,
  endsAt: dateTime,
  weekdays: z.string().regex(/^[0-6]{1,7}$/, "Escolha pelo menos um dia."),
  hourFrom: z.number().int().min(0).max(23),
  hourTo: z.number().int().min(1).max(24),
  minTier: tier.default("BRONZE"),
  productIds: z.array(z.string().max(40)).max(200).default([]),
  active: z.boolean().default(true),
});

export const ENTITIES = {
  rewards: {
    create: reward.strict().refine((r) => r.kind !== "PERCENT" || (r.value >= 1 && r.value <= 50), { message: "Desconto de 1% a 50%.", path: ["value"] }),
    update: reward.partial().strict(),
  },
  missions: {
    create: mission.strict().refine((m) => m.kind !== "WEEKDAY" || m.weekday !== null, { message: "Escolha o dia da semana.", path: ["weekday"] }),
    update: mission.partial().strict(),
  },
  campaigns: {
    create: campaign.strict().refine((c) => new Date(c.endsAt) > new Date(c.startsAt) && c.hourTo > c.hourFrom, { message: "Confira as datas e os horários.", path: ["endsAt"] }),
    update: campaign.partial().strict(),
  },
} as const;

export type Entity = keyof typeof ENTITIES;

/** Converte datas em texto para Date antes de gravar. */
export function entityData(_entity: Entity, data: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...data };
  for (const k of ["startsAt", "endsAt"]) if (typeof out[k] === "string") out[k] = new Date(out[k] as string);
  return out;
}

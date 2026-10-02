import { z } from "zod";
import { sanitizeText } from "./sanitize";

const id = z.string().cuid("ID inválido.");

/** Texto livre: limita tamanho bruto, sanitiza e valida o resultado. */
const text = (min: number, max: number) =>
  z
    .string({ invalid_type_error: "Texto inválido." })
    .max(max * 2, `Máximo de ${max} caracteres.`)
    .transform(sanitizeText)
    .pipe(z.string().min(min, "Campo obrigatório.").max(max, `Máximo de ${max} caracteres.`));

const optionalText = (max: number) =>
  text(0, max)
    .optional()
    .transform((v) => (v ? v : undefined));

const phone = z
  .string()
  .max(30)
  .transform((v) => v.replace(/\D/g, ""))
  .pipe(z.string().min(10, "Telefone inválido.").max(13, "Telefone inválido."));

const cents = z.number().int().min(0).max(1_000_000); // até R$ 10.000,00

export const orderItemSchema = z
  .object({
    productId: id,
    variantId: id.optional(),
    halfProductId: id.optional(),
    addonIds: z.array(id).max(10).default([]),
    quantity: z.number().int().min(1).max(50),
    notes: optionalText(140),
  })
  .strict();

const addressSchema = z
  .object({
    street: text(3, 120),
    number: text(1, 15),
    district: text(2, 80),
    complement: optionalText(80),
    reference: optionalText(120),
  })
  .strict();

const baseOrder = {
  customerName: text(2, 80),
  customerPhone: phone,
  paymentMethod: z.enum(["PIX", "CARD", "CASH"]),
  changeFor: cents.optional(),
  notes: optionalText(280),
  items: z.array(orderItemSchema).min(1, "Carrinho vazio.").max(50),
};

export const createOrderSchema = z.discriminatedUnion("type", [
  z.object({ ...baseOrder, type: z.literal("DELIVERY"), address: addressSchema }).strict(),
  z.object({ ...baseOrder, type: z.literal("PICKUP") }).strict(),
  z.object({ ...baseOrder, type: z.literal("TABLE"), tableNumber: z.number().int().min(1).max(999) }).strict(),
]);

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderItemInput = z.infer<typeof orderItemSchema>;

export const loginSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(1).max(200),
  })
  .strict();

export const updateStatusSchema = z
  .object({ status: z.enum(["PREPARING", "OUT_FOR_DELIVERY", "COMPLETED", "CANCELED"]) })
  .strict();

export const assignDriverSchema = z.object({ driverId: id.nullable() }).strict();

export const createDriverSchema = z.object({ name: text(2, 60), phone }).strict();

export const toggleProductSchema = z.object({ active: z.boolean() }).strict();

export const cuidParam = id;

/** Taxa de entrega definida pelo operador: até R$ 200,00. */
export const deliveryFeeSchema = z.object({ deliveryFee: z.number().int().min(0).max(20_000) }).strict();

/** Token do link de acompanhamento: 24 bytes aleatórios em base64url. */
export const trackingTokenParam = z.string().regex(/^[A-Za-z0-9_-]{32}$/);

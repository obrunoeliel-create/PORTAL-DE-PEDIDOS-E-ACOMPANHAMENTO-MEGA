import { z } from "zod";
import { sanitizeText } from "./sanitize";

const id = z.string().cuid("ID inválido.");

/** Texto livre: limita tamanho bruto, sanitiza e valida o resultado. */
const text = (min: number, max: number) =>
  z
    .string({ invalid_type_error: "Texto inválido.", required_error: "Campo obrigatório." })
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

/** WhatsApp do cliente: celular brasileiro com DDD (11 dígitos, 9 na frente). Aceita +55 e máscara. */
const whatsappPhone = z
  .string({ required_error: "Informe seu WhatsApp com DDD." })
  .max(30)
  .transform((v) => v.replace(/\D/g, "").replace(/^55(?=\d{11}$)/, ""))
  .pipe(z.string().regex(/^[1-9][1-9]9\d{8}$/, "Informe um WhatsApp válido com DDD. Ex: (11) 91234-5678"));

/** Nome do cliente: obrigatório, com pelo menos 2 letras. */
const customerName = text(2, 80).refine((v) => (v.match(/\p{L}/gu) ?? []).length >= 2, "Informe seu nome.");

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
    street: text(3, 120).refine((v) => /\p{L}/u.test(v), "Informe o nome da rua."),
    number: text(1, 15),
    district: text(2, 80),
    complement: optionalText(80),
    reference: optionalText(120),
    // Bairro escolhido na lista de taxas; ausente = "outro bairro" (taxa definida pela loja)
    zoneId: id.optional(),
  })
  .strict();

const baseOrder = {
  customerName,
  customerPhone: whatsappPhone,
  notes: optionalText(280),
  items: z.array(orderItemSchema).min(1, "Carrinho vazio.").max(50),
};

// Delivery e balcão: cliente escolhe o pagamento e pode aceitar atualizações no WhatsApp.
const remoteOrder = {
  ...baseOrder,
  paymentMethod: z.enum(["PIX", "CARD", "CASH"]),
  changeFor: cents.optional(),
  whatsappUpdates: z.boolean().default(false),
};

export const createOrderSchema = z.discriminatedUnion("type", [
  z.object({ ...remoteOrder, type: z.literal("DELIVERY"), address: addressSchema }).strict(),
  z.object({ ...remoteOrder, type: z.literal("PICKUP") }).strict(),
  // Mesa: sem forma de pagamento — é pago presencialmente no caixa antes de sair.
  // A mesa só é aceita com o token do QR Code impresso na mesa (conferido no servidor).
  z
    .object({
      ...baseOrder,
      type: z.literal("TABLE"),
      tableNumber: z.number().int().min(1).max(999),
      tableToken: z.string().regex(/^[A-Za-z0-9_-]{24}$/, "QR Code da mesa inválido."),
    })
    .strict(),
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

/** Taxas de entrega por bairro (portal do gerente). */
export const deliveryZoneSchema = z.object({ name: text(2, 80), fee: z.number().int().min(0).max(20_000) }).strict();
export const deliveryZoneUpdateSchema = z
  .object({ name: text(2, 80).optional(), fee: z.number().int().min(0).max(20_000).optional(), active: z.boolean().optional() })
  .strict();
export const deliveryZoneImportSchema = z.object({ text: z.string().min(1).max(20_000) }).strict();

/** Loja troca a mesa de um pedido pelo portal. */
export const changeTableSchema = z.object({ tableNumber: z.number().int().min(1).max(999) }).strict();

/** Taxa de entrega definida pelo operador: até R$ 200,00. */
export const deliveryFeeSchema = z.object({ deliveryFee: z.number().int().min(0).max(20_000) }).strict();

/** Token do link de acompanhamento: 24 bytes aleatórios em base64url. */
export const trackingTokenParam = z.string().regex(/^[A-Za-z0-9_-]{32}$/);

// Gerador de BR Code PIX estático (padrão EMV® QRCPS - Manual do BR Code do Banco Central).
// Para PIX dinâmico (cobrança com txid e confirmação automática via webhook), integre a API
// do seu PSP (Efí, Mercado Pago, Banco do Brasil...) e substitua esta função pelo payload retornado.

function field(id: string, value: string): string {
  return id + value.length.toString().padStart(2, "0") + value;
}

function normalize(value: string, max: number): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .toUpperCase()
    .trim()
    .slice(0, max);
}

function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function buildPixPayload(opts: {
  key: string;
  merchantName: string;
  merchantCity: string;
  amountCents: number;
  txid?: string;
}): string {
  const txid = (opts.txid ?? "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";

  const payload =
    field("00", "01") +
    field("26", field("00", "br.gov.bcb.pix") + field("01", opts.key.trim())) +
    field("52", "0000") +
    field("53", "986") +
    field("54", (opts.amountCents / 100).toFixed(2)) +
    field("58", "BR") +
    field("59", normalize(opts.merchantName, 25) || "LOJA") +
    field("60", normalize(opts.merchantCity, 15) || "BRASIL") +
    field("62", field("05", txid)) +
    "6304";

  return payload + crc16(payload);
}

/**
 * Payload PIX de um pedido — só quando o valor final é conhecido
 * (delivery precisa da taxa definida pelo operador) e o pedido não foi cancelado.
 */
export function orderPixPayload(
  settings: { pixKey: string | null; pixMerchantName: string | null; pixMerchantCity: string | null; storeName: string },
  order: { paymentMethod: string; type: string; status: string; deliveryFee: number | null; total: number; number: number },
): string | null {
  if (order.paymentMethod !== "PIX" || !settings.pixKey) return null;
  if (order.status === "CANCELED") return null;
  if (order.type === "DELIVERY" && order.deliveryFee === null) return null;
  return buildPixPayload({
    key: settings.pixKey,
    merchantName: settings.pixMerchantName ?? settings.storeName,
    merchantCity: settings.pixMerchantCity ?? "BRASIL",
    amountCents: order.total,
    txid: `OF${order.number}`,
  });
}

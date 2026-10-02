import type { OrderStatusValue, OrderTypeValue, PaymentMethodValue } from "@/types/order";

export const ORDER_TYPE_LABEL: Record<OrderTypeValue, string> = {
  DELIVERY: "Delivery",
  PICKUP: "Retirada no Balcão",
  TABLE: "Mesa",
};

export const PAYMENT_LABEL: Record<PaymentMethodValue, string> = {
  PIX: "PIX",
  CARD: "Cartão (na entrega)",
  CASH: "Dinheiro",
  ON_SITE: "No caixa (presencial)",
};

export const STATUS_LABEL: Record<OrderStatusValue, string> = {
  PENDING: "Aguardando Aceite",
  PREPARING: "Em Preparo",
  OUT_FOR_DELIVERY: "Saiu para Entrega / Pronto",
  COMPLETED: "Concluído",
  CANCELED: "Cancelado",
};

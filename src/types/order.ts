// Tipos serializáveis (JSON) compartilhados entre servidor, Socket.IO e componentes cliente.

export type OrderTypeValue = "DELIVERY" | "PICKUP" | "TABLE";
export type OrderStatusValue = "PENDING" | "PREPARING" | "OUT_FOR_DELIVERY" | "COMPLETED" | "CANCELED";
export type PaymentMethodValue = "PIX" | "CARD" | "CASH" | "ON_SITE";

export type BoardOrderItem = {
  id: string;
  categoryLabel: string | null;
  productName: string;
  halfProductName: string | null;
  variantName: string | null;
  addons: { name: string; price: number }[];
  unitPrice: number;
  quantity: number;
  totalPrice: number;
  notes: string | null;
};

export type BoardOrder = {
  id: string;
  number: number;
  trackingToken: string;
  type: OrderTypeValue;
  status: OrderStatusValue;
  customerName: string;
  customerPhone: string;
  tableNumber: number | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressDistrict: string | null;
  addressComplement: string | null;
  addressReference: string | null;
  paymentMethod: PaymentMethodValue;
  changeFor: number | null;
  subtotal: number;
  /** null = taxa de entrega ainda não definida pelo operador */
  deliveryFee: number | null;
  total: number;
  notes: string | null;
  whatsappUpdates: boolean;
  waAcceptedAt: string | null;
  waDispatchedAt: string | null;
  waError: string | null;
  customerId: string | null;
  tableSessionId: string | null;
  driverId: string | null;
  driver: { id: string; name: string; phone: string } | null;
  items: BoardOrderItem[];
  createdAt: string;
  updatedAt: string;
};

export type DriverDTO = { id: string; name: string; phone: string; active: boolean };

/** Visão pública do pedido (link "Acompanhe seu pedido"): sem telefone, endereço ou IDs internos. */
export type TrackedOrder = {
  number: number;
  status: OrderStatusValue;
  type: OrderTypeValue;
  tableNumber: number | null;
  customerName: string;
  items: {
    quantity: number;
    categoryLabel: string | null;
    productName: string;
    halfProductName: string | null;
    variantName: string | null;
    addons: string[];
    totalPrice: number;
  }[];
  subtotal: number;
  deliveryFee: number | null;
  feePending: boolean;
  total: number;
  paymentMethod: PaymentMethodValue;
  changeFor: number | null;
  createdAt: string;
  pix: { payload: string; key: string; holderName: string | null } | null;
  store: { name: string; whatsappNumber: string | null };
  /** Pedido na mesa: conta da comanda (todos os pedidos daquela mesa até a loja fechar). */
  tableTab: { tableNumber: number; total: number; orders: number; closed: boolean } | null;
};

export type MenuVariant = { id: string; name: string; price: number };
export type MenuAddon = { id: string; name: string; price: number };

export type MenuProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  categoryId: string;
  variants: MenuVariant[];
};

export type MenuCategory = {
  id: string;
  name: string;
  slug: string;
  allowsHalf: boolean;
  /** Tipo no singular: "Esfiha", "Pizza", "Pastel"... (null para bebidas) */
  itemLabel: string | null;
  products: MenuProduct[];
  addons: MenuAddon[];
};

/** Bairro atendido no delivery, com a taxa (centavos). */
export type DeliveryZoneOption = { id: string; name: string; fee: number };

export type PublicSettings = {
  storeName: string;
  isOpen: boolean;
  whatsappNumber: string | null;
  pixEnabled: boolean;
};

export type OrderMode =
  | { type: "DELIVERY" }
  | { type: "PICKUP" }
  /** Mesa só vem do QR Code (número + token) e fica travada para o cliente. */
  | { type: "TABLE"; tableNumber: number; tableToken: string };

export type CartItem = {
  key: string;
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  halfProductId?: string;
  halfProductName?: string;
  categoryLabel?: string;
  addonIds: string[];
  addonNames: string[];
  quantity: number;
  notes?: string;
  /** Preço exibido no cliente; o servidor SEMPRE recalcula a partir do banco. */
  unitPrice: number;
};

/** Cliente com cadastro (só chega ao navegador de quem está logado nele). */
export type CustomerProfile = {
  id: string;
  name: string;
  phone: string;
  address: {
    street: string;
    number: string;
    district: string;
    complement: string | null;
    reference: string | null;
    zoneId: string | null;
  } | null;
};

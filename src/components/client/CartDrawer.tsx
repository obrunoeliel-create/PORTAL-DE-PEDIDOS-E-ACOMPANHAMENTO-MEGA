"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import type { CartItem, CustomerProfile, DeliveryZoneOption, OrderMode, PublicSettings } from "@/types/menu";
import type { PaymentMethodValue } from "@/types/order";
import { formatBRL, parseBRL } from "@/lib/money";
import { ORDER_TYPE_LABEL, PAYMENT_LABEL } from "@/lib/labels";
import { itemTitle } from "@/lib/item-title";
import { buildOrderMessage, buildWhatsAppUrl, formatAddress } from "@/lib/whatsapp";
import { PixQrCode } from "./PixQrCode";
import { Field, maskPhone } from "./form";

type Props = {
  cart: CartItem[];
  setCart: Dispatch<SetStateAction<CartItem[]>>;
  mode: OrderMode | null;
  /** Ausente quando a mesa veio do QR Code (travada). */
  onChangeMode?: () => void;
  settings: PublicSettings;
  /** Bairros atendidos com a taxa (vazio = cliente digita o bairro e a loja define a taxa). */
  zones: DeliveryZoneOption[];
  /** Cliente logado (null = pedido sem cadastro). Nunca usado em pedido de mesa. */
  customer: CustomerProfile | null;
  onAccount: (tab: "login" | "register", prefill?: { name?: string; phone?: string }) => void;
  onLogout: () => void;
  onClose: () => void;
  onOrderPlaced?: (order: { number: number; token: string }) => void;
};

const OTHER_ZONE = "__outro__";

type OrderResult = {
  number: number;
  trackingToken: string;
  total: number;
  feePending: boolean;
  paymentMethod: PaymentMethodValue;
  pix: { payload: string; key: string; holderName: string | null } | null;
  whatsappUrl: string | null;
  tableTab: { total: number; orders: number } | null;
};

/** Último pedido feito neste navegador — o cardápio mostra o atalho "Acompanhar pedido". */
export const LAST_ORDER_KEY = "orderflow:lastOrder:v1";

export function CartDrawer({ cart, setCart, mode, onChangeMode, settings, zones, customer, onAccount, onLogout, onClose, onOrderPlaced }: Props) {
  const isTable = mode?.type === "TABLE";
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer ? maskPhone(customer.phone) : "");
  // Delivery com cadastro: "saved" = entregar no endereço salvo; "other" = digitar outro endereço.
  const [addressChoice, setAddressChoice] = useState<"saved" | "other">(customer?.address ? "saved" : "other");
  const [saveAddress, setSaveAddress] = useState(false);
  const [address, setAddress] = useState({ street: "", number: "", district: "", complement: "", reference: "" });
  const [payment, setPayment] = useState<PaymentMethodValue>(settings.pixEnabled ? "PIX" : "CARD");
  const [changeFor, setChangeFor] = useState("");
  const [notes, setNotes] = useState("");
  const [waUpdates, setWaUpdates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [result, setResult] = useState<OrderResult | null>(null);
  const [zoneId, setZoneId] = useState("");

  // Quando o cliente entra/sai com o carrinho aberto, atualiza os dados.
  useEffect(() => {
    setName(customer?.name ?? "");
    setPhone(customer ? maskPhone(customer.phone) : "");
    setAddressChoice(customer?.address ? "saved" : "other");
  }, [customer]);

  // Endereço salvo: usa o bairro da lista se ainda estiver ativo; senão vira "outro bairro" (taxa pela loja).
  const saved = customer?.address ?? null;
  const savedZone = saved?.zoneId ? zones.find((z) => z.id === saved.zoneId) ?? null : null;
  const usingSaved = mode?.type === "DELIVERY" && addressChoice === "saved" && !!saved;
  const effective =
    usingSaved && saved
      ? {
          street: saved.street,
          number: saved.number,
          district: savedZone ? savedZone.name : saved.district,
          complement: saved.complement ?? "",
          reference: saved.reference ?? "",
        }
      : address;
  const effectiveZoneId = usingSaved ? savedZone?.id ?? "" : zoneId;

  const zone = zones.find((z) => z.id === effectiveZoneId) ?? null;
  const subtotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  // Delivery: taxa do bairro escolhido; sem bairro da lista, a loja define depois (null = a definir).
  // Valor só de exibição: o servidor sempre busca a taxa no cadastro.
  const deliveryFee = mode?.type === "DELIVERY" ? (zone ? zone.fee : null) : 0;
  const total = subtotal + (deliveryFee ?? 0);
  const district = zone ? zone.name : effective.district;

  const clearErr = (field: string) =>
    fieldErrors[field] && setFieldErrors(({ [field]: _removed, ...rest }) => rest);

  const inputCls = (field: string) =>
    `input ${fieldErrors[field] ? "border-brand-500 ring-4 ring-brand-100" : ""}`;

  /** Mesmas regras do servidor, para avisar no campo antes de enviar. */
  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if ((name.match(/\p{L}/gu) ?? []).length < 2) errs.customerName = "Informe seu nome.";
    const digits = phone.replace(/\D/g, "").replace(/^55(?=\d{11}$)/, "");
    if (!isTable && !/^[1-9][1-9]9\d{8}$/.test(digits)) errs.customerPhone = "Informe um WhatsApp válido com DDD. Ex: (11) 91234-5678";
    if (mode?.type === "DELIVERY" && !usingSaved) {
      if (zones.length > 0 && !zoneId) errs["address.zoneId"] = "Selecione seu bairro.";
      if ((zones.length === 0 || zoneId === OTHER_ZONE) && address.district.trim().length < 2) errs["address.district"] = "Informe seu bairro.";
      if (address.street.trim().length < 3 || !/\p{L}/u.test(address.street)) errs["address.street"] = "Informe a rua.";
      if (!address.number.trim()) errs["address.number"] = "Informe o número.";
    }
    return errs;
  }
  const changeCents = changeFor ? parseBRL(changeFor) : null;
  const changeValue = changeCents !== null ? changeCents - total : null;

  const payments: PaymentMethodValue[] = settings.pixEnabled ? ["PIX", "CARD", "CASH"] : ["CARD", "CASH"];

  function updateQty(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => (i.key === key ? { ...i, quantity: Math.min(50, i.quantity + delta) } : i))
        .filter((i) => i.quantity > 0),
    );
  }

  /** Fallback: se a API falhar, monta a mensagem no próprio navegador e abre o WhatsApp. */
  function buildFallbackUrl(): string | null {
    if (!settings.whatsappNumber || !mode) return null;
    const msg = buildOrderMessage({
      storeName: settings.storeName,
      type: mode.type,
      tableNumber: mode.type === "TABLE" ? mode.tableNumber : null,
      customerName: name,
      customerPhone: isTable ? "" : phone,
      address: mode.type === "DELIVERY" ? formatAddress({ ...effective, district }) : null,
      paymentMethod: mode.type === "TABLE" ? "ON_SITE" : payment,
      changeFor: mode.type !== "TABLE" && payment === "CASH" ? changeCents : null,
      items: cart.map((i) => ({ ...i, totalPrice: i.unitPrice * i.quantity })),
      subtotal,
      deliveryFee,
      total,
      notes,
      estimated: true,
    });
    return buildWhatsAppUrl(settings.whatsappNumber, msg);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!mode) return onChangeMode?.();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setError("Preencha os campos obrigatórios destacados.");
      const order = ["customerName", "customerPhone", "address.zoneId", "address.district", "address.street", "address.number"];
      const ids: Record<string, string> = { "address.zoneId": "f-zone", "address.district": "f-district", "address.street": "f-street", "address.number": "f-number" };
      const first = order.find((k) => errs[k]);
      if (first) {
        const el = document.getElementById(ids[first] ?? `f-${first}`);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.focus({ preventScroll: true });
      }
      return;
    }
    if (mode.type !== "TABLE" && payment === "CASH" && changeFor && (changeCents === null || changeCents < total)) {
      setFieldErrors({ changeFor: "O valor para troco deve ser maior ou igual ao total." });
      return;
    }

    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    setFallbackUrl(null);

    const payload = {
      type: mode.type,
      ...(mode.type === "TABLE" && { tableNumber: mode.tableNumber, tableToken: mode.tableToken }),
      ...(mode.type === "DELIVERY" && {
        address: {
          street: effective.street,
          number: effective.number,
          district,
          zoneId: zone?.id,
          complement: effective.complement || undefined,
          reference: effective.reference || undefined,
        },
      }),
      customerName: name,
      ...(mode.type !== "TABLE" && {
        customerPhone: phone,
        saveAddress: mode.type === "DELIVERY" && !!customer && addressChoice === "other" && saveAddress,
        paymentMethod: payment,
        changeFor: payment === "CASH" && changeCents ? changeCents : undefined,
        whatsappUpdates: waUpdates,
      }),
      notes: notes || undefined,
      items: cart.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        halfProductId: i.halfProductId,
        addonIds: i.addonIds,
        quantity: i.quantity,
        notes: i.notes,
      })),
    };

    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Não foi possível enviar o pedido.");
        setFieldErrors(data.fields ?? {});
        if (res.status >= 500) setFallbackUrl(buildFallbackUrl());
        return;
      }
      const created = data as OrderResult;
      setResult(created);
      onOrderPlaced?.({ number: created.number, token: created.trackingToken });
      setCart([]);
      try {
        localStorage.setItem(LAST_ORDER_KEY, JSON.stringify({ number: created.number, token: created.trackingToken }));
      } catch {
        /* armazenamento indisponível */
      }
    } catch {
      setError("Falha de conexão ao enviar o pedido.");
      setFallbackUrl(buildFallbackUrl());
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <Shell onClose={onClose} title="Pedido enviado!">
        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-center">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 px-5 py-7 text-white">
            <div className="bg-dots absolute inset-0" aria-hidden />
            <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-full bg-white text-4xl shadow-lift">✅</div>
            <p className="relative mt-3 text-sm text-white/80">Recebemos seu pedido!</p>
            <p className="relative font-display text-4xl font-extrabold">#{result.number}</p>
            <p className="relative mt-1 text-white/90">
              {result.feePending ? "Total sem a taxa de entrega" : "Total"}:{" "}
              <strong className="font-display">{formatBRL(result.total)}</strong>
            </p>
          </div>
          {result.tableTab && (
            <div className="rounded-2xl bg-ink-950 p-4 text-left text-white">
              <p className="text-xs uppercase tracking-widest text-mega-400">Conta da mesa até agora</p>
              <p className="font-display text-3xl font-extrabold">{formatBRL(result.tableTab.total)}</p>
              <p className="text-sm text-white/70">
                {result.tableTab.orders} {result.tableTab.orders === 1 ? "pedido" : "pedidos"} nesta mesa · pode pedir mais à vontade!
              </p>
            </div>
          )}
          {result.paymentMethod === "ON_SITE" && (
            <p className="rounded-2xl bg-mega-100 p-4 text-left text-sm text-ink-900 ring-1 ring-mega-300">
              💰 <strong>Pagamento no caixa:</strong> é só pagar presencialmente no caixa da loja antes de sair.
            </p>
          )}
          {result.feePending && (
            <p className="rounded-2xl bg-mega-100 p-4 text-left text-sm text-ink-900 ring-1 ring-mega-300">
              🛵 A loja vai calcular a taxa de entrega para o seu endereço.
              {result.paymentMethod === "PIX"
                ? " O QR Code do PIX com o valor final aparece na página de acompanhamento."
                : " Você acompanha o valor final na página do pedido."}
            </p>
          )}
          {result.pix && (
            <PixQrCode
              payload={result.pix.payload}
              pixKey={result.pix.key}
              holderName={result.pix.holderName}
              amount={result.total}
              orderNumber={result.number}
              storeName={settings.storeName}
              storeWhatsapp={settings.whatsappNumber}
              customerName={name}
            />
          )}
          <Link href={`/pedido/${result.trackingToken}`} className="btn-primary w-full py-3.5 text-base">
            📦 {result.feePending && result.paymentMethod === "PIX" ? "Acompanhar pedido e pagar" : "Acompanhar meu pedido"}
          </Link>
          {result.whatsappUrl && !isTable && (
            <a href={result.whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-whatsapp w-full">
              💬 Enviar resumo no WhatsApp
            </a>
          )}
          {!customer && !isTable && (
            <div className="rounded-2xl bg-[#faf7f2] p-4 text-left ring-1 ring-stone-100">
              <p className="font-semibold">✨ Quer pedir mais rápido da próxima vez?</p>
              <p className="mb-3 text-sm text-stone-500">Crie seu cadastro com estes dados — é só escolher uma senha de 4 números.</p>
              <button onClick={() => onAccount("register", { name, phone })} className="btn-ghost w-full">
                Criar meu cadastro
              </button>
            </div>
          )}
          <button onClick={onClose} className="btn-ghost w-full py-3">
            Voltar ao cardápio
          </button>
        </div>
      </Shell>
    );
  }

  const err = (field: string) =>
    fieldErrors[field] ? <p className="mt-1 text-xs font-medium text-brand-700">{fieldErrors[field]}</p> : null;

  const paymentIcon: Record<PaymentMethodValue, string> = { PIX: "⚡", CARD: "💳", CASH: "💵", ON_SITE: "💰" };
  const modeIcon = { DELIVERY: "🛵", PICKUP: "🏪", TABLE: "🍽️" } as const;
  const itemCount = cart.reduce((s, i) => s + i.quantity, 0);

  return (
    <Shell onClose={onClose} title="Seu pedido" subtitle={`${itemCount} ${itemCount === 1 ? "item" : "itens"}`}>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto bg-[#faf7f2] p-4">
          <button
            type="button"
            onClick={onChangeMode}
            disabled={!onChangeMode}
            className="card flex w-full items-center justify-between p-3.5 text-left text-sm transition enabled:hover:shadow-lift"
          >
            <span className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-mega-400 text-xl" aria-hidden>
                {mode ? modeIcon[mode.type] : "📍"}
              </span>
              <span>
                <span className="block text-xs text-stone-500">Modalidade</span>
                <strong className="font-display text-base">
                  {mode ? (mode.type === "TABLE" ? `Mesa ${mode.tableNumber}` : ORDER_TYPE_LABEL[mode.type]) : "Escolher"}
                </strong>
              </span>
            </span>
            {onChangeMode ? (
              <span className="font-semibold text-brand-600">Alterar</span>
            ) : (
              <span className="text-xs font-medium text-stone-500">🔒 via QR Code</span>
            )}
          </button>

          <Card
            title="Itens"
            action={
              cart.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Limpar o carrinho e recomeçar o pedido?")) setCart([]);
                  }}
                  className="text-xs font-semibold text-stone-500 underline hover:text-brand-600"
                >
                  🗑 Limpar carrinho
                </button>
              ) : undefined
            }
          >
            {cart.length === 0 ? (
              <p className="py-6 text-center text-stone-500">🛒 Seu carrinho está vazio.</p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {cart.map((i) => (
                  <li key={i.key} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-semibold">
                        {itemTitle(i)}
                        {i.variantName && <span className="font-normal text-stone-500"> · {i.variantName}</span>}
                      </p>
                      {i.addonNames.length > 0 && <p className="text-stone-500">+ {i.addonNames.join(", ")}</p>}
                      {i.notes && <p className="text-stone-500">“{i.notes}”</p>}
                      <p className="mt-1 font-display font-bold text-brand-700">{formatBRL(i.unitPrice * i.quantity)}</p>
                    </div>
                    <div className="flex h-fit items-center rounded-xl bg-stone-100 p-0.5 text-sm">
                      <button
                        type="button"
                        onClick={() => updateQty(i.key, -1)}
                        className="grid h-8 w-8 place-items-center rounded-lg font-bold text-brand-600 hover:bg-white"
                        aria-label={i.quantity === 1 ? "Remover" : "Diminuir"}
                      >
                        {i.quantity === 1 ? "🗑" : "−"}
                      </button>
                      <span className="w-6 text-center font-display font-bold">{i.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQty(i.key, 1)}
                        className="grid h-8 w-8 place-items-center rounded-lg font-bold text-brand-600 hover:bg-white"
                        aria-label="Aumentar"
                      >
                        +
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={isTable ? "Seu nome" : "Seus dados"}>
            <div className="space-y-3">
              {customer && !isTable ? (
                <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-600 font-display font-bold text-white">
                    {customer.name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-semibold">{customer.name}</p>
                    <p className="text-stone-500">{maskPhone(customer.phone)}</p>
                  </div>
                  <button type="button" onClick={onLogout} className="text-xs font-medium text-stone-500 underline">
                    Não é você?
                  </button>
                </div>
              ) : (
              <>
              <Field id="f-customerName" label="Nome" required error={fieldErrors.customerName}>
                <input
                  id="f-customerName"
                  className={inputCls("customerName")}
                  placeholder="Seu nome"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    clearErr("customerName");
                  }}
                  maxLength={80}
                  autoComplete="name"
                />
              </Field>
              {!isTable && (
              <Field id="f-customerPhone" label="WhatsApp com DDD" required error={fieldErrors.customerPhone}>
                <input
                  id="f-customerPhone"
                  className={inputCls("customerPhone")}
                  placeholder="(11) 91234-5678"
                  value={phone}
                  onChange={(e) => {
                    setPhone(maskPhone(e.target.value));
                    clearErr("customerPhone");
                  }}
                  maxLength={16}
                  inputMode="tel"
                  autoComplete="tel"
                />
              </Field>
              )}
              {!isTable && (
                <button type="button" onClick={() => onAccount("login")} className="text-left text-sm font-semibold text-brand-600">
                  👤 Já tem cadastro? Entrar e preencher automático
                </button>
              )}
              </>
              )}
              {mode && mode.type !== "TABLE" && (
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-3 transition ${
                    waUpdates ? "border-[#25d366] bg-[#25d366]/10" : "border-stone-200 hover:border-stone-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[#25d366]"
                    checked={waUpdates}
                    onChange={(e) => setWaUpdates(e.target.checked)}
                  />
                  <span className="text-sm">
                    <span className="block font-semibold">📲 Quero receber atualizações no WhatsApp</span>
                    <span className="text-stone-500">
                      Avisamos quando o pedido for aceito e quando{" "}
                      {mode.type === "DELIVERY" ? "sair para entrega" : "estiver pronto para retirada"}.
                    </span>
                  </span>
                </label>
              )}
            </div>
          </Card>

          {mode?.type === "DELIVERY" && (
            <Card title="Endereço de entrega">
              {saved && (
                <div className="mb-3 space-y-2">
                  <p className="text-sm font-semibold">Entregar neste endereço?</p>
                  <label className={`chip flex items-start gap-3 ${addressChoice === "saved" ? "chip-on" : "chip-off"}`}>
                    <input type="radio" name="addr" className="mt-1 accent-brand-600" checked={addressChoice === "saved"} onChange={() => setAddressChoice("saved")} />
                    <span className="text-sm">
                      <span className="block font-semibold">🏠 Sim, no meu endereço</span>
                      <span className="text-stone-600">
                        {saved.street}, {saved.number}
                        {saved.complement ? ` — ${saved.complement}` : ""} · {savedZone ? savedZone.name : saved.district}
                      </span>
                      {usingSaved && (
                        <span className="mt-0.5 block font-semibold text-emerald-700">
                          {savedZone ? `🛵 Taxa de entrega: ${formatBRL(savedZone.fee)}` : "A loja confirma a taxa de entrega."}
                        </span>
                      )}
                    </span>
                  </label>
                  <label className={`chip flex items-center gap-3 ${addressChoice === "other" ? "chip-on" : "chip-off"}`}>
                    <input type="radio" name="addr" className="accent-brand-600" checked={addressChoice === "other"} onChange={() => setAddressChoice("other")} />
                    <span className="text-sm font-semibold">📍 Entregar em outro endereço</span>
                  </label>
                </div>
              )}
              {(!saved || addressChoice === "other") && (
              <div className="space-y-3">
                {zones.length > 0 && (
                  <Field id="f-zone" label="Bairro" required error={fieldErrors["address.zoneId"]}>
                    <select
                      id="f-zone"
                      className={inputCls("address.zoneId")}
                      value={zoneId}
                      onChange={(e) => {
                        setZoneId(e.target.value);
                        clearErr("address.zoneId");
                      }}
                    >
                      <option value="">Selecione seu bairro</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name} — taxa {formatBRL(z.fee)}
                        </option>
                      ))}
                      <option value={OTHER_ZONE}>Meu bairro não está na lista</option>
                    </select>
                    {zone && (
                      <p className="mt-1.5 text-sm font-semibold text-emerald-700">🛵 Taxa de entrega: {formatBRL(zone.fee)}</p>
                    )}
                  </Field>
                )}
                {(zones.length === 0 || zoneId === OTHER_ZONE) && (
                  <Field id="f-district" label={zones.length ? "Nome do bairro" : "Bairro"} required error={fieldErrors["address.district"]}>
                    <input
                      id="f-district"
                      className={inputCls("address.district")}
                      placeholder="Seu bairro"
                      value={address.district}
                      onChange={(e) => {
                        setAddress({ ...address, district: e.target.value });
                        clearErr("address.district");
                      }}
                      maxLength={80}
                    />
                    <p className="mt-1.5 text-xs text-stone-500">A loja confirma a taxa de entrega para o seu bairro.</p>
                  </Field>
                )}
                <div className="grid grid-cols-[1fr_6rem] gap-2">
                  <Field id="f-street" label="Rua" required error={fieldErrors["address.street"]}>
                    <input
                      id="f-street"
                      className={inputCls("address.street")}
                      placeholder="Nome da rua"
                      value={address.street}
                      onChange={(e) => {
                        setAddress({ ...address, street: e.target.value });
                        clearErr("address.street");
                      }}
                      maxLength={120}
                      autoComplete="address-line1"
                    />
                  </Field>
                  <Field id="f-number" label="Nº" required error={fieldErrors["address.number"]}>
                    <input
                      id="f-number"
                      className={inputCls("address.number")}
                      placeholder="123"
                      value={address.number}
                      onChange={(e) => {
                        setAddress({ ...address, number: e.target.value });
                        clearErr("address.number");
                      }}
                      maxLength={15}
                    />
                  </Field>
                </div>
                <Field id="f-complement" label="Complemento (opcional)">
                  <input id="f-complement" className="input" placeholder="Apto, bloco, casa 2..." value={address.complement} onChange={(e) => setAddress({ ...address, complement: e.target.value })} maxLength={80} />
                </Field>
                <Field id="f-reference" label="Ponto de referência (opcional)">
                  <input id="f-reference" className="input" placeholder="Perto de..." value={address.reference} onChange={(e) => setAddress({ ...address, reference: e.target.value })} maxLength={120} />
                </Field>
                {customer && (
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
                    Salvar como meu endereço para os próximos pedidos
                  </label>
                )}
              </div>
              )}
            </Card>
          )}

          {mode?.type === "TABLE" ? (
            <Card title="Pagamento">
              <div className="flex gap-3 rounded-xl bg-mega-100 p-3.5 text-sm ring-1 ring-mega-300">
                <span className="text-2xl" aria-hidden>
                  💰
                </span>
                <p>
                  <strong className="block font-display text-base">Pague no caixa ao sair</strong>
                  Pedidos na mesa são pagos presencialmente no caixa da loja. O total do seu pedido aparece abaixo.
                </p>
              </div>
            </Card>
          ) : (
          <Card title="Pagamento">
            <div className="grid grid-cols-3 gap-2">
              {payments.map((p) => (
                <label key={p} className={`chip text-center font-semibold ${payment === p ? "chip-on" : "chip-off"}`}>
                  <input type="radio" name="payment" className="sr-only" checked={payment === p} onChange={() => setPayment(p)} />
                  <span className="block text-xl" aria-hidden>
                    {paymentIcon[p]}
                  </span>
                  {p === "CARD" ? "Cartão" : PAYMENT_LABEL[p]}
                </label>
              ))}
            </div>
            {payment === "PIX" && <p className="mt-2.5 text-xs text-stone-500">O QR Code aparece depois que você enviar o pedido.</p>}
            {payment === "CARD" && <p className="mt-2.5 text-xs text-stone-500">Pagamento na maquininha, na entrega ou no balcão.</p>}
            {payment === "CASH" && (
              <div className="mt-3">
                <input className="input" placeholder="Troco para quanto? (opcional)" value={changeFor} onChange={(e) => setChangeFor(e.target.value)} inputMode="decimal" maxLength={10} />
                {changeValue !== null && changeValue >= 0 && (
                  <p className="mt-1.5 text-sm font-medium text-green-700">
                    {mode?.type === "DELIVERY" && deliveryFee === null
                      ? `Troco sem contar a taxa de entrega: ${formatBRL(changeValue)}`
                      : `Seu troco: ${formatBRL(changeValue)}`}
                  </p>
                )}
                {err("changeFor")}
              </div>
            )}
          </Card>
          )}

          <Card title="Observações do pedido">
            <textarea
              className="input resize-none"
              rows={2}
              placeholder="Opcional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={280}
              aria-label="Observações do pedido"
            />
          </Card>
        </div>

        <div className="space-y-2 border-t border-stone-100 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-sm">
          <Row label="Subtotal" value={formatBRL(subtotal)} />
          {mode?.type === "DELIVERY" && (
            <Row
              label="Taxa de entrega"
              value={deliveryFee !== null ? formatBRL(deliveryFee) : zones.length && !zoneId ? "escolha o bairro" : "a definir pela loja"}
            />
          )}
          <Row label={mode?.type === "DELIVERY" && deliveryFee === null ? "Total (sem a taxa)" : "Total"} value={formatBRL(total)} bold />
          {error && (
            <p className="rounded-xl bg-brand-50 p-3 font-medium text-brand-800" role="alert">
              {error}
            </p>
          )}
          {fallbackUrl && (
            <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" className="btn-whatsapp w-full">
              💬 Enviar pedido pelo WhatsApp
            </a>
          )}
          <button
            type="submit"
            disabled={submitting || cart.length === 0 || !settings.isOpen}
            className="btn-primary w-full justify-between py-4 text-base"
          >
            <span>{submitting ? "Enviando..." : "Finalizar pedido"}</span>
            <span className="font-display font-bold">{formatBRL(total)}</span>
          </button>
        </div>
      </form>
    </Shell>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-display text-base font-bold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-display text-lg font-bold" : "text-stone-500"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Shell({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex animate-fade-in justify-end bg-ink-950/60 backdrop-blur-sm" role="dialog" aria-modal>
      <div className="flex h-full w-full max-w-md animate-slide-up flex-col bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-stone-100 px-5 py-4">
          <div>
            <h2 className="text-xl font-extrabold">{title}</h2>
            {subtitle && <p className="text-xs text-stone-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full bg-stone-100 text-xl leading-none text-stone-500 hover:bg-stone-200"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

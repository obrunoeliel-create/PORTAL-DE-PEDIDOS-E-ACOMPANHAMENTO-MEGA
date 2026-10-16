"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CartItem, DeliveryZoneOption, MenuCategory, MenuProduct } from "@/types/menu";
import type { BoardOrder } from "@/types/order";
import { formatBRL, parseBRL } from "@/lib/money";
import { itemTitle } from "@/lib/item-title";
import { matchZone } from "@/lib/cep";
import { getPrintOnAccept, printDocument } from "@/lib/print-client";
import { categoryIcon } from "@/components/brand/categoryIcon";
import { ProductModal } from "@/components/client/ProductModal";
import { CepField } from "@/components/client/CepField";
import { Field, maskPhone } from "@/components/client/form";

type Kind = "PICKUP" | "DELIVERY" | "TABLE";
type Pay = "CASH" | "CARD" | "PIX";

const KINDS: { v: Kind; label: string; icon: string; hint: string }[] = [
  { v: "PICKUP", label: "Balcão", icon: "🏪", hint: "Cliente retira na loja" },
  { v: "DELIVERY", label: "Delivery", icon: "🛵", hint: "Pedido por telefone / WhatsApp" },
  { v: "TABLE", label: "Mesa", icon: "🍽️", hint: "Acrescentar na conta da mesa" },
];
const PAYS: { v: Pay; label: string }[] = [
  { v: "CASH", label: "💵 Dinheiro" },
  { v: "CARD", label: "💳 Cartão" },
  { v: "PIX", label: "⚡ PIX" },
];
const OTHER_ZONE = "__outro__";
const EMPTY_ADDR = { street: "", number: "", district: "", complement: "", reference: "", zip: "" };

const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type FoundCustomer = {
  id: string;
  name: string;
  phone: string;
  addressStreet: string | null;
  addressNumber: string | null;
  addressDistrict: string | null;
  addressComplement: string | null;
  addressReference: string | null;
  addressZip: string | null;
  zoneId: string | null;
};

/** Precisa abrir a janela de opções? (tamanho, meio a meio ou acréscimos) */
const needsOptions = (p: MenuProduct, c: MenuCategory) => p.variants.length > 0 || c.allowsHalf || c.addons.length > 0;

export function StaffOrderApp({
  categories,
  zones,
  tables,
  initialTable,
  startOnTable = false,
}: {
  categories: MenuCategory[];
  zones: DeliveryZoneOption[];
  tables: number[];
  initialTable: number | null;
  /** Veio das Comandas: já abre no modo Mesa. */
  startOnTable?: boolean;
}) {
  const [kind, setKind] = useState<Kind>(initialTable || startOnTable ? "TABLE" : "PICKUP");
  const [tableNumber, setTableNumber] = useState(initialTable ? String(initialTable) : "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [addr, setAddr] = useState(EMPTY_ADDR);
  const [zoneId, setZoneId] = useState("");
  const [manualFee, setManualFee] = useState("");
  const [pay, setPay] = useState<Pay>("CASH");
  const [changeFor, setChangeFor] = useState("");
  const [notes, setNotes] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState(categories[0]?.id ?? "");
  const [modal, setModal] = useState<{ product: MenuProduct; category: MenuCategory } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<BoardOrder | null>(null);
  const [found, setFound] = useState<FoundCustomer | null>(null);
  const [tableNames, setTableNames] = useState<string[]>([]);

  const zone = zones.find((z) => z.id === zoneId) ?? null;
  const subtotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const manualFeeCents = manualFee ? parseBRL(manualFee) : null;
  const fee = kind === "DELIVERY" ? (zone ? zone.fee : manualFeeCents) : 0;
  const total = subtotal + (fee ?? 0);
  const changeCents = changeFor ? parseBRL(changeFor) : null;

  // Cliente com cadastro: ao digitar o WhatsApp, oferece preencher nome e endereço.
  const phoneDigits = phone.replace(/\D/g, "");
  useEffect(() => {
    setFound(null);
    if (kind === "TABLE" || phoneDigits.length < 10) return;
    const ctrl = new AbortController();
    fetch(`/api/admin/customers?q=${phoneDigits}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const match = (data?.customers as FoundCustomer[] | undefined)?.find((c) => c.phone === phoneDigits);
        if (match) setFound(match);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [phoneDigits, kind]);

  // Mesa: nomes de quem já pediu nessa mesa (para separar a conta por pessoa).
  const tableN = Number(tableNumber);
  useEffect(() => {
    setTableNames([]);
    if (kind !== "TABLE" || !tableN) return;
    const ctrl = new AbortController();
    fetch("/api/admin/table-sessions", { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const session = (data?.sessions as { tableNumber: number; orders: BoardOrder[] }[] | undefined)?.find((s) => s.tableNumber === tableN);
        if (session) setTableNames([...new Set(session.orders.filter((o) => o.status !== "CANCELED").map((o) => o.customerName))]);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [kind, tableN]);

  function applyCustomer(c: FoundCustomer) {
    setName(c.name);
    if (kind === "DELIVERY" && c.addressStreet) {
      setAddr({
        street: c.addressStreet ?? "",
        number: c.addressNumber ?? "",
        district: c.addressDistrict ?? "",
        complement: c.addressComplement ?? "",
        reference: c.addressReference ?? "",
        zip: c.addressZip ?? "",
      });
      const z = c.zoneId ? zones.find((x) => x.id === c.zoneId) : matchZone(zones, c.addressDistrict ?? "");
      setZoneId(z ? z.id : zones.length ? OTHER_ZONE : "");
    }
    setFound(null);
  }

  function addItem(item: CartItem) {
    setCart((prev) => {
      // Mesmo item simples (sem opções nem observação): soma na quantidade.
      const same = prev.find(
        (i) =>
          i.productId === item.productId &&
          i.variantId === item.variantId &&
          i.halfProductId === item.halfProductId &&
          !i.notes &&
          !item.notes &&
          i.addonIds.join() === item.addonIds.join(),
      );
      if (same) return prev.map((i) => (i === same ? { ...i, quantity: Math.min(50, i.quantity + item.quantity) } : i));
      return [...prev, item];
    });
    setErrors(({ items: _i, ...rest }) => rest);
  }

  function pick(product: MenuProduct, category: MenuCategory) {
    if (needsOptions(product, category)) {
      setModal({ product, category });
      return;
    }
    addItem({
      key: newKey(),
      productId: product.id,
      productName: product.name,
      categoryLabel: category.itemLabel ?? undefined,
      addonIds: [],
      addonNames: [],
      quantity: 1,
      unitPrice: product.price,
    });
  }

  const updateQty = (key: string, delta: number) =>
    setCart((prev) => prev.map((i) => (i.key === key ? { ...i, quantity: Math.min(50, i.quantity + delta) } : i)).filter((i) => i.quantity > 0));

  function validate() {
    const e: Record<string, string> = {};
    if (!cart.length) e.items = "Adicione pelo menos um item.";
    if (!/\p{L}/u.test(name)) e.customerName = kind === "TABLE" ? "Informe o nome de quem pediu." : "Informe o nome do cliente.";
    if (kind === "TABLE" && !tables.includes(tableN)) e.tableNumber = "Escolha uma mesa válida.";
    if (kind !== "TABLE" && phoneDigits && (phoneDigits.length < 10 || phoneDigits.length > 11)) e.customerPhone = "Telefone inválido.";
    if (kind === "DELIVERY") {
      if (addr.street.trim().length < 3) e["address.street"] = "Informe a rua.";
      if (!addr.number.trim()) e["address.number"] = "Informe o número.";
      if (zones.length && !zoneId) e["address.zoneId"] = "Escolha o bairro.";
      if ((!zones.length || zoneId === OTHER_ZONE) && addr.district.trim().length < 2) e["address.district"] = "Informe o bairro.";
      if (manualFee && manualFeeCents === null) e.deliveryFee = "Taxa inválida.";
    }
    if (kind !== "TABLE" && pay === "CASH" && changeFor && (changeCents === null || (fee !== null && changeCents < total))) {
      e.changeFor = "O troco precisa ser para um valor maior que o total.";
    }
    return e;
  }

  async function submit() {
    const e = validate();
    setErrors(e);
    setMessage(null);
    if (Object.keys(e).length) {
      setMessage("Confira os campos destacados.");
      return;
    }
    const items = cart.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      halfProductId: i.halfProductId,
      addonIds: i.addonIds,
      quantity: i.quantity,
      notes: i.notes,
    }));
    const body =
      kind === "TABLE"
        ? { type: "TABLE", tableNumber: tableN, customerName: name, notes: notes || undefined, items }
        : {
            type: kind,
            customerName: name,
            customerPhone: phone || undefined,
            paymentMethod: pay,
            changeFor: pay === "CASH" && changeCents ? changeCents : undefined,
            notes: notes || undefined,
            items,
            ...(kind === "DELIVERY" && {
              address: {
                street: addr.street,
                number: addr.number,
                district: zone ? zone.name : addr.district,
                complement: addr.complement || undefined,
                reference: addr.reference || undefined,
                zip: addr.zip.length === 8 ? addr.zip : undefined,
                zoneId: zone?.id,
              },
              deliveryFee: zone ? undefined : manualFeeCents,
            }),
          };
    setBusy(true);
    try {
      const res = await fetch("/api/admin/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error ?? "Não foi possível lançar o pedido.");
        if (data.fields) setErrors(data.fields);
        return;
      }
      const order = data.order as BoardOrder;
      setDone(order);
      // Cupom da cozinha, como num pedido aceito (se a impressão automática estiver ligada neste aparelho).
      if (getPrintOnAccept()) printDocument(`/admin/imprimir/pedido/${order.id}`);
    } catch {
      setMessage("Falha de conexão. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  function reset(keepTable: boolean) {
    setDone(null);
    setCart([]);
    setName("");
    setPhone("");
    setAddr(EMPTY_ADDR);
    setZoneId("");
    setManualFee("");
    setChangeFor("");
    setNotes("");
    setErrors({});
    setMessage(null);
    setQuery("");
    if (!keepTable) setTableNumber("");
  }

  const q = normalize(query.trim());
  const visible = useMemo(() => {
    if (q) {
      return categories
        .map((c) => ({ ...c, products: c.products.filter((p) => normalize(`${c.itemLabel ?? c.name} ${p.name}`).includes(q)) }))
        .filter((c) => c.products.length);
    }
    return categories.filter((c) => c.id === activeCat);
  }, [categories, q, activeCat]);

  const errCls = (f: string) => `input ${errors[f] ? "border-brand-500 ring-4 ring-brand-100" : ""}`;

  if (done) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-6 text-center">
        <div className="card space-y-3 p-8">
          <p className="text-5xl">✅</p>
          <h1 className="text-2xl font-extrabold">Pedido #{done.number} lançado</h1>
          <p className="text-stone-600">
            {done.type === "TABLE"
              ? `Entrou na conta da Mesa ${done.tableNumber} (${done.customerName}).`
              : done.type === "DELIVERY"
                ? "Delivery já em preparo. Escolha o motoboy no painel ao liberar a entrega."
                : "Balcão já em preparo. Clique em “Pronto” no painel quando sair."}
          </p>
          <p className="font-display text-3xl font-extrabold">{formatBRL(done.total)}</p>
          {done.type === "DELIVERY" && done.deliveryFee === null && (
            <p className="rounded-xl bg-brand-50 p-2 text-sm font-semibold text-brand-800">Taxa de entrega a definir no painel de pedidos.</p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <button onClick={() => printDocument(`/admin/imprimir/pedido/${done.id}`)} className="btn-ghost py-3">
              🖨️ Imprimir pedido
            </button>
            {done.type === "TABLE" && done.tableSessionId ? (
              <button onClick={() => printDocument(`/admin/imprimir/mesa/${done.tableSessionId}`)} className="btn-ghost py-3">
                🧾 Imprimir conta da mesa
              </button>
            ) : (
              <Link href="/admin" className="btn-ghost py-3">
                🔔 Ir para os pedidos
              </Link>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {done.type === "TABLE" && (
              <button onClick={() => reset(true)} className="btn-primary py-3">
                ➕ Mais itens na Mesa {done.tableNumber}
              </button>
            )}
            <button onClick={() => reset(false)} className={`${done.type === "TABLE" ? "btn-ghost" : "btn-primary sm:col-span-2"} py-3`}>
              Novo pedido
            </button>
          </div>
          {done.type === "TABLE" && (
            <Link href="/admin/comandas" className="block text-sm font-medium text-stone-500 underline">
              Ver comandas das mesas
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Novo pedido</h1>
          <p className="text-sm text-stone-500">Lançado pela loja: já entra aceito, em preparo. Os preços vêm do cardápio.</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {KINDS.map((k) => (
            <button
              key={k.v}
              onClick={() => {
                setKind(k.v);
                setErrors({});
              }}
              className={`rounded-2xl px-4 py-2.5 text-left transition ${kind === k.v ? "bg-ink-950 text-white shadow-lift" : "bg-white text-stone-700 shadow-card hover:bg-stone-50"}`}
              aria-pressed={kind === k.v}
            >
              <span className="block font-display font-bold">
                {k.icon} {k.label}
              </span>
              <span className={`hidden text-[11px] sm:block ${kind === k.v ? "text-white/70" : "text-stone-500"}`}>{k.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_27rem]">
        {/* ---------- Cardápio ---------- */}
        <section className="card min-w-0 space-y-3 p-4">
          <input className="input" placeholder="🔎 Procurar item (ex: calabresa, coca, x-tudo)..." value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Procurar item" />
          {!q && (
            <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCat(c.id)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${activeCat === c.id ? "bg-brand-600 text-white" : "bg-[#f4f1ec] text-stone-700 hover:bg-stone-200"}`}
                >
                  {categoryIcon(c.slug)} {c.name}
                </button>
              ))}
            </div>
          )}
          {visible.length === 0 && <p className="py-8 text-center text-stone-500">Nenhum item encontrado.</p>}
          {visible.map((c) => (
            <div key={c.id}>
              {q && <h3 className="mb-1.5 mt-2 text-xs font-bold uppercase tracking-wide text-stone-500">{c.name}</h3>}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {c.products.map((p) => {
                  const from = p.variants.length ? Math.min(...p.variants.map((v) => v.price)) : p.price;
                  return (
                    <button
                      key={p.id}
                      onClick={() => pick(p, c)}
                      className="group flex items-center gap-2 rounded-xl bg-[#faf7f2] p-2 text-left ring-1 ring-stone-200 transition hover:bg-mega-100 hover:ring-mega-300 active:scale-[0.98]"
                    >
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white text-xl" aria-hidden>
                          {categoryIcon(c.slug)}
                        </span>
                      )}
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate text-sm font-semibold">{p.name}</span>
                        <span className="text-xs text-stone-500">
                          {p.variants.length ? "a partir de " : ""}
                          {formatBRL(from)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        {/* ---------- Dados e itens do pedido ---------- */}
        <aside className="space-y-3 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
          <div className="card space-y-3 p-4">
            {kind === "TABLE" && (
              <Field id="s-table" label="Mesa" required error={errors.tableNumber}>
                <select id="s-table" className={errCls("tableNumber")} value={tableNumber} onChange={(e) => setTableNumber(e.target.value)}>
                  <option value="">Escolha a mesa</option>
                  {tables.map((n) => (
                    <option key={n} value={n}>
                      Mesa {n}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {kind !== "TABLE" && (
              <Field id="s-phone" label="WhatsApp / telefone" error={errors.customerPhone}>
                <input id="s-phone" className={errCls("customerPhone")} value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} inputMode="tel" placeholder="(11) 91234-5678 — opcional" maxLength={16} />
                {found && (
                  <button onClick={() => applyCustomer(found)} className="mt-1.5 w-full rounded-xl bg-emerald-50 px-3 py-2 text-left text-sm text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100">
                    ⭐ Cliente cadastrado: <strong>{found.name}</strong>
                    {kind === "DELIVERY" && found.addressStreet ? ` — ${found.addressStreet}, ${found.addressNumber}` : ""}
                    <span className="block text-xs font-semibold text-emerald-700">Toque para usar os dados</span>
                  </button>
                )}
              </Field>
            )}
            <Field id="s-name" label={kind === "TABLE" ? "Nome de quem pediu (separa a conta)" : "Nome do cliente"} required error={errors.customerName}>
              <input id="s-name" className={errCls("customerName")} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder={kind === "TABLE" ? "Ex: João" : "Nome"} />
              {kind === "TABLE" && tableNames.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span className="text-xs text-stone-500">Já na mesa:</span>
                  {tableNames.map((n) => (
                    <button key={n} type="button" onClick={() => setName(n)} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${name === n ? "bg-ink-950 text-white ring-ink-950" : "bg-white text-stone-700 ring-stone-300 hover:bg-stone-50"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </Field>

            {kind === "DELIVERY" && (
              <div className="space-y-3 rounded-2xl bg-[#faf7f2] p-3">
                <CepField
                  id="s-cep"
                  value={addr.zip}
                  onChange={(zip) => setAddr((a) => ({ ...a, zip }))}
                  onFound={(f) => {
                    setAddr((a) => ({ ...a, street: f.street || a.street, district: f.district || a.district }));
                    const z = matchZone(zones, f.district);
                    if (zones.length) setZoneId(z ? z.id : OTHER_ZONE);
                    setTimeout(() => document.getElementById("s-number")?.focus(), 50);
                  }}
                />
                <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                  <Field id="s-street" label="Rua" required error={errors["address.street"]}>
                    <input id="s-street" className={errCls("address.street")} value={addr.street} onChange={(e) => setAddr({ ...addr, street: e.target.value })} maxLength={120} />
                  </Field>
                  <Field id="s-number" label="Nº" required error={errors["address.number"]}>
                    <input id="s-number" className={errCls("address.number")} value={addr.number} onChange={(e) => setAddr({ ...addr, number: e.target.value })} maxLength={15} />
                  </Field>
                </div>
                {zones.length > 0 && (
                  <Field id="s-zone" label="Bairro (taxa)" required error={errors["address.zoneId"]}>
                    <select id="s-zone" className={errCls("address.zoneId")} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                      <option value="">Escolha o bairro</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name} — {formatBRL(z.fee)}
                        </option>
                      ))}
                      <option value={OTHER_ZONE}>Outro bairro (digitar)</option>
                    </select>
                  </Field>
                )}
                {(!zones.length || zoneId === OTHER_ZONE) && (
                  <div className="grid grid-cols-[1fr_7rem] gap-2">
                    <Field id="s-district" label="Bairro" required error={errors["address.district"]}>
                      <input id="s-district" className={errCls("address.district")} value={addr.district} onChange={(e) => setAddr({ ...addr, district: e.target.value })} maxLength={80} />
                    </Field>
                    <Field id="s-fee" label="Taxa R$" error={errors.deliveryFee}>
                      <input id="s-fee" className={errCls("deliveryFee")} value={manualFee} onChange={(e) => setManualFee(e.target.value)} inputMode="decimal" placeholder="a definir" maxLength={7} />
                    </Field>
                  </div>
                )}
                <Field id="s-compl" label="Complemento">
                  <input id="s-compl" className="input" value={addr.complement} onChange={(e) => setAddr({ ...addr, complement: e.target.value })} maxLength={80} placeholder="Apto, bloco, casa 2..." />
                </Field>
                <Field id="s-ref" label="Ponto de referência">
                  <input id="s-ref" className="input" value={addr.reference} onChange={(e) => setAddr({ ...addr, reference: e.target.value })} maxLength={120} placeholder="Perto de..." />
                </Field>
              </div>
            )}
          </div>

          <div className="card space-y-3 p-4">
            <h2 className="font-display font-bold">Itens</h2>
            {errors.items && <p className="text-sm font-medium text-brand-700">{errors.items}</p>}
            {cart.length === 0 && <p className="py-3 text-center text-sm text-stone-400">Toque nos itens do cardápio para adicionar.</p>}
            <ul className="divide-y divide-stone-100">
              {cart.map((i) => (
                <li key={i.key} className="flex items-center gap-2 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-tight">{itemTitle(i)}</p>
                    <p className="text-xs text-stone-500">
                      {[i.variantName, i.addonNames.length ? `+ ${i.addonNames.join(", ")}` : "", i.notes ? `Obs: ${i.notes}` : ""].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex items-center rounded-lg bg-stone-100">
                    <button onClick={() => updateQty(i.key, -1)} className="h-8 w-8 font-bold text-brand-600" aria-label="Diminuir">
                      −
                    </button>
                    <span className="w-6 text-center font-bold">{i.quantity}</span>
                    <button onClick={() => updateQty(i.key, 1)} className="h-8 w-8 font-bold text-brand-600" aria-label="Aumentar">
                      +
                    </button>
                  </div>
                  <span className="w-20 text-right font-semibold">{formatBRL(i.unitPrice * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <Field id="s-notes" label="Observação do pedido">
              <input id="s-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={280} placeholder="Opcional" />
            </Field>

            {kind !== "TABLE" && (
              <div>
                <p className="mb-1 text-xs font-semibold text-stone-600">Pagamento</p>
                <div className="grid grid-cols-3 gap-2">
                  {PAYS.map((p) => (
                    <button key={p.v} onClick={() => setPay(p.v)} className={`chip text-center text-sm font-bold ${pay === p.v ? "chip-on" : "chip-off"}`} aria-pressed={pay === p.v}>
                      {p.label}
                    </button>
                  ))}
                </div>
                {pay === "CASH" && (
                  <Field id="s-change" label="Troco para (R$)" error={errors.changeFor}>
                    <input id="s-change" className={errCls("changeFor")} value={changeFor} onChange={(e) => setChangeFor(e.target.value)} inputMode="decimal" placeholder="Sem troco" maxLength={9} />
                    {changeCents !== null && changeCents >= total && fee !== null && (
                      <p className="mt-1 text-xs font-semibold text-emerald-700">Levar troco de {formatBRL(changeCents - total)}</p>
                    )}
                  </Field>
                )}
              </div>
            )}

            <div className="space-y-1 border-t border-stone-100 pt-3 text-sm">
              <p className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatBRL(subtotal)}</span>
              </p>
              {kind === "DELIVERY" && (
                <p className="flex justify-between">
                  <span>Taxa de entrega</span>
                  <span>{fee === null ? "a definir" : formatBRL(fee)}</span>
                </p>
              )}
              <p className="flex justify-between font-display text-xl font-extrabold">
                <span>Total</span>
                <span>{formatBRL(total)}</span>
              </p>
            </div>
            {message && (
              <p className="rounded-xl bg-brand-50 p-3 text-sm font-medium text-brand-800" role="alert">
                {message}
              </p>
            )}
            <button onClick={submit} disabled={busy} className="btn-primary w-full py-3.5 text-base">
              {busy ? "Lançando..." : kind === "TABLE" ? `Lançar na mesa ${tableNumber || ""}` : `Lançar pedido ${kind === "DELIVERY" ? "delivery" : "balcão"}`}
            </button>
          </div>
        </aside>
      </div>

      {modal && (
        <ProductModal
          product={modal.product}
          category={modal.category}
          onAdd={(item) => {
            addItem(item);
            setModal(null);
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { CartItem, CustomerProfile, DeliveryZoneOption, MenuCategory, MenuProduct, OrderMode, PublicSettings } from "@/types/menu";
import { formatBRL } from "@/lib/money";
import { ORDER_TYPE_LABEL } from "@/lib/labels";
import { buildWhatsAppUrl, formatPhone } from "@/lib/whatsapp";
import { Logo } from "@/components/brand/Logo";
import { categoryIcon } from "@/components/brand/categoryIcon";
import { ModeSelector } from "./ModeSelector";
import { ProductModal } from "./ProductModal";
import { CartDrawer, LAST_ORDER_KEY } from "./CartDrawer";
import { AccountSheet } from "./AccountSheet";
import { ChristmasBanner, SnowLayer } from "./Christmas";

const CART_KEY = "orderflow:cart:v1";

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const MODE_ICON: Record<OrderMode["type"], string> = { DELIVERY: "🛵", PICKUP: "🏪", TABLE: "🍽️" };

type Props = {
  categories: MenuCategory[];
  settings: PublicSettings;
  /** Mesa vinda do QR Code (já validada no servidor). */
  initialTable: { number: number; token: string } | null;
  tableQrInvalid: boolean;
  zones: DeliveryZoneOption[];
  /** Cliente logado neste aparelho (cookie), ou null. */
  initialCustomer: CustomerProfile | null;
};

export function MenuApp({ categories, settings, initialTable, tableQrInvalid, zones, initialCustomer }: Props) {
  const [mode, setMode] = useState<OrderMode | null>(
    initialTable ? { type: "TABLE", tableNumber: initialTable.number, tableToken: initialTable.token } : null,
  );
  const [modeOpen, setModeOpen] = useState(!initialTable);
  // Mesa lida pelo QR Code fica travada: só a loja troca a mesa (pelo portal).
  const tableLocked = mode?.type === "TABLE";
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState(categories[0]?.id);
  const [selected, setSelected] = useState<MenuProduct | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState<{ number: number; token: string } | null>(null);
  const [justAdded, setJustAdded] = useState(false);
  const [customer, setCustomer] = useState<CustomerProfile | null>(initialCustomer);
  const [account, setAccount] = useState<{ tab: "login" | "register"; prefill?: { name?: string; phone?: string } } | null>(null);

  async function logoutCustomer() {
    await fetch("/api/customers/logout", { method: "POST" }).catch(() => {});
    setCustomer(null);
  }
  const loaded = useRef(false);
  const chipsRef = useRef<HTMLElement>(null);
  const scrollingTo = useRef<string | null>(null);

  // Carrinho persistido no navegador (somente conveniência; o servidor recalcula tudo).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (raw) setCart(JSON.parse(raw) as CartItem[]);
      const last = JSON.parse(localStorage.getItem(LAST_ORDER_KEY) ?? "null");
      if (last && typeof last.number === "number" && /^[A-Za-z0-9_-]{32}$/.test(last.token)) setLastOrder(last);
    } catch {
      /* armazenamento indisponível */
    }
    loaded.current = true;
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      /* ignore */
    }
  }, [cart]);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return categories;
    return categories
      .map((c) => ({
        ...c,
        products: c.products.filter((p) => normalize(`${p.name} ${p.description ?? ""} ${c.name}`).includes(q)),
      }))
      .filter((c) => c.products.length > 0);
  }, [categories, query]);

  // Destaca a categoria visível enquanto o cliente rola o cardápio.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (scrollingTo.current) return;
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveCat(visible[0].target.id.replace("cat-", ""));
      },
      { rootMargin: "-140px 0px -60% 0px" },
    );
    filtered.forEach((c) => {
      const el = document.getElementById(`cat-${c.id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [filtered]);

  // Mantém o chip ativo visível na faixa de categorias.
  useEffect(() => {
    const chip = chipsRef.current?.querySelector<HTMLElement>(`[data-cat="${activeCat}"]`);
    chip?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeCat]);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  function scrollToCategory(id: string) {
    setActiveCat(id);
    scrollingTo.current = id;
    document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setTimeout(() => (scrollingTo.current = null), 800);
  }

  function addToCart(item: CartItem) {
    setCart((prev) => [...prev, item]);
    setSelected(null);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 600);
  }

  const modeLabel = mode ? (mode.type === "TABLE" ? `Mesa ${mode.tableNumber}` : ORDER_TYPE_LABEL[mode.type]) : null;

  return (
    <div className="min-h-screen pb-32">
      <ChristmasBanner />
      {/* ---------- Topo com a marca ---------- */}
      <header className="relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 text-white">
        <div className="bg-dots absolute inset-0" aria-hidden />
        <SnowLayer />
        <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-mega-400/30 blur-3xl" aria-hidden />
        <div className="absolute -bottom-24 -left-16 h-60 w-60 rounded-full bg-mega-300/20 blur-3xl" aria-hidden />

        <div className="relative mx-auto max-w-3xl px-4 pb-12 pt-6 sm:pt-10">
          {!tableLocked && (
            <div className="mb-4 flex justify-end">
              {customer ? (
                <div className="flex items-center gap-2 rounded-full bg-white/15 py-1 pl-1 pr-3 text-sm backdrop-blur">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-mega-400 font-display font-bold text-ink-900">
                    {customer.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="font-semibold">Olá, {customer.name.split(" ")[0]}!</span>
                  <button onClick={logoutCustomer} className="ml-1 text-xs text-white/70 underline hover:text-white">
                    Sair
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAccount({ tab: "login" })}
                  className="flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-semibold backdrop-blur transition hover:bg-white/25"
                >
                  👤 Entrar / Cadastrar
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-4 sm:gap-6">
            <Logo size={96} className="shadow-lift ring-4 ring-white/90" />
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium backdrop-blur">
                <span className="relative flex h-2 w-2">
                  {settings.isOpen && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-300 opacity-75" />
                  )}
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${settings.isOpen ? "bg-green-400" : "bg-red-300"}`} />
                </span>
                {settings.isOpen ? "Aberto agora" : "Fechado no momento"}
              </span>
              <h1 className="mt-2 text-3xl font-extrabold leading-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)] sm:text-4xl">{settings.storeName}</h1>
              <p className="mt-1.5 text-sm text-white/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)] sm:text-base">Esfihas, pizzas, lanches e mais 🔥</p>
            </div>
          </div>

          <button
            onClick={() => !tableLocked && setModeOpen(true)}
            disabled={tableLocked}
            className="mt-6 flex w-full items-center justify-between rounded-2xl bg-white/10 px-4 py-3 text-left ring-1 ring-white/20 backdrop-blur transition enabled:hover:bg-white/15"
          >
            <span className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-mega-400 text-xl text-ink-900">
                {mode ? MODE_ICON[mode.type] : "📍"}
              </span>
              <span>
                <span className="block text-xs text-white/70">{tableLocked ? "Você está pedindo na" : "Como você quer pedir?"}</span>
                <span className="block font-semibold">{modeLabel ?? "Escolher: delivery ou retirada"}</span>
              </span>
            </span>
            {tableLocked ? (
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white/90">🔒 via QR Code</span>
            ) : (
              <span className="text-sm font-medium text-mega-300">Alterar</span>
            )}
          </button>
        </div>
      </header>

      {/* ---------- Busca + categorias (fixas ao rolar) ---------- */}
      <div className="sticky top-0 z-20 -mt-6 rounded-t-3xl bg-[#faf7f2]/95 pt-4 shadow-[0_-8px_24px_-12px_rgb(0_0_0/0.25)] backdrop-blur">
        <div className="mx-auto max-w-3xl">
          {lastOrder && (
            <Link
              href={`/pedido/${lastOrder.token}`}
              className="mx-4 mb-3 flex items-center justify-between rounded-2xl bg-mega-100 px-4 py-2.5 text-sm font-semibold text-ink-900 ring-1 ring-mega-300"
            >
              <span>📦 Acompanhar meu pedido #{lastOrder.number}</span>
              <span aria-hidden>→</span>
            </Link>
          )}
          <div className="relative px-4">
            <svg className="pointer-events-none absolute left-8 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="O que você quer comer hoje?"
              className="input rounded-2xl py-3 pl-11 text-base shadow-card"
              maxLength={60}
              aria-label="Buscar no cardápio"
            />
          </div>
          <nav ref={chipsRef} className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
            {filtered.map((c) => (
              <button
                key={c.id}
                data-cat={c.id}
                onClick={() => scrollToCategory(c.id)}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                  activeCat === c.id
                    ? "bg-brand-600 text-white shadow-glow"
                    : "bg-white text-stone-700 ring-1 ring-stone-200 hover:ring-stone-300"
                }`}
              >
                <span aria-hidden>{categoryIcon(c.slug)}</span>
                {c.name}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {tableQrInvalid && (
        <div className="mx-auto mt-2 max-w-3xl px-4">
          <div className="rounded-2xl bg-brand-50 p-4 text-sm font-medium text-brand-800 ring-1 ring-brand-200">
            ⚠️ Este QR Code de mesa não é válido ou foi substituído. Leia novamente o QR Code da sua mesa ou chame um atendente.
          </div>
        </div>
      )}

      {!settings.isOpen && (
        <div className="mx-auto mt-2 max-w-3xl px-4">
          <div className="rounded-2xl bg-ink-900 p-4 text-center text-sm font-medium text-white">
            😴 Estamos fechados agora. Você pode olhar o cardápio, e logo voltamos a receber pedidos!
          </div>
        </div>
      )}

      {/* ---------- Cardápio ---------- */}
      <main className="mx-auto max-w-3xl space-y-10 px-4 pt-4">
        {filtered.length === 0 && (
          <div className="py-16 text-center">
            <p className="text-4xl">🔍</p>
            <p className="mt-2 font-semibold">Nenhum item encontrado</p>
            <p className="text-sm text-stone-500">Tente buscar por outro nome.</p>
          </div>
        )}
        {filtered.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-40">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-mega-400 text-2xl shadow-card" aria-hidden>
                {categoryIcon(c.slug)}
              </span>
              <div>
                <h2 className="text-xl font-bold leading-tight sm:text-2xl">{c.name}</h2>
                <p className="text-xs text-stone-500">
                  {c.products.length} {c.products.length === 1 ? "opção" : "opções"}
                  {c.allowsHalf && " · pode ser meio a meio"}
                </p>
              </div>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {c.products.map((p) => (
                <li key={p.id}>
                  <ProductCard product={p} icon={categoryIcon(c.slug)} disabled={!settings.isOpen} onClick={() => setSelected(p)} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>

      {/* ---------- Rodapé ---------- */}
      <footer className="mx-auto mt-16 max-w-3xl px-4">
        <div className="card flex flex-col items-center gap-3 p-6 text-center">
          <Logo size={64} className="shadow-card" />
          <p className="font-display text-lg font-bold">{settings.storeName}</p>
          {settings.whatsappNumber && (
            <a
              href={buildWhatsAppUrl(settings.whatsappNumber, "Olá! Vim pelo cardápio online 😊")}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-whatsapp py-2.5 text-sm"
            >
              💬 WhatsApp {formatPhone(settings.whatsappNumber)}
            </a>
          )}
        </div>
      </footer>

      {/* ---------- Barra do carrinho ---------- */}
      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            onClick={() => setCartOpen(true)}
            className={`mx-auto flex w-full max-w-3xl animate-slide-up items-center justify-between gap-3 rounded-2xl bg-ink-900 px-4 py-3.5 text-white shadow-lift transition hover:bg-black ${
              justAdded ? "scale-[1.02]" : ""
            }`}
          >
            <span className="flex items-center gap-3">
              <span className="grid h-9 min-w-9 place-items-center rounded-xl bg-brand-600 px-2 font-display font-bold">
                {cartCount}
              </span>
              <span className="font-semibold">Ver carrinho</span>
            </span>
            <span className="font-display text-lg font-bold">{formatBRL(cartTotal)}</span>
          </button>
        </div>
      )}

      {account && (
        <AccountSheet
          initialTab={account.tab}
          zones={zones}
          prefill={account.prefill}
          onClose={() => setAccount(null)}
          onDone={(c) => {
            setCustomer(c);
            setAccount(null);
          }}
        />
      )}

      {modeOpen && !tableLocked && (
        <ModeSelector
          current={mode}
          storeName={settings.storeName}
          customerName={customer?.name.split(" ")[0] ?? null}
          onAccount={(tab) => setAccount({ tab })}
          onSelect={(m) => {
            setMode(m);
            setModeOpen(false);
          }}
          onClose={mode ? () => setModeOpen(false) : undefined}
        />
      )}

      {selected && (
        <ProductModal
          product={selected}
          category={categoryById.get(selected.categoryId)!}
          onAdd={addToCart}
          onClose={() => setSelected(null)}
        />
      )}

      {cartOpen && (
        <CartDrawer
          cart={cart}
          setCart={setCart}
          mode={mode}
          onChangeMode={tableLocked ? undefined : () => setModeOpen(true)}
          settings={settings}
          zones={zones}
          customer={tableLocked ? null : customer}
          onAccount={(tab, prefill) => setAccount({ tab, prefill })}
          onLogout={logoutCustomer}
          onClose={() => setCartOpen(false)}
          onOrderPlaced={setLastOrder}
        />
      )}
    </div>
  );
}

function ProductCard({
  product,
  icon,
  disabled,
  onClick,
}: {
  product: MenuProduct;
  icon: string;
  disabled: boolean;
  onClick: () => void;
}) {
  const minVariant = product.variants.length ? Math.min(...product.variants.map((v) => v.price)) : null;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group card flex h-full w-full items-center gap-3.5 p-3 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-lift disabled:pointer-events-none disabled:opacity-60 sm:p-4"
    >
      <span
        className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-mega-100 to-mega-300 text-3xl transition group-hover:scale-105"
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-[1.05rem] font-semibold leading-snug">{product.name}</h3>
        {product.description && <p className="line-clamp-2 text-[13px] leading-snug text-stone-500">{product.description}</p>}
        <p className="mt-1">
          {minVariant !== null && <span className="text-xs text-stone-500">a partir de </span>}
          <span className="font-display text-lg font-bold text-brand-700">{formatBRL(minVariant ?? product.price)}</span>
        </p>
      </div>
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-600 text-2xl font-bold leading-none text-white shadow-glow transition group-hover:scale-110"
        aria-hidden
      >
        +
      </span>
    </button>
  );
}

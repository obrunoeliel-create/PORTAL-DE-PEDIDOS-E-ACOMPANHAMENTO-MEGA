"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CartItem, MenuCategory, MenuProduct, OrderMode, PublicSettings } from "@/types/menu";
import { formatBRL } from "@/lib/money";
import { ORDER_TYPE_LABEL } from "@/lib/labels";
import { ModeSelector } from "./ModeSelector";
import { ProductModal } from "./ProductModal";
import Link from "next/link";
import { CartDrawer, LAST_ORDER_KEY } from "./CartDrawer";

const CART_KEY = "orderflow:cart:v1";

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

type Props = { categories: MenuCategory[]; settings: PublicSettings; initialTable: number | null };

export function MenuApp({ categories, settings, initialTable }: Props) {
  const [mode, setMode] = useState<OrderMode | null>(
    initialTable ? { type: "TABLE", tableNumber: initialTable } : null,
  );
  const [modeOpen, setModeOpen] = useState(!initialTable);
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState(categories[0]?.id);
  const [selected, setSelected] = useState<MenuProduct | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState<{ number: number; token: string } | null>(null);
  const loaded = useRef(false);

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

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);
  const cartTotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  function scrollToCategory(id: string) {
    setActiveCat(id);
    document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function addToCart(item: CartItem) {
    setCart((prev) => [...prev, item]);
    setSelected(null);
  }

  const modeLabel = mode
    ? mode.type === "TABLE"
      ? `Mesa ${mode.tableNumber}`
      : ORDER_TYPE_LABEL[mode.type]
    : "Escolher modalidade";

  return (
    <div className="mx-auto min-h-screen max-w-3xl pb-28">
      <header className="bg-brand-600 px-4 pb-4 pt-6 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold leading-tight">{settings.storeName}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-brand-100">
              <span className={`h-2 w-2 rounded-full ${settings.isOpen ? "bg-green-300" : "bg-red-300"}`} />
              {settings.isOpen ? "Aberto agora" : "Fechado no momento"}
            </p>
          </div>
          <button
            onClick={() => setModeOpen(true)}
            className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium backdrop-blur hover:bg-white/25"
          >
            {modeLabel} ▾
          </button>
        </div>
      </header>

      {lastOrder && (
        <Link
          href={`/pedido/${lastOrder.token}`}
          className="flex items-center justify-between bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-700"
        >
          <span>📦 Acompanhar meu pedido #{lastOrder.number}</span>
          <span aria-hidden>→</span>
        </Link>
      )}

      <div className="sticky top-0 z-20 border-b border-stone-200 bg-stone-50/95 backdrop-blur">
        <div className="px-4 pt-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar no cardápio..."
            className="input"
            maxLength={60}
            aria-label="Buscar no cardápio"
          />
        </div>
        <nav className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => scrollToCategory(c.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${
                activeCat === c.id ? "bg-brand-600 text-white" : "bg-white text-stone-700 ring-1 ring-stone-200"
              }`}
            >
              {c.name}
            </button>
          ))}
        </nav>
      </div>

      <main className="space-y-8 px-4 pt-4">
        {filtered.length === 0 && <p className="py-12 text-center text-stone-500">Nenhum item encontrado.</p>}
        {filtered.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-32">
            <h2 className="mb-3 text-lg font-bold">{c.name}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {c.products.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => setSelected(p)}
                    disabled={!settings.isOpen}
                    className="flex h-full w-full flex-col rounded-xl bg-white p-4 text-left shadow-sm ring-1 ring-stone-200 transition hover:ring-brand-400 disabled:opacity-60"
                  >
                    <span className="font-semibold">{p.name}</span>
                    {p.description && <span className="mt-0.5 text-sm text-stone-500">{p.description}</span>}
                    <span className="mt-auto pt-2 text-sm font-semibold text-brand-700">
                      {p.variants.length > 0
                        ? p.variants.map((v) => `${v.name} ${formatBRL(v.price)}`).join(" · ")
                        : formatBRL(p.price)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>

      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 p-4">
          <button
            onClick={() => setCartOpen(true)}
            className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-xl bg-brand-600 px-5 py-4 font-semibold text-white shadow-lg hover:bg-brand-700"
          >
            <span>Ver carrinho · {cartCount} {cartCount === 1 ? "item" : "itens"}</span>
            <span>{formatBRL(cartTotal)}</span>
          </button>
        </div>
      )}

      {modeOpen && (
        <ModeSelector
          current={mode}
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
          onChangeMode={() => setModeOpen(true)}
          settings={settings}
          onClose={() => setCartOpen(false)}
          onOrderPlaced={setLastOrder}
        />
      )}
    </div>
  );
}

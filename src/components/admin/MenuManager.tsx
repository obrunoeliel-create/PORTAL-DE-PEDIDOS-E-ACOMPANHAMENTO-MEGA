"use client";

import { useMemo, useState } from "react";
import { formatBRL, parseBRL } from "@/lib/money";

type Variant = { id: string; name: string; price: number };
type Product = {
  id: string;
  name: string;
  price: number;
  active: boolean;
  variants: Variant[];
};
type Category = { id: string; name: string; products: Product[] };

const DOT_DECIMAL = /^\s*(R\$\s*)?\d+\.\d{1,2}\s*$/;
const toInput = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
/** Aceita "4,50" e também "4.50" (ponto como vírgula) — evita virar R$ 450,00 por engano. */
const parsePrice = (s: string) => parseBRL(DOT_DECIMAL.test(s) ? s.replace(".", ",") : s);
const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function MenuManager({ categories, canEditPrices }: { categories: Category[]; canEditPrices: boolean }) {
  const [state, setState] = useState(categories);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function updateProduct(productId: string, patch: Partial<Product>) {
    setState((prev) =>
      prev.map((c) => ({ ...c, products: c.products.map((p) => (p.id === productId ? { ...p, ...patch } : p)) })),
    );
  }

  async function send(product: Product, body: unknown): Promise<Product | null> {
    const res = await fetch(`/api/admin/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Não foi possível alterar "${product.name}".`);
    return data.product ?? null;
  }

  async function toggle(product: Product) {
    const next = !product.active;
    setBusy(product.id);
    setMsg(null);
    updateProduct(product.id, { active: next }); // otimista
    try {
      await send(product, { active: next });
    } catch (e) {
      updateProduct(product.id, { active: !next });
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function savePrices(product: Product, body: { price?: number; variants?: { id: string; price: number }[] }) {
    setBusy(product.id);
    setMsg(null);
    try {
      const updated = await send(product, body);
      if (updated) updateProduct(product.id, { price: updated.price, variants: updated.variants });
      setEditing(null);
      setMsg({ ok: true, text: `Preço de "${product.name}" atualizado. Já vale no cardápio dos clientes.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const q = normalize(query.trim());
  const shown = useMemo(
    () =>
      state
        .map((c) => ({ ...c, products: q ? c.products.filter((p) => normalize(`${c.name} ${p.name}`).includes(q)) : c.products }))
        .filter((c) => !q || c.products.length > 0),
    [state, q],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Gestão de Cardápio</h1>
          <p className="text-sm text-stone-500">
            Itens desativados somem do cardápio do cliente na hora.
            {canEditPrices ? " Toque no preço para alterar." : " Só o gerente altera preços."}
          </p>
        </div>
        <input
          className="input max-w-xs"
          placeholder="🔎 Procurar item..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Procurar item do cardápio"
        />
      </div>
      {msg && (
        <p
          className={`rounded-2xl p-3 text-sm font-medium ring-1 ${msg.ok ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-brand-50 text-brand-800 ring-brand-200"}`}
          role="status"
        >
          {msg.text}
        </p>
      )}
      {shown.length === 0 && <p className="text-stone-500">Nenhum item encontrado.</p>}
      {shown.map((c) => (
        <section key={c.id} className="card overflow-hidden">
          <h2 className="border-b border-stone-100 bg-[#faf7f2] px-4 py-3 font-display text-lg font-bold">{c.name}</h2>
          <ul className="divide-y divide-stone-100">
            {c.products.map((p) => (
              <li key={p.id} className="px-4 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className={`min-w-0 ${p.active ? "" : "text-stone-400 line-through"}`}>
                    <span className="font-medium">{p.name}</span>
                    {canEditPrices && editing !== p.id ? (
                      <button
                        onClick={() => setEditing(p.id)}
                        className="ml-2 rounded-lg px-1.5 py-0.5 text-stone-600 no-underline ring-1 ring-stone-200 transition hover:bg-mega-100 hover:ring-mega-300"
                        title="Alterar preço"
                      >
                        {p.variants.length ? p.variants.map((v) => `${v.name} ${formatBRL(v.price)}`).join(" · ") : formatBRL(p.price)} ✏️
                      </button>
                    ) : (
                      editing !== p.id && (
                        <span className="ml-2 text-stone-500">
                          {p.variants.length ? p.variants.map((v) => `${v.name} ${formatBRL(v.price)}`).join(" · ") : formatBRL(p.price)}
                        </span>
                      )
                    )}
                  </span>
                  <button
                    role="switch"
                    aria-checked={p.active}
                    aria-label={`${p.active ? "Desativar" : "Ativar"} ${p.name}`}
                    disabled={busy === p.id}
                    onClick={() => toggle(p)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition ${p.active ? "bg-emerald-500" : "bg-stone-300"}`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${p.active ? "left-[22px]" : "left-0.5"}`}
                    />
                  </button>
                </div>
                {editing === p.id && (
                  <PriceEditor product={p} busy={busy === p.id} onCancel={() => setEditing(null)} onSave={(body) => savePrices(p, body)} />
                )}
              </li>
            ))}
            {c.products.length === 0 && <li className="px-4 py-3 text-sm text-stone-500">Nenhum item cadastrado.</li>}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Preço do item (ou de cada tamanho, ex: Broto / Grande). */
function PriceEditor({
  product,
  busy,
  onSave,
  onCancel,
}: {
  product: Product;
  busy: boolean;
  onSave: (body: { price?: number; variants?: { id: string; price: number }[] }) => void;
  onCancel: () => void;
}) {
  const hasVariants = product.variants.length > 0;
  const [single, setSingle] = useState(toInput(product.price));
  const [byVariant, setByVariant] = useState<Record<string, string>>(
    Object.fromEntries(product.variants.map((v) => [v.id, toInput(v.price)])),
  );

  const parsedVariants = product.variants.map((v) => ({ id: v.id, price: parsePrice(byVariant[v.id] ?? "") }));
  const singleCents = parsePrice(single);
  const valid = hasVariants
    ? parsedVariants.every((v) => v.price !== null && v.price > 0 && v.price <= 100_000)
    : singleCents !== null && singleCents > 0 && singleCents <= 100_000;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSave(hasVariants ? { variants: parsedVariants.map((v) => ({ id: v.id, price: v.price as number })) } : { price: singleCents as number });
      }}
      className="mt-2 flex flex-wrap items-end gap-2 rounded-xl bg-mega-100/60 p-3 ring-1 ring-mega-300"
    >
      {hasVariants ? (
        product.variants.map((v) => (
          <label key={v.id} className="text-xs font-semibold text-stone-700">
            {v.name}
            <span className="mt-1 flex items-center gap-1">
              R$
              <input
                className="input w-24 py-1.5 text-right"
                value={byVariant[v.id] ?? ""}
                onChange={(e) => setByVariant((prev) => ({ ...prev, [v.id]: e.target.value }))}
                inputMode="decimal"
                maxLength={8}
                aria-label={`Preço ${v.name}`}
              />
            </span>
          </label>
        ))
      ) : (
        <label className="text-xs font-semibold text-stone-700">
          Preço
          <span className="mt-1 flex items-center gap-1">
            R$
            <input
              className="input w-24 py-1.5 text-right"
              value={single}
              onChange={(e) => setSingle(e.target.value)}
              inputMode="decimal"
              maxLength={8}
              autoFocus
              aria-label="Preço"
            />
          </span>
        </label>
      )}
      <button type="submit" disabled={!valid || busy} className="btn-primary px-4 py-2 text-xs">
        {busy ? "Salvando..." : "Salvar preço"}
      </button>
      <button type="button" onClick={onCancel} className="px-2 py-2 text-xs font-medium text-stone-500 underline">
        Cancelar
      </button>
      {!valid && <p className="w-full text-xs font-medium text-brand-700">Informe um preço válido (ex: 4,50).</p>}
    </form>
  );
}

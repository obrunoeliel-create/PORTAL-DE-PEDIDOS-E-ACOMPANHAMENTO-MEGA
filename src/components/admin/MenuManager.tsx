"use client";

import { useState } from "react";
import { formatBRL } from "@/lib/money";

type Product = {
  id: string;
  name: string;
  price: number;
  active: boolean;
  variants: { name: string; price: number }[];
};
type Category = { id: string; name: string; products: Product[] };

export function MenuManager({ categories }: { categories: Category[] }) {
  const [state, setState] = useState(categories);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setActive(productId: string, active: boolean) {
    setState((prev) =>
      prev.map((c) => ({ ...c, products: c.products.map((p) => (p.id === productId ? { ...p, active } : p)) })),
    );
  }

  async function toggle(product: Product) {
    const next = !product.active;
    setBusy(product.id);
    setError(null);
    setActive(product.id, next); // otimista
    try {
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setActive(product.id, !next);
      setError(`Não foi possível alterar "${product.name}".`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold sm:text-3xl">Gestão de Cardápio</h1>
        <p className="text-sm text-stone-500">Itens desativados somem do cardápio do cliente imediatamente.</p>
      </div>
      {error && (
        <p className="rounded-2xl bg-brand-50 p-3 text-sm font-medium text-brand-800" role="alert">
          {error}
        </p>
      )}
      {state.map((c) => (
        <section key={c.id} className="card overflow-hidden">
          <h2 className="border-b border-stone-100 bg-[#faf7f2] px-4 py-3 font-display text-lg font-bold">{c.name}</h2>
          <ul className="divide-y divide-stone-100">
            {c.products.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className={p.active ? "" : "text-stone-400 line-through"}>
                  {p.name}
                  <span className="ml-2 text-stone-500 no-underline">
                    {p.variants.length
                      ? p.variants.map((v) => `${v.name} ${formatBRL(v.price)}`).join(" · ")
                      : formatBRL(p.price)}
                  </span>
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
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      p.active ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              </li>
            ))}
            {c.products.length === 0 && <li className="px-4 py-3 text-sm text-stone-500">Nenhum item cadastrado.</li>}
          </ul>
        </section>
      ))}
    </div>
  );
}

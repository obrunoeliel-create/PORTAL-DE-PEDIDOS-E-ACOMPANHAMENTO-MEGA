"use client";

import { useMemo, useState } from "react";
import type { CartItem, MenuCategory, MenuProduct } from "@/types/menu";
import { calcUnitPrice } from "@/lib/pricing-core";
import { formatBRL } from "@/lib/money";
import { categoryIcon } from "@/components/brand/categoryIcon";

type Props = {
  product: MenuProduct;
  category: MenuCategory;
  onAdd: (item: CartItem) => void;
  onClose: () => void;
};

const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function ProductModal({ product, category, onAdd, onClose }: Props) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id);
  const [halfId, setHalfId] = useState("");
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  const variant = product.variants.find((v) => v.id === variantId) ?? null;

  // Sabores elegíveis para 1/2 a 1/2: mesma categoria e com o mesmo tamanho disponível.
  const halfOptions = useMemo(
    () =>
      category.allowsHalf
        ? category.products.filter(
            (p) => p.id !== product.id && (!variant || p.variants.some((v) => v.name === variant.name)),
          )
        : [],
    [category, product.id, variant],
  );
  const halfProduct = halfOptions.find((p) => p.id === halfId) ?? null;
  const addons = category.addons.filter((a) => addonIds.includes(a.id));

  const unitPrice = calcUnitPrice({ product, variantName: variant?.name, halfProduct, addons });

  function toggleAddon(id: string) {
    setAddonIds((prev) => (prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]));
  }

  function submit() {
    if (unitPrice === null) return;
    onAdd({
      key: newKey(),
      productId: product.id,
      productName: product.name,
      variantId: variant?.id,
      variantName: variant?.name,
      halfProductId: halfProduct?.id,
      halfProductName: halfProduct?.name,
      categoryLabel: category.itemLabel ?? undefined,
      addonIds,
      addonNames: addons.map((a) => a.name),
      quantity,
      notes: notes.trim() || undefined,
      unitPrice,
    });
  }

  return (
    <div className="overlay" role="dialog" aria-modal onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet flex max-h-[92vh] w-full max-w-lg flex-col">
        <div className="mx-auto mt-2.5 h-1.5 w-12 rounded-full bg-stone-200 sm:hidden" aria-hidden />
        <div className="flex items-start gap-4 p-5">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-mega-100 to-mega-300 text-4xl" aria-hidden>
            {categoryIcon(category.slug)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{category.name}</p>
            <h2 className="text-2xl font-extrabold leading-tight">{product.name}</h2>
            {product.description && <p className="mt-1 text-sm text-stone-500">{product.description}</p>}
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-stone-100 text-xl leading-none text-stone-500 hover:bg-stone-200"
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 pb-5">
          {product.variants.length > 0 && (
            <Section title="Escolha o tamanho" required>
              <div className="grid grid-cols-2 gap-2">
                {product.variants.map((v) => (
                  <label key={v.id} className={`chip ${variantId === v.id ? "chip-on" : "chip-off"}`}>
                    <input
                      type="radio"
                      name="variant"
                      className="sr-only"
                      checked={variantId === v.id}
                      onChange={() => {
                        setVariantId(v.id);
                        setHalfId("");
                      }}
                    />
                    <span className="block font-display font-bold">{v.name}</span>
                    <span className="text-stone-500">{formatBRL(v.price)}</span>
                  </label>
                ))}
              </div>
            </Section>
          )}

          {halfOptions.length > 0 && (
            <Section title="Quer meio a meio?" hint="Cobramos o sabor de maior valor">
              <select value={halfId} onChange={(e) => setHalfId(e.target.value)} className="input" aria-label="Segundo sabor">
                <option value="">Não, sabor inteiro de {product.name}</option>
                {halfOptions.map((p) => {
                  const price = variant ? p.variants.find((v) => v.name === variant.name)?.price : p.price;
                  return (
                    <option key={p.id} value={p.id}>
                      ½ {product.name} + ½ {p.name} {price !== undefined ? `(${formatBRL(price)})` : ""}
                    </option>
                  );
                })}
              </select>
            </Section>
          )}

          {category.addons.length > 0 && (
            <Section title="Turbine seu pedido" hint="Opcional">
              <div className="space-y-2">
                {category.addons.map((a) => {
                  const on = addonIds.includes(a.id);
                  return (
                    <label key={a.id} className={`chip flex items-center justify-between ${on ? "chip-on" : "chip-off"}`}>
                      <span className="flex items-center gap-3">
                        <span
                          className={`grid h-5 w-5 place-items-center rounded-md border-2 text-xs text-white transition ${
                            on ? "border-brand-600 bg-brand-600" : "border-stone-300"
                          }`}
                          aria-hidden
                        >
                          {on && "✓"}
                        </span>
                        <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleAddon(a.id)} />
                        <span className="font-medium">{a.name}</span>
                      </span>
                      <span className="font-semibold text-stone-600">+ {formatBRL(a.price)}</span>
                    </label>
                  );
                })}
              </div>
            </Section>
          )}

          <Section title="Alguma observação?" hint="Opcional">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={140}
              rows={2}
              placeholder="Ex: sem cebola, bem assada..."
              className="input resize-none"
              aria-label="Observações"
            />
          </Section>
        </div>

        <div className="flex items-center gap-3 border-t border-stone-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center rounded-xl bg-stone-100 p-1">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="grid h-10 w-10 place-items-center rounded-lg text-xl font-bold text-brand-600 hover:bg-white"
              aria-label="Diminuir"
            >
              −
            </button>
            <span className="w-8 text-center font-display text-lg font-bold">{quantity}</span>
            <button
              onClick={() => setQuantity((q) => Math.min(50, q + 1))}
              className="grid h-10 w-10 place-items-center rounded-lg text-xl font-bold text-brand-600 hover:bg-white"
              aria-label="Aumentar"
            >
              +
            </button>
          </div>
          <button onClick={submit} disabled={unitPrice === null} className="btn-primary flex-1 justify-between py-3.5 text-base">
            <span>Adicionar</span>
            <span className="font-display font-bold">{unitPrice !== null ? formatBRL(unitPrice * quantity) : "—"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, hint, required, children }: { title: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h3 className="font-display text-base font-bold">{title}</h3>
        {required ? (
          <span className="rounded-full bg-ink-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Obrigatório</span>
        ) : (
          hint && <span className="text-xs text-stone-500">{hint}</span>
        )}
      </div>
      {required && hint && <p className="-mt-1.5 mb-2 text-xs text-stone-500">{hint}</p>}
      {children}
    </section>
  );
}

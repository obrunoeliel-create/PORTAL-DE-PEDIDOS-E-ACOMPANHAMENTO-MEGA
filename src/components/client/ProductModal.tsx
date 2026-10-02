"use client";

import { useMemo, useState } from "react";
import type { CartItem, MenuCategory, MenuProduct } from "@/types/menu";
import { calcUnitPrice } from "@/lib/pricing-core";
import { formatBRL } from "@/lib/money";

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
      addonIds,
      addonNames: addons.map((a) => a.name),
      quantity,
      notes: notes.trim() || undefined,
      unitPrice,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="flex items-start justify-between border-b border-stone-100 p-5">
          <div>
            <h2 className="text-lg font-bold">{product.name}</h2>
            {product.description && <p className="text-sm text-stone-500">{product.description}</p>}
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-stone-400" aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {product.variants.length > 0 && (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Tamanho</legend>
              <div className="grid grid-cols-2 gap-2">
                {product.variants.map((v) => (
                  <label
                    key={v.id}
                    className={`cursor-pointer rounded-lg border p-3 text-sm ${
                      variantId === v.id ? "border-brand-500 bg-brand-50" : "border-stone-200"
                    }`}
                  >
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
                    <span className="block font-medium">{v.name}</span>
                    <span className="text-stone-500">{formatBRL(v.price)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {halfOptions.length > 0 && (
            <div>
              <label htmlFor="half" className="mb-2 block text-sm font-semibold">
                Meio a meio <span className="font-normal text-stone-500">(cobra o sabor de maior valor)</span>
              </label>
              <select id="half" value={halfId} onChange={(e) => setHalfId(e.target.value)} className="input">
                <option value="">Sabor inteiro: {product.name}</option>
                {halfOptions.map((p) => {
                  const price = variant ? p.variants.find((v) => v.name === variant.name)?.price : p.price;
                  return (
                    <option key={p.id} value={p.id}>
                      1/2 {product.name} + 1/2 {p.name} {price !== undefined ? `(${formatBRL(price)})` : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {category.addons.length > 0 && (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Acréscimos</legend>
              <div className="space-y-2">
                {category.addons.map((a) => (
                  <label key={a.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-stone-200 p-3 text-sm">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={addonIds.includes(a.id)}
                        onChange={() => toggleAddon(a.id)}
                        className="h-4 w-4 accent-brand-600"
                      />
                      {a.name}
                    </span>
                    <span className="text-stone-500">+ {formatBRL(a.price)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <div>
            <label htmlFor="notes" className="mb-2 block text-sm font-semibold">
              Observações
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={140}
              rows={2}
              placeholder="Ex: sem cebola"
              className="input resize-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-stone-100 p-5">
          <div className="flex items-center rounded-lg border border-stone-300">
            <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="px-3 py-2 text-lg" aria-label="Diminuir">
              −
            </button>
            <span className="w-8 text-center font-semibold">{quantity}</span>
            <button onClick={() => setQuantity((q) => Math.min(50, q + 1))} className="px-3 py-2 text-lg" aria-label="Aumentar">
              +
            </button>
          </div>
          <button onClick={submit} disabled={unitPrice === null} className="btn-primary flex-1 py-3">
            Adicionar · {unitPrice !== null ? formatBRL(unitPrice * quantity) : "—"}
          </button>
        </div>
      </div>
    </div>
  );
}

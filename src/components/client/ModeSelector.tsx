"use client";

import { useState } from "react";
import type { OrderMode } from "@/types/menu";
import { Logo } from "@/components/brand/Logo";

type Props = {
  current: OrderMode | null;
  storeName: string;
  onSelect: (mode: OrderMode) => void;
  onClose?: () => void;
};

export function ModeSelector({ current, storeName, onSelect, onClose }: Props) {
  const [askTable, setAskTable] = useState(current?.type === "TABLE");
  const [table, setTable] = useState(current?.type === "TABLE" ? String(current.tableNumber) : "");
  const tableNumber = Number(table);
  const tableValid = /^\d{1,3}$/.test(table) && tableNumber >= 1;

  return (
    <div className="overlay" role="dialog" aria-modal>
      <div className="sheet relative w-full max-w-md overflow-hidden">
        <div className="relative bg-gradient-to-br from-brand-600 to-brand-800 px-6 pb-10 pt-6 text-center text-white">
          <div className="bg-dots absolute inset-0" aria-hidden />
          {onClose && (
            <button
              onClick={onClose}
              className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/15 text-xl leading-none hover:bg-white/25"
              aria-label="Fechar"
            >
              ×
            </button>
          )}
          <Logo size={84} className="relative mx-auto shadow-lift ring-4 ring-white/90" />
          <p className="relative mt-3 text-sm text-white/80">Bem-vindo à</p>
          <h2 className="relative text-2xl font-extrabold">{storeName}</h2>
        </div>

        <div className="-mt-5 rounded-t-3xl bg-white p-6">
          {!askTable ? (
            <>
              <h3 className="mb-4 text-center text-lg font-bold">Como você quer pedir?</h3>
              <div className="grid gap-3">
                <ModeButton icon="🛵" title="Delivery" subtitle="Receba no seu endereço" onClick={() => onSelect({ type: "DELIVERY" })} />
                <ModeButton icon="🏪" title="Retirada no balcão" subtitle="Peça e busque na loja" onClick={() => onSelect({ type: "PICKUP" })} />
                <ModeButton icon="🍽️" title="Pedido na mesa" subtitle="Estou no salão" onClick={() => setAskTable(true)} />
              </div>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (tableValid) onSelect({ type: "TABLE", tableNumber });
              }}
              className="space-y-4"
            >
              <label className="block text-center text-lg font-bold" htmlFor="table">
                Qual é o número da sua mesa?
              </label>
              <input
                id="table"
                inputMode="numeric"
                autoFocus
                value={table}
                onChange={(e) => setTable(e.target.value.replace(/\D/g, "").slice(0, 3))}
                className="input py-4 text-center font-display text-4xl font-extrabold"
                placeholder="12"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setAskTable(false)} className="btn-ghost flex-1 py-3">
                  Voltar
                </button>
                <button type="submit" disabled={!tableValid} className="btn-primary flex-1 py-3">
                  Confirmar mesa
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function ModeButton(props: { icon: string; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      className="group flex items-center gap-4 rounded-2xl border-2 border-stone-100 p-4 text-left transition hover:border-brand-500 hover:bg-brand-50 active:scale-[0.99]"
    >
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-mega-400 text-3xl transition group-hover:scale-105" aria-hidden>
        {props.icon}
      </span>
      <span className="flex-1">
        <span className="block font-display text-lg font-bold">{props.title}</span>
        <span className="block text-sm text-stone-500">{props.subtitle}</span>
      </span>
      <span className="text-xl text-stone-300 transition group-hover:translate-x-1 group-hover:text-brand-600" aria-hidden>
        →
      </span>
    </button>
  );
}

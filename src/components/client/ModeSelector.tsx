"use client";

import { useState } from "react";
import type { OrderMode } from "@/types/menu";

type Props = {
  current: OrderMode | null;
  onSelect: (mode: OrderMode) => void;
  onClose?: () => void;
};

export function ModeSelector({ current, onSelect, onClose }: Props) {
  const [askTable, setAskTable] = useState(current?.type === "TABLE");
  const [table, setTable] = useState(current?.type === "TABLE" ? String(current.tableNumber) : "");
  const tableNumber = Number(table);
  const tableValid = /^\d{1,3}$/.test(table) && tableNumber >= 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-6 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Como você quer pedir?</h2>
          {onClose && (
            <button onClick={onClose} className="text-2xl leading-none text-stone-400" aria-label="Fechar">
              ×
            </button>
          )}
        </div>

        {!askTable ? (
          <div className="grid gap-3">
            <ModeButton icon="🛵" title="Delivery" subtitle="Receba no seu endereço" onClick={() => onSelect({ type: "DELIVERY" })} />
            <ModeButton icon="🏪" title="Retirada no Balcão" subtitle="Busque na loja" onClick={() => onSelect({ type: "PICKUP" })} />
            <ModeButton icon="🍽️" title="Pedido na Mesa" subtitle="Estou no salão" onClick={() => setAskTable(true)} />
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (tableValid) onSelect({ type: "TABLE", tableNumber });
            }}
            className="space-y-3"
          >
            <label className="block text-sm font-medium" htmlFor="table">
              Número da mesa
            </label>
            <input
              id="table"
              inputMode="numeric"
              autoFocus
              value={table}
              onChange={(e) => setTable(e.target.value.replace(/\D/g, "").slice(0, 3))}
              className="input text-center text-2xl font-bold"
              placeholder="Ex: 12"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setAskTable(false)} className="btn-ghost flex-1">
                Voltar
              </button>
              <button type="submit" disabled={!tableValid} className="btn-primary flex-1">
                Confirmar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ModeButton(props: { icon: string; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      className="flex items-center gap-4 rounded-xl border border-stone-200 p-4 text-left transition hover:border-brand-500 hover:bg-brand-50"
    >
      <span className="text-3xl" aria-hidden>
        {props.icon}
      </span>
      <span>
        <span className="block font-semibold">{props.title}</span>
        <span className="block text-sm text-stone-500">{props.subtitle}</span>
      </span>
    </button>
  );
}

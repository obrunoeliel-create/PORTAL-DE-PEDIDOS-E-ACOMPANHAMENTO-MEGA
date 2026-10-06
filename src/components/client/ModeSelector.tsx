"use client";

import type { OrderMode } from "@/types/menu";
import { Logo } from "@/components/brand/Logo";

type Props = {
  current: OrderMode | null;
  storeName: string;
  /** Primeiro nome do cliente logado (null = sem cadastro neste aparelho). */
  customerName: string | null;
  onAccount: (tab: "login" | "register") => void;
  onSelect: (mode: OrderMode) => void;
  onClose?: () => void;
};

/**
 * Escolha entre delivery e retirada. Pedido na mesa NÃO é escolhido aqui:
 * só é possível lendo o QR Code que fica na mesa (que já traz o número travado).
 */
export function ModeSelector({ storeName, customerName, onAccount, onSelect, onClose }: Props) {
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
          <p className="relative mt-3 text-sm text-white/80">{customerName ? `Que bom te ver de novo, ${customerName}! 👋` : "Bem-vindo à"}</p>
          <h2 className="relative text-2xl font-extrabold">{storeName}</h2>
        </div>

        <div className="-mt-5 rounded-t-3xl bg-white p-6">
          {!customerName && (
            <div className="mb-5 rounded-2xl bg-[#faf7f2] p-4 text-center ring-1 ring-stone-100">
              <p className="text-sm font-semibold">Peça mais rápido com seu cadastro</p>
              <p className="mb-3 text-xs text-stone-500">Nome e endereço já preenchidos em todo pedido.</p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => onAccount("login")} className="btn-ghost py-2.5">
                  👤 Já tenho cadastro
                </button>
                <button onClick={() => onAccount("register")} className="btn-primary py-2.5">
                  ✨ Me cadastrar
                </button>
              </div>
              <p className="mt-2.5 text-xs text-stone-500">ou escolha abaixo e peça sem cadastro</p>
            </div>
          )}
          <h3 className="mb-4 text-center text-lg font-bold">Como você quer pedir?</h3>
          <div className="grid gap-3">
            <ModeButton icon="🛵" title="Delivery" subtitle="Receba no seu endereço" onClick={() => onSelect({ type: "DELIVERY" })} />
            <ModeButton icon="🏪" title="Retirada no balcão" subtitle="Peça e busque na loja" onClick={() => onSelect({ type: "PICKUP" })} />
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-mega-100 p-3.5 text-sm text-ink-900 ring-1 ring-mega-300">
            <span className="text-2xl" aria-hidden>
              🍽️
            </span>
            <p>
              <strong>Está na loja?</strong> Leia o <strong>QR Code da sua mesa</strong> com a câmera do celular para pedir
              na mesa.
            </p>
          </div>
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

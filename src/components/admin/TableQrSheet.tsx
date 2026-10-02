"use client";

import { useState } from "react";
import { Logo } from "@/components/brand/Logo";

type TableCard = { number: number; url: string; svg: string };

export function TableQrSheet({ tables: initial }: { tables: TableCard[] }) {
  const [tables, setTables] = useState(initial);
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function regenerate(number: number) {
    if (!confirm(`Gerar um QR Code novo para a mesa ${number}?\n\nO QR Code impresso atual dessa mesa vai PARAR de funcionar — será preciso imprimir e trocar.`)) return;
    setBusy(number);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/tables/${number}/regenerate`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Falha ao gerar QR Code.");
      setTables((prev) => prev.map((t) => (t.number === number ? { number, url: data.url, svg: data.svg } : t)));
      setMessage(`Mesa ${number}: QR Code novo gerado. Imprima e substitua o da mesa.`);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Mesas e QR Codes</h1>
          <p className="text-sm text-stone-500">
            {tables.length} mesas · impressão em A4, 4 por folha. Cada QR Code só funciona na sua mesa — o cliente não consegue trocar o número.
          </p>
        </div>
        <button onClick={() => window.print()} className="btn-primary py-3">
          🖨️ Imprimir / salvar PDF
        </button>
      </div>
      {message && (
        <p className="rounded-2xl bg-mega-100 p-3 text-sm font-medium text-ink-900 ring-1 ring-mega-300 print:hidden">{message}</p>
      )}

      <div className="qr-sheet grid gap-4 sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-2 print:gap-0">
        {tables.map((t) => (
          <article key={t.number} className="qr-card card flex flex-col items-center p-5 text-center print:rounded-none print:shadow-none">
            <div className="flex items-center gap-2">
              <Logo size={44} />
              <div className="text-left leading-tight">
                <p className="font-display text-sm font-bold">Mega Esfiha Jurema</p>
                <p className="text-[11px] text-stone-500">Cardápio digital</p>
              </div>
            </div>
            <p className="mt-3 font-display text-sm font-bold uppercase tracking-[0.3em] text-brand-600">Mesa</p>
            <p className="font-display text-6xl font-black leading-none">{t.number}</p>
            <div className="qr-img mt-3 w-44 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: t.svg }} />
            <p className="mt-3 text-sm font-semibold">📱 Aponte a câmera do celular</p>
            <p className="text-xs text-stone-500">para ver o cardápio e fazer seu pedido</p>
            <p className="mt-1 text-[11px] text-stone-400">Pagamento no caixa ao sair</p>
            <button
              onClick={() => regenerate(t.number)}
              disabled={busy === t.number}
              className="mt-3 text-xs font-medium text-stone-400 underline hover:text-brand-600 print:hidden"
            >
              {busy === t.number ? "Gerando..." : "Gerar QR novo"}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { formatBRL, parseBRL } from "@/lib/money";

type Zone = { id: string; name: string; fee: number; active: boolean };

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Falha na operação.");
  return data;
}

export function ZoneManager({ initialZones }: { initialZones: Zone[] }) {
  const [zones, setZones] = useState(initialZones);
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [newFee, setNewFee] = useState("");
  const [bulk, setBulk] = useState("");
  const [showBulk, setShowBulk] = useState(initialZones.length === 0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const sorted = (list: Zone[]) => [...list].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? zones.filter((z) => z.name.toLowerCase().includes(q)) : zones;
  }, [zones, query]);
  const activeCount = zones.filter((z) => z.active).length;

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const fee = parseBRL(newFee);
    if (fee === null) return setMsg({ ok: false, text: "Taxa inválida." });
    run(async () => {
      const { zone } = await api("/api/admin/delivery-zones", "POST", { name: newName, fee });
      setZones((p) => sorted([...p, zone]));
      setNewName("");
      setNewFee("");
      setMsg({ ok: true, text: `Bairro "${zone.name}" cadastrado.` });
    });
  };

  const importBulk = () =>
    run(async () => {
      const r = await api("/api/admin/delivery-zones/import", "POST", { text: bulk });
      setZones(r.zones);
      setBulk("");
      setMsg({
        ok: r.invalid.length === 0,
        text: `${r.created} bairro(s) novo(s), ${r.updated} atualizado(s).${
          r.invalid.length ? ` Linhas ignoradas: ${r.invalid.join(" | ")}` : ""
        }`,
      });
    });

  const update = (z: Zone, data: Partial<Zone>) =>
    run(async () => {
      const { zone } = await api(`/api/admin/delivery-zones/${z.id}`, "PATCH", data);
      setZones((p) => sorted(p.map((x) => (x.id === zone.id ? zone : x))));
    });

  const remove = (z: Zone) => {
    if (!confirm(`Excluir o bairro "${z.name}"?`)) return;
    run(async () => {
      await api(`/api/admin/delivery-zones/${z.id}`, "DELETE");
      setZones((p) => p.filter((x) => x.id !== z.id));
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Taxas de entrega</h1>
          <p className="text-sm text-stone-500">
            {activeCount} ativo(s) · {zones.length - activeCount} pausado(s). No checkout o cliente escolhe o bairro e a taxa entra sozinha no total. Bairro
            fora da lista: a loja define a taxa no pedido.
          </p>
        </div>
        <button onClick={() => setShowBulk((v) => !v)} className="btn-ghost">
          📋 {showBulk ? "Fechar importação" : "Importar lista"}
        </button>
      </div>

      {msg && (
        <p
          className={`rounded-2xl p-3 text-sm font-medium ring-1 ${
            msg.ok ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-brand-50 text-brand-800 ring-brand-200"
          }`}
          role="status"
        >
          {msg.text}
        </p>
      )}

      {showBulk && (
        <section className="card space-y-3 p-5">
          <h2 className="font-display text-lg font-bold">Importar vários bairros</h2>
          <p className="text-sm text-stone-500">
            Cole um bairro por linha com a taxa. Ex: <code className="rounded bg-stone-100 px-1">Centro;7,00</code> ou{" "}
            <code className="rounded bg-stone-100 px-1">Jardim Jurema - R$ 8,50</code>. Bairros que já existem têm a taxa
            atualizada.
          </p>
          <textarea
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            rows={8}
            className="input font-mono text-xs"
            placeholder={"Centro;7,00\nJardim Jurema;8,00\nVila Galvão;10,00"}
          />
          <button onClick={importBulk} disabled={busy || !bulk.trim()} className="btn-primary">
            Importar
          </button>
        </section>
      )}

      <form onSubmit={add} className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[12rem] flex-1">
          <label className="mb-1 block text-xs font-semibold text-stone-600" htmlFor="zname">
            Novo bairro
          </label>
          <input id="zname" className="input" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} required />
        </div>
        <div className="w-32">
          <label className="mb-1 block text-xs font-semibold text-stone-600" htmlFor="zfee">
            Taxa (R$)
          </label>
          <input id="zfee" className="input" value={newFee} onChange={(e) => setNewFee(e.target.value)} inputMode="decimal" placeholder="7,00" required />
        </div>
        <button disabled={busy} className="btn-primary">
          Adicionar
        </button>
      </form>

      <section className="card overflow-hidden">
        <div className="border-b border-stone-100 bg-[#faf7f2] p-3">
          <input className="input" placeholder="Buscar bairro..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="hidden grid-cols-[1fr_9rem_6.5rem] gap-3 bg-ink-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white sm:grid">
          <span>Bairro</span>
          <span>Taxa de entrega</span>
          <span className="text-center">Ações</span>
        </div>
        <ul className="divide-y divide-stone-100">
          {shown.map((z) => (
            <ZoneRow key={`${z.id}-${z.fee}-${z.name}`} zone={z} busy={busy} onSave={update} onRemove={remove} />
          ))}
          {shown.length === 0 && <li className="p-6 text-center text-sm text-stone-500">Nenhum bairro cadastrado.</li>}
        </ul>
      </section>
    </div>
  );
}

function ZoneRow({
  zone,
  busy,
  onSave,
  onRemove,
}: {
  zone: Zone;
  busy: boolean;
  onSave: (z: Zone, data: Partial<Zone>) => void;
  onRemove: (z: Zone) => void;
}) {
  const [name, setName] = useState(zone.name);
  const [fee, setFee] = useState((zone.fee / 100).toFixed(2).replace(".", ","));

  // Salva ao sair do campo ou apertar Enter (como no Multipedidos).
  function commitName() {
    const v = name.trim();
    if (v.length >= 2 && v !== zone.name) onSave(zone, { name: v });
    else setName(zone.name);
  }
  function commitFee() {
    const cents = parseBRL(fee);
    if (cents !== null && cents <= 20_000 && cents !== zone.fee) onSave(zone, { fee: cents });
    else setFee((zone.fee / 100).toFixed(2).replace(".", ","));
  }
  const onEnter = (fn: () => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      fn();
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <li
      className={`grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 text-sm sm:grid-cols-[1fr_9rem_6.5rem] ${
        zone.active ? "" : "bg-mega-100/70"
      }`}
    >
      <input
        className={`input py-2 font-medium uppercase ${zone.active ? "" : "text-stone-500 line-through"}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={onEnter(commitName)}
        maxLength={80}
        aria-label="Nome do bairro"
      />
      <div className="relative row-start-2 sm:row-start-auto">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">R$</span>
        <input
          className="input py-2 pl-9 text-right font-display font-bold"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          onBlur={commitFee}
          onKeyDown={onEnter(commitFee)}
          inputMode="decimal"
          aria-label={`Taxa de ${zone.name}`}
        />
      </div>
      <div className="row-span-2 flex items-center justify-center gap-2 sm:row-span-1">
        <button
          onClick={() => onSave(zone, { active: !zone.active })}
          disabled={busy}
          title={zone.active ? "Pausar bairro (some do checkout)" : "Reativar bairro"}
          aria-label={zone.active ? `Pausar ${zone.name}` : `Reativar ${zone.name}`}
          className={`grid h-10 w-10 place-items-center rounded-xl border-2 text-base transition disabled:opacity-50 ${
            zone.active
              ? "border-emerald-600 text-emerald-700 hover:bg-emerald-50"
              : "border-mega-500 bg-mega-400 text-ink-900 hover:bg-mega-300"
          }`}
        >
          {zone.active ? "⏸" : "▶"}
        </button>
        <button
          onClick={() => onRemove(zone)}
          disabled={busy}
          title="Excluir bairro"
          aria-label={`Excluir ${zone.name}`}
          className="grid h-10 w-10 place-items-center rounded-xl border-2 border-brand-500 text-brand-600 transition hover:bg-brand-50 disabled:opacity-50"
        >
          🗑
        </button>
      </div>
    </li>
  );
}

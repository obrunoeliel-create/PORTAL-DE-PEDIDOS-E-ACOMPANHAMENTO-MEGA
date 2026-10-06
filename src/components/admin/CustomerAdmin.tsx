"use client";

import { useEffect, useState } from "react";

type Row = {
  id: string;
  name: string;
  phone: string;
  addressStreet: string | null;
  addressNumber: string | null;
  addressDistrict: string | null;
  lastOrderAt: string | null;
  createdAt: string;
  _count: { orders: number };
};

const fmtPhone = (p: string) => (p.length === 11 ? `(${p.slice(0, 2)}) ${p.slice(2, 7)}-${p.slice(7)}` : p);
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

export function CustomerAdmin() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPin, setNewPin] = useState<{ name: string; pin: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await fetch(`/api/admin/customers?q=${encodeURIComponent(q)}`, { cache: "no-store" }).catch(() => null);
      if (res?.ok) setRows((await res.json()).customers);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function resetPin(r: Row) {
    if (!confirm(`Gerar uma senha nova para ${r.name}? A senha antiga deixa de funcionar.`)) return;
    const res = await fetch(`/api/admin/customers/${r.id}/reset-pin`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setNewPin({ name: r.name, pin: data.pin });
    else alert(data.error ?? "Falha ao gerar senha.");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold sm:text-3xl">Clientes cadastrados</h1>
        <p className="text-sm text-stone-500">Busque por nome ou WhatsApp. Se o cliente esqueceu a senha, gere uma nova e passe para ele.</p>
      </div>

      {newPin && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-2 border-emerald-400 p-4">
          <p className="text-sm">
            Nova senha de <strong>{newPin.name}</strong>:{" "}
            <span className="ml-1 rounded-lg bg-ink-950 px-3 py-1 font-display text-2xl font-extrabold tracking-[0.4em] text-white">{newPin.pin}</span>
            <span className="mt-1 block text-xs text-stone-500">Mostrada só agora. Passe para o cliente — ele pode entrar com ela no cardápio.</span>
          </p>
          <button onClick={() => setNewPin(null)} className="btn-ghost">
            Ok, já passei
          </button>
        </div>
      )}

      <input className="input max-w-md" placeholder="Buscar por nome ou WhatsApp..." value={q} onChange={(e) => setQ(e.target.value)} />

      <section className="card overflow-hidden">
        <div className="hidden grid-cols-[1.4fr_1fr_1.6fr_0.6fr_0.8fr_9rem] gap-3 bg-ink-950 px-4 py-3 text-xs font-bold uppercase tracking-wide text-white lg:grid">
          <span>Cliente</span>
          <span>WhatsApp</span>
          <span>Endereço salvo</span>
          <span>Pedidos</span>
          <span>Último</span>
          <span />
        </div>
        <ul className="divide-y divide-stone-100">
          {rows.map((r) => (
            <li key={r.id} className="grid gap-1 px-4 py-3 text-sm lg:grid-cols-[1.4fr_1fr_1.6fr_0.6fr_0.8fr_9rem] lg:items-center lg:gap-3">
              <span className="font-semibold">{r.name}</span>
              <span className="text-stone-600">{fmtPhone(r.phone)}</span>
              <span className="text-stone-600">
                {r.addressStreet ? `${r.addressStreet}, ${r.addressNumber} · ${r.addressDistrict}` : <em className="text-stone-400">sem endereço</em>}
              </span>
              <span>{r._count.orders}</span>
              <span className="text-stone-500">{fmtDate(r.lastOrderAt)}</span>
              <button onClick={() => resetPin(r)} className="btn-ghost px-3 py-1.5 text-xs">
                🔑 Nova senha
              </button>
            </li>
          ))}
          {!loading && rows.length === 0 && <li className="p-6 text-center text-sm text-stone-500">Nenhum cliente encontrado.</li>}
        </ul>
      </section>
    </div>
  );
}

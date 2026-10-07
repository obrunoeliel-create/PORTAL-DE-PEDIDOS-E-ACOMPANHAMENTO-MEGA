"use client";

import { useState } from "react";
import { formatBRL } from "@/lib/money";

export type BarDatum = { label: string; value: number; count?: number };

// Série única: um só tom (azul neutro, não as cores de status da marca). Barras finas, ponta arredondada.
const BAR = "#2a78d6";
const BAR_ACTIVE = "#1a5fb4";

/**
 * Gráfico de colunas simples com valor ao passar o mouse / focar (teclado) e versão em tabela.
 * `format`: "brl" para valores em centavos, "int" para contagens.
 */
export function BarChart({ data, format = "brl", title, unit }: { data: BarDatum[]; format?: "brl" | "int"; title: string; unit?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const fmt = (v: number) => (format === "brl" ? formatBRL(v) : v.toLocaleString("pt-BR"));
  const max = Math.max(...data.map((d) => d.value), 0);
  const peak = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  // Rótulos do eixo sem amontoar: no máximo ~12 visíveis.
  const step = Math.max(1, Math.ceil(data.length / 12));

  if (max === 0) return <p className="py-10 text-center text-sm text-stone-500">Sem vendas neste período.</p>;

  return (
    <figure>
      <div className="flex gap-2">
        <div className="flex h-44 w-16 shrink-0 flex-col justify-between text-right text-[11px] tabular-nums text-stone-400" aria-hidden>
          <span>{fmt(max)}</span>
          <span>{fmt(Math.round(max / 2))}</span>
          <span>0</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-0 flex h-44 flex-col justify-between" aria-hidden>
            <span className="border-t border-stone-100" />
            <span className="border-t border-stone-100" />
            <span className="border-t border-stone-200" />
          </div>
          <div className="relative flex h-44 items-end" role="list" aria-label={title} onMouseLeave={() => setActive(null)}>
            {data.map((d, i) => {
              const h = (d.value / max) * 100;
              const on = active === i;
              return (
                <div
                  key={d.label + i}
                  role="listitem"
                  tabIndex={0}
                  aria-label={`${d.label}: ${fmt(d.value)}${d.count !== undefined ? `, ${d.count} pedidos` : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="relative flex h-full min-w-0 flex-1 cursor-default items-end justify-center px-px outline-none"
                >
                  <span
                    className="block w-full max-w-6 rounded-t transition-colors"
                    style={{ height: `${h}%`, minHeight: d.value > 0 ? 2 : 0, background: on ? BAR_ACTIVE : BAR }}
                  />
                  {i === peak && active === null && (
                    <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold text-stone-700" style={{ bottom: `calc(${h}% + 4px)` }}>
                      {fmt(d.value)}
                    </span>
                  )}
                  {on && (
                    <span
                      className={`pointer-events-none absolute z-10 whitespace-nowrap rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs text-white shadow-lift ${
                        i < data.length / 2 ? "left-0" : "right-0"
                      }`}
                      style={{ bottom: `calc(${Math.min(h, 70)}% + 8px)` }}
                    >
                      <strong className="block text-sm">{fmt(d.value)}</strong>
                      {d.label}
                      {d.count !== undefined && ` · ${d.count} pedido${d.count === 1 ? "" : "s"}`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex text-[11px] text-stone-500" aria-hidden>
            {data.map((d, i) => (
              <span key={d.label + i} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center">
                {i % step === 0 ? d.label : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-stone-500 hover:text-stone-700">Ver em tabela</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-stone-200">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-stone-50 text-xs uppercase text-stone-500">
              <tr>
                <th className="px-3 py-2">{unit ?? "Período"}</th>
                <th className="px-3 py-2 text-right">{format === "brl" ? "Vendas" : "Quantidade"}</th>
                {data.some((d) => d.count !== undefined) && <th className="px-3 py-2 text-right">Pedidos</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={d.label + i} className="border-t border-stone-100">
                  <td className="px-3 py-1.5">{d.label}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(d.value)}</td>
                  {d.count !== undefined && <td className="px-3 py-1.5 text-right tabular-nums">{d.count}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

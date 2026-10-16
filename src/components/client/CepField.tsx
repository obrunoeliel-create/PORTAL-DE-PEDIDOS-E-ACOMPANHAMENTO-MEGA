"use client";

import { useEffect, useRef, useState } from "react";
import { type CepAddress, cepDigits, maskCep } from "@/lib/cep";

type Status = { kind: "idle" | "loading" | "ok" | "error"; text?: string };

/**
 * Campo de CEP: ao completar os 8 números, busca o endereço e devolve rua e bairro em `onFound`.
 * O cliente só precisa completar número, complemento e referência.
 */
export function CepField({
  id,
  value,
  onChange,
  onFound,
  error,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (cep: string) => void;
  onFound: (address: CepAddress) => void;
  error?: string;
  autoFocus?: boolean;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const lastLookup = useRef("");
  const onFoundRef = useRef(onFound);
  onFoundRef.current = onFound;

  const digits = cepDigits(value);
  useEffect(() => {
    if (digits.length !== 8) {
      lastLookup.current = "";
      setStatus({ kind: "idle" });
      return;
    }
    if (digits === lastLookup.current) return;
    lastLookup.current = digits;
    const ctrl = new AbortController();
    setStatus({ kind: "loading" });
    fetch(`/api/cep/${digits}`, { signal: ctrl.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.address) {
          setStatus({ kind: "error", text: data.error ?? "CEP não encontrado. Preencha o endereço." });
          return;
        }
        const a = data.address as CepAddress;
        onFoundRef.current(a);
        setStatus({ kind: "ok", text: [a.district, a.city && `${a.city}/${a.uf}`].filter(Boolean).join(" · ") });
      })
      .catch((e) => {
        if ((e as Error).name !== "AbortError") setStatus({ kind: "error", text: "Sem conexão para buscar o CEP. Preencha o endereço." });
      });
    return () => ctrl.abort();
  }, [digits]);

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-stone-600">
        CEP <span className="font-normal text-stone-400">— o endereço aparece sozinho</span>
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          className={`input max-w-[10rem] font-display text-lg tracking-wider ${error ? "border-brand-500 ring-4 ring-brand-100" : ""}`}
          value={maskCep(value)}
          onChange={(e) => onChange(cepDigits(e.target.value))}
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="00000-000"
          maxLength={9}
          autoFocus={autoFocus}
        />
        <a
          href="https://buscacepinter.correios.com.br/app/endereco/index.php"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-stone-500 underline"
        >
          Não sei meu CEP
        </a>
      </div>
      {status.kind === "loading" && <p className="mt-1 text-xs font-medium text-stone-500">🔎 Buscando endereço…</p>}
      {status.kind === "ok" && <p className="mt-1 text-xs font-semibold text-emerald-700">✓ Endereço encontrado{status.text ? ` — ${status.text}` : ""}</p>}
      {status.kind === "error" && <p className="mt-1 text-xs font-medium text-amber-700">{status.text}</p>}
      {error && <p className="mt-1 text-xs font-medium text-brand-700">{error}</p>}
    </div>
  );
}

"use client";

import { useState } from "react";
import type { CustomerProfile, DeliveryZoneOption } from "@/types/menu";
import { formatBRL } from "@/lib/money";
import { Logo } from "@/components/brand/Logo";
import { Field, errInput, hasName, isValidMobile, maskPhone } from "./form";

type Props = {
  initialTab?: "login" | "register";
  zones: DeliveryZoneOption[];
  /** Dados já digitados no pedido (para "salvar meus dados" depois do pedido). */
  prefill?: { name?: string; phone?: string };
  onDone: (customer: CustomerProfile) => void;
  onClose: () => void;
};

const OTHER = "__outro__";

export function AccountSheet({ initialTab = "login", zones, prefill, onDone, onClose }: Props) {
  const [tab, setTab] = useState(initialTab);
  const [name, setName] = useState(prefill?.name ?? "");
  const [phone, setPhone] = useState(maskPhone(prefill?.phone ?? ""));
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [withAddress, setWithAddress] = useState(false);
  const [zoneId, setZoneId] = useState("");
  const [addr, setAddr] = useState({ street: "", number: "", district: "", complement: "", reference: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onlyDigits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

  async function call(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!isValidMobile(phone)) errs.phone = "Informe um WhatsApp válido com DDD.";
    if (!/^\d{4}$/.test(pin)) errs.pin = "A senha tem 4 números.";
    if (tab === "register") {
      if (!hasName(name)) errs.name = "Informe seu nome.";
      if (pin !== pin2) errs.pin2 = "As senhas não são iguais.";
      if (withAddress) {
        if (zones.length && !zoneId) errs.zone = "Selecione seu bairro.";
        if ((!zones.length || zoneId === OTHER) && addr.district.trim().length < 2) errs.district = "Informe o bairro.";
        if (addr.street.trim().length < 3) errs.street = "Informe a rua.";
        if (!addr.number.trim()) errs.number = "Informe o número.";
      }
    }
    setErrors(errs);
    setMessage(null);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      const zone = zones.find((z) => z.id === zoneId);
      const { res, data } =
        tab === "login"
          ? await call("/api/customers/login", { phone, pin })
          : await call("/api/customers/register", {
              name,
              phone,
              pin,
              ...(withAddress && {
                address: {
                  street: addr.street,
                  number: addr.number,
                  district: zone ? zone.name : addr.district,
                  complement: addr.complement || undefined,
                  reference: addr.reference || undefined,
                  zoneId: zone?.id,
                },
              }),
            });
      if (!res.ok) {
        setMessage(data.error ?? "Não foi possível continuar.");
        if (data.fields) setErrors((p) => ({ ...p, ...data.fields }));
        if (res.status === 409) setTab("login");
        return;
      }
      onDone(data.customer as CustomerProfile);
    } catch {
      setMessage("Falha de conexão.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay z-[60]" role="dialog" aria-modal onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden">
        <div className="relative bg-gradient-to-br from-brand-600 to-brand-800 px-6 pb-8 pt-6 text-center text-white">
          <div className="bg-dots absolute inset-0" aria-hidden />
          <button
            onClick={onClose}
            className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/15 text-xl leading-none hover:bg-white/25"
            aria-label="Fechar"
          >
            ×
          </button>
          <Logo size={64} className="relative mx-auto ring-4 ring-white/90" />
          <h2 className="relative mt-2 text-xl font-extrabold">{tab === "login" ? "Entrar no meu cadastro" : "Criar meu cadastro"}</h2>
          <p className="relative text-sm text-white/80">
            {tab === "login" ? "Seus dados e endereço já aparecem no pedido." : "Faça uma vez e peça mais rápido nas próximas."}
          </p>
        </div>

        <div className="-mt-4 flex rounded-t-3xl bg-white px-5 pt-5">
          {(["login", "register"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setErrors({});
                setMessage(null);
              }}
              className={`flex-1 border-b-2 pb-2.5 text-sm font-bold transition ${
                tab === t ? "border-brand-600 text-brand-700" : "border-stone-200 text-stone-400"
              }`}
            >
              {t === "login" ? "Já tenho cadastro" : "Quero me cadastrar"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex-1 space-y-3 overflow-y-auto bg-white p-5">
          {tab === "register" && (
            <Field id="acc-name" label="Nome" required error={errors.name}>
              <input id="acc-name" className={errInput(!!errors.name)} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" placeholder="Seu nome" />
            </Field>
          )}
          <Field id="acc-phone" label="WhatsApp com DDD" required error={errors.phone}>
            <input id="acc-phone" className={errInput(!!errors.phone)} value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} inputMode="tel" autoComplete="tel" placeholder="(11) 91234-5678" maxLength={16} />
          </Field>
          <div className={tab === "register" ? "grid grid-cols-2 gap-2" : ""}>
            <Field id="acc-pin" label={tab === "register" ? "Crie uma senha (4 números)" : "Senha (4 números)"} required error={errors.pin}>
              <input id="acc-pin" type="password" className={`${errInput(!!errors.pin)} text-center font-display text-lg tracking-[0.5em]`} value={pin} onChange={(e) => setPin(onlyDigits(e.target.value))} inputMode="numeric" autoComplete={tab === "register" ? "new-password" : "current-password"} placeholder="••••" />
            </Field>
            {tab === "register" && (
              <Field id="acc-pin2" label="Repita a senha" required error={errors.pin2}>
                <input id="acc-pin2" type="password" className={`${errInput(!!errors.pin2)} text-center font-display text-lg tracking-[0.5em]`} value={pin2} onChange={(e) => setPin2(onlyDigits(e.target.value))} inputMode="numeric" autoComplete="new-password" placeholder="••••" />
              </Field>
            )}
          </div>

          {tab === "register" && (
            <>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-stone-200 p-3 text-sm">
                <input type="checkbox" className="h-5 w-5 accent-brand-600" checked={withAddress} onChange={(e) => setWithAddress(e.target.checked)} />
                <span>
                  <span className="block font-semibold">🛵 Salvar meu endereço de entrega</span>
                  <span className="text-stone-500">Opcional — para delivery sem digitar de novo.</span>
                </span>
              </label>
              {withAddress && (
                <div className="space-y-3 rounded-2xl bg-[#faf7f2] p-3">
                  {zones.length > 0 && (
                    <Field id="acc-zone" label="Bairro" required error={errors.zone}>
                      <select id="acc-zone" className={errInput(!!errors.zone)} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                        <option value="">Selecione seu bairro</option>
                        {zones.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.name} — taxa {formatBRL(z.fee)}
                          </option>
                        ))}
                        <option value={OTHER}>Meu bairro não está na lista</option>
                      </select>
                    </Field>
                  )}
                  {(!zones.length || zoneId === OTHER) && (
                    <Field id="acc-district" label="Bairro" required error={errors.district}>
                      <input id="acc-district" className={errInput(!!errors.district)} value={addr.district} onChange={(e) => setAddr({ ...addr, district: e.target.value })} maxLength={80} />
                    </Field>
                  )}
                  <div className="grid grid-cols-[1fr_5.5rem] gap-2">
                    <Field id="acc-street" label="Rua" required error={errors.street}>
                      <input id="acc-street" className={errInput(!!errors.street)} value={addr.street} onChange={(e) => setAddr({ ...addr, street: e.target.value })} maxLength={120} autoComplete="address-line1" />
                    </Field>
                    <Field id="acc-number" label="Nº" required error={errors.number}>
                      <input id="acc-number" className={errInput(!!errors.number)} value={addr.number} onChange={(e) => setAddr({ ...addr, number: e.target.value })} maxLength={15} />
                    </Field>
                  </div>
                  <Field id="acc-compl" label="Complemento (opcional)">
                    <input id="acc-compl" className="input" value={addr.complement} onChange={(e) => setAddr({ ...addr, complement: e.target.value })} maxLength={80} />
                  </Field>
                  <Field id="acc-ref" label="Ponto de referência (opcional)">
                    <input id="acc-ref" className="input" value={addr.reference} onChange={(e) => setAddr({ ...addr, reference: e.target.value })} maxLength={120} />
                  </Field>
                </div>
              )}
              <p className="text-xs text-stone-500">
                🔒 Seus dados ficam guardados só para agilizar seus pedidos na Mega Esfiha Jurema. A senha impede que outra
                pessoa veja seu endereço.
              </p>
            </>
          )}

          {message && (
            <p className="rounded-xl bg-brand-50 p-3 text-sm font-medium text-brand-800" role="alert">
              {message}
            </p>
          )}
          <button type="submit" disabled={busy} className="btn-primary w-full py-3.5 text-base">
            {busy ? "Aguarde..." : tab === "login" ? "Entrar" : "Criar cadastro"}
          </button>
          {tab === "login" && (
            <p className="text-center text-xs text-stone-500">Esqueceu a senha? Faça o pedido sem cadastro e peça para a loja redefinir.</p>
          )}
          <button type="button" onClick={onClose} className="w-full py-2 text-sm font-medium text-stone-500 underline">
            Continuar sem cadastro
          </button>
        </form>
      </div>
    </div>
  );
}

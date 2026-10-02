"use client";

import { useEffect, useState } from "react";
import { toDataURL } from "qrcode";
import { formatBRL } from "@/lib/money";
import { buildReceiptMessage, buildWhatsAppUrl, formatPhone } from "@/lib/whatsapp";

type Props = {
  payload: string;
  pixKey: string;
  holderName: string | null;
  amount: number;
  orderNumber: number;
  storeName: string;
  storeWhatsapp: string | null;
  customerName?: string;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false; // clipboard indisponível (http fora de localhost)
  }
}

export function PixQrCode(props: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "key" | null>(null);

  useEffect(() => {
    toDataURL(props.payload, { width: 260, margin: 1, errorCorrectionLevel: "M" })
      .then(setSrc)
      .catch(() => setSrc(null));
  }, [props.payload]);

  async function copy(what: "code" | "key") {
    if (await copyText(what === "code" ? props.payload : props.pixKey)) {
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    }
  }

  const isPhoneKey = /^\+55\d{10,11}$/.test(props.pixKey);
  const keyLabel = isPhoneKey ? formatPhone(props.pixKey) : props.pixKey;

  const receiptUrl = props.storeWhatsapp
    ? buildWhatsAppUrl(
        props.storeWhatsapp,
        buildReceiptMessage({
          storeName: props.storeName,
          number: props.orderNumber,
          total: props.amount,
          customerName: props.customerName,
        }),
      )
    : null;

  return (
    <div className="card overflow-hidden text-left">
      <div className="flex items-center justify-between bg-[#32bcad] px-4 py-3 text-white">
        <span className="font-display text-lg font-bold">⚡ Pague com PIX</span>
        <span className="font-display text-xl font-extrabold">{formatBRL(props.amount)}</span>
      </div>

      <div className="flex flex-col items-center gap-4 p-4">
        <div className="rounded-2xl bg-white p-2 ring-1 ring-stone-200">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="QR Code PIX" width={220} height={220} />
          ) : (
            <div className="h-[220px] w-[220px] animate-pulse rounded-xl bg-stone-100" />
          )}
        </div>

        <button onClick={() => copy("code")} className="btn-primary w-full py-3">
          {copied === "code" ? "✓ Código copiado!" : "Copiar PIX copia e cola"}
        </button>

        <div className="w-full rounded-2xl bg-stone-50 p-3.5 text-sm ring-1 ring-stone-100">
          <p className="text-xs text-stone-500">Ou pague pela chave {isPhoneKey ? "(telefone)" : ""}</p>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className="font-display text-base font-bold">{keyLabel}</span>
            <button onClick={() => copy("key")} className="rounded-lg px-2 py-1 text-sm font-semibold text-brand-600 hover:bg-white">
              {copied === "key" ? "✓ Copiada" : "Copiar"}
            </button>
          </div>
          {props.holderName && <p className="mt-1 text-xs text-stone-500">Em nome de: {props.holderName}</p>}
        </div>

        {receiptUrl && (
          <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="btn-whatsapp w-full">
            📎 Enviar comprovante pelo WhatsApp
          </a>
        )}
        <p className="text-center text-xs leading-relaxed text-stone-500">
          Depois de pagar, toque em “Enviar comprovante”. A conversa abre com o número do pedido e o valor — é só anexar
          o print do comprovante.
        </p>
      </div>
    </div>
  );
}

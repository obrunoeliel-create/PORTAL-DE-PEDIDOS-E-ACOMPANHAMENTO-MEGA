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
    toDataURL(props.payload, { width: 240, margin: 1, errorCorrectionLevel: "M" })
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
    <div className="flex flex-col items-center gap-3 rounded-xl border border-stone-200 p-4 text-left">
      <p className="text-sm font-semibold">Pague {formatBRL(props.amount)} com PIX</p>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="QR Code PIX" width={240} height={240} />
      ) : (
        <div className="h-[240px] w-[240px] animate-pulse rounded bg-stone-100" />
      )}

      <button onClick={() => copy("code")} className="btn-primary w-full">
        {copied === "code" ? "Código copiado!" : "Copiar PIX copia e cola"}
      </button>

      <div className="w-full rounded-lg bg-stone-50 p-3 text-sm">
        <p className="text-stone-500">Ou pague pela chave {isPhoneKey ? "(telefone)" : ""}:</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="font-semibold">{keyLabel}</span>
          <button onClick={() => copy("key")} className="text-sm font-medium text-brand-700">
            {copied === "key" ? "Copiada!" : "Copiar chave"}
          </button>
        </div>
        {props.holderName && <p className="mt-1 text-stone-600">Em nome de: {props.holderName}</p>}
      </div>

      {receiptUrl && (
        <a
          href={receiptUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-3 font-semibold text-white hover:bg-green-700"
        >
          📎 Enviar comprovante pelo WhatsApp
        </a>
      )}
      <p className="text-center text-xs text-stone-500">
        Depois de pagar, toque em “Enviar comprovante”: a conversa com a loja abre com o número do pedido e o valor
        já preenchidos — é só anexar o print do comprovante.
      </p>
    </div>
  );
}

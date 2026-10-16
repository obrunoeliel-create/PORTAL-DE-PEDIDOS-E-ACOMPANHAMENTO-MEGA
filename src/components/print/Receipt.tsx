import { formatBRL } from "@/lib/money";
import { itemTitle } from "@/lib/item-title";

// Cupom para impressora térmica (80 ou 58 mm) ou folha A4. Só preto, letra sem serifa e em negrito
// (a térmica imprime mais nítido), espaçamento curto para gastar menos papel.

export type ReceiptItem = {
  id: string;
  quantity: number;
  categoryLabel: string | null;
  productName: string;
  halfProductName: string | null;
  variantName: string | null;
  addons: unknown;
  notes: string | null;
  totalPrice: number;
};

const WIDTH_CSS: Record<string, string> = {
  "80": "@page { size: 80mm auto; margin: 0 } .receipt { width: 72mm; font-size: 14px }",
  "58": "@page { size: 58mm auto; margin: 0 } .receipt { width: 48mm; font-size: 12.5px }",
  a4: "@page { size: A4; margin: 12mm } .receipt { width: 100mm; font-size: 14px }",
};

export function paperWidth(w: string | undefined) {
  return w === "58" || w === "a4" ? w : "80";
}

/** Estilo do cupom (papel + tipografia), reutilizado pelas páginas de impressão e pelo modo contingência. */
export function receiptCss(width: string) {
  return `
        ${WIDTH_CSS[width] ?? WIDTH_CSS["80"]}
        .receipt { margin: 0 auto; padding: 1mm 1mm 3mm; font-family: Arial, Helvetica, "Liberation Sans", sans-serif; font-weight: 600; line-height: 1.22; color: #000; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .receipt * { color: #000 !important; }
        .r-center { text-align: center; }
        .r-store { font-size: 1.1em; font-weight: 800; }
        .r-big { font-size: 1.75em; font-weight: 900; line-height: 1.1; }
        .r-tag { display: inline-block; border: 2.5px solid #000; padding: 0 8px; font-weight: 900; font-size: 1.15em; margin-top: 2px; }
        .r-sep { border: 0; border-top: 1.5px dashed #000; margin: 4px 0; }
        .r-row { display: flex; justify-content: space-between; gap: 6px; }
        .r-row > span:last-child { white-space: nowrap; }
        .r-item { margin: 3px 0; }
        .r-item-name { font-weight: 800; font-size: 1.08em; }
        .r-sub { padding-left: 1em; font-weight: 600; }
        .r-note { padding-left: 1em; font-weight: 800; }
        .r-total { font-size: 1.45em; font-weight: 900; }
        .r-box { border: 1.5px solid #000; padding: 3px 4px; margin: 3px 0; }
        .r-person { border-top: 2.5px solid #000; border-bottom: 1px solid #000; font-weight: 900; font-size: 1.08em; padding: 1px 0; margin-top: 5px; }
        .r-small { font-size: .82em; font-weight: 500; }`;
}

export function ReceiptShell({ width, children }: { width: string; children: React.ReactNode }) {
  return (
    <>
      <style>{`
        html, body { background: #fff !important; color: #000; margin: 0; }
        ${receiptCss(width)}
        .toolbar { position: fixed; top: 8px; right: 8px; display: flex; gap: 6px; font-family: system-ui, sans-serif; }
        .toolbar button { padding: 8px 14px; border-radius: 8px; border: 1px solid #ccc; background: #fff; cursor: pointer; font-size: 14px; }
        @media print { .no-print { display: none !important; } }
        @media screen { body { background: #eee !important; padding: 16px 0; } .receipt { box-shadow: 0 2px 10px rgba(0,0,0,.15); } }
      `}</style>
      <div className="receipt">{children}</div>
    </>
  );
}

export function Sep() {
  return <hr className="r-sep" />;
}

export function Row({ left, right, className = "" }: { left: React.ReactNode; right: React.ReactNode; className?: string }) {
  return (
    <div className={`r-row ${className}`}>
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

export function Items({ items }: { items: ReceiptItem[] }) {
  return (
    <div>
      {items.map((i) => {
        const addons = Array.isArray(i.addons) ? (i.addons as { name?: string }[]).map((a) => a?.name).filter(Boolean) : [];
        return (
          <div key={i.id} className="r-item">
            <Row
              left={
                <span className="r-item-name">
                  {i.quantity}x {itemTitle(i)}
                </span>
              }
              right={formatBRL(i.totalPrice)}
            />
            {i.variantName && <div className="r-sub">{i.variantName}</div>}
            {addons.length > 0 && <div className="r-sub">+ {addons.join(", ")}</div>}
            {i.notes && <div className="r-note">OBS: {i.notes}</div>}
          </div>
        );
      })}
    </div>
  );
}

export const printDate = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

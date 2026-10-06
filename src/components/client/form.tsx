"use client";

/** "11912345678" → "(11) 91234-5678" enquanto o cliente digita. */
export function maskPhone(v: string): string {
  const d = v.replace(/\D/g, "").replace(/^55(?=\d{11})/, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** WhatsApp celular com DDD (mesma regra do servidor). */
export function isValidMobile(phone: string): boolean {
  const digits = phone.replace(/\D/g, "").replace(/^55(?=\d{11}$)/, "");
  return /^[1-9][1-9]9\d{8}$/.test(digits);
}

export function hasName(name: string): boolean {
  return (name.match(/\p{L}/gu) ?? []).length >= 2;
}

export function Field({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-stone-600">
        {label} {required && <span className="text-brand-600">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs font-medium text-brand-700">{error}</p>}
    </div>
  );
}

export const errInput = (has: boolean) => `input ${has ? "border-brand-500 ring-4 ring-brand-100" : ""}`;

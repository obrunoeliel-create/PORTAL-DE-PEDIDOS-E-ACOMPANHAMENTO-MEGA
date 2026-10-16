// CEP: máscara, validação e "qual bairro da lista de taxas é este". Compartilhado entre cliente e servidor.

/** Só os dígitos do CEP (no máximo 8). */
export const cepDigits = (v: string) => v.replace(/\D/g, "").slice(0, 8);

/** "07244000" → "07244-000" enquanto digita. */
export function maskCep(v: string): string {
  const d = cepDigits(v);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export const isCompleteCep = (v: string) => cepDigits(v).length === 8;

/** Endereço devolvido pela busca do CEP. */
export type CepAddress = { cep: string; street: string; district: string; city: string; uf: string };

/** Nome sem acento, minúsculo e sem abreviações comuns (Jd. = Jardim, Pq. = Parque, Vl. = Vila). */
function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\bjd\.?\s/g, "jardim ")
    .replace(/\bpq\.?\s/g, "parque ")
    .replace(/\bvl\.?\s/g, "vila ")
    .replace(/\bres\.?\s/g, "residencial ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Bairro da lista de taxas que corresponde ao bairro do CEP. Primeiro procura o nome igual;
 * se não achar, aceita quando um nome contém o outro (ex: "Parque Jurema" e "Jurema").
 * Devolve null quando não há correspondência segura — aí a loja confirma a taxa.
 */
export function matchZone<Z extends { name: string }>(zones: Z[], district: string): Z | null {
  const d = normalize(district);
  if (!d) return null;
  const exact = zones.find((z) => normalize(z.name) === d);
  if (exact) return exact;
  const partial = zones.filter((z) => {
    const n = normalize(z.name);
    return n.length >= 4 && (d.includes(n) || n.includes(d));
  });
  return partial.length === 1 ? partial[0] : null;
}

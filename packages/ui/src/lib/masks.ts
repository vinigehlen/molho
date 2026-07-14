/**
 * Máscaras brasileiras do MoInput (doc de marca §5.1).
 * Toda máscara é pura: string suja entra, string formatada sai. Sem estado.
 */

import { formatCents, parseCents } from './format';

export type MaskKind = 'phone' | 'cpf' | 'cnpj' | 'cpfCnpj' | 'cep' | 'currency';

const digits = (value: string): string => value.replace(/\D/g, '');

/** (11) 98765-4321 — celular; (11) 3456-7890 — fixo. */
export function maskPhone(value: string): string {
  const d = digits(value).slice(0, 11);
  if (d.length <= 2) return d.replace(/^(\d{0,2})/, '($1');
  if (d.length <= 6) return d.replace(/^(\d{2})(\d{0,4})/, '($1) $2');
  if (d.length <= 10) return d.replace(/^(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
  return d.replace(/^(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
}

/** 123.456.789-00 */
export function maskCpf(value: string): string {
  const d = digits(value).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

/** 12.345.678/0001-90 */
export function maskCnpj(value: string): string {
  const d = digits(value).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

/** Decide entre CPF e CNPJ pelo tamanho — o lojista digita e a gente se vira. */
export function maskCpfCnpj(value: string): string {
  return digits(value).length <= 11 ? maskCpf(value) : maskCnpj(value);
}

/** 01310-100 */
export function maskCep(value: string): string {
  const d = digits(value).slice(0, 8);
  return d.replace(/^(\d{5})(\d{1,3})$/, '$1-$2');
}

/** Digitação da direita para a esquerda: "1990" → "R$ 19,90". */
export function maskCurrency(value: string): string {
  return formatCents(parseCents(value));
}

export const MASKS: Record<MaskKind, (value: string) => string> = {
  phone: maskPhone,
  cpf: maskCpf,
  cnpj: maskCnpj,
  cpfCnpj: maskCpfCnpj,
  cep: maskCep,
  currency: maskCurrency,
};

/** Tira a máscara — é isto que vai para a API, nunca a string bonita. */
export function unmask(value: string): string {
  return digits(value);
}

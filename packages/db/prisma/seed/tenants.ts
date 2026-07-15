import type { Plan } from '@molho/contracts';

export interface SeedTenantDef {
  slug: string;
  name: string;
  cnpj: string;
  plan: Plan;
  themeKey: string;
  store: {
    name: string;
    addressText: string;
    timezone: string;
    phone: string;
    whatsappNumber: string;
    minOrderCents: number;
  };
  owner: {
    name: string;
    /** E.164 — nunca gravado em claro, ver packages/db/src/crypto/phone.ts */
    phone: string;
  };
}

// CNPJs fictícios (mod 11 válido, raiz sequencial — não corresponde a
// empresa real) só pra exercitar o campo sem violar o formato esperado.
export const SEED_TENANTS: readonly SeedTenantDef[] = [
  {
    slug: 'hamburgueria-da-vila',
    name: 'Hamburgueria da Vila',
    cnpj: '12.345.678/0001-95',
    plan: 'standard',
    themeKey: 'brasa',
    store: {
      name: 'Hamburgueria da Vila — Bela Vista',
      addressText: 'Rua das Flores, 234 — Bela Vista, Estância Velha - RS',
      timezone: 'America/Sao_Paulo',
      phone: '+5551999990000',
      whatsappNumber: '+5551999990000',
      minOrderCents: 3000,
    },
    owner: {
      name: 'Vinicius',
      phone: '+5551999990000',
    },
  },
  {
    slug: 'pizzaria-roma',
    name: 'Pizzaria Roma',
    cnpj: '98.765.432/0001-98',
    plan: 'pro',
    themeKey: 'roxo',
    store: {
      name: 'Pizzaria Roma — Centro',
      addressText: 'Rua Comercial, 100 — Centro Histórico, Porto Alegre - RS',
      timezone: 'America/Sao_Paulo',
      phone: '+5551988880000',
      whatsappNumber: '+5551988880000',
      minOrderCents: 0,
    },
    owner: {
      name: 'Ana',
      phone: '+5551988880000',
    },
  },
] as const;

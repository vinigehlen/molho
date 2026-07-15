import type { Plan } from '@molho/contracts';

export interface SeedPlanDef {
  id: Plan;
  name: string;
  priceMonthCents: number;
}

// Preços de docs/02-definicoes-v1.md §4 (mensal, decisão D1/D2 13/07/2026).
export const SEED_PLANS: readonly SeedPlanDef[] = [
  { id: 'standard', name: 'Standard', priceMonthCents: 9900 },
  { id: 'pro', name: 'Pro', priceMonthCents: 18900 },
  { id: 'premium', name: 'Premium', priceMonthCents: 29900 },
] as const;

/**
 * Slot agendável — admin (Épico conversão, C3). Mesma forma de
 * store-hours-admin.ts (PUT do conjunto INTEIRO da semana, não patch de um
 * slot — mais simples pro lojista reordenar/remover, evita id de slot
 * vazando pro form): docs/handoff-features-conversao-gestor.md A3.
 *
 * Camada EM CIMA de store_hours, não substituta — validar que um slot cai
 * DENTRO do horário de funcionamento é responsabilidade do serviço de
 * checkout (fora do escopo deste contrato), não deste schema.
 *
 * Diferente de shiftSchema (StoreHours): v1 não modela slot atravessando
 * meia-noite — `endsAtMinutes` sempre > `startsAtMinutes` (mesmo CHECK no
 * banco). Simples de propósito, mesmo racional do resto do v1 ENXUTO do C2.
 */

import { z } from 'zod';
import { dayOfWeekSchema } from './store-hours-admin';

export const schedulingSlotSchema = z
  .object({
    dayOfWeek: dayOfWeekSchema,
    startsAtMinutes: z.int().min(0).max(1439),
    endsAtMinutes: z.int().min(0).max(1439),
    /** Teto de pedidos agendados NESTA ocorrência do slot (uma sexta específica), nunca somado entre semanas. */
    maxOrders: z.int().positive(),
  })
  .refine((v) => v.startsAtMinutes < v.endsAtMinutes, {
    message: 'startsAtMinutes precisa ser antes de endsAtMinutes.',
  });

export const putSchedulingSlotsSchema = z.strictObject({
  slots: z.array(schedulingSlotSchema),
});

export const schedulingSlotsResponseSchema = z.strictObject({
  slots: z.array(schedulingSlotSchema),
});

export type SchedulingSlot = z.infer<typeof schedulingSlotSchema>;
export type PutSchedulingSlotsInput = z.infer<typeof putSchedulingSlotsSchema>;
export type SchedulingSlotsResponse = z.infer<typeof schedulingSlotsResponseSchema>;

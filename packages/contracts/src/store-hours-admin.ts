/**
 * Contrato de horário de funcionamento — backoffice (Épico 6). `PUT` do
 * conjunto INTEIRO da semana (não patch de um turno): mais simples pro
 * lojista reordenar/remover turnos, e evita id de turno vazando pro
 * cliente do form.
 *
 * Validação de SOBREPOSIÇÃO de turnos no mesmo dia fica de fora
 * DELIBERADAMENTE — exige ordenar e comparar os turnos do dia entre si,
 * que é trabalho de servidor (ou de outro turno já persistido). Este
 * schema só garante a FORMA de cada turno isolado.
 */

import { z } from 'zod';

/** Espelha o enum `DayOfWeek` do Prisma (`packages/db/prisma/schema.prisma`). */
export const dayOfWeekSchema = z.enum([
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]);

/**
 * Minutos desde meia-noite (0–1439), não `TIME` — vira aritmética de
 * inteiro, não fuso. `closesAtMinutes < opensAtMinutes` É VÁLIDO: significa
 * "fecha no dia seguinte" (ex. sexta 22h–sábado 02h: dayOfWeek=friday,
 * opens=1320, closes=120).
 */
export const shiftSchema = z.object({
  dayOfWeek: dayOfWeekSchema,
  opensAtMinutes: z.int().min(0).max(1439),
  closesAtMinutes: z.int().min(0).max(1439),
});

export const putStoreHoursSchema = z.object({
  shifts: z.array(shiftSchema),
});

export const storeHoursResponseSchema = z.object({
  shifts: z.array(shiftSchema),
});

export type DayOfWeek = z.infer<typeof dayOfWeekSchema>;
export type Shift = z.infer<typeof shiftSchema>;
export type PutStoreHoursInput = z.infer<typeof putStoreHoursSchema>;
export type StoreHoursResponse = z.infer<typeof storeHoursResponseSchema>;

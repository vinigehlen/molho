import type { PutStoreHoursInput } from '@molho/contracts';
import { describe, expect, it, vi } from 'vitest';
import { StoreHoursValidationError } from './store-hours-admin.errors';
import type { StoreHoursAdminRepository } from './store-hours-admin.repository';
import { StoreHoursAdminService } from './store-hours-admin.service';

function makeService() {
  const repo: StoreHoursAdminRepository = {
    list: vi.fn(),
    replaceAll: vi.fn().mockResolvedValue({ shifts: [] }),
  };
  return { repo, service: new StoreHoursAdminService(repo) };
}

function replace(service: StoreHoursAdminService, shifts: PutStoreHoursInput['shifts']) {
  return service.replaceAll('store-1', { shifts });
}

describe('StoreHoursAdminService', () => {
  it('aceita vários turnos separados no mesmo dia', async () => {
    const { repo, service } = makeService();
    const shifts: PutStoreHoursInput['shifts'] = [
      { dayOfWeek: 'monday', opensAtMinutes: 11 * 60, closesAtMinutes: 14 * 60 },
      { dayOfWeek: 'monday', opensAtMinutes: 18 * 60, closesAtMinutes: 23 * 60 },
    ];

    await expect(replace(service, shifts)).resolves.toEqual({ shifts: [] });
    expect(repo.replaceAll).toHaveBeenCalledWith('store-1', { shifts });
  });

  it('aceita turnos que apenas encostam no mesmo dia', async () => {
    const { service } = makeService();

    await expect(
      replace(service, [
        { dayOfWeek: 'monday', opensAtMinutes: 10 * 60, closesAtMinutes: 12 * 60 },
        { dayOfWeek: 'monday', opensAtMinutes: 12 * 60, closesAtMinutes: 14 * 60 },
      ]),
    ).resolves.toEqual({ shifts: [] });
  });

  it('rejeita turnos sobrepostos no mesmo dia', () => {
    const { repo, service } = makeService();

    expect(() =>
      replace(service, [
        { dayOfWeek: 'monday', opensAtMinutes: 11 * 60, closesAtMinutes: 14 * 60 },
        { dayOfWeek: 'monday', opensAtMinutes: 13 * 60, closesAtMinutes: 15 * 60 },
      ]),
    ).toThrowError(new StoreHoursValidationError('Turnos não podem se sobrepor, inclusive na virada do dia.'));
    expect(repo.replaceAll).not.toHaveBeenCalled();
  });

  it('rejeita turno do dia seguinte dentro da cauda de um turno noturno', () => {
    const { service } = makeService();

    expect(() =>
      replace(service, [
        { dayOfWeek: 'friday', opensAtMinutes: 22 * 60, closesAtMinutes: 2 * 60 },
        { dayOfWeek: 'saturday', opensAtMinutes: 60, closesAtMinutes: 3 * 60 },
      ]),
    ).toThrowError('Turnos não podem se sobrepor, inclusive na virada do dia.');
  });

  it('aceita turno do dia seguinte começando quando o noturno termina', async () => {
    const { service } = makeService();

    await expect(
      replace(service, [
        { dayOfWeek: 'friday', opensAtMinutes: 22 * 60, closesAtMinutes: 2 * 60 },
        { dayOfWeek: 'saturday', opensAtMinutes: 2 * 60, closesAtMinutes: 3 * 60 },
      ]),
    ).resolves.toEqual({ shifts: [] });
  });

  it('rejeita sobreposição de sábado para domingo na virada da semana', () => {
    const { service } = makeService();

    expect(() =>
      replace(service, [
        { dayOfWeek: 'saturday', opensAtMinutes: 23 * 60, closesAtMinutes: 2 * 60 },
        { dayOfWeek: 'sunday', opensAtMinutes: 60, closesAtMinutes: 3 * 60 },
      ]),
    ).toThrowError('Turnos não podem se sobrepor, inclusive na virada do dia.');
  });

  it('rejeita turnos duplicados', () => {
    const { service } = makeService();
    const shift = { dayOfWeek: 'wednesday' as const, opensAtMinutes: 10 * 60, closesAtMinutes: 14 * 60 };

    expect(() => replace(service, [shift, shift])).toThrowError(
      'Turnos não podem se sobrepor, inclusive na virada do dia.',
    );
  });

  it('continua rejeitando turno de duração zero antes de testar sobreposição', () => {
    const { service } = makeService();

    expect(() =>
      replace(service, [{ dayOfWeek: 'sunday', opensAtMinutes: 10 * 60, closesAtMinutes: 10 * 60 }]),
    ).toThrowError('Turno precisa ter abertura e fechamento diferentes.');
  });
});

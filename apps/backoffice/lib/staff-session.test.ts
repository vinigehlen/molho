import { beforeEach, describe, expect, it } from 'vitest';
import { clearStaffSession, getStaffSession, setStaffSession } from './staff-session';

beforeEach(() => window.sessionStorage.clear());

describe('staff-session', () => {
  it('set → get devolve a sessão', () => {
    setStaffSession({ accessToken: 'tok', tenantId: 'tenant-1', userId: 'u1' });
    expect(getStaffSession()).toEqual({ accessToken: 'tok', tenantId: 'tenant-1', userId: 'u1' });
  });

  it('sem nada gravado: null', () => {
    expect(getStaffSession()).toBeNull();
  });

  it('clear remove', () => {
    setStaffSession({ accessToken: 'tok', tenantId: 'tenant-1', userId: 'u1' });
    clearStaffSession();
    expect(getStaffSession()).toBeNull();
  });

  it('storage corrompido (JSON inválido): null, não lança', () => {
    window.sessionStorage.setItem('molho.staff-session', '{nao-e-json');
    expect(getStaffSession()).toBeNull();
  });

  it('storage sem os campos certos: null', () => {
    window.sessionStorage.setItem('molho.staff-session', JSON.stringify({ accessToken: 'x' }));
    expect(getStaffSession()).toBeNull();
  });
});

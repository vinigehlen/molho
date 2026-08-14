import { beforeEach, describe, expect, it } from 'vitest';
import { clearStaffSession, getPreferredTenantId, getStaffSession, setStaffSession } from './staff-session';

const SESSION = { accessToken: 'tok', tenantId: 'tenant-1', tenantName: 'Cabanhas BBQ', userId: 'u1' };

beforeEach(() => {
  clearStaffSession();
  window.sessionStorage.clear();
});

describe('staff-session', () => {
  it('set → get devolve a sessão', () => {
    setStaffSession(SESSION);
    expect(getStaffSession()).toEqual(SESSION);
  });

  it('sem nada gravado: null', () => {
    expect(getStaffSession()).toBeNull();
  });

  it('clear remove', () => {
    setStaffSession(SESSION);
    clearStaffSession();
    expect(getStaffSession()).toBeNull();
  });

  it('não recupera credencial do storage depois de limpar a memória', () => {
    window.sessionStorage.setItem('molho.staff-session', JSON.stringify(SESSION));
    expect(getStaffSession()).toBeNull();
  });

  it('persiste somente o tenant preferido', () => {
    setStaffSession(SESSION);
    expect(getPreferredTenantId()).toBe('tenant-1');
    expect(window.sessionStorage.getItem('molho.staff-session')).toBeNull();
  });
});

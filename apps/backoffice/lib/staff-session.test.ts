import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStaffSession,
  getPreferredTenantId,
  getStaffSession,
  setStaffSession,
  subscribeStaffSessionClear,
} from './staff-session';

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

  it('avisa a aba atual quando a sessão é limpa', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStaffSessionClear(listener);

    setStaffSession(SESSION);
    clearStaffSession();

    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it('limpa a memória e o tenant quando outra aba anuncia logout', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStaffSessionClear(listener);
    setStaffSession(SESSION);

    window.dispatchEvent(
      new StorageEvent('storage', { key: 'molho.staff-logout', newValue: 'outra-aba' }),
    );

    expect(getStaffSession()).toBeNull();
    expect(getPreferredTenantId()).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});

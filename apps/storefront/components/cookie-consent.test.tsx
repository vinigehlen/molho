import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'molho_cookie_consent_v1';

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('CookieConsent', () => {
  it('não aparece quando analytics não está configurado', async () => {
    const { CookieConsent } = await import('./cookie-consent');

    render(<CookieConsent />);

    expect(screen.queryByLabelText('Preferências de cookies')).not.toBeInTheDocument();
  });

  it('salva aceite e dispara evento de consentimento', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_ID', 'G-TESTE');
    const { CookieConsent } = await import('./cookie-consent');
    const onConsent = vi.fn();
    window.addEventListener('molho:analytics-consent', onConsent);

    render(<CookieConsent />);

    expect(await screen.findByLabelText('Preferências de cookies')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar' }));

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('accepted');
    expect(onConsent).toHaveBeenCalledWith(expect.objectContaining({ detail: 'accepted' }));
    await waitFor(() => expect(screen.queryByLabelText('Preferências de cookies')).not.toBeInTheDocument());

    window.removeEventListener('molho:analytics-consent', onConsent);
  });
});


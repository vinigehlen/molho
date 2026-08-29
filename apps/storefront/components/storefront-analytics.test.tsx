import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'molho_cookie_consent_v1';

vi.mock('next/navigation', () => ({
  usePathname: () => '/acai-da-ana',
}));

afterEach(() => {
  window.localStorage.clear();
  document.head.innerHTML = '';
  delete window.gtag;
  delete window.dataLayer;
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('StorefrontAnalytics', () => {
  it('não captura page view antes do consentimento', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_ID', 'G-TESTE');
    const gtag = vi.fn();
    window.gtag = gtag;
    const { StorefrontAnalytics } = await import('./storefront-analytics');

    render(<StorefrontAnalytics />);

    await waitFor(() => expect(gtag).not.toHaveBeenCalledWith('event', 'storefront_page_viewed', expect.anything()));
  });

  it('captura page view do storefront quando consentimento já foi aceito', async () => {
    vi.stubEnv('NEXT_PUBLIC_GA_ID', 'G-TESTE');
    window.localStorage.setItem(STORAGE_KEY, 'accepted');
    const gtag = vi.fn();
    window.gtag = gtag;
    const { StorefrontAnalytics } = await import('./storefront-analytics');

    render(<StorefrontAnalytics />);

    await waitFor(() =>
      expect(gtag).toHaveBeenCalledWith(
        'event',
        'storefront_page_viewed',
        expect.objectContaining({ path: '/acai-da-ana' }),
      ),
    );
  });
});


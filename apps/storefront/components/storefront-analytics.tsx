'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const STORAGE_KEY = 'molho_cookie_consent_v1';
const CONSENT_EVENT = 'molho:analytics-consent';
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://app.posthog.com';
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

declare global {
  interface Window {
    posthog?: {
      init: (key: string, options: Record<string, unknown>) => void;
      capture: (event: string, properties?: Record<string, unknown>) => void;
    };
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function consentAccepted(): boolean {
  return typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) === 'accepted';
}

function loadScript(id: string, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.id = id;
    script.async = true;
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Falha ao carregar ${id}.`));
    document.head.appendChild(script);
  });
}

async function enableAnalytics() {
  if (POSTHOG_KEY && !window.posthog) {
    await loadScript('molho-posthog', `${POSTHOG_HOST.replace(/\/+$/, '')}/static/array.js`);
    const posthog = window.posthog as Window['posthog'] | undefined;
    posthog?.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      capture_pageview: false,
      autocapture: false,
      persistence: 'localStorage+cookie',
    });
  }

  if (GA_ID && !window.gtag) {
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = (...args: unknown[]) => {
      window.dataLayer?.push(args);
    };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { send_page_view: false });
    await loadScript('molho-ga', `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`);
  }
}

function capture(event: string, properties: Record<string, unknown> = {}) {
  if (!consentAccepted()) return;
  window.posthog?.capture(event, properties);
  window.gtag?.('event', event, properties);
}

export function StorefrontAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!POSTHOG_KEY && !GA_ID) return;

    const onConsent = (event: Event) => {
      if ((event as CustomEvent).detail === 'accepted') {
        void enableAnalytics().then(() => capture('analytics_consent_accepted'));
      }
    };

    window.addEventListener(CONSENT_EVENT, onConsent);
    if (consentAccepted()) void enableAnalytics();
    return () => window.removeEventListener(CONSENT_EVENT, onConsent);
  }, []);

  useEffect(() => {
    if (!POSTHOG_KEY && !GA_ID) return;
    void enableAnalytics().then(() => {
      capture('storefront_page_viewed', {
        path: pathname,
        url: window.location.href,
      });
    });
  }, [pathname]);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target.closest('button, a') : null;
      if (!(target instanceof HTMLElement)) return;
      const label = target.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      capture('storefront_action_clicked', {
        label,
        path: window.location.pathname,
      });
    }

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return null;
}


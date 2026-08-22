/**
 * A landing é topo de funil pro backoffice (signup/login do Épico 13).
 * Nunca hardcodar domínio — `NEXT_PUBLIC_APP_URL` é inlinado no build
 * (Next.js), então trocar env exige rebuild (docs/13-landing-site.md §6).
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://staging-app.molho.live';

export const SIGNUP_URL = `${APP_URL}/signup`;
export const LOGIN_URL = `${APP_URL}/login`;

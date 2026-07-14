import { defineConfig, devices } from '@playwright/test';

/**
 * Teste de contraste real: renderiza cada story em cada tema no Chromium e mede
 * o pixel. Depende do build do Storybook (`pnpm --filter @molho/ui build`).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],

  use: {
    baseURL: 'http://localhost:4321',
    // O contraste é medido em CSS pixels; a escala não muda a razão, mas mantém
    // o screenshot de falha legível.
    deviceScaleFactor: 2,
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    command: 'node e2e/static-server.mjs',
    url: 'http://localhost:4321/iframe.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});

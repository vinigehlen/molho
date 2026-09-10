import { defineConfig, devices } from 'playwright/test';

const storefrontEnv = {
  ...process.env,
  MOLHO_API_INTERNAL_URL: 'http://127.0.0.1:3334',
  MOLHO_STOREFRONT_ROOT_DOMAIN: 'localhost',
  MOLHO_STOREFRONT_PATH_MODE: 'false',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: 'http://cabanhas-bbq.localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/mock-api.mjs',
      url: 'http://127.0.0.1:3334/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'node ../../node_modules/typescript/bin/tsc -p ../../packages/contracts/tsconfig.build.json && node node_modules/next/dist/bin/next dev -p 3100',
      url: 'http://cabanhas-bbq.localhost:3100',
      reuseExistingServer: false,
      timeout: 90_000,
      env: storefrontEnv,
    },
  ],
});

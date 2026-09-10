import { expect, test } from 'playwright/test';

const TRACKING_TOKEN = '0193f1a0-0000-7000-8000-000000000005';

test('subdomínio → catálogo → BFF → checkout OTP → tracking, sem slug público', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const homeResponse = await page.goto('/');
  expect(homeResponse?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Cabanhas BBQ' })).toBeVisible();
  await expect(page.getByText('Combo Brasa')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/');

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'http://cabanhas-bbq.localhost:3100');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', 'http://cabanhas-bbq.localhost:3100/manifest.webmanifest');
  const csp = homeResponse?.headers()['content-security-policy'];
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(homeResponse?.headers()['x-content-type-options']).toBe('nosniff');

  await page.getByRole('button', { name: 'Adicionar Combo Brasa ao carrinho' }).click();
  await page.getByRole('link', { name: /Carrinho, 1 item/ }).click();
  await expect(page).toHaveURL('http://cabanhas-bbq.localhost:3100/carrinho');

  await page.getByRole('button', { name: 'Retirar no balcão' }).click();
  await page.getByRole('button', { name: 'Fazer pedido' }).click();
  await expect(page.getByText('Revisa seu pedido')).toBeVisible();
  await page.getByRole('checkbox', { name: /Li e aceito/ }).check();
  await page.getByRole('button', { name: 'Confirmar pedido' }).click();

  await expect(page.getByRole('heading', { name: 'Confirma seu telefone' })).toBeVisible();
  await page.getByLabel('Confirma seu telefone').getByLabel('Telefone').fill('51999999999');
  await page.getByLabel('Confirma seu telefone').getByRole('button', { name: 'Enviar código' }).click();
  await page.getByLabel('Digite o código').getByLabel('Código').fill('123456');
  await page.getByLabel('Digite o código').getByRole('button', { name: 'Confirmar código' }).click();
  await expect(page.getByRole('heading', { name: 'Pedido feito!' })).toBeVisible();

  await page.getByRole('button', { name: 'Acompanhar pedido' }).click();
  await expect(page).toHaveURL(`http://cabanhas-bbq.localhost:3100/acompanhar/${TRACKING_TOKEN}`);
  await expect(page.getByText('Pedido recebido', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText('Pedido recebido', { exact: true })).toBeVisible();
  expect(new URL(page.url()).pathname).not.toContain('/cabanhas-bbq/');
  expect(consoleErrors).toEqual([]);

  await testInfo.attach('tracking-page', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
});

test('BFF nega namespace administrativo, tenant cruzado e payload excessivo', async ({ request }) => {
  const catalog = await request.get('/api/store/cabanhas-bbq');
  expect(catalog.status()).toBe(200);

  const admin = await request.get('/api/store/cabanhas-bbq/admin/orders');
  expect(admin.status()).toBe(404);

  const platform = await request.get('/api/store/cabanhas-bbq/platform/tenants');
  expect(platform.status()).toBe(404);

  const crossedTenant = await request.get('/api/store/outra-loja');
  expect(crossedTenant.status()).toBe(404);

  const oversized = await request.post('/api/store/cabanhas-bbq/checkout/revalidate', {
    headers: { 'content-type': 'application/json' },
    data: { value: 'x'.repeat(256 * 1024) },
  });
  expect(oversized.status()).toBe(413);
});

test('coletor de CSP aceita somente relatório sanitizável', async ({ request }) => {
  const response = await request.post('/api/csp-report', {
    headers: { 'content-type': 'application/csp-report' },
    data: {
      'csp-report': {
        'violated-directive': 'script-src-elem',
        'blocked-uri': 'https://cdn.example.test/asset.js?customer=email@example.test',
        'document-uri': 'http://cabanhas-bbq.localhost:3100/carrinho?phone=51999999999',
      },
    },
  });
  expect(response.status()).toBe(204);
});

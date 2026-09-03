import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(__dirname, '../prisma/migrations/20260902140000_notification_log_epico11/migration.sql'),
  'utf8',
);

describe('notification_log migration', () => {
  it('cria histórico append-only com RLS de select/insert e sem update/delete', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "notification_log"');
    expect(migration).toContain('ALTER TABLE "notification_log" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('FOR SELECT USING (app_tenant_visible("tenant_id"))');
    expect(migration).toContain('FOR INSERT WITH CHECK (app_tenant_visible("tenant_id"))');
    expect(migration).toContain('"notification_log_order_id_tenant_id_fkey"');
    expect(migration).not.toMatch(/FOR UPDATE|FOR DELETE|GRANT .*UPDATE|GRANT .*DELETE/i);
  });
});

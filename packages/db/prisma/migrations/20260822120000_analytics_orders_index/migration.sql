CREATE INDEX IF NOT EXISTS "orders_tenant_created_status_idx" ON "orders"("tenant_id", "created_at", "status");

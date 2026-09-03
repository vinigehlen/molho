-- Épico 11 — histórico append-only do click-to-chat.
CREATE TABLE IF NOT EXISTS "notification_log" (
  "id" UUID NOT NULL DEFAULT uuidv7(),
  "tenant_id" UUID NOT NULL,
  "order_id" UUID NOT NULL,
  "channel" TEXT NOT NULL,
  "order_status_snapshot" "OrderStatus" NOT NULL,
  "actor_id" UUID NOT NULL,
  "actor_role" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "notification_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notification_log_tenant_id_order_id_created_at_idx"
  ON "notification_log"("tenant_id", "order_id", "created_at");

DO $$
BEGIN
  ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_order_id_tenant_id_fkey"
    FOREIGN KEY ("order_id", "tenant_id") REFERENCES "orders"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_channel_check"
    CHECK ("channel" = 'whatsapp_ctc');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "notification_log" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_select ON "notification_log";
CREATE POLICY tenant_isolation_select ON "notification_log"
  FOR SELECT USING (app_tenant_visible("tenant_id"));
DROP POLICY IF EXISTS tenant_isolation_insert ON "notification_log";
CREATE POLICY tenant_isolation_insert ON "notification_log"
  FOR INSERT WITH CHECK (app_tenant_visible("tenant_id"));

-- Append-only como audit_log/order_status_history: sem policy de UPDATE/DELETE.

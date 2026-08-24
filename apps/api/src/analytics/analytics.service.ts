import type {
  AnalyticsCustomer,
  AnalyticsFulfillment,
  AnalyticsGranularity,
  AnalyticsIdleItem,
  AnalyticsOverview,
  AnalyticsPeakHour,
  AnalyticsRegion,
  AnalyticsTimeseriesPoint,
  AnalyticsTopItem,
  AnalyticsTopItemsSort,
} from '@molho/contracts';
import { decryptPhone, Prisma } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';

export interface AnalyticsPeriod {
  from: Date;
  to: Date;
  fulfillment?: AnalyticsFulfillment;
}

type CountMoneyRow = { pedidos: bigint | number | null; faturamentoCents: bigint | number | null };
type FulfillmentRow = { tipo: AnalyticsFulfillment; pedidos: bigint | number | null; faturamentoCents: bigint | number | null };
type CustomerRow = CountMoneyRow & {
  customerId: string;
  nomeMascarado: string | null;
  phoneCiphertext: Uint8Array | Buffer | null;
  phoneKeyVersion: number;
};

const SP_TZ = 'America/Sao_Paulo';

function asNumber(value: bigint | number | null | undefined): number {
  if (typeof value === 'bigint') return Number(value);
  return value ?? 0;
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  const local = digits.slice(-11);
  if (local.length !== 11) return `••••${digits.slice(-4)}`;
  return `(${local.slice(0, 2)}) *****-${local.slice(-4)}`;
}

function maskEncryptedPhone(ciphertext: Uint8Array | Buffer | null, keyVersion: number): string | null {
  if (!ciphertext) return null;
  try {
    return maskPhone(decryptPhone(Buffer.from(ciphertext), keyVersion));
  } catch {
    return null;
  }
}

function rowMoney(row: CountMoneyRow | undefined) {
  return { pedidos: asNumber(row?.pedidos), faturamentoCents: asNumber(row?.faturamentoCents) };
}

export class AnalyticsService {
  constructor(private readonly requestContext: RequestContextService) {}

  async overview(storeId: string, period: AnalyticsPeriod): Promise<AnalyticsOverview> {
    await this.assertStoreExists(storeId);
    const realizadoRows = await this.moneyByStatus(storeId, period, Prisma.sql`o."status" = 'completed' AND o."payment_status" = 'confirmado'`);
    const abertoRows = await this.moneyByStatus(storeId, period, Prisma.sql`o."status" IN ('received','preparing','ready','in_transit')`);
    const fulfillmentRows = await this.requestContext.getClient().$queryRaw<FulfillmentRow[]>`
      SELECT ${this.fulfillmentCase()} AS "tipo",
             count(*) AS "pedidos",
             COALESCE(sum(COALESCE(o."current_total_cents", o."total_cents")), 0) AS "faturamentoCents"
      FROM "orders" o
      LEFT JOIN "customers" c ON c."id" = o."customer_id" AND c."tenant_id" = o."tenant_id"
      WHERE ${this.baseWhere(storeId, period)}
        AND o."status" = 'completed'
        AND o."payment_status" = 'confirmado'
      GROUP BY 1
      ORDER BY 1
    `;
    const realizado = rowMoney(realizadoRows[0]);
    const emAberto = rowMoney(abertoRows[0]);
    return {
      realizado: {
        ...realizado,
        ticketMedioCents: realizado.pedidos === 0 ? 0 : Math.round(realizado.faturamentoCents / realizado.pedidos),
      },
      emAberto,
      fulfillment: fulfillmentRows.map((row) => ({
        tipo: row.tipo,
        pedidos: asNumber(row.pedidos),
        faturamentoCents: asNumber(row.faturamentoCents),
      })),
    };
  }

  async timeseries(storeId: string, period: AnalyticsPeriod, granularity: AnalyticsGranularity): Promise<AnalyticsTimeseriesPoint[]> {
    await this.assertStoreExists(storeId);
    const trunc = granularity === 'month' ? Prisma.sql`'month'` : Prisma.sql`'day'`;
    const rows = await this.requestContext.getClient().$queryRaw<Array<CountMoneyRow & { bucket: Date }>>`
      SELECT date_trunc(${trunc}, o."created_at" AT TIME ZONE ${SP_TZ}) AS "bucket",
             count(*) AS "pedidos",
             COALESCE(sum(COALESCE(o."current_total_cents", o."total_cents")), 0) AS "faturamentoCents"
      FROM "orders" o
      LEFT JOIN "customers" c ON c."id" = o."customer_id" AND c."tenant_id" = o."tenant_id"
      WHERE ${this.baseWhere(storeId, period)}
        AND o."status" = 'completed'
        AND o."payment_status" = 'confirmado'
      GROUP BY 1
      ORDER BY 1
    `;
    return rows.map((row) => ({
      bucket: row.bucket instanceof Date ? row.bucket.toISOString().slice(0, granularity === 'month' ? 7 : 10) : String(row.bucket),
      pedidos: asNumber(row.pedidos),
      faturamentoCents: asNumber(row.faturamentoCents),
    }));
  }

  async peakHours(storeId: string, period: AnalyticsPeriod): Promise<AnalyticsPeakHour[]> {
    await this.assertStoreExists(storeId);
    const rows = await this.requestContext.getClient().$queryRaw<Array<CountMoneyRow & { dow: bigint | number; hour: bigint | number }>>`
      SELECT EXTRACT(dow FROM o."created_at" AT TIME ZONE ${SP_TZ})::int AS "dow",
             EXTRACT(hour FROM o."created_at" AT TIME ZONE ${SP_TZ})::int AS "hour",
             count(*) AS "pedidos",
             COALESCE(sum(COALESCE(o."current_total_cents", o."total_cents")), 0) AS "faturamentoCents"
      FROM "orders" o
      LEFT JOIN "customers" c ON c."id" = o."customer_id" AND c."tenant_id" = o."tenant_id"
      WHERE ${this.baseWhere(storeId, period)}
        AND o."status" = 'completed'
        AND o."payment_status" = 'confirmado'
      GROUP BY 1, 2
      ORDER BY 1, 2
    `;
    return rows.map((row) => ({
      dow: asNumber(row.dow),
      hour: asNumber(row.hour),
      pedidos: asNumber(row.pedidos),
      faturamentoCents: asNumber(row.faturamentoCents),
    }));
  }

  async topItems(storeId: string, period: AnalyticsPeriod, limit: number, sort: AnalyticsTopItemsSort): Promise<AnalyticsTopItem[]> {
    await this.assertStoreExists(storeId);
    const order = sort === 'revenue' ? Prisma.sql`"faturamentoCents" DESC, "unidades" DESC` : Prisma.sql`"unidades" DESC, "faturamentoCents" DESC`;
    const rows = await this.requestContext.getClient().$queryRaw<
      Array<{ productId: string; nome: string; unidades: bigint | number; faturamentoCents: bigint | number }>
    >`
      SELECT oi."product_id" AS "productId",
             max(oi."name") AS "nome",
             COALESCE(sum(oi."quantity"), 0) AS "unidades",
             COALESCE(sum(oi."line_total_cents"), 0) AS "faturamentoCents"
      FROM "order_items" oi
      JOIN "orders" o ON o."id" = oi."order_id" AND o."tenant_id" = oi."tenant_id"
      LEFT JOIN "customers" c ON c."id" = o."customer_id" AND c."tenant_id" = o."tenant_id"
      WHERE ${this.baseWhere(storeId, period)}
        AND o."status" = 'completed'
        AND o."payment_status" = 'confirmado'
      GROUP BY oi."product_id"
      ORDER BY ${order}
      LIMIT ${limit}
    `;
    return rows.map((row) => ({
      productId: row.productId,
      nome: row.nome,
      unidades: asNumber(row.unidades),
      faturamentoCents: asNumber(row.faturamentoCents),
    }));
  }

  async customers(storeId: string, period: AnalyticsPeriod, limit: number): Promise<AnalyticsCustomer[]> {
    await this.assertStoreExists(storeId);
    const rows = await this.requestContext.getClient().$queryRaw<CustomerRow[]>`
      SELECT c."id" AS "customerId",
             c."name" AS "nomeMascarado",
             c."phone_ciphertext" AS "phoneCiphertext",
             c."phone_key_version" AS "phoneKeyVersion",
             count(*) AS "pedidos",
             COALESCE(sum(COALESCE(o."current_total_cents", o."total_cents")), 0) AS "faturamentoCents"
      FROM "orders" o
      JOIN "customers" c ON c."id" = o."customer_id" AND c."tenant_id" = o."tenant_id"
      WHERE ${this.baseWhere(storeId, period)}
        AND o."status" = 'completed'
        AND o."payment_status" = 'confirmado'
      GROUP BY c."id", c."name", c."phone_ciphertext", c."phone_key_version"
      ORDER BY "faturamentoCents" DESC, "pedidos" DESC
      LIMIT ${limit}
    `;
    return rows.map((row) => ({
      customerId: row.customerId,
      nomeMascarado: row.nomeMascarado,
      telefoneMascarado: maskEncryptedPhone(row.phoneCiphertext, row.phoneKeyVersion),
      pedidos: asNumber(row.pedidos),
      faturamentoCents: asNumber(row.faturamentoCents),
    }));
  }

  async regions(storeId: string, period: AnalyticsPeriod): Promise<AnalyticsRegion[]> {
    await this.assertStoreExists(storeId);
    const rows = await this.requestContext.getClient().$queryRaw<
      Array<CountMoneyRow & { cityKey: string | null; cidade: string | null; uf: string | null }>
    >`
      WITH base AS (
        SELECT CASE WHEN o."fulfillment_type" = 'delivery' AND o."delivery_city" IS NOT NULL
                    THEN molho_city_key(o."delivery_city")
                    ELSE NULL
               END AS "cityKey",
               CASE WHEN o."fulfillment_type" = 'delivery' AND o."delivery_city" IS NOT NULL
                    THEN o."delivery_city"
                    ELSE 'Sem região'
               END AS "cidade",
               CASE WHEN o."fulfillment_type" = 'delivery' AND o."delivery_city" IS NOT NULL
                    THEN o."delivery_state"
                    ELSE NULL
               END AS "uf",
               COALESCE(o."current_total_cents", o."total_cents") AS "totalCents"
        FROM "orders" o
        LEFT JOIN "customers" c ON c."id" = o."customer_id" AND c."tenant_id" = o."tenant_id"
        WHERE ${this.baseWhere(storeId, period)}
          AND o."status" = 'completed'
          AND o."payment_status" = 'confirmado'
      )
      SELECT "cityKey",
             max("cidade") AS "cidade",
             max("uf") AS "uf",
             count(*) AS "pedidos",
             COALESCE(sum("totalCents"), 0) AS "faturamentoCents"
      FROM base
      GROUP BY "cityKey"
      ORDER BY "faturamentoCents" DESC, "pedidos" DESC
    `;
    return rows.map((row) => ({
      cityKey: row.cityKey,
      cidade: row.cidade ?? 'Sem região',
      uf: row.uf,
      pedidos: asNumber(row.pedidos),
      faturamentoCents: asNumber(row.faturamentoCents),
    }));
  }

  async idleItems(storeId: string, period: AnalyticsPeriod): Promise<AnalyticsIdleItem[]> {
    await this.assertStoreExists(storeId);
    return this.requestContext.getClient().$queryRaw<AnalyticsIdleItem[]>`
      WITH sold AS (
        SELECT oi."product_id", COALESCE(sum(oi."quantity"), 0) AS "unidades"
        FROM "order_items" oi
        JOIN "orders" o ON o."id" = oi."order_id" AND o."tenant_id" = oi."tenant_id"
        LEFT JOIN "customers" c ON c."id" = o."customer_id" AND c."tenant_id" = o."tenant_id"
        WHERE o."store_id" = ${storeId}::uuid
          AND o."created_at" >= ${period.from}
          AND o."created_at" <= ${period.to}
          AND o."status" = 'completed'
          AND o."payment_status" = 'confirmado'
          ${period.fulfillment ? Prisma.sql`AND ${this.fulfillmentCase()} = ${period.fulfillment}` : Prisma.empty}
        GROUP BY oi."product_id"
      )
      SELECT p."id" AS "productId", p."name" AS "nome", cat."name" AS "categoria"
      FROM "products" p
      JOIN "categories" cat ON cat."id" = p."category_id" AND cat."tenant_id" = p."tenant_id"
      LEFT JOIN sold ON sold."product_id" = p."id"
      WHERE p."deleted_at" IS NULL
        AND COALESCE(sold."unidades", 0) = 0
      ORDER BY cat."name", p."name"
    `;
  }

  private moneyByStatus(storeId: string, period: AnalyticsPeriod, statusWhere: Prisma.Sql) {
    return this.requestContext.getClient().$queryRaw<CountMoneyRow[]>`
      SELECT count(*) AS "pedidos",
             COALESCE(sum(COALESCE(o."current_total_cents", o."total_cents")), 0) AS "faturamentoCents"
      FROM "orders" o
      LEFT JOIN "customers" c ON c."id" = o."customer_id" AND c."tenant_id" = o."tenant_id"
      WHERE ${this.baseWhere(storeId, period)}
        AND ${statusWhere}
    `;
  }

  private baseWhere(storeId: string, period: AnalyticsPeriod): Prisma.Sql {
    return Prisma.sql`
      o."store_id" = ${storeId}::uuid
      AND o."created_at" >= ${period.from}
      AND o."created_at" <= ${period.to}
      AND o."status" NOT IN ('expired','auto_canceled','canceled','delivery_failed')
      ${period.fulfillment ? Prisma.sql`AND ${this.fulfillmentCase()} = ${period.fulfillment}` : Prisma.empty}
    `;
  }

  private fulfillmentCase(): Prisma.Sql {
    return Prisma.sql`
      CASE
        WHEN o."fulfillment_type" = 'delivery' THEN 'delivery'
        WHEN o."fulfillment_type" = 'pickup'
          AND (o."payment_method" IN ('cash_at_counter','card_at_counter') OR c."phone_ciphertext" IS NULL) THEN 'balcao'
        ELSE 'pickup'
      END
    `;
  }

  private async assertStoreExists(storeId: string): Promise<void> {
    await this.requestContext.getClient().store.findFirstOrThrow({ where: { id: storeId, deletedAt: null }, select: { id: true } });
  }
}

import { Prisma } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';
import type { PrintTicketOrder } from './print-ticket';

export interface PrintJobRecord {
  id: string;
  orderId: string;
  idempotencyKey: string;
  status: 'queued' | 'printing' | 'printed' | 'failed';
  ticketText: string;
  width: number;
  cut: boolean;
  attempts: number;
  leaseUntil: Date | null;
  leasedBy: string | null;
  lastError: string | null;
  version: number;
  createdAt: Date;
  printedAt: Date | null;
}

export interface CreatePrintJobParams {
  orderId: string;
  idempotencyKey: string;
  ticketText: string;
  width: number;
  cut: boolean;
}

export interface ClaimPrintJobParams {
  workerId: string;
  leaseSeconds: number;
  width?: number;
}

export interface FinishPrintJobParams {
  id: string;
  expectedVersion: number;
  workerId: string;
}

export interface FailPrintJobParams extends FinishPrintJobParams {
  error: string;
}

export interface PrintQueueStatus {
  queued: number;
  printing: number;
  failed: number;
  stalePrinting: number;
  oldestQueuedAt: Date | null;
  lastFailureAt: Date | null;
  lastError: string | null;
}

export interface PrintJobRepository {
  findOrderForTicket(orderId: string): Promise<PrintTicketOrder | null>;
  createIdempotent(params: CreatePrintJobParams): Promise<PrintJobRecord>;
  claimNext(params: ClaimPrintJobParams): Promise<PrintJobRecord | null>;
  markPrinted(params: FinishPrintJobParams): Promise<boolean>;
  markFailed(params: FailPrintJobParams): Promise<boolean>;
  getStatus(): Promise<PrintQueueStatus>;
}

const PRINT_JOB_SELECT = {
  id: true,
  orderId: true,
  idempotencyKey: true,
  status: true,
  ticketText: true,
  width: true,
  cut: true,
  attempts: true,
  leaseUntil: true,
  leasedBy: true,
  lastError: true,
  version: true,
  createdAt: true,
  printedAt: true,
} as const;

type RawPrintJobRow = {
  id: string;
  order_id: string;
  idempotency_key: string;
  status: PrintJobRecord['status'];
  ticket_text: string;
  width: number;
  cut: boolean;
  attempts: number;
  lease_until: Date | null;
  leased_by: string | null;
  last_error: string | null;
  version: number;
  created_at: Date;
  printed_at: Date | null;
};

type RawPrintQueueStatusRow = {
  queued: bigint | number;
  printing: bigint | number;
  failed: bigint | number;
  stale_printing: bigint | number;
  oldest_queued_at: Date | null;
  last_failure_at: Date | null;
  last_error: string | null;
};

function toPrintJob(row: RawPrintJobRow): PrintJobRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    ticketText: row.ticket_text,
    width: row.width,
    cut: row.cut,
    attempts: row.attempts,
    leaseUntil: row.lease_until,
    leasedBy: row.leased_by,
    lastError: row.last_error,
    version: row.version,
    createdAt: row.created_at,
    printedAt: row.printed_at,
  };
}

function toNumber(value: bigint | number): number {
  return typeof value === 'bigint' ? Number(value) : value;
}

function returningPrintJobSql() {
  return Prisma.sql`
    "id", "order_id", "idempotency_key", "status", "ticket_text", "width", "cut",
    "attempts", "lease_until", "leased_by", "last_error", "version", "created_at", "printed_at"
  `;
}

function returningPrintJobSqlFrom(alias: string) {
  const table = Prisma.raw(alias);
  return Prisma.sql`
    ${table}."id", ${table}."order_id", ${table}."idempotency_key", ${table}."status", ${table}."ticket_text",
    ${table}."width", ${table}."cut", ${table}."attempts", ${table}."lease_until", ${table}."leased_by",
    ${table}."last_error", ${table}."version", ${table}."created_at", ${table}."printed_at"
  `;
}

export class PrismaPrintJobRepository implements PrintJobRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async findOrderForTicket(orderId: string): Promise<PrintTicketOrder | null> {
    return this.requestContext.getClient().order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        id: true,
        createdAt: true,
        fulfillmentType: true,
        customer: { select: { name: true } },
        store: { select: { timezone: true } },
        items: {
          orderBy: { createdAt: 'asc' },
          select: {
            name: true,
            quantity: true,
            notes: true,
            modifiers: { orderBy: { createdAt: 'asc' }, select: { name: true } },
          },
        },
      },
    });
  }

  async createIdempotent(params: CreatePrintJobParams): Promise<PrintJobRecord> {
    const tenantId = this.requestContext.getTenantId();
    const inserted = await this.requestContext.getClient().$queryRaw<RawPrintJobRow[]>`
      INSERT INTO "print_jobs" (
        "tenant_id", "order_id", "idempotency_key", "ticket_text", "width", "cut"
      ) VALUES (
        ${tenantId}::uuid, ${params.orderId}::uuid, ${params.idempotencyKey}, ${params.ticketText}, ${params.width}, ${params.cut}
      )
      ON CONFLICT ("tenant_id", "idempotency_key") DO NOTHING
      RETURNING ${returningPrintJobSql()}
    `;
    if (inserted[0]) return toPrintJob(inserted[0]);

    const existing = await this.requestContext.getClient().printJob.findFirst({
      where: { tenantId, idempotencyKey: params.idempotencyKey, deletedAt: null },
      select: PRINT_JOB_SELECT,
    });
    if (!existing) throw new Error('print_job idempotente conflitou mas nao foi encontrado.');
    return existing;
  }

  async claimNext(params: ClaimPrintJobParams): Promise<PrintJobRecord | null> {
    const tenantId = this.requestContext.getTenantId();
    const widthFilter =
      params.width === undefined ? Prisma.empty : Prisma.sql`AND "width" = ${params.width}`;
    const rows = await this.requestContext.getClient().$queryRaw<RawPrintJobRow[]>`
      WITH next_job AS (
        SELECT "id"
        FROM "print_jobs"
        WHERE "tenant_id" = ${tenantId}::uuid
          AND "deleted_at" IS NULL
          AND (
            "status" = 'queued'
            OR ("status" = 'printing' AND "lease_until" < now())
          )
          ${widthFilter}
        ORDER BY "created_at" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "print_jobs" AS pj
      SET
        "status" = 'printing',
        "leased_by" = ${params.workerId},
        "lease_until" = now() + (${params.leaseSeconds} * interval '1 second'),
        "attempts" = pj."attempts" + 1,
        "last_error" = NULL,
        "version" = pj."version" + 1,
        "updated_at" = now()
      FROM next_job
      WHERE pj."id" = next_job."id"
      RETURNING ${returningPrintJobSqlFrom('pj')}
    `;
    return rows[0] ? toPrintJob(rows[0]) : null;
  }

  async markPrinted(params: FinishPrintJobParams): Promise<boolean> {
    const rows = await this.requestContext.getClient().$queryRaw<{ id: string }[]>`
      UPDATE "print_jobs"
      SET
        "status" = 'printed',
        "printed_at" = now(),
        "lease_until" = NULL,
        "leased_by" = NULL,
        "version" = "version" + 1,
        "updated_at" = now()
      WHERE "id" = ${params.id}::uuid
        AND "version" = ${params.expectedVersion}
        AND "status" = 'printing'
        AND "leased_by" = ${params.workerId}
        AND "deleted_at" IS NULL
      RETURNING "id"
    `;
    return rows.length > 0;
  }

  async markFailed(params: FailPrintJobParams): Promise<boolean> {
    const rows = await this.requestContext.getClient().$queryRaw<{ id: string }[]>`
      UPDATE "print_jobs"
      SET
        "status" = 'failed',
        "last_error" = ${params.error},
        "lease_until" = NULL,
        "leased_by" = NULL,
        "version" = "version" + 1,
        "updated_at" = now()
      WHERE "id" = ${params.id}::uuid
        AND "version" = ${params.expectedVersion}
        AND "status" = 'printing'
        AND "leased_by" = ${params.workerId}
        AND "deleted_at" IS NULL
      RETURNING "id"
    `;
    return rows.length > 0;
  }

  async getStatus(): Promise<PrintQueueStatus> {
    const tenantId = this.requestContext.getTenantId();
    const rows = await this.requestContext.getClient().$queryRaw<RawPrintQueueStatusRow[]>`
      SELECT
        COUNT(*) FILTER (WHERE "status" = 'queued') AS "queued",
        COUNT(*) FILTER (WHERE "status" = 'printing') AS "printing",
        COUNT(*) FILTER (WHERE "status" = 'failed') AS "failed",
        COUNT(*) FILTER (WHERE "status" = 'printing' AND "lease_until" < now()) AS "stale_printing",
        MIN("created_at") FILTER (WHERE "status" = 'queued') AS "oldest_queued_at",
        MAX("updated_at") FILTER (WHERE "status" = 'failed') AS "last_failure_at",
        (
          SELECT "last_error"
          FROM "print_jobs"
          WHERE "tenant_id" = ${tenantId}::uuid
            AND "deleted_at" IS NULL
            AND "status" = 'failed'
          ORDER BY "updated_at" DESC
          LIMIT 1
        ) AS "last_error"
      FROM "print_jobs"
      WHERE "tenant_id" = ${tenantId}::uuid
        AND "deleted_at" IS NULL
    `;
    const row = rows[0];
    return {
      queued: toNumber(row?.queued ?? 0),
      printing: toNumber(row?.printing ?? 0),
      failed: toNumber(row?.failed ?? 0),
      stalePrinting: toNumber(row?.stale_printing ?? 0),
      oldestQueuedAt: row?.oldest_queued_at ?? null,
      lastFailureAt: row?.last_failure_at ?? null,
      lastError: row?.last_error ?? null,
    };
  }
}

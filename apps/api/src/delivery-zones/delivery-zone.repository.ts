import type { DeliveryZoneResponse } from '@molho/contracts';
import type { RequestContextService } from '../context/request-context.service';
import { DeliveryZoneConflictError, DeliveryZoneDuplicateCityError, DeliveryZoneNotFoundError } from './delivery-zone.errors';
import type { DeliveryZoneInput } from './delivery-zone.service';

type DeliveryZoneRow = {
  id: string;
  name: string;
  kind: 'city' | 'polygon';
  city: string | null;
  state: string | null;
  feeCents: number;
  etaMinMinutes: number;
  etaMaxMinutes: number;
  priority: number;
};

export interface DeliveryZoneRepository {
  listByStore(storeId: string): Promise<DeliveryZoneResponse[]>;
  create(storeId: string, input: DeliveryZoneInput): Promise<DeliveryZoneResponse>;
  update(zoneId: string, input: DeliveryZoneInput): Promise<DeliveryZoneResponse>;
  softDelete(zoneId: string): Promise<void>;
}

const SELECT = {
  id: true,
  name: true,
  city: true,
  state: true,
  feeCents: true,
  etaMinMinutes: true,
  etaMaxMinutes: true,
  priority: true,
} as const;

function toResponse(record: {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  feeCents: number;
  etaMinMinutes: number;
  etaMaxMinutes: number;
  priority: number;
}): DeliveryZoneResponse {
  return {
    id: record.id,
    name: record.name,
    kind: record.city === null ? 'polygon' : 'city',
    city: record.city,
    state: record.state,
    feeCents: record.feeCents,
    etaMinMinutes: record.etaMinMinutes,
    etaMaxMinutes: record.etaMaxMinutes,
    priority: record.priority,
  };
}

function isDuplicateCityError(error: unknown): boolean {
  const candidate = error as { code?: unknown; meta?: { target?: unknown; driverAdapterError?: { cause?: { originalMessage?: unknown } } } };
  return (
    candidate.code === 'P2002' &&
    (candidate.meta?.target === 'delivery_zones_tenant_store_city_key' ||
      (Array.isArray(candidate.meta?.target) && candidate.meta.target.includes('delivery_zones_tenant_store_city_key')) ||
      (typeof candidate.meta?.driverAdapterError?.cause?.originalMessage === 'string' &&
        candidate.meta.driverAdapterError.cause.originalMessage.includes('delivery_zones_tenant_store_city_key')))
  );
}

function isUniqueCitySqlError(error: unknown): boolean {
  const candidate = error as {
    code?: unknown;
    meta?: {
      code?: unknown;
      constraint?: unknown;
      driverAdapterError?: { cause?: { originalCode?: unknown; originalMessage?: unknown } };
    };
  };
  return (
    candidate.code === 'P2010' &&
    ((candidate.meta?.code === '23505' && candidate.meta?.constraint === 'delivery_zones_tenant_store_city_key') ||
      (candidate.meta?.driverAdapterError?.cause?.originalCode === '23505' &&
        typeof candidate.meta.driverAdapterError.cause.originalMessage === 'string' &&
        candidate.meta.driverAdapterError.cause.originalMessage.includes('delivery_zones_tenant_store_city_key')))
  );
}

function mapKnownWriteError(error: unknown): never {
  if (isDuplicateCityError(error) || isUniqueCitySqlError(error)) {
    throw new DeliveryZoneDuplicateCityError();
  }
  throw error;
}

export class PrismaDeliveryZoneRepository implements DeliveryZoneRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async listByStore(storeId: string): Promise<DeliveryZoneResponse[]> {
    await this.assertStoreExists(storeId);
    const records = await this.requestContext.getClient().deliveryZone.findMany({
      where: { storeId, deletedAt: null },
      select: SELECT,
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
    return records.map(toResponse);
  }

  async create(storeId: string, input: DeliveryZoneInput): Promise<DeliveryZoneResponse> {
    const tenantId = this.requestContext.getTenantId();
    await this.assertStoreExists(storeId);
    if (input.kind === 'city') {
      try {
        const record = await this.requestContext.getClient().deliveryZone.create({
          data: {
            tenantId,
            storeId,
            name: input.name.trim(),
            city: input.city.trim(),
            state: input.state.trim().toUpperCase(),
            feeCents: input.feeCents,
            etaMinMinutes: input.etaMinMinutes,
            etaMaxMinutes: input.etaMaxMinutes,
            priority: input.priority,
          },
          select: SELECT,
        });
        return toResponse(record);
      } catch (error) {
        mapKnownWriteError(error);
      }
    }

    return this.createPolygon(storeId, input);
  }

  async update(zoneId: string, input: DeliveryZoneInput): Promise<DeliveryZoneResponse> {
    if (input.kind === 'city') {
      return this.updateCity(zoneId, input);
    }

    return this.updatePolygon(zoneId, input);
  }

  async softDelete(zoneId: string): Promise<void> {
    const result = await this.requestContext.getClient().deliveryZone.updateMany({
      where: { id: zoneId, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    await this.assertUpdated(zoneId, result.count);
  }

  private async createPolygon(storeId: string, input: DeliveryZoneInput & { kind: 'polygon' }): Promise<DeliveryZoneResponse> {
    try {
      const rows = await this.requestContext.getClient().$queryRaw<DeliveryZoneRow[]>`
        INSERT INTO "delivery_zones" (
          "tenant_id", "store_id", "name", "polygon", "fee_cents", "eta_min_minutes", "eta_max_minutes", "priority"
        )
        VALUES (
          ${this.requestContext.getTenantId()}::uuid,
          ${storeId}::uuid,
          ${input.name.trim()},
          ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(input.polygon)}), 4326)::geography,
          ${input.feeCents},
          ${input.etaMinMinutes},
          ${input.etaMaxMinutes},
          ${input.priority}
        )
        RETURNING
          "id",
          "name",
          'polygon'::text AS "kind",
          "city",
          "state",
          "fee_cents" AS "feeCents",
          "eta_min_minutes" AS "etaMinMinutes",
          "eta_max_minutes" AS "etaMaxMinutes",
          "priority"
      `;
      const row = rows[0];
      if (!row) throw new DeliveryZoneNotFoundError();
      return toResponse(row);
    } catch (error) {
      mapKnownWriteError(error);
    }
  }

  private async updateCity(zoneId: string, input: DeliveryZoneInput & { kind: 'city' }): Promise<DeliveryZoneResponse> {
    try {
      const rows = await this.requestContext.getClient().$queryRaw<DeliveryZoneRow[]>`
        UPDATE "delivery_zones"
        SET
          "name" = ${input.name.trim()},
          "city" = ${input.city.trim()},
          "state" = ${input.state.trim().toUpperCase()},
          "polygon" = NULL,
          "fee_cents" = ${input.feeCents},
          "eta_min_minutes" = ${input.etaMinMinutes},
          "eta_max_minutes" = ${input.etaMaxMinutes},
          "priority" = ${input.priority},
          "version" = "version" + 1,
          "updated_at" = now()
        WHERE "id" = ${zoneId}::uuid AND "deleted_at" IS NULL
        RETURNING
          "id",
          "name",
          'city'::text AS "kind",
          "city",
          "state",
          "fee_cents" AS "feeCents",
          "eta_min_minutes" AS "etaMinMinutes",
          "eta_max_minutes" AS "etaMaxMinutes",
          "priority"
      `;
      await this.assertUpdated(zoneId, rows.length);
      const row = rows[0];
      if (!row) throw new DeliveryZoneNotFoundError();
      return toResponse(row);
    } catch (error) {
      mapKnownWriteError(error);
    }
  }

  private async updatePolygon(zoneId: string, input: DeliveryZoneInput & { kind: 'polygon' }): Promise<DeliveryZoneResponse> {
    try {
      const rows = await this.requestContext.getClient().$queryRaw<DeliveryZoneRow[]>`
        UPDATE "delivery_zones"
        SET
          "name" = ${input.name.trim()},
          "city" = NULL,
          "state" = NULL,
          "polygon" = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(input.polygon)}), 4326)::geography,
          "fee_cents" = ${input.feeCents},
          "eta_min_minutes" = ${input.etaMinMinutes},
          "eta_max_minutes" = ${input.etaMaxMinutes},
          "priority" = ${input.priority},
          "version" = "version" + 1,
          "updated_at" = now()
        WHERE "id" = ${zoneId}::uuid AND "deleted_at" IS NULL
        RETURNING
          "id",
          "name",
          'polygon'::text AS "kind",
          "city",
          "state",
          "fee_cents" AS "feeCents",
          "eta_min_minutes" AS "etaMinMinutes",
          "eta_max_minutes" AS "etaMaxMinutes",
          "priority"
      `;
      await this.assertUpdated(zoneId, rows.length);
      const row = rows[0];
      if (!row) throw new DeliveryZoneNotFoundError();
      return toResponse(row);
    } catch (error) {
      mapKnownWriteError(error);
    }
  }

  private async findByIdOrThrow(zoneId: string): Promise<DeliveryZoneResponse> {
    const record = await this.requestContext.getClient().deliveryZone.findFirst({
      where: { id: zoneId, deletedAt: null },
      select: SELECT,
    });
    if (!record) throw new DeliveryZoneNotFoundError();
    return toResponse(record);
  }

  private async assertStoreExists(storeId: string): Promise<void> {
    const store = await this.requestContext.getClient().store.findFirst({
      where: { id: storeId, deletedAt: null },
      select: { id: true },
    });
    if (!store) throw new DeliveryZoneNotFoundError();
  }

  private async assertUpdated(zoneId: string, updatedCount: number): Promise<void> {
    if (updatedCount > 0) return;

    const stillExists = await this.requestContext.getClient().deliveryZone.findFirst({
      where: { id: zoneId, deletedAt: null },
      select: { id: true },
    });
    throw stillExists ? new DeliveryZoneConflictError() : new DeliveryZoneNotFoundError();
  }
}

import type { RequestContextService } from '../context/request-context.service';

export interface DeliveryZoneMatch {
  name: string;
  feeCents: number;
  etaMinMinutes: number;
  etaMaxMinutes: number;
}

export interface DeliveryMatchRepository {
  findMatchingZone(lat: number, lng: number): Promise<DeliveryZoneMatch | null>;
}

/**
 * `ST_Covers`, não `ST_Contains`: `geography` não tem overload de
 * `ST_Contains` no PostGIS (só `geometry`, que usaria matemática planar —
 * menos precisa pra área real de uma zona de entrega). `ST_Covers` em
 * `geography` faz o cálculo elipsoidal certo e inclui a borda do polígono
 * (ponto exatamente na linha da zona conta como dentro — mais generoso pro
 * cliente do que deixar de fora por um metro de arredondamento).
 *
 * Zonas sobrepostas: `ORDER BY priority ASC LIMIT 1` pega a de menor valor
 * primeiro — zona premium menor "vence" a zona grande por fora, exatamente
 * a regra decidida no desenho do schema.
 *
 * `$queryRaw` porque PostGIS/`geography` são `Unsupported` no Prisma DSL —
 * a API fluente não expressa `ST_Covers` nem `ST_MakePoint`. Tagged
 * template parametriza `lat`/`lng` automaticamente (sem risco de SQL
 * injection, mesmo sendo string interpolation na superfície).
 */
export class PrismaDeliveryMatchRepository implements DeliveryMatchRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async findMatchingZone(lat: number, lng: number): Promise<DeliveryZoneMatch | null> {
    const rows = await this.requestContext.getClient().$queryRaw<DeliveryZoneMatch[]>`
      SELECT
        "name",
        "fee_cents" AS "feeCents",
        "eta_min_minutes" AS "etaMinMinutes",
        "eta_max_minutes" AS "etaMaxMinutes"
      FROM "delivery_zones"
      WHERE "deleted_at" IS NULL
        AND ST_Covers("polygon", ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)
      ORDER BY "priority" ASC
      LIMIT 1
    `;
    return rows[0] ?? null;
  }
}

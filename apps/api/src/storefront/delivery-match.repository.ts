import type { RequestContextService } from '../context/request-context.service';

export interface DeliveryZoneMatch {
  name: string;
  feeCents: number;
  etaMinMinutes: number;
  etaMaxMinutes: number;
}

/**
 * Onde o cliente quer receber. Os dois pares são independentes: zona por
 * CIDADE só olha `city`/`state`, zona por RAIO só olha `lat`/`lng`.
 *
 * `lat`/`lng` nulos são estado NORMAL, não erro: o geocoder (Épico 6, Bloco
 * 1) pode resolver o município pelo CEP e não achar o ponto. Taxa por
 * cidade não depende de ponto, então o pedido segue.
 */
export interface DeliveryLocation {
  city: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
}

export interface DeliveryMatchRepository {
  findMatchingZone(location: DeliveryLocation): Promise<DeliveryZoneMatch | null>;
}

/**
 * Dois tipos de zona na MESMA query (Épico 6): por cidade (taxa fixa por
 * município — o caso da Cabanhas) e por polígono/raio (`ST_Covers`). A
 * escolha é por ZONA, não por tenant: os dois tipos coexistem no mesmo
 * tenant.
 *
 * `ST_Covers`, não `ST_Contains`: `geography` não tem overload de
 * `ST_Contains` no PostGIS (só `geometry`, que usaria matemática planar —
 * menos precisa pra área real de uma zona de entrega). `ST_Covers` em
 * `geography` faz o cálculo elipsoidal certo e inclui a borda do polígono
 * (ponto exatamente na linha da zona conta como dentro — mais generoso pro
 * cliente do que deixar de fora por um metro de arredondamento).
 *
 * `$queryRaw` porque PostGIS/`geography` são `Unsupported` no Prisma DSL —
 * a API fluente não expressa `ST_Covers` nem `ST_MakePoint`. Tagged
 * template parametriza automaticamente (sem risco de SQL injection, mesmo
 * sendo string interpolation na superfície).
 */
export class PrismaDeliveryMatchRepository implements DeliveryMatchRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async findMatchingZone(location: DeliveryLocation): Promise<DeliveryZoneMatch | null> {
    const { city, state, lat, lng } = location;

    // store_id omitido de propósito — MVP é 1 loja/tenant e a RLS já escopa
    // o tenant. ADICIONAR FILTRO POR LOJA ANTES DE MULTI-LOJA: sem ele, uma
    // zona "Centro" de uma loja casaria pedido de outra loja do mesmo
    // tenant. O índice único já é por (tenant_id, store_id, cidade, UF),
    // então o DADO fica correto — o que falta é só o filtro aqui.
    //
    // Casts explícitos (`::text`, `::double precision`) são obrigatórios:
    // sem eles o Postgres pode não inferir o tipo de um parâmetro NULL
    // (42P08) — e ponto nulo é caso normal aqui.
    //
    // Ponto nulo não vaza pra lugar nenhum: `ST_MakePoint(NULL, NULL)` é
    // NULL, `ST_Covers(polygon, NULL)` é NULL, e NULL no WHERE não casa. Em
    // SQL `= NULL` nunca é verdadeiro — não existe aqui a armadilha do
    // seletor nulo do Prisma (CLAUDE.md), em que `where: { city: null }`
    // casaria com TODAS as zonas sem cidade.
    //
    // `ORDER BY ("city" IS NULL) ASC` é DELIBERADO: cidade sempre ganha de
    // polígono, e `priority` só desempata DENTRO do mesmo tipo. Um tenant
    // que queira "raio premium sobrepõe a taxa de cidade" é revisita de
    // desenho, não bug desta ordenação.
    //
    // `fee_cents ASC, id ASC` depois do `priority` existe porque empate no
    // ORDER BY é ordem ARBITRÁRIA no Postgres — duas zonas sobrepostas com a
    // mesma priority fariam o mesmo endereço receber taxas diferentes entre
    // requisições. `priority` continua sendo o botão explícito do lojista
    // ("zona premium menor vence" = priority menor); no EMPATE, ganha a mais
    // barata (CLAUDE.md regra 14: cobrar mais exige consentimento, cobrar
    // menos nunca exige) e o `id` (uuid v7, ordena por criação) fecha o caso
    // de empatar até na taxa.
    const rows = await this.requestContext.getClient().$queryRaw<DeliveryZoneMatch[]>`
      SELECT
        "name",
        "fee_cents" AS "feeCents",
        "eta_min_minutes" AS "etaMinMinutes",
        "eta_max_minutes" AS "etaMaxMinutes"
      FROM "delivery_zones"
      WHERE "deleted_at" IS NULL
        AND (
              ("city" IS NOT NULL
                AND molho_city_key("city") = molho_city_key(${city}::text)
                AND upper(btrim("state")) = upper(btrim(${state}::text)))
           OR ("city" IS NULL AND "polygon" IS NOT NULL
                AND ST_Covers(
                      "polygon",
                      ST_SetSRID(ST_MakePoint(${lng}::double precision, ${lat}::double precision), 4326)::geography))
            )
      ORDER BY ("city" IS NULL) ASC, "priority" ASC, "fee_cents" ASC, "id" ASC
      LIMIT 1
    `;
    return rows[0] ?? null;
  }
}

import type {
  CmvDashboard,
  CmvIngredient,
  CmvProductRankingItem,
  CmvRecipeSummary,
} from '@molho/contracts';
import { Prisma } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';
import type { AnalyticsPeriod } from './analytics.service';

type Money = bigint | number | null;

type RankingRow = {
  productId: string;
  nome: string;
  categoria: string;
  vendidos: Money;
  receitaLiquidaCents: Money;
  cmvUnitarioCents: Money;
  cmvTotalCents: Money;
  isEstimated: boolean | null;
  hasRecipe: boolean;
};

type KpiRow = {
  receitaLiquidaCents: Money;
  cmvTeoricoCents: Money;
  pedidos: Money;
  produtosSemFicha: Money;
  custosEstimados: Money;
};

type TimeseriesRow = {
  bucket: Date | string;
  receitaLiquidaCents: Money;
  cmvTeoricoCents: Money;
};

function asNumber(value: Money | undefined): number {
  if (typeof value === 'bigint') return Number(value);
  return value ?? 0;
}

function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function statusFor(cmvPercent: number, hasRecipe: boolean): CmvProductRankingItem['status'] {
  if (!hasRecipe) return 'sem_ficha';
  if (cmvPercent > 35) return 'vermelho';
  if (cmvPercent > 30) return 'amarelo';
  return 'verde';
}

export class CmvService {
  constructor(private readonly requestContext: RequestContextService) {}

  async dashboard(storeId: string, period: AnalyticsPeriod): Promise<CmvDashboard> {
    await this.assertStoreExists(storeId);
    const [kpiRows, timeseriesRows, rankingRows] = await Promise.all([
      this.kpiRows(storeId, period),
      this.timeseriesRows(storeId, period),
      this.rankingRows(storeId, period),
    ]);
    const kpi = kpiRows[0] ?? {
      receitaLiquidaCents: 0,
      cmvTeoricoCents: 0,
      pedidos: 0,
      produtosSemFicha: 0,
      custosEstimados: 0,
    };
    const receita = asNumber(kpi.receitaLiquidaCents);
    const cmv = asNumber(kpi.cmvTeoricoCents);
    const margem = receita - cmv;

    return {
      kpis: {
        receitaLiquidaCents: receita,
        cmvTeoricoCents: cmv,
        cmvTeoricoPercent: percent(cmv, receita),
        margemBrutaCents: margem,
        margemBrutaPercent: percent(margem, receita),
        contribuicaoCents: margem,
        contribuicaoPercent: percent(margem, receita),
        pedidos: asNumber(kpi.pedidos),
        ticketMedioCents: asNumber(kpi.pedidos) === 0 ? 0 : Math.round(receita / asNumber(kpi.pedidos)),
        produtosSemFicha: asNumber(kpi.produtosSemFicha),
        custosEstimados: asNumber(kpi.custosEstimados),
      },
      timeseries: timeseriesRows.map((row) => {
        const rowReceita = asNumber(row.receitaLiquidaCents);
        const rowCmv = asNumber(row.cmvTeoricoCents);
        return {
          bucket: row.bucket instanceof Date ? row.bucket.toISOString().slice(0, 10) : String(row.bucket),
          receitaLiquidaCents: rowReceita,
          cmvTeoricoCents: rowCmv,
          margemBrutaCents: rowReceita - rowCmv,
          cmvTeoricoPercent: percent(rowCmv, rowReceita),
        };
      }),
      ranking: this.decorateRanking(rankingRows),
    };
  }

  async ingredients(): Promise<CmvIngredient[]> {
    const rows = await this.requestContext.getClient().$queryRaw<
      Array<{
        id: string;
        nome: string;
        categoria: string;
        unidadeBase: string;
        custoAtualCents: Money;
        rendimentoPercent: Prisma.Decimal | string | number;
        ultimaAtualizacao: Date | null;
        produtosAfetados: Money;
        isTestData: boolean;
      }>
    >`
      SELECT i."id",
             i."name" AS "nome",
             i."category"::text AS "categoria",
             i."base_unit"::text AS "unidadeBase",
             i."current_purchase_cost_cents" AS "custoAtualCents",
             i."yield_percentage" AS "rendimentoPercent",
             max(h."valid_from") AS "ultimaAtualizacao",
             count(DISTINCT rp."product_id") AS "produtosAfetados",
             bool_or(COALESCE(h."is_test_data", false)) AS "isTestData"
      FROM "cmv_ingredients" i
      LEFT JOIN "cmv_ingredient_cost_history" h ON h."ingredient_id" = i."id" AND h."tenant_id" = i."tenant_id"
      LEFT JOIN "cmv_recipe_components" rc ON rc."ingredient_id" = i."id" AND rc."tenant_id" = i."tenant_id" AND rc."deleted_at" IS NULL
      LEFT JOIN "cmv_recipe_products" rp ON rp."recipe_id" = rc."recipe_id" AND rp."tenant_id" = i."tenant_id" AND rp."deleted_at" IS NULL
      WHERE i."deleted_at" IS NULL
      GROUP BY i."id", i."name", i."category", i."base_unit", i."current_purchase_cost_cents", i."yield_percentage"
      ORDER BY i."category", i."name"
    `;
    return rows.map((row) => ({
      id: row.id,
      nome: row.nome,
      categoria: row.categoria,
      unidadeBase: row.unidadeBase,
      custoAtualCents: asNumber(row.custoAtualCents),
      rendimentoPercent: Number(row.rendimentoPercent),
      ultimaAtualizacao: row.ultimaAtualizacao?.toISOString() ?? null,
      produtosAfetados: asNumber(row.produtosAfetados),
      isTestData: row.isTestData,
    }));
  }

  async recipes(): Promise<CmvRecipeSummary[]> {
    const rows = await this.requestContext.getClient().$queryRaw<
      Array<{
        recipeId: string;
        productId: string | null;
        nome: string;
        tipo: 'MENU_ITEM' | 'SUB_RECIPE';
        custoTotalCents: Money;
        isTestData: boolean;
        components: unknown;
      }>
    >`
      SELECT r."id" AS "recipeId",
             rp."product_id" AS "productId",
             r."name" AS "nome",
             r."recipe_type"::text AS "tipo",
             COALESCE(cost."cost_cents", 0) AS "custoTotalCents",
             r."is_test_data" AS "isTestData",
             COALESCE(components."items", '[]'::jsonb) AS "components"
      FROM "cmv_recipes" r
      LEFT JOIN "cmv_recipe_products" rp ON rp."recipe_id" = r."id" AND rp."tenant_id" = r."tenant_id" AND rp."deleted_at" IS NULL
      LEFT JOIN LATERAL (${this.recipeCostSql(Prisma.sql`r."id"`, Prisma.sql`now()`)} ) cost ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'nome', COALESCE(i."name", child."name"),
          'tipo', rc."component_type"::text,
          'quantidade', rc."quantity",
          'unidade', rc."unit"::text,
          'custoUnitarioCents', COALESCE(h."net_unit_cost_cents", child_cost."cost_cents", 0),
          'custoTotalCents', ROUND(COALESCE(h."net_unit_cost_cents", child_cost."cost_cents", 0) * rc."quantity" * (1 + rc."loss_percentage" / 100.0))::int,
          'perdaPercent', rc."loss_percentage",
          'estimated', rc."is_estimated" OR COALESCE(h."is_test_data", false) OR COALESCE(child."is_test_data", false)
        ) ORDER BY rc."sort_order") AS "items"
        FROM "cmv_recipe_components" rc
        LEFT JOIN "cmv_ingredients" i ON i."id" = rc."ingredient_id" AND i."tenant_id" = rc."tenant_id"
        LEFT JOIN LATERAL (
          SELECT hh."net_unit_cost_cents", hh."is_test_data"
          FROM "cmv_ingredient_cost_history" hh
          WHERE hh."ingredient_id" = rc."ingredient_id"
            AND hh."tenant_id" = rc."tenant_id"
            AND hh."valid_from" <= now()
          ORDER BY hh."valid_from" DESC
          LIMIT 1
        ) h ON true
        LEFT JOIN "cmv_recipes" child ON child."id" = rc."child_recipe_id" AND child."tenant_id" = rc."tenant_id"
        LEFT JOIN LATERAL (${this.recipeCostSql(Prisma.sql`child."id"`, Prisma.sql`now()`)} ) child_cost ON true
        WHERE rc."recipe_id" = r."id" AND rc."tenant_id" = r."tenant_id" AND rc."deleted_at" IS NULL
      ) components ON true
      LEFT JOIN "products" menu_product ON menu_product."id" = rp."product_id"
        AND menu_product."tenant_id" = r."tenant_id"
        AND menu_product."deleted_at" IS NULL
      LEFT JOIN "categories" menu_category ON menu_category."id" = menu_product."category_id"
        AND menu_category."tenant_id" = r."tenant_id"
        AND menu_category."deleted_at" IS NULL
      WHERE r."deleted_at" IS NULL
        AND (
          r."recipe_type" = 'SUB_RECIPE'
          OR menu_category."visible" = true
        )
      ORDER BY r."recipe_type", r."name"
    `;

    return rows.map((row) => ({
      recipeId: row.recipeId,
      productId: row.productId,
      nome: row.nome,
      tipo: row.tipo,
      custoTotalCents: asNumber(row.custoTotalCents),
      components: Array.isArray(row.components) ? row.components as CmvRecipeSummary['components'] : [],
      isTestData: row.isTestData,
    }));
  }

  private decorateRanking(rows: RankingRow[]): CmvProductRankingItem[] {
    const totalUnits = rows.reduce((sum, row) => sum + asNumber(row.vendidos), 0);
    const byCategory = new Map<string, RankingRow[]>();
    for (const row of rows) byCategory.set(row.categoria, [...(byCategory.get(row.categoria) ?? []), row]);
    const categoryAvgContribution = new Map<string, number>();
    for (const [category, items] of byCategory) {
      const totalContribution = items.reduce((sum, row) => sum + asNumber(row.receitaLiquidaCents) - asNumber(row.cmvTotalCents), 0);
      const totalSold = items.reduce((sum, row) => sum + asNumber(row.vendidos), 0);
      categoryAvgContribution.set(category, totalSold === 0 ? 0 : totalContribution / totalSold);
    }

    return rows.map((row) => {
      const vendidos = asNumber(row.vendidos);
      const receita = asNumber(row.receitaLiquidaCents);
      const cmvTotal = asNumber(row.cmvTotalCents);
      const contribution = receita - cmvTotal;
      const unitContribution = vendidos === 0 ? 0 : contribution / vendidos;
      const expectedPopularity = 1 / Math.max(1, byCategory.get(row.categoria)?.length ?? 1);
      const categoryUnits = (byCategory.get(row.categoria) ?? []).reduce((sum, item) => sum + asNumber(item.vendidos), 0);
      const categoryMix = categoryUnits === 0 ? 0 : vendidos / categoryUnits;
      const highPopularity = categoryMix >= expectedPopularity * 0.7;
      const highContribution = unitContribution >= (categoryAvgContribution.get(row.categoria) ?? 0);
      const quadrant = !row.hasRecipe
        ? 'sem_dados'
        : highPopularity && highContribution
          ? 'estrela'
          : highPopularity
            ? 'cavalo_de_batalha'
            : highContribution
              ? 'oportunidade'
              : 'item_critico';
      const cmvPercent = percent(cmvTotal, receita);
      return {
        productId: row.productId,
        nome: row.nome,
        categoria: row.categoria,
        vendidos,
        receitaLiquidaCents: receita,
        cmvUnitarioCents: row.hasRecipe ? asNumber(row.cmvUnitarioCents) : null,
        cmvTotalCents: cmvTotal,
        cmvPercent,
        margemUnitariaCents: row.hasRecipe ? Math.round(unitContribution) : null,
        contribuicaoCents: contribution,
        mixPercent: percent(vendidos, totalUnits),
        status: statusFor(cmvPercent, row.hasRecipe),
        quadrant,
        hasRecipe: row.hasRecipe,
        isEstimated: row.isEstimated ?? false,
      };
    });
  }

  private kpiRows(storeId: string, period: AnalyticsPeriod) {
    return this.requestContext.getClient().$queryRaw<KpiRow[]>`
      WITH rows AS (${this.salesRowsSql(storeId, period)})
      SELECT COALESCE(sum("netRevenueCents"), 0) AS "receitaLiquidaCents",
             COALESCE(sum("cmvTotalCents"), 0) AS "cmvTeoricoCents",
             count(DISTINCT "orderId") AS "pedidos",
             count(DISTINCT "productId") FILTER (WHERE NOT "hasRecipe") AS "produtosSemFicha",
             count(*) FILTER (WHERE "isEstimated") AS "custosEstimados"
      FROM rows
    `;
  }

  private timeseriesRows(storeId: string, period: AnalyticsPeriod) {
    return this.requestContext.getClient().$queryRaw<TimeseriesRow[]>`
      WITH rows AS (${this.salesRowsSql(storeId, period)})
      SELECT date_trunc('day', "createdAt" AT TIME ZONE 'America/Sao_Paulo') AS "bucket",
             COALESCE(sum("netRevenueCents"), 0) AS "receitaLiquidaCents",
             COALESCE(sum("cmvTotalCents"), 0) AS "cmvTeoricoCents"
      FROM rows
      GROUP BY 1
      ORDER BY 1
    `;
  }

  private rankingRows(storeId: string, period: AnalyticsPeriod) {
    return this.requestContext.getClient().$queryRaw<RankingRow[]>`
      WITH rows AS (${this.salesRowsSql(storeId, period)})
      SELECT "productId",
             max("productName") AS "nome",
             max("categoryName") AS "categoria",
             COALESCE(sum("quantity"), 0) AS "vendidos",
             COALESCE(sum("netRevenueCents"), 0) AS "receitaLiquidaCents",
             CASE WHEN bool_or("hasRecipe") THEN ROUND(avg("unitCostCents"))::int ELSE NULL END AS "cmvUnitarioCents",
             COALESCE(sum("cmvTotalCents"), 0) AS "cmvTotalCents",
             bool_or("isEstimated") AS "isEstimated",
             bool_or("hasRecipe") AS "hasRecipe"
      FROM rows
      GROUP BY "productId"
      ORDER BY (COALESCE(sum("netRevenueCents"), 0) - COALESCE(sum("cmvTotalCents"), 0)) DESC, "receitaLiquidaCents" DESC
    `;
  }

  private salesRowsSql(storeId: string, period: AnalyticsPeriod): Prisma.Sql {
    return Prisma.sql`
      SELECT o."id" AS "orderId",
             o."created_at" AS "createdAt",
             oi."product_id" AS "productId",
             oi."name" AS "productName",
             cat."name" AS "categoryName",
             oi."quantity" AS "quantity",
             GREATEST(
               0,
               oi."line_total_cents"
               - ROUND((COALESCE(o."discount_cents", 0) + COALESCE(o."cashback_used_cents", 0) + COALESCE(o."promotion_discount_cents", 0)) * oi."line_total_cents"::numeric / NULLIF(o."subtotal_cents", 0))::int
             ) AS "netRevenueCents",
             COALESCE(cost."cost_cents", 0) AS "unitCostCents",
             COALESCE(cost."cost_cents", 0) * oi."quantity" AS "cmvTotalCents",
             COALESCE(cost."is_estimated", false) AS "isEstimated",
             rp."recipe_id" IS NOT NULL AS "hasRecipe"
      FROM "order_items" oi
      JOIN "orders" o ON o."id" = oi."order_id" AND o."tenant_id" = oi."tenant_id"
      LEFT JOIN "customers" c ON c."id" = o."customer_id" AND c."tenant_id" = o."tenant_id"
      JOIN "products" p ON p."id" = oi."product_id" AND p."tenant_id" = oi."tenant_id"
      JOIN "categories" cat ON cat."id" = p."category_id" AND cat."tenant_id" = p."tenant_id"
      LEFT JOIN "cmv_recipe_products" rp ON rp."product_id" = oi."product_id" AND rp."tenant_id" = oi."tenant_id" AND rp."deleted_at" IS NULL
      LEFT JOIN LATERAL (${this.recipeCostSql(Prisma.sql`rp."recipe_id"`, Prisma.sql`o."created_at"`)} ) cost ON true
      WHERE o."store_id" = ${storeId}::uuid
        AND o."created_at" >= ${period.from}
        AND o."created_at" <= ${period.to}
        AND o."status" = 'completed'
        AND o."payment_status" = 'confirmado'
        ${period.fulfillment ? Prisma.sql`AND ${this.fulfillmentCase()} = ${period.fulfillment}` : Prisma.empty}
    `;
  }

  private recipeCostSql(recipeId: Prisma.Sql, at: Prisma.Sql): Prisma.Sql {
    return Prisma.sql`
      WITH RECURSIVE recipes("recipeId", "multiplier", "isEstimated", "depth") AS (
        SELECT ${recipeId}, 1::numeric, false, 0
        UNION ALL
        SELECT rc."child_recipe_id",
               recipes."multiplier" * (rc."quantity" / NULLIF(child_recipe."yield_quantity", 0)),
               recipes."isEstimated" OR rc."is_estimated" OR child_recipe."is_test_data",
               recipes."depth" + 1
        FROM recipes
        JOIN "cmv_recipe_components" rc ON rc."recipe_id" = recipes."recipeId" AND rc."deleted_at" IS NULL
        JOIN "cmv_recipes" child_recipe ON child_recipe."id" = rc."child_recipe_id" AND child_recipe."tenant_id" = rc."tenant_id" AND child_recipe."deleted_at" IS NULL
        WHERE recipes."depth" < 6
          AND rc."component_type" = 'recipe'
      ),
      expanded AS (
        SELECT rc."ingredient_id" AS "ingredientId",
               rc."quantity" * recipes."multiplier" AS "quantity",
               rc."loss_percentage" AS "loss",
               recipes."isEstimated" OR rc."is_estimated" AS "isEstimated"
        FROM recipes
        JOIN "cmv_recipe_components" rc ON rc."recipe_id" = recipes."recipeId" AND rc."deleted_at" IS NULL
        WHERE rc."component_type" = 'ingredient'
      )
      SELECT ROUND(COALESCE(sum(h."net_unit_cost_cents" * expanded."quantity" * (1 + expanded."loss" / 100.0)), 0))::int AS "cost_cents",
             bool_or(expanded."isEstimated" OR COALESCE(h."is_test_data", false)) AS "is_estimated"
      FROM expanded
      LEFT JOIN LATERAL (
        SELECT hh."net_unit_cost_cents", hh."is_test_data"
        FROM "cmv_ingredient_cost_history" hh
        WHERE hh."ingredient_id" = expanded."ingredientId"
          AND hh."valid_from" <= ${at}
        ORDER BY hh."valid_from" DESC
        LIMIT 1
      ) h ON true
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

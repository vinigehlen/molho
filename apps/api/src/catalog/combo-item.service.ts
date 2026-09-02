import { CatalogNotFoundError, CatalogValidationError } from './catalog-errors';
import type {
  ComboGraphEdge,
  ComboItemRecord,
  ComboItemRepository,
  CreateComboItemInput,
  UpdateComboItemInput,
} from './combo-item.repository';

const MAX_NESTED_COMBO_EDGES = 1;

/**
 * Composição de combo (exceção MVP 2026-08-28, CLAUDE.md — fase 4/4).
 *
 * Regras de composição:
 * - o "pai" tem que ser um `Product` com `kind = 'combo'` (fase 3);
 * - o filho tem que existir;
 * - filho ≠ pai (o CHECK do banco também barra, isto é só pro 400 legível).
 * - combo dentro de combo é permitido em um nível, sem ciclo.
 */
export class ComboItemService {
  constructor(private readonly repo: ComboItemRepository) {}

  listByCombo(comboProductId: string): Promise<ComboItemRecord[]> {
    return this.repo.listByCombo(comboProductId);
  }

  get(id: string): Promise<ComboItemRecord | null> {
    return this.repo.findById(id);
  }

  async create(input: CreateComboItemInput): Promise<ComboItemRecord> {
    if (input.comboProductId === input.childProductId) {
      throw new CatalogValidationError('Um combo não pode conter ele mesmo.');
    }
    const combo = await this.repo.findProductKind(input.comboProductId);
    if (!combo) throw new CatalogNotFoundError('Combo');
    if (combo.kind !== 'combo') {
      throw new CatalogValidationError('Só um item do tipo Combo recebe outros produtos dentro.');
    }
    const child = await this.repo.findProductKind(input.childProductId);
    if (!child) throw new CatalogNotFoundError('Produto');
    if (child.kind === 'combo') {
      await this.assertNestedComboIsSafe(input.comboProductId, input.childProductId);
    }
    return this.repo.create(input);
  }

  update(id: string, expectedVersion: number, input: UpdateComboItemInput): Promise<ComboItemRecord> {
    return this.repo.update(id, expectedVersion, input);
  }

  delete(id: string, expectedVersion: number): Promise<void> {
    return this.repo.softDelete(id, expectedVersion);
  }

  private async assertNestedComboIsSafe(comboProductId: string, childProductId: string): Promise<void> {
    const edges = await this.repo.listNestedComboEdges();
    const graph = buildNestedComboGraph([...edges, { comboProductId, childProductId }]);

    if (hasCycle(graph)) {
      throw new CatalogValidationError('Esse aninhamento criaria um ciclo entre combos.');
    }
    if (maxComboDepth(graph) > MAX_NESTED_COMBO_EDGES) {
      throw new CatalogValidationError('Por enquanto, um combo só pode conter outro combo em um nível.');
    }
  }
}

function buildNestedComboGraph(edges: readonly ComboGraphEdge[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const edge of edges) {
    const children = graph.get(edge.comboProductId) ?? [];
    children.push(edge.childProductId);
    graph.set(edge.comboProductId, children);
    if (!graph.has(edge.childProductId)) graph.set(edge.childProductId, []);
  }
  return graph;
}

function hasCycle(graph: ReadonlyMap<string, readonly string[]>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(productId: string): boolean {
    if (visiting.has(productId)) return true;
    if (visited.has(productId)) return false;
    visiting.add(productId);
    for (const childId of graph.get(productId) ?? []) {
      if (visit(childId)) return true;
    }
    visiting.delete(productId);
    visited.add(productId);
    return false;
  }

  for (const productId of graph.keys()) {
    if (visit(productId)) return true;
  }
  return false;
}

function maxComboDepth(graph: ReadonlyMap<string, readonly string[]>): number {
  const memo = new Map<string, number>();

  function depthFrom(productId: string): number {
    const cached = memo.get(productId);
    if (cached !== undefined) return cached;
    const children = graph.get(productId) ?? [];
    const depth = children.length === 0 ? 0 : 1 + Math.max(...children.map(depthFrom));
    memo.set(productId, depth);
    return depth;
  }

  return Math.max(0, ...[...graph.keys()].map(depthFrom));
}

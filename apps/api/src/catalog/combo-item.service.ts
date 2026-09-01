import { CatalogNotFoundError, CatalogValidationError } from './catalog-errors';
import type {
  ComboItemRecord,
  ComboItemRepository,
  CreateComboItemInput,
  UpdateComboItemInput,
} from './combo-item.repository';

/**
 * Composição de combo (exceção MVP 2026-08-28, CLAUDE.md — fase 4/4, 4.1a).
 *
 * Regras de 4.1a:
 * - o "pai" tem que ser um `Product` com `kind = 'combo'` (fase 3);
 * - o filho tem que existir e NÃO pode ser outro combo (sem aninhamento);
 * - filho ≠ pai (o CHECK do banco também barra, isto é só pro 400 legível).
 *   Combo aninhado é validação somente da aplicação em 4.1; CHECK comum não
 *   consulta `Product.kind` de outra linha.
 * Preço "a partir de", modificador de filho e combo aninhado ficam pra 4.2.
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
      throw new CatalogValidationError('Um combo não pode conter outro combo.');
    }
    return this.repo.create(input);
  }

  update(id: string, expectedVersion: number, input: UpdateComboItemInput): Promise<ComboItemRecord> {
    return this.repo.update(id, expectedVersion, input);
  }

  delete(id: string, expectedVersion: number): Promise<void> {
    return this.repo.softDelete(id, expectedVersion);
  }
}

import {
  MODULE_KEYS,
  type ModuleDef,
  type ModuleKey,
  isModuleKey,
  moduleDef,
} from '@molho/contracts';

/**
 * Porta pro registry estático de módulos. Em produção é @molho/contracts direto;
 * em teste, um registry fake permite montar cadeias de `requires` (ex.: A→B→C)
 * que não existem — e não deveriam existir — no registry real do produto.
 */
export interface ModuleRegistry {
  readonly MODULE_KEYS: readonly ModuleKey[];
  moduleDef(key: ModuleKey): ModuleDef;
  isModuleKey(key: string): key is ModuleKey;
}

export const contractsModuleRegistry: ModuleRegistry = {
  MODULE_KEYS,
  moduleDef,
  isModuleKey,
};

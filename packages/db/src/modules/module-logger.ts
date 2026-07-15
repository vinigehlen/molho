/** Porta mínima de log — em produção é o Logger do Nest; em teste, um spy. */
export interface ModuleLogger {
  warn(event: string, meta?: Record<string, unknown>): void;
}

export const consoleModuleLogger: ModuleLogger = {
  warn(event, meta) {
    console.warn(`[module-service] ${event}`, meta ?? {});
  },
};

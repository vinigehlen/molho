import { Controller, Get } from '@nestjs/common';

// Versão fixa até o Épico 2 trazer versionamento de verdade — ler o
// package.json em runtime exigiria sair do rootDir do tsc.
const API_VERSION = '0.1.0';

interface HealthResponse {
  status: 'ok';
  timestamp: string;
  version: string;
}

@Controller('health')
export class HealthController {
  @Get()
  check(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: API_VERSION,
    };
  }
}

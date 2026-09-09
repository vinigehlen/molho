import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ReadinessService } from './readiness.service';

/**
 * `/ready` — sem prefixo global e sem guard, igual ao `/health`. 200 quando
 * banco e Redis respondem; 503 quando uma dependência obrigatória está fora
 * (o Fly tira a máquina da rotação). Corpo sanitizado, sem detalhe de erro.
 */
@Controller('ready')
export class ReadinessController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const result = await this.readiness.check();
    res.status(result.ready ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status: result.ready ? 'ready' : 'not_ready', db: result.db, redis: result.redis };
  }
}

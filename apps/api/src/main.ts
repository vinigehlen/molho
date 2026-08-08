import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { COPY, t } from '@molho/contracts';
import { AppModule } from './app.module';
import { configureCors } from './bootstrap/cors';
import { configureSecurityHeaders } from './bootstrap/security-headers';
import { configureTrustProxy } from './bootstrap/trust-proxy';

const PORTA_PADRAO = 3333;

async function bootstrap() {
  // Logger padrão do Nest (não pino): sem auth, sem banco e sem volume de
  // tráfego ainda, o console estruturado do Nest já cobre a necessidade —
  // trocar por pino é reversível quando o Épico 9 (realtime) pedir mais.
  const app = await NestFactory.create(AppModule);

  // Antes de qualquer coisa que leia IP: sem isto, `request.ip` atrás de um
  // proxy é o IP do proxy, e todo rate limit por IP vira uma chave global.
  configureTrustProxy(app);

  // whitelist: campo não declarado no DTO é removido silenciosamente (não
  // erro) — forbidNonWhitelisted seria mais estrito, mas whitelist já evita
  // um client mandar campo a mais que o controller não espera.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // CORS com credenciais + allowlist de origens exatas (Épico 9). Com o stream
  // SSE autenticado por cookie, CORS PASSA a ser fronteira de segurança: só as
  // origens da allowlist podem ler respostas credenciadas. Ver bootstrap/cors.
  configureCors(app);

  // nosniff + frame-options + referrer-policy em toda resposta. HSTS FICA DE
  // FORA até o TLS de molho.live estar validado — ver security-headers.ts.
  configureSecurityHeaders(app);

  // SIGTERM do rolling deploy (Fly) fecha os streams SSE limpo em vez de
  // deixá-los pendurar até timeout de TCP — ver OrderStreamController.
  app.enableShutdownHooks();

  const porta = process.env.PORT ? Number(process.env.PORT) : PORTA_PADRAO;
  await app.listen(porta);

  Logger.log(`Molho API no ar em http://localhost:${porta}`, 'Bootstrap');
  Logger.log(t(COPY.sistema.emConstrucao, { epico: 2 }), 'Bootstrap'); // schema Prisma + RLS
}

void bootstrap();

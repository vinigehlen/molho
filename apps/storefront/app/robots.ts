import type { MetadataRoute } from 'next';

// Rota estática do Next (metadata route) — nunca chama a API, nunca toca
// Redis. Bot batendo em /robots.txt não consome o balde do
// StorefrontRateLimitGuard porque essa rota não existe no lado da API.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/' } };
}

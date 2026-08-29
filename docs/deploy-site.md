# Deploy Do Site Institucional

O site institucional vive em `apps/site` e publica `https://molho.live`.

## Projeto

- Plataforma: Vercel
- Projeto: `molho-site`
- Root Directory: `apps/site`
- Framework: Next.js
- Domínios: `molho.live`, `www.molho.live`

## Variáveis

Produção:

```text
NEXT_PUBLIC_SITE_URL=https://molho.live
```

Não versionar `.env.local` nem `.vercel/`.

## Deploy Manual

Na raiz do monorepo ou dentro de `apps/site`, garanta que o projeto local está linkado ao `molho-site`. Se o root do monorepo estiver linkado a outro projeto Vercel, force os IDs do projeto correto no ambiente do comando.

```bash
pnpm --filter @molho/site build
pnpm exec vercel --prod
```

## DNS

No Cloudflare, os registros devem ficar como DNS only:

```text
CNAME @   2981d60ba3501975.vercel-dns-017.com
CNAME www 2981d60ba3501975.vercel-dns-017.com
```

## Verificação

```bash
pnpm exec vercel domains verify molho.live
pnpm exec vercel domains verify www.molho.live
curl https://molho.live
curl https://molho.live/sitemap.xml
```

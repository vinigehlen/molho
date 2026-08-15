import { PrismaPg } from '@prisma/adapter-pg';
import { encryptEmail, hashEmailForLookup } from '../../src/crypto/email';
import { PrismaClient } from '../generated/client/client';

/**
 * Bootstrap idempotente do papel `platform.superadmin` (Épico 14) — NÃO é
 * endpoint runtime: rodar via `pnpm --filter @molho/db db:seed:superadmin`,
 * como app_migrator (DIRECT_URL), fora do request path normal — mesmo
 * racional do seed principal (RLS bloquearia app_runtime sem o GUC
 * app.is_platform, que só a API seta por request).
 *
 * `user_roles_user_id_role_scope_type_scope_id_key` é um índice único comum
 * (não parcial/COALESCE) — Postgres nunca considera dois NULL iguais num
 * índice único, então `scopeId: null` (platform) faz `upsert()`/`ON CONFLICT`
 * NUNCA bater num re-run e duplicaria a linha a cada execução. Por isso
 * findFirst+create aqui, não upsert (mesmo padrão de seedTenant() pros
 * models sem unique key visível ao Prisma — aqui a causa é outra, mas a
 * solução idêntica).
 */
async function findOrCreateSuperadmin(prisma: PrismaClient, email: string) {
  const emailHash = hashEmailForLookup(email);
  let user = await prisma.user.findFirst({ where: { emailLookupHash: emailHash, deletedAt: null } });
  if (!user) {
    const { ciphertext, keyVersion } = encryptEmail(email);
    user = await prisma.user.create({
      data: {
        name: email,
        emailCiphertext: new Uint8Array(ciphertext),
        emailLookupHash: emailHash,
        emailKeyVersion: keyVersion,
      },
    });
    console.log(`  user "${email}" criado (${user.id})`);
  } else {
    console.log(`  user "${email}" já existia (${user.id})`);
  }

  const existingRole = await prisma.userRole.findFirst({
    where: { userId: user.id, role: 'platform.superadmin', scopeType: 'platform', scopeId: null },
  });
  if (existingRole) {
    console.log('  papel platform.superadmin já concedido');
    return;
  }
  await prisma.userRole.create({
    data: { userId: user.id, role: 'platform.superadmin', scopeType: 'platform', scopeId: null },
  });
  console.log('  papel platform.superadmin concedido');
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Seed RECUSADO em produção (NODE_ENV=production) — provisionar super-admin em prod exige fluxo próprio, não este script.',
    );
  }

  const emailsRaw = process.env.MOLHO_SUPERADMIN_EMAILS;
  if (!emailsRaw) throw new Error('MOLHO_SUPERADMIN_EMAILS não configurada (CSV de e-mails) — ver .env.example');
  const emails = emailsRaw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (emails.length === 0) throw new Error('MOLHO_SUPERADMIN_EMAILS vazia após parse — nada a semear.');
  for (const email of emails) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(`MOLHO_SUPERADMIN_EMAILS contém e-mail inválido: "${email}"`);
    }
  }

  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) throw new Error('DIRECT_URL não configurada — seed roda como app_migrator');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: directUrl }) });
  try {
    console.log('super-admins:');
    for (const email of emails) {
      console.log(`  ${email}`);
      await findOrCreateSuperadmin(prisma, email);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log('\nseed:superadmin concluído.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('seed:superadmin falhou:', error);
    process.exit(1);
  });

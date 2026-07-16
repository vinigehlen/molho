/** Token de DI pro PrismaClient global (dono: app.module.ts). Não precisa do
 * tipo PrismaClient aqui — é só um símbolo — por isso este arquivo não entra
 * na exceção do lint de "nunca importar PrismaClient direto". */
export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT');

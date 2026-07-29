/**
 * Canal de entrega do OTP, CONFIGURADO POR ESCOPO (Épico 9c). Staff e cliente
 * podem estar em canais diferentes — no piloto os dois vão pra `email`, e
 * reativar SMS ao fim é trocar a env, não escrever código.
 *
 * Default `sms` de propósito: é o comportamento de hoje. A virada pra e-mail é
 * um ato explícito de configuração (env), nunca um efeito colateral de deploy.
 */
export type OtpChannel = 'sms' | 'email';
export type OtpScope = 'staff' | 'customer';

const ENV_VAR: Record<OtpScope, string> = {
  staff: 'OTP_CHANNEL_STAFF',
  customer: 'OTP_CHANNEL_CUSTOMER',
};

export function otpChannelFor(scope: OtpScope, env: NodeJS.ProcessEnv = process.env): OtpChannel {
  const raw = env[ENV_VAR[scope]];
  if (!raw) return 'sms';
  if (raw !== 'sms' && raw !== 'email') {
    // Config de auth mal escrita não vira default silencioso — um typo
    // ("e-mail") mandaria o piloto inteiro pro canal errado sem avisar.
    throw new Error(`${ENV_VAR[scope]}="${raw}" inválido — use "sms" ou "email".`);
  }
  return raw;
}

/**
 * Um canal está EM USO se algum escopo o seleciona. É o que torna a guarda de
 * produção per-canal: canal não usado não pode bloquear o boot (o piloto sobe
 * sem nenhuma credencial de SMS), canal em uso nunca cai pro mock.
 */
export function isOtpChannelInUse(channel: OtpChannel, env: NodeJS.ProcessEnv = process.env): boolean {
  return (['staff', 'customer'] as const).some((scope) => otpChannelFor(scope, env) === channel);
}

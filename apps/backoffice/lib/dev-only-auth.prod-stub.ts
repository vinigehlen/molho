/**
 * Substituto de `dev-only-auth` em builds de PRODUÇÃO (via
 * NormalModuleReplacementPlugin no next.config). Existe pra que o código real
 * que obtém OTP/JWT NÃO seja empacotado em produção — o import dinâmico do Next
 * emite o chunk pro disco mesmo com o call site morto, então só "não executar"
 * não basta; aqui o módulo de verdade é SUBSTITUÍDO por estas funções vazias.
 * Se alguma delas rodar em prod (não deveria — a página early-returna), lança.
 */
const MSG = 'dev-only-auth não existe em produção (substituído no build — ver next.config).';

export function devRequestOtp(): Promise<void> {
  throw new Error(MSG);
}

export function devVerifyOtp(): Promise<{ name: string }> {
  throw new Error(MSG);
}

import { type EmailAddress, type PhoneNumber, phoneNumberToE164 } from '@molho/contracts';
import type { EmailProvider } from '../../messaging/email-provider.port';
import type { MessagingProvider } from '../../messaging/messaging-provider.port';

/**
 * Destinatário do OTP, AGNÓSTICO DE CANAL. O `OtpService` só conhece isto —
 * não sabe se é SMS ou e-mail (Épico 9c: OTP por e-mail no piloto, SMS volta
 * ao fim). `identifier` é o valor NORMALIZADO e estável que vira a chave do
 * desafio e do rate limit (hmac): E.164 pra telefone, e-mail minúsculo pra
 * e-mail. `deliver` entrega a mensagem pelo canal do destinatário.
 */
export interface OtpRecipient {
  identifier: string;
  deliver(message: string): Promise<void>;
}

/**
 * Destinatário de TELEFONE (SMS) — preserva byte-a-byte o comportamento anterior
 * do OtpService: `identifier` = E.164 (mesma chave de desafio/rate-limit de
 * antes), entrega via `MessagingProvider.send`.
 */
export function phoneRecipient(phone: PhoneNumber, messaging: MessagingProvider): OtpRecipient {
  return {
    identifier: phoneNumberToE164(phone),
    deliver: (message) => messaging.send(phone, message),
  };
}

/** Assunto fixo — o corpo (que carrega o código) vem do OtpService. */
const OTP_EMAIL_SUBJECT = 'Seu código de acesso Molho';

/**
 * Destinatário de E-MAIL (Épico 9c). `identifier` é o e-mail já normalizado
 * pelo `parseEmail` (lowercase) — por isso duas grafias do mesmo endereço
 * caem no MESMO desafio e no MESMO balde de rate limit.
 */
export function emailRecipient(email: EmailAddress, provider: EmailProvider): OtpRecipient {
  return {
    identifier: email,
    deliver: (message) => provider.send(email, OTP_EMAIL_SUBJECT, message),
  };
}

/**
 * CLIENTE no piloto: identidade é o TELEFONE, entrega é por E-MAIL. É o único
 * lugar onde `identifier` e alvo de entrega divergem, e é deliberado — o
 * identifier continua sendo o E.164, então chave de desafio, balde de rate
 * limit e cooldown ficam byte a byte iguais aos do SMS, e voltar pro SMS ao
 * fim do piloto é trocar env. Ver CLAUDE.md regra 13 e docs/08.
 *
 * A escolha de QUAL e-mail (o de registro, via TOFU, ou o digitado) é do
 * controller — aqui só se entrega no que foi decidido.
 */
export function phoneIdentityViaEmail(
  phone: PhoneNumber,
  email: EmailAddress,
  provider: EmailProvider,
): OtpRecipient {
  return {
    identifier: phoneNumberToE164(phone),
    deliver: (message) => provider.send(email, OTP_EMAIL_SUBJECT, message),
  };
}

/**
 * Só identidade, sem canal — `verifyOtp` nunca entrega nada, só precisa da
 * chave do desafio. `deliver` LANÇA de propósito: se algum caminho futuro
 * tentar enviar por aqui, explode no teste em vez de mandar SMS silenciosamente
 * num deploy configurado pra e-mail.
 */
export function identityOnly(identifier: string): OtpRecipient {
  return {
    identifier,
    deliver: () => {
      throw new Error('identityOnly não entrega — use phoneRecipient/emailRecipient pra enviar OTP.');
    },
  };
}

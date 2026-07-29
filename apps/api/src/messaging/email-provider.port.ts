import type { EmailAddress } from '@molho/contracts';

/**
 * Envio automático por E-MAIL — irmã do MessagingProvider (SMS), não
 * substituta: no piloto (Épico 9c) o OTP vai por e-mail e o SMS fica
 * intacto, reativável por env. Duas portas separadas em vez de uma
 * genérica porque o destinatário é de tipo DIFERENTE (EmailAddress vs
 * PhoneNumber) e é justamente isso que impede chamar um provider com
 * identificador do canal errado. Quem une os dois é o OtpRecipient, que
 * já é agnóstico de canal.
 *
 * `text` puro, sem HTML: OTP é uma linha com 6 dígitos, e e-mail
 * text-only entrega melhor que HTML de template.
 */
export interface EmailProvider {
  send(to: EmailAddress, subject: string, text: string): Promise<void>;
}

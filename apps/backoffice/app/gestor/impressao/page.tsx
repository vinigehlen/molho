import { redirect } from 'next/navigation';

/**
 * A configuração de impressão foi para dentro de Configuração (seção
 * "Impressora") e não tem mais entrada própria na barra lateral. A rota
 * antiga continua existindo só pra não quebrar links salvos.
 */
export default function ImpressaoPage() {
  redirect('/gestor/configuracao#impressora');
}

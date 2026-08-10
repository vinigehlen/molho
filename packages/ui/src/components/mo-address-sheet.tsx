'use client';

import * as React from 'react';
import { MoButton } from './mo-button';
import { MoInput } from './mo-input';
import { MoSheet } from './mo-sheet';

export interface MoAddressSheetValue {
  label: string;
  street: string;
  number: string | null;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string | null;
  referencePoint: string | null;
}

/** Campos que o CEP preenche — os únicos que podem ficar travados. */
type CampoDoCep = 'street' | 'neighborhood' | 'city' | 'state';

/** Espelha `ViaCepResult` (`apps/storefront/lib/viacep.ts`) sem acoplar `packages/ui` ao storefront. */
export type MoPostalCodeLookup =
  | { status: 'found'; address: Record<CampoDoCep, string | null> }
  | { status: 'not_found' }
  | { status: 'unavailable' };

export interface MoAddressSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null`/omitido = formulário em branco (endereço novo). */
  initialValue?: MoAddressSheetValue | null;
  /** Consulta de CEP (ViaCEP). Nunca deve lançar — os três desfechos são estados de UI. */
  onLookupPostalCode: (postalCode: string) => Promise<MoPostalCodeLookup>;
  onSave: (value: MoAddressSheetValue) => void;
  className?: string;
}

type EstadoBusca =
  | { kind: 'idle' }
  | { kind: 'buscando' }
  /** `afirmados` = os campos que o CEP realmente respondeu; só esses travam. */
  | { kind: 'encontrado'; afirmados: Record<CampoDoCep, boolean> }
  | { kind: 'nao_encontrado' }
  | { kind: 'indisponivel' };

const VALOR_VAZIO: MoAddressSheetValue = {
  label: 'Endereço',
  street: '',
  number: null,
  complement: null,
  neighborhood: '',
  city: '',
  state: '',
  postalCode: null,
  referencePoint: null,
};

const MENSAGEM: Partial<Record<EstadoBusca['kind'], string>> = {
  nao_encontrado: 'Não encontrei esse CEP — confere o número. Se estiver certo, preenche o endereço à mão.',
  indisponivel: 'Não deu pra buscar o CEP agora. Preenche o endereço à mão que a gente confirma na hora do pedido.',
};

/**
 * MoAddressSheet — formulário de endereço do cliente (Épico 6, Bloco 3).
 *
 * O CEP é o campo de entrada: com 8 dígitos, dispara a consulta e preenche
 * rua/bairro/cidade/UF. Sem mapa, sem pin, sem geolocalização — o SERVIDOR
 * deriva o ponto a partir do CEP (`GeocodeMiddleware`), e coordenada vinda do
 * cliente é ignorada desde a inversão do contrato de endereço.
 *
 * Campo que o CEP responde fica READ-ONLY, campo a campo: um CEP "geral" de
 * cidade não tem rua nem bairro, e esses dois seguem editáveis. Não existe
 * "editar mesmo assim" no que veio do CEP — o servidor sobrescreve com a
 * própria consulta dele, então campo editável cujo valor é descartado seria
 * mentira de UI.
 *
 * `packages/ui` não depende de `@molho/contracts` nem faz I/O (mesmo racional
 * de MoProductSheet): a consulta chega por `onLookupPostalCode`, e quem chama
 * adapta o value pro `CustomerAddress` do contrato (`schemaVersion`/`updatedAt`).
 */
export function MoAddressSheet({
  open,
  onOpenChange,
  initialValue,
  onLookupPostalCode,
  onSave,
  className,
}: MoAddressSheetProps) {
  const [valor, setValor] = React.useState<MoAddressSheetValue>(initialValue ?? VALOR_VAZIO);
  const [busca, setBusca] = React.useState<EstadoBusca>({ kind: 'idle' });
  /** Último CEP consultado — também é o token da corrida (resposta de CEP velho é descartada). */
  const consultadoRef = React.useRef<string | null>(null);

  const cep = (valor.postalCode ?? '').replace(/\D/g, '');

  React.useEffect(() => {
    if (!open) return;
    setValor(initialValue ?? VALOR_VAZIO);
    setBusca({ kind: 'idle' });
    // Reabrir consulta de novo: o CEP salvo pode ter passado a responder
    // (ViaCEP estava mudo da última vez).
    consultadoRef.current = null;
  }, [open, initialValue]);

  React.useEffect(() => {
    if (!open) return;

    // Menos de 8 dígitos é "ainda digitando", nunca erro: quem cobra CEP
    // completo é o botão de salvar.
    if (cep.length !== 8) {
      consultadoRef.current = null;
      setBusca({ kind: 'idle' });
      return;
    }

    if (consultadoRef.current === cep) return;
    consultadoRef.current = cep;
    setBusca({ kind: 'buscando' });

    void onLookupPostalCode(cep).then((resultado) => {
      // O cliente mudou o CEP enquanto esta consulta estava no ar.
      if (consultadoRef.current !== cep) return;

      if (resultado.status !== 'found') {
        setBusca({ kind: resultado.status === 'not_found' ? 'nao_encontrado' : 'indisponivel' });
        return;
      }

      const { address } = resultado;
      setValor((anterior) => ({
        ...anterior,
        street: address.street ?? anterior.street,
        neighborhood: address.neighborhood ?? anterior.neighborhood,
        city: address.city ?? anterior.city,
        state: address.state ?? anterior.state,
      }));
      setBusca({
        kind: 'encontrado',
        afirmados: {
          street: address.street !== null,
          neighborhood: address.neighborhood !== null,
          city: address.city !== null,
          state: address.state !== null,
        },
      });
    });
  }, [open, cep, onLookupPostalCode]);

  if (!open) return null;

  function travado(campo: CampoDoCep): boolean {
    return busca.kind === 'encontrado' && busca.afirmados[campo];
  }

  // Bairro fica de fora dos obrigatórios: cidade pequena tem CEP sem bairro, e
  // travar o pedido nisso não ajuda ninguém. Rua/cidade/UF vêm prontas no
  // caminho feliz; o cliente só digita quando o CEP fica mudo.
  const podeSalvar =
    cep.length === 8 &&
    (valor.number ?? '').trim() !== '' &&
    valor.street.trim() !== '' &&
    valor.city.trim() !== '' &&
    valor.state.trim() !== '';

  function handleSalvar() {
    if (!podeSalvar) return;
    onSave(valor);
  }

  const mensagem = MENSAGEM[busca.kind];

  return (
    <MoSheet open={open} onOpenChange={onOpenChange} title="Seu endereço" className={className}>
      <div className="flex flex-col gap-4 pb-6">
        <MoInput
          label="CEP"
          mask="cep"
          inputMode="numeric"
          autoComplete="postal-code"
          value={valor.postalCode ?? ''}
          onChange={(e) => setValor((anterior) => ({ ...anterior, postalCode: e.target.value || null }))}
          hint={busca.kind === 'buscando' ? 'Buscando endereço…' : 'A gente preenche o resto pra você.'}
        />

        {/* role="status": o preenchimento automático acontece longe do foco (que
            está no CEP), então precisa ser anunciado por leitor de tela. */}
        {mensagem ? (
          <p role="status" className="text-caption text-critical-strong">
            {mensagem}
          </p>
        ) : null}
        {busca.kind === 'encontrado' ? (
          <p role="status" className="text-caption text-positive">
            Endereço encontrado pelo CEP.
          </p>
        ) : null}

        <MoInput
          label="Rua"
          value={valor.street}
          readOnly={travado('street')}
          onChange={(e) => setValor((anterior) => ({ ...anterior, street: e.target.value }))}
        />
        <div className="grid grid-cols-2 gap-4">
          <MoInput
            label="Número"
            inputMode="numeric"
            value={valor.number ?? ''}
            onChange={(e) => setValor((anterior) => ({ ...anterior, number: e.target.value || null }))}
            placeholder="s/n"
          />
          <MoInput
            label="Complemento"
            value={valor.complement ?? ''}
            onChange={(e) => setValor((anterior) => ({ ...anterior, complement: e.target.value || null }))}
          />
        </div>
        <MoInput
          label="Bairro"
          value={valor.neighborhood}
          readOnly={travado('neighborhood')}
          onChange={(e) => setValor((anterior) => ({ ...anterior, neighborhood: e.target.value }))}
        />
        <div className="grid grid-cols-2 gap-4">
          <MoInput
            label="Cidade"
            value={valor.city}
            readOnly={travado('city')}
            onChange={(e) => setValor((anterior) => ({ ...anterior, city: e.target.value }))}
          />
          <MoInput
            label="Estado"
            value={valor.state}
            readOnly={travado('state')}
            onChange={(e) => setValor((anterior) => ({ ...anterior, state: e.target.value.toUpperCase().slice(0, 2) }))}
            placeholder="RS"
          />
        </div>
        <MoInput
          label="Rótulo"
          value={valor.label}
          onChange={(e) => setValor((anterior) => ({ ...anterior, label: e.target.value }))}
          placeholder="Casa, Trabalho…"
        />
        <MoInput
          label="Ponto de referência"
          value={valor.referencePoint ?? ''}
          onChange={(e) => setValor((anterior) => ({ ...anterior, referencePoint: e.target.value || null }))}
          placeholder="Perto da padaria…"
        />

        <MoButton disabled={!podeSalvar} onClick={handleSalvar}>
          Salvar endereço
        </MoButton>
      </div>
    </MoSheet>
  );
}

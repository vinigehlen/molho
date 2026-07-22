'use client';

import * as React from 'react';
import { MapPin } from 'lucide-react';
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
  /** Só existe se o cliente tocou "usar minha localização" — sem geocoding neste épico, texto e coordenada são independentes. */
  lat: number | null;
  lng: number | null;
}

export interface MoAddressSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null`/omitido = formulário em branco (endereço novo). */
  initialValue?: MoAddressSheetValue | null;
  onSave: (value: MoAddressSheetValue) => void;
  className?: string;
}

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
  lat: null,
  lng: null,
};

/**
 * MoAddressSheet — formulário de endereço do cliente (Épico 6).
 *
 * Sem nenhuma API de mapa: "usar minha localização" é só
 * `navigator.geolocation`, nativo do browser — sem pin arrastável, sem
 * geocoding. `packages/ui` não depende de `@molho/contracts` (mesmo
 * racional de MoProductSheet) — quem chama adapta este value pro
 * `CustomerAddress` do contrato (adiciona `schemaVersion`/`updatedAt`).
 *
 * `lat`/`lng` e o texto do endereço são independentes de propósito: o
 * cliente pode preencher só o texto (sem tocar geolocalização) — é um
 * estado válido, só não dá pra confirmar cobertura de entrega até ter
 * coordenada (ver `delivery-match-api.ts` do storefront).
 */
export function MoAddressSheet({ open, onOpenChange, initialValue, onSave, className }: MoAddressSheetProps) {
  const [valor, setValor] = React.useState<MoAddressSheetValue>(initialValue ?? VALOR_VAZIO);
  const [buscandoLocalizacao, setBuscandoLocalizacao] = React.useState(false);
  const [erroLocalizacao, setErroLocalizacao] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setValor(initialValue ?? VALOR_VAZIO);
    setErroLocalizacao(null);
  }, [open, initialValue]);

  if (!open) return null;

  const podeSalvar = valor.street.trim() !== '' && valor.neighborhood.trim() !== '' && valor.city.trim() !== '' && valor.state.trim() !== '';

  function usarMinhaLocalizacao() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setErroLocalizacao('Seu navegador não suporta localização automática — preenche à mão mesmo.');
      return;
    }

    setBuscandoLocalizacao(true);
    setErroLocalizacao(null);

    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        setValor((anterior) => ({ ...anterior, lat: posicao.coords.latitude, lng: posicao.coords.longitude }));
        setBuscandoLocalizacao(false);
      },
      () => {
        setErroLocalizacao('Não conseguimos acessar sua localização. Preenche o endereço à mão — a gente confirma a cobertura depois.');
        setBuscandoLocalizacao(false);
      },
      { timeout: 10_000 },
    );
  }

  function handleSalvar() {
    if (!podeSalvar) return;
    onSave(valor);
  }

  return (
    <MoSheet open={open} onOpenChange={onOpenChange} title="Seu endereço" className={className}>
      <div className="flex flex-col gap-4 pb-6">
        <MoButton
          variant="secondary"
          icon={<MapPin className="h-5 w-5" aria-hidden="true" />}
          loading={buscandoLocalizacao}
          onClick={usarMinhaLocalizacao}
        >
          Usar minha localização
        </MoButton>

        {valor.lat !== null && valor.lng !== null ? (
          <p className="text-caption text-positive">Localização capturada — já dá pra conferir se a gente entrega aí.</p>
        ) : null}
        {erroLocalizacao ? <p className="text-caption text-critical-strong">{erroLocalizacao}</p> : null}

        <MoInput
          label="Rótulo"
          value={valor.label}
          onChange={(e) => setValor((anterior) => ({ ...anterior, label: e.target.value }))}
          placeholder="Casa, Trabalho…"
        />
        <MoInput
          label="Rua"
          value={valor.street}
          onChange={(e) => setValor((anterior) => ({ ...anterior, street: e.target.value }))}
        />
        <div className="grid grid-cols-2 gap-4">
          <MoInput
            label="Número"
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
          onChange={(e) => setValor((anterior) => ({ ...anterior, neighborhood: e.target.value }))}
        />
        <div className="grid grid-cols-2 gap-4">
          <MoInput
            label="Cidade"
            value={valor.city}
            onChange={(e) => setValor((anterior) => ({ ...anterior, city: e.target.value }))}
          />
          <MoInput
            label="Estado"
            value={valor.state}
            onChange={(e) => setValor((anterior) => ({ ...anterior, state: e.target.value.toUpperCase().slice(0, 2) }))}
            placeholder="RS"
          />
        </div>
        <MoInput
          label="CEP"
          mask="cep"
          value={valor.postalCode ?? ''}
          onChange={(e) => setValor((anterior) => ({ ...anterior, postalCode: e.target.value || null }))}
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

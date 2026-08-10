import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { MoAddressSheet, type MoPostalCodeLookup } from './mo-address-sheet';

const CEP_COMPLETO: MoPostalCodeLookup = {
  status: 'found',
  address: { street: 'Rua das Palmeiras', neighborhood: 'Bela Vista', city: 'Estância Velha', state: 'RS' },
};

/** CEP "geral" de cidade pequena: o ViaCEP sabe o município, não a rua. */
const CEP_SO_CIDADE: MoPostalCodeLookup = {
  status: 'found',
  address: { street: null, neighborhood: null, city: 'Estância Velha', state: 'RS' },
};

function renderSheet(lookup: MoPostalCodeLookup | (() => Promise<MoPostalCodeLookup>), onSave = vi.fn()) {
  const onLookupPostalCode = vi.fn(typeof lookup === 'function' ? lookup : async () => lookup);
  render(<MoAddressSheet open onOpenChange={() => {}} onLookupPostalCode={onLookupPostalCode} onSave={onSave} />);
  return { onLookupPostalCode, onSave, user: userEvent.setup() };
}

describe('MoAddressSheet', () => {
  it('não tem violação de acessibilidade', async () => {
    const { container } = render(
      <MoAddressSheet open onOpenChange={() => {}} onLookupPostalCode={async () => CEP_COMPLETO} onSave={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('fechado: não renderiza nada', () => {
    render(
      <MoAddressSheet
        open={false}
        onOpenChange={() => {}}
        onLookupPostalCode={async () => CEP_COMPLETO}
        onSave={() => {}}
      />,
    );
    expect(screen.queryByText('Seu endereço')).not.toBeInTheDocument();
  });

  it('CEP incompleto não consulta nada nem mostra erro — o cliente ainda está digitando', async () => {
    const { onLookupPostalCode, user } = renderSheet(CEP_COMPLETO);

    await user.type(screen.getByLabelText('CEP'), '9361');

    expect(onLookupPostalCode).not.toHaveBeenCalled();
    expect(screen.queryByText(/Não encontrei esse CEP/)).not.toBeInTheDocument();
  });

  it('CEP completo preenche os campos e trava os que o CEP respondeu', async () => {
    const { onLookupPostalCode, user } = renderSheet(CEP_COMPLETO);

    await user.type(screen.getByLabelText('CEP'), '93610000');

    expect(await screen.findByText('Endereço encontrado pelo CEP.')).toBeInTheDocument();
    expect(onLookupPostalCode).toHaveBeenCalledWith('93610000');
    expect(screen.getByLabelText('Rua')).toHaveValue('Rua das Palmeiras');
    expect(screen.getByLabelText('Cidade')).toHaveValue('Estância Velha');
    // O servidor sobrescreve com a consulta dele — editar aqui não mudaria nada.
    expect(screen.getByLabelText('Rua')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Cidade')).toHaveAttribute('readonly');
    // Número nunca vem do CEP.
    expect(screen.getByLabelText('Número')).not.toHaveAttribute('readonly');
  });

  it('CEP geral de cidade: trava só cidade/UF, rua e bairro seguem editáveis', async () => {
    const { user } = renderSheet(CEP_SO_CIDADE);

    await user.type(screen.getByLabelText('CEP'), '93600000');
    await screen.findByText('Endereço encontrado pelo CEP.');

    expect(screen.getByLabelText('Cidade')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Rua')).not.toHaveAttribute('readonly');
    expect(screen.getByLabelText('Bairro')).not.toHaveAttribute('readonly');

    await user.type(screen.getByLabelText('Rua'), 'Rua do Meio');
    expect(screen.getByLabelText('Rua')).toHaveValue('Rua do Meio');
  });

  it('CEP inexistente: mensagem de conferência e campos editáveis', async () => {
    const { user } = renderSheet({ status: 'not_found' });

    await user.type(screen.getByLabelText('CEP'), '99999999');

    expect(await screen.findByText(/Não encontrei esse CEP/)).toBeInTheDocument();
    expect(screen.getByLabelText('Rua')).not.toHaveAttribute('readonly');
    expect(screen.getByLabelText('Cidade')).not.toHaveAttribute('readonly');
  });

  it('ViaCEP mudo: avisa e deixa preencher à mão — nunca trava o pedido', async () => {
    const { user } = renderSheet({ status: 'unavailable' });

    await user.type(screen.getByLabelText('CEP'), '93610000');

    expect(await screen.findByText(/Não deu pra buscar o CEP agora/)).toBeInTheDocument();
    expect(screen.getByLabelText('Cidade')).not.toHaveAttribute('readonly');
  });

  it('resposta de um CEP que o cliente já trocou é descartada', async () => {
    const respostas: Record<string, MoPostalCodeLookup> = {
      '93610000': CEP_COMPLETO,
      '93610111': { status: 'found', address: { street: 'Rua Nova', neighborhood: 'Centro', city: 'Novo Hamburgo', state: 'RS' } },
    };
    // O primeiro CEP responde DEPOIS do segundo — se a corrida não fosse
    // tratada, a tela terminaria mostrando o endereço antigo.
    const { user } = renderSheet(
      vi.fn(async (cep: string) => {
        await new Promise((resolve) => setTimeout(resolve, cep === '93610000' ? 40 : 0));
        return respostas[cep] ?? { status: 'not_found' };
      }) as unknown as () => Promise<MoPostalCodeLookup>,
    );

    const campoCep = screen.getByLabelText('CEP');
    await user.type(campoCep, '93610000');
    await user.clear(campoCep);
    await user.type(campoCep, '93610111');

    await screen.findByText('Endereço encontrado pelo CEP.');
    await waitFor(() => expect(screen.getByLabelText('Cidade')).toHaveValue('Novo Hamburgo'));
  });

  it('salvar exige CEP completo E número, além de rua/cidade/UF', async () => {
    const { user } = renderSheet(CEP_COMPLETO);
    const salvar = screen.getByRole('button', { name: 'Salvar endereço' });
    expect(salvar).toBeDisabled();

    await user.type(screen.getByLabelText('CEP'), '93610000');
    await screen.findByText('Endereço encontrado pelo CEP.');
    // Rua/cidade/UF já vieram do CEP; falta só o número.
    expect(salvar).toBeDisabled();

    await user.type(screen.getByLabelText('Número'), '120');
    expect(salvar).toBeEnabled();
  });

  it('salva o endereço completo, com os opcionais em null quando vazios', async () => {
    const onSave = vi.fn();
    const { user } = renderSheet(CEP_COMPLETO, onSave);

    await user.type(screen.getByLabelText('CEP'), '93610000');
    await screen.findByText('Endereço encontrado pelo CEP.');
    await user.type(screen.getByLabelText('Número'), '120');
    await user.click(screen.getByRole('button', { name: 'Salvar endereço' }));

    expect(onSave).toHaveBeenCalledWith({
      label: 'Endereço',
      street: 'Rua das Palmeiras',
      number: '120',
      complement: null,
      neighborhood: 'Bela Vista',
      city: 'Estância Velha',
      state: 'RS',
      postalCode: '93610-000',
      referencePoint: null,
    });
  });

  it('Estado vira maiúsculo e limitado a 2 letras quando digitado à mão', async () => {
    const { user } = renderSheet({ status: 'not_found' });

    await user.type(screen.getByLabelText('Estado'), 'rsx');
    expect(screen.getByLabelText('Estado')).toHaveValue('RS');
  });

  it('abrir com endereço salvo preenche o formulário e reconsulta o CEP', async () => {
    const onLookupPostalCode = vi.fn(async () => CEP_COMPLETO);
    render(
      <MoAddressSheet
        open
        onOpenChange={() => {}}
        onLookupPostalCode={onLookupPostalCode}
        onSave={() => {}}
        initialValue={{
          label: 'Casa',
          street: 'Rua X',
          number: '10',
          complement: null,
          neighborhood: 'Centro',
          city: 'Porto Alegre',
          state: 'RS',
          postalCode: '93610-000',
          referencePoint: null,
        }}
      />,
    );

    expect(screen.getByLabelText('Número')).toHaveValue('10');
    // Reconsulta: o CEP salvo pode ter passado a responder desde a última vez.
    await waitFor(() => expect(onLookupPostalCode).toHaveBeenCalledWith('93610000'));
    await waitFor(() => expect(screen.getByLabelText('Rua')).toHaveValue('Rua das Palmeiras'));
  });
});

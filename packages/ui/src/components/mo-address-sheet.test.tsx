import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MoAddressSheet } from './mo-address-sheet';

function stubGeolocation(implementacao: {
  success?: { lat: number; lng: number };
  fail?: boolean;
}) {
  Object.defineProperty(window.navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (onSuccess: PositionCallback, onError?: PositionErrorCallback) => {
        if (implementacao.fail) {
          onError?.({ code: 1, message: 'negado' } as GeolocationPositionError);
          return;
        }
        onSuccess({
          coords: { latitude: implementacao.success?.lat ?? 0, longitude: implementacao.success?.lng ?? 0 },
        } as GeolocationPosition);
      },
    },
  });
}

afterEach(() => {
  // @ts-expect-error -- limpa o stub entre testes, navigator.geolocation não existe por padrão no jsdom.
  delete window.navigator.geolocation;
});

describe('MoAddressSheet', () => {
  it('não tem violação de acessibilidade', async () => {
    const { container } = render(<MoAddressSheet open onOpenChange={() => {}} onSave={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('fechado: não renderiza nada', () => {
    render(<MoAddressSheet open={false} onOpenChange={() => {}} onSave={() => {}} />);
    expect(screen.queryByText('Seu endereço')).not.toBeInTheDocument();
  });

  it('botão Salvar desabilitado até rua/bairro/cidade/estado estarem preenchidos', async () => {
    const user = userEvent.setup();
    render(<MoAddressSheet open onOpenChange={() => {}} onSave={() => {}} />);

    const salvar = screen.getByRole('button', { name: 'Salvar endereço' });
    expect(salvar).toBeDisabled();

    await user.type(screen.getByLabelText('Rua'), 'Rua das Palmeiras');
    await user.type(screen.getByLabelText('Bairro'), 'Bela Vista');
    await user.type(screen.getByLabelText('Cidade'), 'Estância Velha');
    expect(salvar).toBeDisabled();

    await user.type(screen.getByLabelText('Estado'), 'rs');
    expect(salvar).toBeEnabled();
  });

  it('Estado vira maiúsculo e limitado a 2 letras', async () => {
    const user = userEvent.setup();
    render(<MoAddressSheet open onOpenChange={() => {}} onSave={() => {}} />);

    await user.type(screen.getByLabelText('Estado'), 'rsx');
    expect(screen.getByLabelText('Estado')).toHaveValue('RS');
  });

  it('salva o endereço completo, incluindo campos opcionais como null quando vazios', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<MoAddressSheet open onOpenChange={() => {}} onSave={onSave} />);

    await user.type(screen.getByLabelText('Rua'), 'Rua das Palmeiras');
    await user.type(screen.getByLabelText('Bairro'), 'Bela Vista');
    await user.type(screen.getByLabelText('Cidade'), 'Estância Velha');
    await user.type(screen.getByLabelText('Estado'), 'RS');
    await user.click(screen.getByRole('button', { name: 'Salvar endereço' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        street: 'Rua das Palmeiras',
        neighborhood: 'Bela Vista',
        city: 'Estância Velha',
        state: 'RS',
        number: null,
        complement: null,
        postalCode: null,
        referencePoint: null,
        lat: null,
        lng: null,
      }),
    );
  });

  it('usar minha localização: sucesso preenche lat/lng e mostra confirmação', async () => {
    stubGeolocation({ success: { lat: -29.6, lng: -51.17 } });
    const user = userEvent.setup();
    render(<MoAddressSheet open onOpenChange={() => {}} onSave={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Usar minha localização' }));

    expect(await screen.findByText(/Localização capturada/)).toBeInTheDocument();
  });

  it('usar minha localização: falha (permissão negada) mostra erro, não trava o formulário', async () => {
    stubGeolocation({ fail: true });
    const user = userEvent.setup();
    render(<MoAddressSheet open onOpenChange={() => {}} onSave={() => {}} />);

    await user.click(screen.getByRole('button', { name: 'Usar minha localização' }));

    expect(await screen.findByText(/Não conseguimos acessar sua localização/)).toBeInTheDocument();
  });

  it('reabrir com initialValue preenche o formulário (editar endereço salvo)', () => {
    render(
      <MoAddressSheet
        open
        onOpenChange={() => {}}
        onSave={() => {}}
        initialValue={{
          label: 'Casa',
          street: 'Rua X',
          number: '10',
          complement: null,
          neighborhood: 'Centro',
          city: 'Porto Alegre',
          state: 'RS',
          postalCode: null,
          referencePoint: null,
          lat: -30,
          lng: -51,
        }}
      />,
    );

    expect(screen.getByLabelText('Rua')).toHaveValue('Rua X');
    expect(screen.getByLabelText('Cidade')).toHaveValue('Porto Alegre');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupPostalCode } from './viacep';

function stubFetch(implementacao: () => Promise<unknown> | never) {
  vi.stubGlobal('fetch', vi.fn(implementacao));
}

function respostaOk(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lookupPostalCode', () => {
  it('CEP completo: devolve os campos que o ViaCEP afirma', async () => {
    stubFetch(async () =>
      respostaOk({ logradouro: 'Rua das Palmeiras', bairro: 'Bela Vista', localidade: 'Estância Velha', uf: 'RS' }),
    );

    // Aceita CEP mascarado — é o que sai do campo com `mask="cep"`.
    expect(await lookupPostalCode('93610-000')).toEqual({
      status: 'found',
      address: { street: 'Rua das Palmeiras', neighborhood: 'Bela Vista', city: 'Estância Velha', state: 'RS' },
    });
    expect(fetch).toHaveBeenCalledWith('https://viacep.com.br/ws/93610000/json/', expect.anything());
  });

  it('CEP geral de cidade: campo vazio vira null, não string vazia', async () => {
    stubFetch(async () => respostaOk({ logradouro: '', bairro: '  ', localidade: 'Estância Velha', uf: 'RS' }));

    expect(await lookupPostalCode('93600000')).toEqual({
      status: 'found',
      address: { street: null, neighborhood: null, city: 'Estância Velha', state: 'RS' },
    });
  });

  it('`erro` do ViaCEP vira not_found, nos dois formatos (booleano e string)', async () => {
    stubFetch(async () => respostaOk({ erro: true }));
    expect(await lookupPostalCode('99999999')).toEqual({ status: 'not_found' });

    stubFetch(async () => respostaOk({ erro: 'true' }));
    expect(await lookupPostalCode('99999999')).toEqual({ status: 'not_found' });
  });

  it('CEP com menos de 8 dígitos nem chega a fazer request', async () => {
    stubFetch(async () => respostaOk({}));
    expect(await lookupPostalCode('9361')).toEqual({ status: 'not_found' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rede caída, HTTP não-ok e JSON quebrado viram unavailable — nunca lança', async () => {
    stubFetch(async () => {
      throw new Error('offline');
    });
    await expect(lookupPostalCode('93610000')).resolves.toEqual({ status: 'unavailable' });

    stubFetch(async () => ({ ok: false }) as Response);
    await expect(lookupPostalCode('93610000')).resolves.toEqual({ status: 'unavailable' });

    stubFetch(async () => respostaOk('isto não é um objeto'));
    await expect(lookupPostalCode('93610000')).resolves.toEqual({ status: 'unavailable' });
  });
});

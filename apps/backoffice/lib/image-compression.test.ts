import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compressProductImage } from './image-compression';

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 3200;
  naturalHeight = 1800;
  width = 3200;
  height = 1800;

  set src(_value: string) {
    queueMicrotask(() => this.onload?.());
  }
}

describe('compressProductImage', () => {
  beforeEach(() => {
    vi.stubGlobal('Image', FakeImage);
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:foto'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('não tenta reprocessar SVG', async () => {
    const file = new File(['<svg />'], 'icone.svg', { type: 'image/svg+xml' });

    await expect(compressProductImage(file)).resolves.toBe(file);
  });

  it('gera JPEG menor e limita a maior borda para 1600px', async () => {
    const drawImage = vi.fn();
    const compressedBlob = new Blob(['jpeg menor'], { type: 'image/jpeg' });
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage })),
      toBlob: vi.fn((callback: BlobCallback, type?: string, quality?: number) => {
        callback(compressedBlob);
        expect(type).toBe('image/jpeg');
        expect(quality).toBe(0.82);
      }),
    } as unknown as HTMLCanvasElement;
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);
    const file = new File(['original grande demais para upload direto'], 'pizza.png', { type: 'image/png' });

    const compressed = await compressProductImage(file);

    expect(compressed).not.toBe(file);
    expect(compressed.name).toBe('pizza.jpg');
    expect(compressed.type).toBe('image/jpeg');
    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(900);
    expect(drawImage).toHaveBeenCalledWith(expect.any(FakeImage), 0, 0, 1600, 900);
  });

  it('mantém o arquivo original quando a compressão não reduz tamanho', async () => {
    const largeBlob = new Blob(['maior que o arquivo original'], { type: 'image/jpeg' });
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({ drawImage: vi.fn() })),
      toBlob: vi.fn((callback: BlobCallback) => callback(largeBlob)),
    } as unknown as HTMLCanvasElement;
    vi.spyOn(document, 'createElement').mockReturnValue(canvas);
    const file = new File(['curto'], 'foto.webp', { type: 'image/webp' });

    await expect(compressProductImage(file)).resolves.toBe(file);
  });
});

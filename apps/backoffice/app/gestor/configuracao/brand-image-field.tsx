'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';

/**
 * Campo de imagem de marca com editor de enquadramento (pan + zoom).
 *
 * Fluxo: o lojista escolhe um arquivo -> abre o editor com o recorte no
 * formato exato de onde a imagem aparece (logo 1:1, capa 1.91:1) -> ajusta
 * posição e zoom -> confirma. O recorte é assado num canvas no tamanho final
 * e só então vira upload, então o que ele vê é exatamente o que publica.
 */

type BrandImageKind = 'logo' | 'cover';

interface BrandSpec {
  label: string;
  /** proporção largura/altura do recorte */
  aspect: number;
  /** lado maior do arquivo final, em px */
  outputEdge: number;
  /** logo mantém transparência (PNG); capa achata em JPEG */
  outputMime: 'image/png' | 'image/jpeg';
  maxBytes: number;
  maxLabel: string;
  /** classe do quadro de preview no formulário */
  previewClass: string;
  /** onde a imagem aparece pro cliente */
  usedFor: string;
  /** dica de preparo do arquivo de origem */
  sourceHint: string;
}

export const BRAND_IMAGE_SPEC: Record<BrandImageKind, BrandSpec> = {
  logo: {
    label: 'Logo',
    aspect: 1,
    outputEdge: 512,
    outputMime: 'image/png',
    maxBytes: 500 * 1024,
    maxLabel: '500 KB',
    previewClass: 'h-20 w-20 rounded-full',
    usedFor: 'Foto de perfil redonda no card de compartilhamento e ícone do app.',
    sourceHint:
      'Quadrada, no mínimo 512 × 512 px. PNG com fundo transparente fica melhor; deixe uma folga em volta do desenho porque o recorte é circular.',
  },
  cover: {
    label: 'Capa',
    aspect: 1200 / 630,
    outputEdge: 1200,
    outputMime: 'image/jpeg',
    maxBytes: 1024 * 1024,
    maxLabel: '1 MB',
    previewClass: 'h-20 w-36 rounded-[10px]',
    usedFor: 'Fundo do card “fachada” que aparece quando o link da loja é compartilhado.',
    sourceHint:
      'Deitada, proporção 1200 × 630 px (1.91:1), no mínimo 1200 px de largura. Mantenha o essencial no centro — as bordas podem ser cortadas em telas menores.',
  },
};

const ACCEPT = 'image/png,image/jpeg,image/webp';
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
/** o quadro de edição tem esta largura em px na tela */
const FRAME_W = 320;

interface LoadedImage {
  el: HTMLImageElement;
  url: string;
  naturalWidth: number;
  naturalHeight: number;
}

function loadImage(file: File): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () =>
      resolve({ el, url, naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight });
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível abrir a imagem.'));
    };
    el.src = url;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Assa o recorte visível num arquivo final. `scale` e `offset` estão na escala
 * do quadro de edição (FRAME_W); convertemos pro tamanho de saída.
 */
async function bakeCrop(
  img: LoadedImage,
  spec: BrandSpec,
  scale: number,
  offset: { x: number; y: number },
): Promise<File> {
  const frameH = FRAME_W / spec.aspect;
  const outW = spec.aspect >= 1 ? spec.outputEdge : Math.round(spec.outputEdge * spec.aspect);
  const outH = spec.aspect >= 1 ? Math.round(spec.outputEdge / spec.aspect) : spec.outputEdge;
  const k = outW / FRAME_W;

  // tamanho da imagem "contida" no quadro (antes do zoom)
  const baseScale = Math.max(FRAME_W / img.naturalWidth, frameH / img.naturalHeight);
  const drawW = img.naturalWidth * baseScale * scale * k;
  const drawH = img.naturalHeight * baseScale * scale * k;
  const cx = outW / 2 + offset.x * k;
  const cy = outH / 2 + offset.y * k;

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível neste navegador.');
  ctx.imageSmoothingQuality = 'high';
  if (spec.outputMime === 'image/jpeg') {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, outW, outH);
  }
  ctx.drawImage(img.el, cx - drawW / 2, cy - drawH / 2, drawW, drawH);

  const qualities = spec.outputMime === 'image/jpeg' ? [0.85, 0.75, 0.65, 0.5] : [1];
  for (const q of qualities) {
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, spec.outputMime, q),
    );
    if (blob && blob.size <= spec.maxBytes) {
      return new File([blob], `${spec.label.toLowerCase()}.${spec.outputMime === 'image/png' ? 'png' : 'jpg'}`, {
        type: spec.outputMime,
        lastModified: Date.now(),
      });
    }
    if (q === qualities[qualities.length - 1] && blob) {
      // PNG grande demais: reduz o lado e tenta uma vez
      if (spec.outputMime === 'image/png' && blob.size > spec.maxBytes) {
        const half = document.createElement('canvas');
        half.width = Math.round(outW * 0.7);
        half.height = Math.round(outH * 0.7);
        half.getContext('2d')?.drawImage(canvas, 0, 0, half.width, half.height);
        const small = await new Promise<Blob | null>((res) => half.toBlob(res, 'image/png'));
        if (small) return new File([small], 'logo.png', { type: 'image/png', lastModified: Date.now() });
      }
      return new File([blob], `${spec.label.toLowerCase()}.jpg`, { type: spec.outputMime, lastModified: Date.now() });
    }
  }
  throw new Error('Não foi possível gerar a imagem.');
}

function CropEditor({
  file,
  spec,
  onCancel,
  onConfirm,
}: {
  file: File;
  spec: BrandSpec;
  onCancel: () => void;
  onConfirm: (cropped: File) => void;
}) {
  const [img, setImg] = useState<LoadedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [baking, setBaking] = useState(false);
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);
  const frameH = FRAME_W / spec.aspect;

  useEffect(() => {
    let live = true;
    let loaded: LoadedImage | null = null;
    loadImage(file)
      .then((res) => {
        if (!live) {
          URL.revokeObjectURL(res.url);
          return;
        }
        loaded = res;
        setImg(res);
      })
      .catch((cause: unknown) => live && setError(cause instanceof Error ? cause.message : 'Erro ao abrir imagem.'));
    return () => {
      live = false;
      if (loaded) URL.revokeObjectURL(loaded.url);
    };
  }, [file]);

  const clampOffset = useCallback(
    (next: { x: number; y: number }, atScale: number) => {
      if (!img) return next;
      const baseScale = Math.max(FRAME_W / img.naturalWidth, frameH / img.naturalHeight);
      const drawW = img.naturalWidth * baseScale * atScale;
      const drawH = img.naturalHeight * baseScale * atScale;
      const maxX = Math.max(0, (drawW - FRAME_W) / 2);
      const maxY = Math.max(0, (drawH - frameH) / 2);
      return { x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
    },
    [img, frameH],
  );

  function applyScale(nextRaw: number) {
    const next = clamp(nextRaw, MIN_ZOOM, MAX_ZOOM);
    setScale(next);
    setOffset((prev) => clampOffset(prev, next));
  }

  function onPointerDown(event: React.PointerEvent) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { px: event.clientX, py: event.clientY, ox: offset.x, oy: offset.y };
  }
  function onPointerMove(event: React.PointerEvent) {
    if (!drag.current) return;
    const nx = drag.current.ox + (event.clientX - drag.current.px);
    const ny = drag.current.oy + (event.clientY - drag.current.py);
    setOffset(clampOffset({ x: nx, y: ny }, scale));
  }
  function onPointerUp() {
    drag.current = null;
  }

  async function confirm() {
    if (!img) return;
    setBaking(true);
    setError(null);
    try {
      onConfirm(await bakeCrop(img, spec, scale, offset));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Erro ao recortar.');
      setBaking(false);
    }
  }

  const baseScale = img ? Math.max(FRAME_W / img.naturalWidth, frameH / img.naturalHeight) : 1;
  const imgStyle: React.CSSProperties = img
    ? {
        width: img.naturalWidth * baseScale * scale,
        height: img.naturalHeight * baseScale * scale,
        transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
      }
    : {};

  return (
    <div className="mt-3 rounded-[14px] border border-border bg-bg-card p-3">
      <p className="text-sm font-medium">Ajuste o enquadramento</p>
      <p className="mt-1 text-xs text-text-muted">Arraste para posicionar. Use o zoom para preencher o quadro.</p>

      <div className="mt-3 flex justify-center">
        <div
          className="relative touch-none overflow-hidden bg-[repeating-conic-gradient(#e5e7eb_0_25%,#f9fafb_0_50%)] bg-[length:20px_20px]"
          style={{
            width: FRAME_W,
            height: frameH,
            borderRadius: spec.aspect === 1 ? '9999px' : '10px',
            cursor: drag.current ? 'grabbing' : 'grab',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {img && (
            <img
              src={img.url}
              alt=""
              draggable={false}
              className="pointer-events-none absolute left-1/2 top-1/2 max-w-none select-none"
              style={imgStyle}
            />
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          aria-label="Diminuir zoom"
          className="rounded-[10px] border border-border p-1.5 text-text-muted hover:border-border-strong disabled:opacity-40"
          disabled={scale <= MIN_ZOOM}
          onClick={() => applyScale(scale - 0.25)}
        >
          <Minus className="h-4 w-4" />
        </button>
        <input
          type="range"
          aria-label="Zoom"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={scale}
          onChange={(event) => applyScale(Number(event.target.value))}
          className="h-1 flex-1 accent-brand"
        />
        <button
          type="button"
          aria-label="Aumentar zoom"
          className="rounded-[10px] border border-border p-1.5 text-text-muted hover:border-border-strong disabled:opacity-40"
          disabled={scale >= MAX_ZOOM}
          onClick={() => applyScale(scale + 0.25)}
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Recomeçar"
          className="rounded-[10px] border border-border p-1.5 text-text-muted hover:border-border-strong"
          onClick={() => {
            setScale(1);
            setOffset({ x: 0, y: 0 });
          }}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-critical">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="rounded-[10px] bg-brand px-3 py-2 text-sm font-semibold text-on-brand disabled:opacity-50"
          disabled={!img || baking}
          onClick={() => void confirm()}
        >
          {baking ? 'Aplicando…' : 'Usar esta imagem'}
        </button>
        <button
          type="button"
          className="rounded-[10px] border border-border px-3 py-2 text-sm font-medium hover:border-border-strong"
          onClick={onCancel}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function BrandImageField({
  kind,
  imageUrl,
  busy,
  onChange,
}: {
  kind: BrandImageKind;
  imageUrl: string | null;
  busy: boolean;
  onChange: (file: File | undefined) => void;
}) {
  const spec = BRAND_IMAGE_SPEC[kind];
  const [pending, setPending] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!localPreview) return;
    return () => URL.revokeObjectURL(localPreview);
  }, [localPreview]);

  function pick(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) {
      setError('Use um arquivo PNG, JPG ou WebP.');
      return;
    }
    setPending(file);
  }

  function applyCropped(cropped: File) {
    setLocalPreview(URL.createObjectURL(cropped));
    setPending(null);
    onChange(cropped);
  }

  const shown = localPreview ?? imageUrl;

  return (
    <div className="block">
      <span className="text-sm font-medium">{spec.label}</span>
      <span className="mt-2 flex min-h-28 items-start gap-3 rounded-[14px] border border-border bg-bg px-3 py-3">
        {shown ? (
          <img
            src={shown}
            alt=""
            className={`${spec.previewClass} shrink-0 border border-border bg-[repeating-conic-gradient(#e5e7eb_0_25%,#f9fafb_0_50%)] bg-[length:12px_12px] object-cover`}
          />
        ) : (
          <span
            className={`${spec.previewClass} flex shrink-0 items-center justify-center bg-bg-card text-center text-xs text-text-muted`}
          >
            Sem imagem
          </span>
        )}
        <span className="flex min-w-0 flex-col gap-1.5">
          <input
            ref={inputRef}
            className="block w-full text-sm text-text-muted file:mr-3 file:rounded-[10px] file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:font-semibold file:text-on-brand"
            type="file"
            accept={ACCEPT}
            disabled={busy}
            onChange={(event) => {
              pick(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <span className="text-xs text-text-muted">
            {busy ? 'Enviando…' : `Aparece em: ${spec.usedFor}`}
          </span>
          <span className="text-xs text-text-muted">
            Arquivo: {spec.sourceHint} Até {spec.maxLabel}.
          </span>
          {error && (
            <span role="alert" className="text-xs font-medium text-critical">
              {error}
            </span>
          )}
        </span>
      </span>

      {pending && (
        <CropEditor
          file={pending}
          spec={spec}
          onCancel={() => setPending(null)}
          onConfirm={applyCropped}
        />
      )}
    </div>
  );
}

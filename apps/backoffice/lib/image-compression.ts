const TARGET_MIME = 'image/jpeg';
const MAX_EDGE = 1600;
const QUALITY = 0.82;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function readImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler a foto.'));
    };
    image.src = url;
  });
}

function targetSize(width: number, height: number): { width: number; height: number } {
  const largest = Math.max(width, height);
  if (largest <= MAX_EDGE) return { width, height };
  const ratio = MAX_EDGE / largest;
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

export async function compressProductImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file;
  if (typeof document === 'undefined') return file;

  const image = await readImage(file);
  const size = targetSize(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;

  const context = canvas.getContext('2d');
  if (!context) return file;
  context.drawImage(image, 0, 0, size.width, size.height);

  const blob = await canvasToBlob(canvas, TARGET_MIME, QUALITY);
  if (!blob || blob.size >= file.size) return file;

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'foto-produto';
  return new File([blob], `${baseName}.jpg`, { type: TARGET_MIME, lastModified: Date.now() });
}

import type { WatermarkOptions } from './types';

/** Sin DOM: se usa tanto en el worker de imágenes como en el hilo principal (vídeo). */

const TEXT_PX = 160;
const PAD = 24;

const alphaOf = (w: WatermarkOptions) => Math.min(1, Math.max(0, w.opacity / 100));

export function hasWatermark(w: WatermarkOptions | null | undefined): w is WatermarkOptions {
  if (!w) return false;
  return w.kind === 'image' ? !!w.image : w.text.trim().length > 0;
}

/** Marca de agua ya dibujada (texto o imagen) con su opacidad, en un lienzo con fondo transparente. */
export function makeSprite(w: WatermarkOptions, bitmap: ImageBitmap | null, maxWidth = 1024): OffscreenCanvas | null {
  if (w.kind === 'image') {
    if (!bitmap) return null;
    const k = Math.min(1, maxWidth / bitmap.width);
    const sprite = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * k)), Math.max(1, Math.round(bitmap.height * k)));
    const ctx = sprite.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = alphaOf(w);
    ctx.drawImage(bitmap, 0, 0, sprite.width, sprite.height);
    return sprite;
  }

  const text = w.text.trim();
  if (!text) return null;
  const font = `600 ${TEXT_PX}px system-ui, "Segoe UI", sans-serif`;
  const probe = new OffscreenCanvas(1, 1).getContext('2d')!;
  probe.font = font;
  const textW = Math.ceil(probe.measureText(text).width);
  const sprite = new OffscreenCanvas(Math.min(8192, textW + PAD * 2), Math.round(TEXT_PX * 1.3) + PAD * 2);
  const ctx = sprite.getContext('2d')!;
  ctx.globalAlpha = alphaOf(w);
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = TEXT_PX * 0.08;
  ctx.fillStyle = '#fff';
  ctx.fillText(text, sprite.width / 2, sprite.height / 2, sprite.width - PAD);
  return sprite;
}

/** Dibuja la marca de agua sobre una imagen (posición 3×3). */
export function drawWatermark(canvas: OffscreenCanvas, w: WatermarkOptions, bitmap: ImageBitmap | null) {
  const sprite = makeSprite(w, bitmap);
  if (!sprite) return;
  const side = Math.min(canvas.width, canvas.height);
  const dw =
    w.kind === 'image'
      ? (canvas.width * w.imgPct) / 100
      : (sprite.width * ((side * w.sizePct) / 100)) / TEXT_PX; // sizePct = alto del texto
  drawSprite(canvas.getContext('2d')!, sprite, canvas.width, canvas.height, w.position, dw);
}

/** Coloca la marca de agua en una cuadrícula 3×3 con un margen proporcional; `width` en píxeles. */
export function drawSprite(
  ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
  sprite: OffscreenCanvas,
  cw: number,
  ch: number,
  position: number,
  width: number,
) {
  const dw = Math.max(4, Math.min(cw, width));
  const dh = (sprite.height * dw) / sprite.width;
  const margin = Math.round(Math.min(cw, ch) * 0.03);
  const col = position % 3;
  const row = Math.floor(position / 3);
  const x = col === 0 ? margin : col === 1 ? (cw - dw) / 2 : cw - dw - margin;
  const y = row === 0 ? margin : row === 1 ? (ch - dh) / 2 : ch - dh - margin;
  ctx.save();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sprite, Math.round(x), Math.round(y), Math.round(dw), Math.round(dh));
  ctx.restore();
}

export async function decodeWatermarkImage(w: WatermarkOptions): Promise<ImageBitmap | null> {
  if (w.kind !== 'image' || !w.image) return null;
  return createImageBitmap(new Blob([w.image.buffer], { type: w.image.mime }));
}

/** PNG de la marca de agua con la opacidad ya aplicada (para ffmpeg en escritorio). */
export async function watermarkPng(w: WatermarkOptions): Promise<Uint8Array | null> {
  const bitmap = await decodeWatermarkImage(w);
  try {
    const sprite = makeSprite(w, bitmap);
    if (!sprite) return null;
    const blob = await sprite.convertToBlob({ type: 'image/png' });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    bitmap?.close();
  }
}

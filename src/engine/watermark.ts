import type { WatermarkOptions } from './types';

/** Sin DOM: se usa tanto en el worker de imágenes como en el hilo principal (vídeo). */

const MARGIN = 0.03;

const alphaOf = (w: WatermarkOptions) => Math.min(1, Math.max(0, w.opacity / 100));

export function hasWatermark(w: WatermarkOptions | null | undefined): w is WatermarkOptions {
  if (!w) return false;
  return w.kind === 'image' ? !!w.image : w.text.trim().length > 0;
}

/** Marca de agua ya dibujada con su tamaño final en píxeles y el ancho al que hay que pintarla. */
export interface PlacedSprite {
  sprite: OffscreenCanvas;
  width: number;
}

/** Imagen con su opacidad, en un lienzo transparente (como mucho `maxWidth` de ancho). */
function imageSprite(w: WatermarkOptions, bitmap: ImageBitmap | null, maxWidth = 1024): OffscreenCanvas | null {
  if (!bitmap) return null;
  const k = Math.min(1, maxWidth / bitmap.width);
  const sprite = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * k)), Math.max(1, Math.round(bitmap.height * k)));
  const ctx = sprite.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.globalAlpha = alphaOf(w);
  ctx.drawImage(bitmap, 0, 0, sprite.width, sprite.height);
  return sprite;
}

/** Parte el texto en líneas que no superen `maxW` (por palabras; una palabra más larga se corta por letras). */
function wrapLines(ctx: OffscreenCanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxW) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      let rest = word;
      while (ctx.measureText(rest).width > maxW && rest.length > 1) {
        let n = rest.length - 1;
        while (n > 1 && ctx.measureText(rest.slice(0, n)).width > maxW) n--;
        lines.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * Marca de agua para un lienzo de `cw`×`ch`.
 * Texto: tamaño fijo (alto = `sizePct` % del lado menor, sin escalarlo después), alineado según la columna de la posición
 * y partido en varias líneas si no cabe en el ancho de la imagen. Imagen: `imgPct` % del ancho.
 */
export function placedSprite(w: WatermarkOptions, bitmap: ImageBitmap | null, cw: number, ch: number): PlacedSprite | null {
  if (w.kind === 'image') {
    const sprite = imageSprite(w, bitmap);
    return sprite ? { sprite, width: (cw * w.imgPct) / 100 } : null;
  }

  const text = w.text.trim();
  if (!text) return null;
  const side = Math.min(cw, ch);
  const fontPx = Math.max(8, Math.round((side * w.sizePct) / 100));
  const pad = Math.ceil(fontPx * 0.3);
  const maxLine = Math.max(fontPx, cw - 2 * Math.round(side * MARGIN) - 2 * pad);
  const font = `600 ${fontPx}px system-ui, "Segoe UI", sans-serif`;

  const probe = new OffscreenCanvas(1, 1).getContext('2d')!;
  probe.font = font;
  const lines = wrapLines(probe, text, maxLine);
  if (!lines.length) return null;
  const lineH = Math.round(fontPx * 1.25);
  const textW = Math.ceil(Math.max(...lines.map((l) => probe.measureText(l).width)));
  const sprite = new OffscreenCanvas(Math.max(1, textW + pad * 2), lineH * lines.length + pad * 2);
  const ctx = sprite.getContext('2d')!;
  ctx.globalAlpha = alphaOf(w);
  ctx.font = font;
  ctx.textBaseline = 'middle';
  const col = w.position % 3;
  ctx.textAlign = col === 0 ? 'left' : col === 1 ? 'center' : 'right';
  const color = /^#[0-9a-f]{6}$/i.test(w.color ?? '') ? w.color! : '#ffffff';
  const lum = (0.299 * parseInt(color.slice(1, 3), 16) + 0.587 * parseInt(color.slice(3, 5), 16) + 0.114 * parseInt(color.slice(5, 7), 16)) / 255;
  const outline = !!w.outline;
  if (outline) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, fontPx * 0.14);
    ctx.strokeStyle = /^#[0-9a-f]{6}$/i.test(w.outlineColor ?? '') ? w.outlineColor! : '#000000';
  } else {
    ctx.shadowColor = lum > 0.5 ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.5)'; // sombra contraria para que se lea sobre cualquier fondo
    ctx.shadowBlur = fontPx * 0.12;
  }
  ctx.fillStyle = color;
  const x = col === 0 ? pad : col === 1 ? sprite.width / 2 : sprite.width - pad;
  lines.forEach((line, i) => {
    const y = pad + lineH * i + lineH / 2;
    if (outline) ctx.strokeText(line, x, y);
    ctx.fillText(line, x, y);
  });
  return { sprite, width: sprite.width };
}

/** Dibuja la marca de agua sobre una imagen (posición 3×3). */
export function drawWatermark(canvas: OffscreenCanvas, w: WatermarkOptions, bitmap: ImageBitmap | null) {
  const placed = placedSprite(w, bitmap, canvas.width, canvas.height);
  if (placed) drawSprite(canvas.getContext('2d')!, placed.sprite, canvas.width, canvas.height, w.position, placed.width);
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
  const margin = Math.round(Math.min(cw, ch) * MARGIN);
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

/** Tamaño (px) del resultado de vídeo/GIF/fotograma a partir del original; refleja lo que hace ffmpeg en escritorio. */
export function outputSize(o: { kind: string; animWidth: number; maxHeight: number }, iw: number, ih: number): { w: number; h: number } {
  if (!iw || !ih) return { w: 0, h: 0 };
  if (o.kind === 'gif' || o.kind === 'webp') {
    const w = Math.min(o.animWidth || 480, iw);
    return { w, h: Math.round((ih * w) / iw) };
  }
  const h = o.maxHeight > 0 ? Math.min(o.maxHeight, ih) : ih;
  return { w: Math.round((iw * h) / ih), h };
}

/** PNG de la marca de agua para un resultado de `cw`×`ch` (para ffmpeg en escritorio) y su ancho como % del vídeo. */
export async function watermarkPng(w: WatermarkOptions, cw: number, ch: number): Promise<{ png: Uint8Array; widthPct: number } | null> {
  const bitmap = await decodeWatermarkImage(w);
  try {
    const placed = placedSprite(w, bitmap, cw, ch);
    if (!placed) return null;
    const blob = await placed.sprite.convertToBlob({ type: 'image/png' });
    return { png: new Uint8Array(await blob.arrayBuffer()), widthPct: Math.min(100, Math.max(1, (placed.width / cw) * 100)) };
  } finally {
    bitmap?.close();
  }
}

export interface WatermarkPainter {
  /** Pinta la marca de agua en un fotograma de `cw`×`ch` (la prepara una sola vez por tamaño). */
  paint(ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, cw: number, ch: number): void;
  close(): void;
}

export async function watermarkPainter(w: WatermarkOptions): Promise<WatermarkPainter> {
  const bitmap = await decodeWatermarkImage(w);
  const cache = new Map<string, PlacedSprite | null>();
  return {
    paint(ctx, cw, ch) {
      const key = `${cw}x${ch}`;
      if (!cache.has(key)) cache.set(key, placedSprite(w, bitmap, cw, ch));
      const placed = cache.get(key);
      if (placed) drawSprite(ctx, placed.sprite, cw, ch, w.position, placed.width);
    },
    close: () => bitmap?.close(),
  };
}

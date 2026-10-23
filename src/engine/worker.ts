/// <reference lib="webworker" />
import { encode as encodeWebp } from '@jsquash/webp';
import { encode as encodeAvif } from '@jsquash/avif';
import { encode as encodeJpeg } from '@jsquash/jpeg';
import { encode as encodePng } from '@jsquash/png';
import { optimise } from '@jsquash/oxipng';
import * as UTIF from 'utif2';
import { codecParams } from './presets';
import type { ConvertOptions, WorkerRequest, WorkerResponse } from './types';

const isTiff = (mime: string, name: string) => /tiff?$/i.test(mime) || /\.tiff?$/i.test(name);

async function decode(buffer: ArrayBuffer, mime: string, name: string): Promise<ImageData> {
  if (isTiff(mime, name)) {
    const [ifd] = UTIF.decode(buffer);
    if (!ifd) throw new Error('TIFF vacío o dañado');
    UTIF.decodeImage(buffer, ifd);
    const rgba = UTIF.toRGBA8(ifd);
    return new ImageData(new Uint8ClampedArray(rgba), ifd.width, ifd.height);
  }
  const bitmap = await createImageBitmap(new Blob([buffer], { type: mime }));
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

function fitSize(w: number, h: number, o: ConvertOptions) {
  const rw = o.maxWidth > 0 ? o.maxWidth / w : Infinity;
  const rh = o.maxHeight > 0 ? o.maxHeight / h : Infinity;
  const r = Math.min(rw, rh, 1); // nunca se amplía
  if (r >= 1) return { width: w, height: h };
  return { width: Math.max(1, Math.round(w * r)), height: Math.max(1, Math.round(h * r)) };
}

function resize(src: ImageData, width: number, height: number): ImageData {
  if (src.width === width && src.height === height) return src;
  // Reducción por pasos de /2 para conservar nitidez (un único salto grande produce aliasing).
  let canvas = new OffscreenCanvas(src.width, src.height);
  canvas.getContext('2d')!.putImageData(src, 0, 0);
  let cw = src.width;
  let ch = src.height;
  while (cw / 2 > width || ch / 2 > height) {
    const nw = Math.max(width, Math.floor(cw / 2));
    const nh = Math.max(height, Math.floor(ch / 2));
    const next = new OffscreenCanvas(nw, nh);
    const c = next.getContext('2d')!;
    c.imageSmoothingQuality = 'high';
    c.drawImage(canvas, 0, 0, nw, nh);
    canvas = next;
    cw = nw;
    ch = nh;
  }
  const out = new OffscreenCanvas(width, height);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

function hasAlpha(img: ImageData): boolean {
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) if (d[i] !== 255) return true;
  return false;
}

/** JPEG no admite transparencia: se compone sobre blanco. */
function flatten(img: ImageData): ImageData {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 255) continue;
    const k = a / 255;
    d[i] = d[i] * k + 255 * (1 - k);
    d[i + 1] = d[i + 1] * k + 255 * (1 - k);
    d[i + 2] = d[i + 2] * k + 255 * (1 - k);
    d[i + 3] = 255;
  }
  return img;
}

async function convert(req: WorkerRequest) {
  const { options } = req;
  let img = await decode(req.buffer, req.mime, req.name);
  const alpha = hasAlpha(img);
  const size = fitSize(img.width, img.height, options);
  img = resize(img, size.width, size.height);

  const p = codecParams(options.format, options.preset);
  let out: ArrayBuffer;
  switch (options.format) {
    case 'webp':
      out = await encodeWebp(img, {
        quality: p.quality,
        lossless: p.lossless ? 1 : 0,
        // exact=1 conserva el RGB bajo los píxeles transparentes en modo lossless
        exact: p.lossless ? 1 : 0,
        method: 5,
      });
      break;
    case 'avif':
      out = await encodeAvif(img, { quality: p.quality, lossless: p.lossless, speed: 6 });
      break;
    case 'jpeg':
      out = await encodeJpeg(alpha ? flatten(img) : img, { quality: p.quality, progressive: true });
      break;
    case 'png': {
      const raw = await encodePng(img);
      out = await optimise(raw, { level: p.pngLevel, interlace: false, optimiseAlpha: true });
      break;
    }
  }
  return { buffer: out, width: img.width, height: img.height, hasAlpha: alpha };
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    const r = await convert(req);
    const res: WorkerResponse = { id: req.id, ok: true, ...r };
    ctx.postMessage(res, [r.buffer]);
  } catch (err) {
    const res: WorkerResponse = { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) };
    ctx.postMessage(res);
  }
};

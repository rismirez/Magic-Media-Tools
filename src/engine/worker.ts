/// <reference lib="webworker" />
import { encode as encodeWebp } from '@jsquash/webp';
import { encode as encodeAvif } from '@jsquash/avif';
import { encode as encodeJpeg } from '@jsquash/jpeg';
import { encode as encodePng } from '@jsquash/png';
import { optimise } from '@jsquash/oxipng';
import * as UTIF from 'utif2';
import { codecParams } from './presets';
import { orient } from './canvas';
import { planResize, type ResizePlan } from './geometry';
import { decodeWatermarkImage, drawWatermark } from './watermark';
import type { ConvertOptions, Output, WorkerRequest, WorkerResponse } from './types';

const isTiff = (mime: string, name: string) => /tiff?$/i.test(mime) || /\.tiff?$/i.test(name);

function toCanvas(img: ImageData): OffscreenCanvas {
  const c = new OffscreenCanvas(img.width, img.height);
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}

async function decode(buffer: ArrayBuffer, mime: string, name: string): Promise<OffscreenCanvas> {
  if (isTiff(mime, name)) {
    const [ifd] = UTIF.decode(buffer);
    if (!ifd) throw new Error('TIFF vacío o dañado');
    UTIF.decodeImage(buffer, ifd);
    const rgba = UTIF.toRGBA8(ifd);
    return toCanvas(new ImageData(new Uint8ClampedArray(rgba), ifd.width, ifd.height));
  }
  // imageOrientation "from-image" (por defecto) aplica la orientación EXIF: las fotos salen derechas.
  const bitmap = await createImageBitmap(new Blob([buffer], { type: mime }));
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
    return canvas;
  } finally {
    bitmap.close();
  }
}

/** Reduce por pasos de /2: un único salto grande produce aliasing. */
function stepDown(src: OffscreenCanvas, width: number, height: number): OffscreenCanvas {
  if (src.width === width && src.height === height) return src;
  let canvas = src;
  while (canvas.width / 2 > width || canvas.height / 2 > height) {
    const next = new OffscreenCanvas(Math.max(width, Math.floor(canvas.width / 2)), Math.max(height, Math.floor(canvas.height / 2)));
    const c = next.getContext('2d')!;
    c.imageSmoothingQuality = 'high';
    c.drawImage(canvas, 0, 0, next.width, next.height);
    canvas = next;
  }
  const out = new OffscreenCanvas(width, height);
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, width, height);
  return out;
}

function render(src: OffscreenCanvas, plan: ResizePlan, background: string): OffscreenCanvas {
  let region = src;
  if (plan.sx || plan.sy || plan.sw !== src.width || plan.sh !== src.height) {
    region = new OffscreenCanvas(plan.sw, plan.sh);
    region.getContext('2d')!.drawImage(src, plan.sx, plan.sy, plan.sw, plan.sh, 0, 0, plan.sw, plan.sh);
  }
  const scaled = stepDown(region, plan.dw, plan.dh);
  if (plan.outW === plan.dw && plan.outH === plan.dh) return scaled;
  const out = new OffscreenCanvas(plan.outW, plan.outH);
  const ctx = out.getContext('2d')!;
  if (background !== 'transparent') {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, out.width, out.height);
  }
  ctx.drawImage(scaled, plan.dx, plan.dy);
  return out;
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

async function encodeOnce(img: ImageData, o: ConvertOptions, quality: number, lossless: boolean, pngLevel: number): Promise<ArrayBuffer> {
  switch (o.format) {
    case 'webp':
      return encodeWebp(img, {
        quality,
        lossless: lossless ? 1 : 0,
        // exact=1 conserva el RGB bajo los píxeles transparentes en modo lossless
        exact: lossless ? 1 : 0,
        method: 5,
      });
    case 'avif':
      return encodeAvif(img, { quality, lossless, speed: 6 });
    case 'jpeg':
      return encodeJpeg(img, { quality, progressive: true });
    case 'png': {
      const raw = await encodePng(img);
      return optimise(raw, { level: pngLevel, interlace: false, optimiseAlpha: true });
    }
  }
}

async function encode(img: ImageData, o: ConvertOptions): Promise<{ buffer: ArrayBuffer; targetMissed: boolean }> {
  const p = codecParams(o.format, o.preset);
  const targetBytes = o.targetKB * 1024;

  if (targetBytes > 0 && o.format !== 'png') {
    // Búsqueda binaria de la mayor calidad que cabe en el peso objetivo.
    let best: ArrayBuffer | null = null;
    let lo = 5;
    let hi = 95;
    const top = await encodeOnce(img, o, hi, false, p.pngLevel);
    if (top.byteLength <= targetBytes) return { buffer: top, targetMissed: false };
    for (let i = 0; i < 6 && lo <= hi; i++) {
      const mid = Math.floor((lo + hi) / 2);
      const out = await encodeOnce(img, o, mid, false, p.pngLevel);
      if (out.byteLength <= targetBytes) {
        best = out;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (best) return { buffer: best, targetMissed: false };
    return { buffer: await encodeOnce(img, o, 5, false, p.pngLevel), targetMissed: true };
  }

  return { buffer: await encodeOnce(img, o, p.quality, p.lossless, p.pngLevel), targetMissed: false };
}

async function convert(req: WorkerRequest) {
  const { options: o } = req;
  const decoded = await decode(req.buffer, req.mime, req.name);
  const oriented = orient(decoded, o.rotate, o.flipH, o.flipV);
  const alpha = hasAlpha(oriented.getContext('2d')!.getImageData(0, 0, oriented.width, oriented.height));

  // Varias versiones (srcset): sólo anchos menores que el original; si no hay ninguno, una sola salida.
  const widths = [...new Set(o.sizes)].filter((w) => w > 0 && w < oriented.width).sort((a, b) => b - a);
  const plans: ResizePlan[] = widths.length
    ? widths.map((w) => planResize(oriented.width, oriented.height, { ...o.resize, mode: 'inside', width: w, height: 0 }))
    : [planResize(oriented.width, oriented.height, o.resize)];

  const outputs: Output[] = [];
  const wmBitmap = o.watermark ? await decodeWatermarkImage(o.watermark) : null;
  for (const plan of plans) {
    const canvas = render(oriented, plan, o.resize.background);
    if (o.watermark) drawWatermark(canvas, o.watermark, wmBitmap);
    let img = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    if (o.format === 'jpeg' && alpha) img = flatten(img);
    const { buffer, targetMissed } = await encode(img, o);
    outputs.push({ buffer, width: canvas.width, height: canvas.height, targetMissed });
  }
  wmBitmap?.close();
  return { outputs, hasAlpha: alpha };
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    const r = await convert(req);
    const res: WorkerResponse = { id: req.id, ok: true, ...r };
    ctx.postMessage(
      res,
      r.outputs.map((o) => o.buffer),
    );
  } catch (err) {
    const res: WorkerResponse = { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) };
    ctx.postMessage(res);
  }
};

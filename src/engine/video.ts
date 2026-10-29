import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSink,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  QUALITY_LOW,
  QUALITY_MEDIUM,
  WebMOutputFormat,
  getEncodableVideoCodecs,
  type VideoCodec,
  type VideoSample,
} from 'mediabunny';
import type { WatermarkOptions } from './types';
import { probeGif } from './gifInput';
import { hasWatermark, watermarkPainter } from './watermark';

export type VideoKind = 'video' | 'gif' | 'webp' | 'frame';
export type VideoFormat = 'mp4-h264' | 'mp4-h265' | 'webm-vp9' | 'webm-av1';
export type VideoQuality = 'high' | 'balanced' | 'small';
export type FrameFormat = 'jpeg' | 'png' | 'webp';

export interface VideoOptions {
  kind: VideoKind;
  format: VideoFormat;
  quality: VideoQuality;
  /** Peso máximo aproximado en MB (0 = desactivado). */
  targetMB: number;
  /** 0 = original. Nunca se amplía. */
  maxHeight: number;
  /** 0 = original. */
  maxFps: number;
  audio: 'keep' | 'drop';
  /** 0 = automático. */
  audioKbps: number;
  /** Segundos. end = 0 → hasta el final. */
  start: number;
  end: number;
  animWidth: number;
  animFps: number;
  frameTime: number;
  frameFormat: FrameFormat;
}

export const defaultVideoOptions: VideoOptions = {
  kind: 'video',
  format: 'mp4-h264',
  quality: 'balanced',
  targetMB: 0,
  maxHeight: 0,
  maxFps: 0,
  audio: 'keep',
  audioKbps: 0,
  start: 0,
  end: 0,
  animWidth: 480,
  animFps: 12,
  frameTime: 0,
  frameFormat: 'jpeg',
};

const VIDEO_EXTS = ['gif', 'mp4', 'm4v', 'mov', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'mpg', 'mpeg', 'ts', 'mts', 'm2ts', '3gp', 'ogv'];
export const VIDEO_ACCEPT = VIDEO_EXTS.map((e) => `.${e}`).join(',');
export const isVideoFile = (name: string) => VIDEO_EXTS.includes(name.slice(name.lastIndexOf('.') + 1).toLowerCase());

export function outputExt(o: VideoOptions): string {
  if (o.kind === 'gif') return 'gif';
  if (o.kind === 'webp') return 'webp';
  if (o.kind === 'frame') return o.frameFormat === 'jpeg' ? 'jpg' : o.frameFormat;
  return o.format.startsWith('mp4') ? 'mp4' : 'webm';
}

// ---------- navegador (WebCodecs vía mediabunny) ----------

const CODEC: Record<VideoFormat, VideoCodec> = {
  'mp4-h264': 'avc',
  'mp4-h265': 'hevc',
  'webm-vp9': 'vp9',
  'webm-av1': 'av1',
};

/** Formatos que este navegador puede codificar. */
export async function supportedWebFormats(): Promise<VideoFormat[]> {
  try {
    const ok = new Set(await getEncodableVideoCodecs());
    return (Object.keys(CODEC) as VideoFormat[]).filter((f) => ok.has(CODEC[f]));
  } catch {
    return [];
  }
}

export interface WebHandle {
  cancel?: () => Promise<void>;
}

/** Convierte en el navegador. Devuelve el archivo resultante en memoria. */
export async function convertVideoWeb(
  file: File,
  o: VideoOptions,
  onProgress: (ratio: number) => void,
  handle: WebHandle,
  watermark?: WatermarkOptions | null,
): Promise<ArrayBuffer> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const isMp4 = o.format.startsWith('mp4');
  const target = new BufferTarget();
  const output = new Output({ format: isMp4 ? new Mp4OutputFormat() : new WebMOutputFormat(), target });

  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('El archivo no contiene vídeo');
  const total = await input.computeDuration();
  const length = Math.max(0.1, (o.end > o.start ? Math.min(o.end, total) : total) - o.start);

  const audioBps = o.audio === 'keep' ? (o.audioKbps || 128) * 1000 : 0;
  const quality = { high: QUALITY_HIGH, balanced: QUALITY_MEDIUM, small: QUALITY_LOW }[o.quality];
  const bitrate = o.targetMB > 0 ? Math.max(80_000, Math.floor((o.targetMB * 8 * 1024 * 1024) / length - audioBps)) : undefined;

  const video: Record<string, unknown> = { codec: CODEC[o.format], ...(bitrate ? { bitrate } : { quality }) };
  if (o.maxHeight > 0 && track.displayHeight > o.maxHeight) {
    video.height = Math.max(2, Math.round(o.maxHeight / 2) * 2);
  }
  if (o.maxFps > 0) {
    const stats = await track.computePacketStats(120);
    if (!stats.averagePacketRate || stats.averagePacketRate > o.maxFps + 0.5) video.frameRate = o.maxFps;
  }


  if (hasWatermark(watermark)) {
    // Cada fotograma (ya redimensionado) se pinta en un lienzo con la marca de agua encima.
    const wm = await watermarkPainter(watermark);
    let canvas: OffscreenCanvas | null = null;
    video.process = (sample: VideoSample) => {
      const w = sample.displayWidth;
      const h = sample.displayHeight;
      if (!canvas || canvas.width !== w || canvas.height !== h) canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d')!;
      sample.draw(ctx, 0, 0, w, h);
      wm.paint(ctx, w, h);
      return canvas;
    };
  }

  const audio: Record<string, unknown> =
    o.audio === 'drop' ? { discard: true } : { codec: isMp4 ? 'aac' : 'opus', ...(o.audioKbps ? { bitrate: o.audioKbps * 1000 } : {}) };

  const conversion = await Conversion.init({
    input,
    output,
    video,
    audio,
    trim: o.start > 0 || o.end > 0 ? { start: o.start || undefined, end: o.end > o.start ? o.end : undefined } : undefined,
  });
  if (!conversion.isValid) {
    throw new Error('Este navegador no puede convertir ese archivo (códec no compatible). Prueba la app de escritorio.');
  }
  conversion.onProgress = (p) => onProgress(p);
  handle.cancel = () => conversion.cancel();
  await conversion.execute();
  if (!target.buffer) throw new Error('No se generó ningún resultado');
  return target.buffer;
}

// ---------- fotograma (navegador) ----------

export async function extractFrameWeb(
  file: File,
  time: number,
  format: FrameFormat,
  maxHeight: number,
  watermark?: WatermarkOptions | null,
): Promise<ArrayBuffer> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    video.src = url;
    await once(video, 'loadeddata', 'No se pudo leer el vídeo en este navegador');
    video.currentTime = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.05));
    await once(video, 'seeked', 'No se pudo buscar el fotograma');
    let w = video.videoWidth;
    let h = video.videoHeight;
    if (maxHeight > 0 && h > maxHeight) {
      w = Math.round((w * maxHeight) / h);
      h = maxHeight;
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx2d = canvas.getContext('2d')!;
    ctx2d.drawImage(video, 0, 0, w, h);
    if (hasWatermark(watermark)) {
      const wm = await watermarkPainter(watermark);
      wm.paint(ctx2d, w, h);
      wm.close();
    }
    const mime = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[format];
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, mime, 0.92));
    if (!blob) throw new Error('No se pudo generar la imagen');
    return await blob.arrayBuffer();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function once(el: HTMLVideoElement, event: string, errorMessage: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(errorMessage)), 15_000);
    el.addEventListener(
      event,
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    el.addEventListener(
      'error',
      () => {
        clearTimeout(timer);
        reject(new Error(errorMessage));
      },
      { once: true },
    );
  });
}

/** Duración (s) y medidas leyendo sólo los metadatos (0 si el navegador no puede). */
export function probeInfo(file: File): Promise<{ duration: number; width: number; height: number }> {
  if (file.name.toLowerCase().endsWith('.gif')) return probeGif(file);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    const done = (ok: boolean) => {
      const duration = ok && Number.isFinite(v.duration) ? v.duration : 0;
      const info = { duration, width: ok ? v.videoWidth : 0, height: ok ? v.videoHeight : 0 };
      URL.revokeObjectURL(url);
      resolve(info);
    };
    v.preload = 'metadata';
    v.onloadedmetadata = () => done(true);
    v.onerror = () => done(false);
    v.src = url;
  });
}

// ---------- GIF (navegador) ----------

const MAX_GIF_FRAMES = 1500;

/** GIF animado en el navegador: fotogramas con mediabunny + codificador GIF en JS (256 colores por fotograma). */
export async function convertGifWeb(
  file: File,
  o: VideoOptions,
  onProgress: (ratio: number) => void,
  handle: WebHandle,
  watermark?: WatermarkOptions | null,
): Promise<ArrayBuffer> {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('El archivo no contiene vídeo');
    const total = await input.computeDuration();
    const start = Math.min(o.start, Math.max(0, total - 0.1));
    const end = o.end > start ? Math.min(o.end, total) : total;
    const fps = Math.max(1, Math.min(30, o.animFps || 12));
    const count = Math.max(1, Math.floor((end - start) * fps));
    if (count > MAX_GIF_FRAMES) throw new Error(`El GIF tendría ${count} fotogramas (máximo ${MAX_GIF_FRAMES}). Recorta el fragmento o baja los FPS.`);

    const width = Math.max(16, Math.min(o.animWidth || 480, track.displayWidth));
    const sink = new CanvasSink(track, { width: Math.round(width) });
    const timestamps = Array.from({ length: count }, (_, i) => start + i / fps);

    const wm = hasWatermark(watermark) ? await watermarkPainter(watermark) : null;

    let cancelled = false;
    handle.cancel = async () => {
      cancelled = true;
    };
    const gif = GIFEncoder();
    const delay = Math.round(100 / fps) * 10; // el formato GIF cuenta en centésimas
    let done = 0;
    for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
      if (cancelled) throw new Error('Cancelado');
      if (wrapped) {
        const canvas = wrapped.canvas as HTMLCanvasElement | OffscreenCanvas;
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        const w = canvas.width;
        const h = canvas.height;
        wm?.paint(ctx, w, h);
        const rgba = ctx.getImageData(0, 0, w, h).data;
        const palette = quantize(rgba, 256);
        gif.writeFrame(applyPalette(rgba, palette), w, h, { palette, delay });
      }
      done++;
      onProgress(done / count);
      if (done % 4 === 0) await new Promise((r) => setTimeout(r)); // deja respirar a la interfaz
    }
    gif.finish();
    const bytes = gif.bytes();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  } finally {
    input.dispose();
  }
}

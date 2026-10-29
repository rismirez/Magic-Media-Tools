import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, QUALITY_LOW, QUALITY_MEDIUM, WebMOutputFormat } from 'mediabunny';
import type { FrameFormat, VideoOptions, WebHandle } from './video';
import type { WatermarkOptions } from './types';
import { decodeWatermarkImage, drawSprite, hasWatermark, makeSprite } from './watermark';

/** GIF como entrada de la pestaña de vídeo en el navegador: mediabunny no lee GIF, así que se decodifica con ImageDecoder. */

export const isGifName = (name: string) => name.toLowerCase().endsWith('.gif');

const MAX_GIF_FRAMES = 1500;
const MAX_BYTES = 900 * 1024 * 1024;

interface GifFrame {
  bmp: ImageBitmap;
  /** Inicio y duración en segundos. */
  start: number;
  dur: number;
}

interface DecodedGif {
  frames: GifFrame[];
  total: number;
  width: number;
  height: number;
  close(): void;
}

function decoderCtor(): typeof ImageDecoder {
  if (typeof ImageDecoder === 'undefined') throw new Error('Este navegador no puede leer GIF animados. Prueba con Chrome/Edge o la app de escritorio.');
  return ImageDecoder;
}

/** Duración total del GIF en segundos (0 si no se puede leer). */
export async function probeGifDuration(file: File): Promise<number> {
  try {
    const decoder = new (decoderCtor())({ data: await file.arrayBuffer(), type: 'image/gif' });
    await decoder.tracks.ready;
    const n = decoder.tracks.selectedTrack?.frameCount ?? 0;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      total += (image.duration ?? 0) / 1e6;
      image.close();
    }
    decoder.close();
    return total;
  } catch {
    return 0;
  }
}

/** Decodifica todos los fotogramas, ya reducidos a `maxWidth` (sin ampliar) para limitar la memoria. */
async function decodeGif(file: File, maxWidth: number, maxHeight: number): Promise<DecodedGif> {
  const decoder = new (decoderCtor())({ data: await file.arrayBuffer(), type: 'image/gif' });
  await decoder.tracks.ready;
  const n = decoder.tracks.selectedTrack?.frameCount ?? 0;
  if (!n) throw new Error('El GIF no contiene fotogramas');
  if (n > MAX_GIF_FRAMES) throw new Error(`El GIF tiene ${n} fotogramas (máximo ${MAX_GIF_FRAMES} en el navegador). Usa la app de escritorio.`);
  const frames: GifFrame[] = [];
  let t = 0;
  let width = 0;
  let height = 0;
  try {
    for (let i = 0; i < n; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      if (!width) {
        const nw = image.displayWidth;
        const nh = image.displayHeight;
        const k = Math.min(1, maxWidth > 0 ? maxWidth / nw : 1, maxHeight > 0 ? maxHeight / nh : 1);
        width = Math.max(2, Math.round((nw * k) / 2) * 2);
        height = Math.max(2, Math.round((nh * k) / 2) * 2);
        if (width * height * 4 * n > MAX_BYTES) throw new Error('El GIF es demasiado grande para el navegador. Reduce el ancho o usa la app de escritorio.');
      }
      const dur = Math.max(0.02, (image.duration ?? 100_000) / 1e6);
      const bmp = await createImageBitmap(image, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
      image.close();
      frames.push({ bmp, start: t, dur });
      t += dur;
    }
  } catch (err) {
    frames.forEach((f) => f.bmp.close());
    throw err;
  } finally {
    decoder.close();
  }
  return { frames, total: t, width, height, close: () => frames.forEach((f) => f.bmp.close()) };
}

/** Codificador GIF incremental (256 colores por fotograma). */
export async function makeGifWriter(fps: number) {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const gif = GIFEncoder();
  const delay = Math.round(100 / fps) * 10; // el formato GIF cuenta en centésimas
  return {
    add(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, w: number, h: number) {
      const rgba = ctx.getImageData(0, 0, w, h).data;
      const palette = quantize(rgba, 256);
      gif.writeFrame(applyPalette(rgba, palette), w, h, { palette, delay });
    },
    finish(): ArrayBuffer {
      gif.finish();
      const bytes = gif.bytes();
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    },
  };
}

const tick = () => new Promise((r) => setTimeout(r));

/** Convierte un GIF (entrada) a GIF, MP4/WebM o un fotograma, con recorte, tamaño y marca de agua. */
export async function convertFromGifWeb(
  file: File,
  o: VideoOptions,
  onProgress: (ratio: number) => void,
  handle: WebHandle,
  watermark?: WatermarkOptions | null,
): Promise<ArrayBuffer> {
  const maxWidth = o.kind === 'gif' ? o.animWidth || 480 : 0;
  const maxHeight = o.kind === 'gif' ? 0 : o.maxHeight;
  const gif = await decodeGif(file, maxWidth, maxHeight);
  try {
    const { width: w, height: h } = gif;
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d', { willReadFrequently: o.kind === 'gif' })!;

    let sprite: ReturnType<typeof makeSprite> = null;
    if (hasWatermark(watermark)) {
      const bitmap = await decodeWatermarkImage(watermark);
      sprite = makeSprite(watermark, bitmap);
      bitmap?.close();
    }
    const paint = (f: GifFrame) => {
      ctx.fillStyle = '#fff'; // GIF sin color de fondo: se rellena para vídeo/JPEG y no deja ruido en el GIF
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(f.bmp, 0, 0, w, h);
      if (sprite && watermark) drawSprite(ctx, sprite, w, h, watermark.position, (w * watermark.imgPct) / 100);
    };

    const start = Math.min(o.start, Math.max(0, gif.total - 0.05));
    const end = o.end > start ? Math.min(o.end, gif.total) : gif.total;
    const at = (t: number) => gif.frames.find((f) => t < f.start + f.dur) ?? gif.frames[gif.frames.length - 1];
    let cancelled = false;
    handle.cancel = async () => {
      cancelled = true;
    };

    if (o.kind === 'frame') {
      paint(at(Math.min(Math.max(start, o.frameTime), gif.total - 0.001)));
      const mime: Record<FrameFormat, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
      const blob = await canvas.convertToBlob({ type: mime[o.frameFormat], quality: 0.92 });
      onProgress(1);
      return await blob.arrayBuffer();
    }

    if (o.kind === 'gif') {
      const fps = Math.max(1, Math.min(30, o.animFps || 12));
      const count = Math.max(1, Math.floor((end - start) * fps));
      const writer = await makeGifWriter(fps);
      for (let i = 0; i < count; i++) {
        if (cancelled) throw new Error('Cancelado');
        paint(at(start + i / fps));
        writer.add(ctx, w, h);
        onProgress((i + 1) / count);
        if (i % 4 === 3) await tick();
      }
      return writer.finish();
    }

    // MP4 / WebM: cada fotograma conserva su propio tiempo (los GIF suelen tener tiempos variables).
    const isMp4 = o.format.startsWith('mp4');
    const target = new BufferTarget();
    const output = new Output({ format: isMp4 ? new Mp4OutputFormat() : new WebMOutputFormat(), target });
    const codec = { 'mp4-h264': 'avc', 'mp4-h265': 'hevc', 'webm-vp9': 'vp9', 'webm-av1': 'av1' }[o.format] as 'avc' | 'hevc' | 'vp9' | 'av1';
    const quality = { high: QUALITY_HIGH, balanced: QUALITY_MEDIUM, small: QUALITY_LOW }[o.quality];
    const length = Math.max(0.1, end - start);
    const bitrate = o.targetMB > 0 ? Math.max(80_000, Math.floor((o.targetMB * 8 * 1024 * 1024) / length)) : quality;
    const source = new CanvasSource(canvas, { codec, bitrate });
    output.addVideoTrack(source);
    await output.start();
    const frames = gif.frames.filter((f) => f.start + f.dur > start && f.start < end);
    let done = 0;
    for (const f of frames) {
      if (cancelled) {
        await output.cancel();
        throw new Error('Cancelado');
      }
      paint(f);
      const from = Math.max(f.start, start);
      await source.add(from - start, Math.min(f.start + f.dur, end) - from);
      onProgress(++done / frames.length);
    }
    await output.finalize();
    if (!target.buffer) throw new Error('No se generó ningún resultado');
    return target.buffer;
  } finally {
    gif.close();
  }
}

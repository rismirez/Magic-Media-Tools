import type { ResizeOptions } from './geometry';

export type OutputFormat = 'webp' | 'avif' | 'jpeg' | 'png';
export type PresetId = 'keep' | 'lossless' | 'balanced' | 'smallest';

export interface WatermarkOptions {
  kind: 'text' | 'image';
  text: string;
  /** Posición 3×3 como índice 0-8 (fila * 3 + columna). */
  position: number;
  /** 0-100 */
  opacity: number;
  /** Imagen: ancho como % del ancho de la imagen. En vídeo se usa para texto e imagen. */
  imgPct: number;
  /** Texto: tamaño como % del lado menor de la imagen. */
  sizePct: number;
  /** Imagen de la marca de agua (sólo en memoria: no se guarda en los ajustes). */
  image?: { buffer: ArrayBuffer; mime: string } | null;
}

export interface ConvertOptions {
  format: OutputFormat;
  preset: PresetId;
  resize: ResizeOptions;
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  /** Peso máximo en KB (0 = desactivado). Sólo formatos con pérdida. */
  targetKB: number;
  /** Anchos para generar varias versiones (srcset). Vacío = una sola salida. */
  sizes: number[];
  watermark: WatermarkOptions | null;
}

export interface WorkerRequest {
  id: number;
  buffer: ArrayBuffer;
  mime: string;
  name: string;
  options: ConvertOptions;
}

export interface Output {
  buffer: ArrayBuffer;
  width: number;
  height: number;
  /** Si se pidió un peso objetivo y ni con la calidad mínima se alcanzó. */
  targetMissed: boolean;
}

export type WorkerResponse =
  | { id: number; ok: true; outputs: Output[]; hasAlpha: boolean }
  | { id: number; ok: false; error: string };

export const EXTENSIONS: Record<OutputFormat, string> = {
  webp: 'webp',
  avif: 'avif',
  jpeg: 'jpg',
  png: 'png',
};

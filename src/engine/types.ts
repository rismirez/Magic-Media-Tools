export type OutputFormat = 'webp' | 'avif' | 'jpeg' | 'png';
export type PresetId = 'keep' | 'lossless' | 'balanced' | 'smallest';

export interface ConvertOptions {
  format: OutputFormat;
  preset: PresetId;
  /** 0 = sin límite. La imagen se ajusta al recuadro sin deformarse ni ampliarse. */
  maxWidth: number;
  maxHeight: number;
}

export interface WorkerRequest {
  id: number;
  buffer: ArrayBuffer;
  mime: string;
  name: string;
  options: ConvertOptions;
}

export type WorkerResponse =
  | { id: number; ok: true; buffer: ArrayBuffer; width: number; height: number; hasAlpha: boolean }
  | { id: number; ok: false; error: string };

export const EXTENSIONS: Record<OutputFormat, string> = {
  webp: 'webp',
  avif: 'avif',
  jpeg: 'jpg',
  png: 'png',
};

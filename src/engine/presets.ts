import type { OutputFormat, PresetId } from './types';

export interface CodecParams {
  lossless: boolean;
  /** 0-100 */
  quality: number;
  /** Nivel oxipng (0-6), sólo PNG. */
  pngLevel: number;
}

const QUALITY: Record<Exclude<PresetId, 'lossless'>, Record<Exclude<OutputFormat, 'png'>, number>> = {
  keep: { webp: 95, avif: 90, jpeg: 95 },
  balanced: { webp: 78, avif: 55, jpeg: 78 },
  smallest: { webp: 45, avif: 30, jpeg: 50 },
};

const PNG_LEVEL: Record<PresetId, number> = { keep: 2, lossless: 4, balanced: 4, smallest: 6 };

/**
 * Traduce un perfil de calidad a parámetros concretos de cada códec.
 * PNG es siempre sin pérdida (sólo varía el esfuerzo de oxipng).
 * JPEG no tiene modo lossless real: "lossless" usa calidad 100.
 */
export function codecParams(format: OutputFormat, preset: PresetId): CodecParams {
  const pngLevel = PNG_LEVEL[preset];
  if (format === 'png') return { lossless: true, quality: 100, pngLevel };
  if (preset === 'lossless') {
    return { lossless: format !== 'jpeg', quality: 100, pngLevel };
  }
  return { lossless: false, quality: QUALITY[preset][format], pngLevel };
}

export const PRESET_ORDER: PresetId[] = ['keep', 'lossless', 'balanced', 'smallest'];

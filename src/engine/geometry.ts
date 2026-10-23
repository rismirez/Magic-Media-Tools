export type FitMode = 'none' | 'inside' | 'cover' | 'contain';
/** Posición en una cuadrícula 3×3: 0 = inicio, 1 = centro, 2 = final. */
export type Anchor = 0 | 1 | 2;

export interface ResizeOptions {
  mode: FitMode;
  /** none: ignorado · inside: máximo (0 = sin límite) · cover/contain: tamaño exacto de salida. */
  width: number;
  height: number;
  anchorX: Anchor;
  anchorY: Anchor;
  /** Relleno de las bandas en «contain». "transparent" o #rrggbb. */
  background: string;
}

export interface ResizePlan {
  outW: number;
  outH: number;
  /** Región de origen que se conserva. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Dónde y a qué tamaño se dibuja esa región dentro del lienzo de salida. */
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}

export const defaultResize: ResizeOptions = {
  mode: 'none',
  width: 0,
  height: 0,
  anchorX: 1,
  anchorY: 1,
  background: 'transparent',
};

/** Compartido entre el worker (que recorta de verdad) y la UI (que lo dibuja en la vista previa). */
export function planResize(srcW: number, srcH: number, o: ResizeOptions): ResizePlan {
  const whole = { sx: 0, sy: 0, sw: srcW, sh: srcH };
  const none: ResizePlan = { ...whole, outW: srcW, outH: srcH, dx: 0, dy: 0, dw: srcW, dh: srcH };

  let mode = o.mode;
  // Cover/contain necesitan caja completa; con una sola medida se comportan como «inside».
  if ((mode === 'cover' || mode === 'contain') && !(o.width > 0 && o.height > 0)) mode = 'inside';

  if (mode === 'none') return none;

  if (mode === 'inside') {
    const rw = o.width > 0 ? o.width / srcW : Infinity;
    const rh = o.height > 0 ? o.height / srcH : Infinity;
    const r = Math.min(rw, rh, 1); // nunca se amplía
    if (r >= 1) return none;
    const w = Math.max(1, Math.round(srcW * r));
    const h = Math.max(1, Math.round(srcH * r));
    return { ...whole, outW: w, outH: h, dx: 0, dy: 0, dw: w, dh: h };
  }

  const tw = Math.round(o.width);
  const th = Math.round(o.height);
  const fx = o.anchorX / 2;
  const fy = o.anchorY / 2;

  if (mode === 'cover') {
    const s = Math.max(tw / srcW, th / srcH);
    const cw = Math.min(srcW, Math.max(1, Math.round(tw / s)));
    const ch = Math.min(srcH, Math.max(1, Math.round(th / s)));
    return {
      outW: tw,
      outH: th,
      sx: Math.round((srcW - cw) * fx),
      sy: Math.round((srcH - ch) * fy),
      sw: cw,
      sh: ch,
      dx: 0,
      dy: 0,
      dw: tw,
      dh: th,
    };
  }

  // contain: cabe entero dentro de la caja, sin ampliar, con bandas alrededor.
  const s = Math.min(tw / srcW, th / srcH, 1);
  const dw = Math.max(1, Math.round(srcW * s));
  const dh = Math.max(1, Math.round(srcH * s));
  return {
    ...whole,
    outW: tw,
    outH: th,
    dx: Math.round((tw - dw) * fx),
    dy: Math.round((th - dh) * fy),
    dw,
    dh,
  };
}

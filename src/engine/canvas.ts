/** Aplica rotación (múltiplos de 90°) y volteos. Compartido por el worker y la vista previa. */
export function orient(src: OffscreenCanvas, rotate: number, flipH: boolean, flipV: boolean): OffscreenCanvas {
  if (!rotate && !flipH && !flipV) return src;
  const swap = rotate === 90 || rotate === 270;
  const out = new OffscreenCanvas(swap ? src.height : src.width, swap ? src.width : src.height);
  const ctx = out.getContext('2d')!;
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((rotate * Math.PI) / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

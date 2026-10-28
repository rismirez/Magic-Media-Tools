import { orient } from '../engine/canvas';
import { planResize, type ResizeOptions } from '../engine/geometry';

export interface PreviewInput {
  /** Imagen de muestra (primera de la cola). null = rectángulo de ejemplo 3:2. */
  image: ImageBitmap | null;
  rotate: number;
  flipH: boolean;
  flipV: boolean;
  resize: ResizeOptions;
}

const W = 320;
const H = 200;

function css(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

/** Dibuja de forma simbólica qué se conserva al recortar/encajar. */
export function drawCropPreview(canvas: HTMLCanvasElement, input: PreviewInput): { outW: number; outH: number } {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  // Imagen orientada (o ejemplo).
  let src: OffscreenCanvas;
  if (input.image) {
    src = new OffscreenCanvas(input.image.width, input.image.height);
    src.getContext('2d')!.drawImage(input.image, 0, 0);
  } else {
    src = new OffscreenCanvas(1200, 800);
    const c = src.getContext('2d')!;
    const g = c.createLinearGradient(0, 0, 1200, 800);
    g.addColorStop(0, '#60a5fa');
    g.addColorStop(1, '#f472b6');
    c.fillStyle = g;
    c.fillRect(0, 0, 1200, 800);
    c.fillStyle = 'rgba(255,255,255,.85)';
    c.beginPath();
    c.arc(300, 260, 90, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(0, 800);
    c.lineTo(420, 380);
    c.lineTo(700, 640);
    c.lineTo(900, 460);
    c.lineTo(1200, 800);
    c.fill();
  }
  const oriented = orient(src, input.rotate, input.flipH, input.flipV);
  const plan = planResize(oriented.width, oriented.height, input.resize);

  const pad = 6;
  const mode = input.resize.mode;
  const accent = css('--accent');
  const r = input.resize;
  const boxed = (r.width > 0 && r.height > 0) || r.ratio > 0;

  if (mode === 'contain' && boxed) {
    // Se dibuja la caja de salida con la imagen dentro.
    const k = Math.min((W - pad * 2) / plan.outW, (H - pad * 2) / plan.outH);
    const bw = plan.outW * k;
    const bh = plan.outH * k;
    const bx = (W - bw) / 2;
    const by = (H - bh) / 2;
    drawChecker(ctx, bx, by, bw, bh);
    if (input.resize.background !== 'transparent') {
      ctx.fillStyle = input.resize.background;
      ctx.fillRect(bx, by, bw, bh);
    }
    ctx.drawImage(oriented, bx + plan.dx * k, by + plan.dy * k, plan.dw * k, plan.dh * k);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    return { outW: plan.outW, outH: plan.outH };
  }

  // none / inside / cover: se muestra la imagen entera y, en cover, la zona conservada.
  const k = Math.min((W - pad * 2) / oriented.width, (H - pad * 2) / oriented.height);
  const iw = oriented.width * k;
  const ih = oriented.height * k;
  const ix = (W - iw) / 2;
  const iy = (H - ih) / 2;
  ctx.drawImage(oriented, ix, iy, iw, ih);

  if (mode === 'cover' && boxed) {
    const rx = ix + plan.sx * k;
    const ry = iy + plan.sy * k;
    const rw = plan.sw * k;
    const rh = plan.sh * k;
    // Oscurece lo que se descarta.
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillRect(ix, iy, iw, ry - iy);
    ctx.fillRect(ix, ry + rh, iw, iy + ih - (ry + rh));
    ctx.fillRect(ix, ry, rx - ix, rh);
    ctx.fillRect(rx + rw, ry, ix + iw - (rx + rw), rh);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);
  }
  return { outW: plan.outW, outH: plan.outH };
}

function drawChecker(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const s = 8;
  for (let j = 0; j * s < h; j++) {
    for (let i = 0; i * s < w; i++) {
      ctx.fillStyle = (i + j) % 2 ? '#c8c8c8' : '#e8e8e8';
      ctx.fillRect(x + i * s, y + j * s, s, s);
    }
  }
  ctx.restore();
}

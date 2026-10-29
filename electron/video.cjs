const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

/** ffmpeg viene incluido en la app; empaquetado vive fuera del asar (asarUnpack). */
function ffmpegPath() {
  return require('@ffmpeg-installer/ffmpeg').path.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

const num = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const pick = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

/** El renderer sólo manda opciones estructuradas; los argumentos de ffmpeg se construyen aquí. */
function sanitize(o = {}) {
  return {
    kind: pick(o.kind, ['video', 'gif', 'webp', 'frame'], 'video'),
    format: pick(o.format, ['mp4-h264', 'mp4-h265', 'webm-vp9', 'webm-av1'], 'mp4-h264'),
    quality: pick(o.quality, ['high', 'balanced', 'small'], 'balanced'),
    targetMB: num(o.targetMB, 0, 100000, 0),
    maxHeight: Math.floor(num(o.maxHeight, 0, 8640, 0)),
    maxFps: num(o.maxFps, 0, 240, 0),
    audio: pick(o.audio, ['keep', 'drop'], 'keep'),
    audioKbps: Math.floor(num(o.audioKbps, 0, 512, 0)),
    start: num(o.start, 0, 1e7, 0),
    end: num(o.end, 0, 1e7, 0),
    animWidth: Math.floor(num(o.animWidth, 16, 4096, 480)),
    animFps: num(o.animFps, 1, 60, 12),
    frameTime: num(o.frameTime, 0, 1e7, 0),
  };
}

function probe(file) {
  return new Promise((resolve) => {
    const p = spawn(ffmpegPath(), ['-hide_banner', '-nostdin', '-i', file], { windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.on('error', () => resolve({ duration: 0, fps: 0, width: 0, height: 0 }));
    p.on('close', () => {
      const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
      const f = /(\d+(?:\.\d+)?)\s*fps/.exec(err);
      const s = /Video:.*?[ ,](\d{2,5})x(\d{2,5})/.exec(err);
      resolve({
        duration: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : 0,
        fps: f ? Number(f[1]) : 0,
        width: s ? Number(s[1]) : 0,
        height: s ? Number(s[2]) : 0,
      });
    });
  });
}

const CRF = {
  'mp4-h264': { high: 20, balanced: 24, small: 29 },
  'mp4-h265': { high: 24, balanced: 28, small: 32 },
  'webm-vp9': { high: 28, balanced: 33, small: 39 },
  'webm-av1': { high: 28, balanced: 34, small: 40 },
};
const WEBP_Q = { high: 85, balanced: 70, small: 50 };

/** Superpone el PNG de marca de agua (con la opacidad ya aplicada) sobre el vídeo: tamaño = % del ancho, posición 3×3. */
function overlayGraph(pre, wm, post, outWidth) {
  const margin = 'W*0.03';
  const x = [margin, '(W-w)/2', `W-w-${margin}`][wm.position % 3];
  const y = [margin, '(H-h)/2', `H-h-${margin}`][Math.floor(wm.position / 3)];
  // El ancho en píxeles se calcula aquí (no con scale2ref, cuyas variables cambian entre versiones de ffmpeg).
  const wmWidth = Math.max(8, Math.round(((outWidth || 1280) * wm.widthPct) / 100));
  const parts = [
    `[0:v]${pre || 'null'}[base]`,
    `[1:v]scale=${wmWidth}:-1[wm]`,
    `[base][wm]overlay=x=${x}:y=${y}:format=auto[${post ? 'o' : 'v'}]`,
  ];
  if (post) parts.push(`[o]${post}[v]`);
  return parts.join(';');
}

/** Ancho (px) del vídeo de salida, para dimensionar la marca de agua. 0 si no se pudo averiguar. */
function outputWidth(o, info) {
  if (!info.width || !info.height) return 0;
  if (o.kind === 'gif' || o.kind === 'webp') return Math.min(o.animWidth, info.width);
  const h = o.maxHeight > 0 ? Math.min(o.maxHeight, info.height) : info.height;
  return Math.round((info.width * h) / info.height);
}

function buildArgs(o, info, input, output, wm) {
  const args = ['-hide_banner', '-nostdin', '-y'];
  if (o.kind === 'frame') {
    args.push('-ss', String(o.frameTime), '-i', input);
    if (wm) args.push('-i', wm.file);
    const scale = o.maxHeight > 0 ? `scale=-2:'min(ih,${o.maxHeight})'` : '';
    if (wm) args.push('-filter_complex', overlayGraph(scale, wm, '', outputWidth(o, info)), '-map', '[v]');
    else if (scale) args.push('-vf', scale);
    args.push('-frames:v', '1');
    const ext = path.extname(output).toLowerCase();
    if (ext === '.jpg') args.push('-q:v', '2');
    else if (ext === '.webp') args.push('-q:v', '90');
    args.push(output);
    return { args, length: 0 };
  }
  if (o.start > 0) args.push('-ss', String(o.start));
  args.push('-i', input);
  if (wm) args.push('-i', wm.file);
  /** Con marca de agua los filtros pasan a un grafo complejo; sin ella se usa -vf como siempre. */
  const applyFilters = (pre, post = '') => {
    if (wm) {
      args.push('-filter_complex', overlayGraph(pre, wm, post, outputWidth(o, info)), '-map', '[v]');
      if (o.kind === 'video' && o.audio === 'keep') args.push('-map', '0:a:0?');
    } else {
      const all = [pre, post].filter(Boolean).join(post && pre ? ',' : '');
      if (all) args.push('-vf', all);
    }
  };
  const available = Math.max(0, (info.duration || 0) - o.start);
  const length = o.end > o.start ? Math.min(o.end - o.start, available || Infinity) : available;
  if (o.end > o.start) args.push('-t', String(o.end - o.start));

  const filters = [];
  const fpsCap = o.maxFps > 0 && (!info.fps || info.fps > o.maxFps) ? o.maxFps : 0;

  if (o.kind === 'video') {
    if (o.maxHeight > 0 && (!info.height || info.height > o.maxHeight)) filters.push(`scale=-2:${o.maxHeight}`);
    if (fpsCap) filters.push(`fps=${fpsCap}`);
    // yuv420p (H.264/H.265) exige ancho y alto pares: GIF y vídeos con medidas impares fallarían.
    if (o.format.startsWith('mp4')) filters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
    applyFilters(filters.join(','));

    const fmt = o.format;
    const crf = CRF[fmt][o.quality];
    const audioKbps = o.audio === 'keep' ? o.audioKbps || 128 : 0;
    const videoKbps =
      o.targetMB > 0 && length > 0 ? Math.max(80, Math.floor((o.targetMB * 8192) / length - audioKbps)) : 0;

    if (fmt === 'mp4-h264') {
      args.push('-c:v', 'libx264', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart');
      args.push(...(videoKbps ? ['-b:v', `${videoKbps}k`, '-maxrate', `${Math.round(videoKbps * 1.5)}k`, '-bufsize', `${videoKbps * 2}k`] : ['-crf', String(crf)]));
    } else if (fmt === 'mp4-h265') {
      args.push('-c:v', 'libx265', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1', '-x265-params', 'log-level=error', '-movflags', '+faststart');
      args.push(...(videoKbps ? ['-b:v', `${videoKbps}k`] : ['-crf', String(crf)]));
    } else if (fmt === 'webm-vp9') {
      args.push('-c:v', 'libvpx-vp9', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p');
      args.push(...(videoKbps ? ['-b:v', `${videoKbps}k`] : ['-b:v', '0', '-crf', String(crf)]));
    } else {
      args.push('-c:v', 'libaom-av1', '-cpu-used', '6', '-row-mt', '1', '-pix_fmt', 'yuv420p');
      args.push(...(videoKbps ? ['-b:v', `${videoKbps}k`] : ['-b:v', '0', '-crf', String(crf)]));
    }

    if (o.audio === 'drop') args.push('-an');
    else args.push('-c:a', fmt.startsWith('mp4') ? 'aac' : 'libopus', '-b:a', `${audioKbps}k`);
  } else if (o.kind === 'gif') {
    const f = Math.min(o.animFps, 30);
    const pre = `fps=${f},scale='min(${o.animWidth},iw)':-2:flags=lanczos`;
    const palette = 'split[s0][s1];[s0]palettegen=max_colors=256[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4';
    if (wm) applyFilters(pre, palette);
    else args.push('-vf', `${pre},${palette}`);
    args.push('-an', '-loop', '0');
  } else {
    applyFilters(`fps=${o.animFps},scale='min(${o.animWidth},iw)':-2:flags=lanczos`);
    args.push('-c:v', 'libwebp', '-q:v', String(WEBP_Q[o.quality]), '-compression_level', '4', '-loop', '0', '-an');
  }

  args.push('-progress', 'pipe:1', '-nostats', output);
  return { args, length };
}

const running = new Map();

/** Ejecuta ffmpeg. onProgress recibe 0..1. Devuelve el tamaño del archivo resultante. */
async function run({ id, inputPath, outputPath, options, watermark, onProgress }) {
  const o = sanitize(options);
  const info = await probe(inputPath);
  const { args, length } = buildArgs(o, info, inputPath, outputPath, watermark);

  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath(), args, { windowsHide: true });
    running.set(id, { p, outputPath });
    let tail = '';
    let buf = '';
    p.stdout.on('data', (d) => {
      buf += d;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      for (const line of lines) {
        const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);
        if (m && length > 0) onProgress?.(Math.min(1, Number(m[1]) / 1e6 / length));
      }
    });
    p.stderr.on('data', (d) => (tail = (tail + d).slice(-1500)));
    p.on('error', (e) => {
      running.delete(id);
      reject(e);
    });
    p.on('close', (code) => {
      const entry = running.get(id);
      running.delete(id);
      if (entry?.cancelled) {
        fs.rm(outputPath, { force: true }, () => reject(new Error('cancelled')));
      } else if (code === 0) {
        onProgress?.(1);
        resolve(fs.statSync(outputPath).size);
      } else {
        fs.rm(outputPath, { force: true }, () => reject(new Error(tail.trim().split(/\r?\n/).slice(-3).join(' ') || `ffmpeg salió con código ${code}`)));
      }
    });
  });
}

function cancel(id) {
  const entry = running.get(id);
  if (!entry) return;
  entry.cancelled = true;
  entry.p.kill();
}

const ALLOWED_EXT = new Set(['.mp4', '.webm', '.gif', '.webp', '.jpg', '.png']);
const isAllowedOutput = (file) => ALLOWED_EXT.has(path.extname(file).toLowerCase());

module.exports = { run, cancel, probe, isAllowedOutput };

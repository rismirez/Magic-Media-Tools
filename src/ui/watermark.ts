import { t } from '../i18n';
import type { WatermarkOptions } from '../engine/types';
import { anchorGrid } from './anchorGrid';
import { esc } from './format';
import { ico } from './icons';
import { drawSprite, placedSprite } from '../engine/watermark';

/** Ajustes guardables de la marca de agua (la imagen va aparte, sólo en memoria). */
export type WatermarkSettings = Omit<WatermarkOptions, 'image'> & { enabled: boolean };

export const defaultWatermark = (): WatermarkSettings => ({
  enabled: false,
  kind: 'text',
  text: '',
  color: '#ffffff',
  outline: false,
  outlineColor: '#000000',
  position: 8,
  opacity: 100,
  sizePct: 5,
  imgPct: 20,
});

/**
 * Bloque de marca de agua compartido por imagen y vídeo. Los campos usan `data-bind="watermark.*"`,
 * así que el enlazado genérico de cada pestaña los gestiona; aquí sólo van la imagen, la cuadrícula y la visibilidad.
 * `video` ya no cambia los campos: el texto tiene tamaño fijo (alto en % del lado menor) y la imagen va en % del ancho.
 */
export function watermarkHtml(prefix: string): string {
  const kinds = (['text', 'image'] as const)
    .map((k) => `<label><input type="radio" name="${prefix}-wm-kind" data-bind="watermark.kind" value="${k}" /><span>${ico(k === 'text' ? 'type' : 'image', 16)}${esc(t(k === 'text' ? 'wm.kindText' : 'wm.kindImage'))}</span></label>`)
    .join('');
  const sizeText = `<label class="field" data-wm-size="text">${esc(t('textSize'))}<input type="range" min="2" max="20" data-bind="watermark.sizePct" data-type="number" /></label>`;
  const sizeImage = `<label class="field" data-wm-size="image">${esc(t('wmImageSize'))}<input type="range" min="2" max="80" data-bind="watermark.imgPct" data-type="number" /></label>`;
  return `
    <fieldset class="wm-fieldset">
      <legend>${ico('stamp')}${esc(t('watermark'))}</legend>
      <label class="chk"><input type="checkbox" data-bind="watermark.enabled" data-type="bool" />${esc(t('watermarkEnable'))}</label>
      <div class="wm-box">
        <div class="seg">${kinds}</div>
        <div class="wm-text">
          <div class="row nowrap">
            <input type="text" data-bind="watermark.text" data-type="text" maxlength="80" placeholder="${esc(t('watermarkText'))}" />
            <input type="color" class="wm-color" data-bind="watermark.color" data-type="text" title="${esc(t('wmColor'))}" aria-label="${esc(t('wmColor'))}" />
          </div>
          <div class="row nowrap wm-outline">
            <label class="chk grow"><input type="checkbox" data-bind="watermark.outline" data-type="bool" />${esc(t('wmOutline'))}</label>
            <input type="color" class="wm-outline-color" data-bind="watermark.outlineColor" data-type="text" title="${esc(t('wmOutlineColor'))}" aria-label="${esc(t('wmOutlineColor'))}" />
          </div>
          <span class="mini">${esc(t('previewTitle'))}</span>
          <canvas class="wm-preview" width="320" height="180" aria-hidden="true"></canvas>
        </div>
        <div class="wm-image">
          <div class="row nowrap">
            <button type="button" class="btn wm-pick">${ico('image-plus')}${esc(t('wmPickImage'))}</button>
            <button type="button" class="link wm-clear" hidden>${ico('x', 14)}${esc(t('wmRemoveImage'))}</button>
          </div>
          <div class="wm-file"><img class="wm-thumb" alt="" hidden /><small class="wm-name"></small></div>
          <input type="file" class="wm-input" accept="image/*" hidden />
        </div>
        <div class="crop-row">
          <div><span class="mini">${esc(t('position'))}</span><div class="wm-anchor"></div></div>
          <div class="grow">
            <label class="field"><span>${esc(t('opacity'))} · <b class="wm-op"></b></span><input type="range" min="5" max="100" data-bind="watermark.opacity" data-type="number" /></label>
            ${sizeText}${sizeImage}
          </div>
        </div>
      </div>
    </fieldset>`;
}

export interface WatermarkControl {
  /** Vuelve a pintar visibilidad, cuadrícula y valores según los ajustes. */
  refresh(): void;
  /** Opciones listas para convertir (o null si está desactivada o incompleta). */
  options(): Promise<WatermarkOptions | null>;
  hasImage(): boolean;
}

export function mountWatermark(
  root: HTMLElement,
  wm: WatermarkSettings,
  onChange: () => void,
  /** Medidas (px) del resultado para que la vista previa tenga su misma proporción; sin ellas, 16:9. */
  getSize?: () => { w: number; h: number } | null,
): WatermarkControl {
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  wm.color ||= '#ffffff'; // ajustes guardados antes de existir estos campos
  wm.outline ??= false;
  wm.outlineColor ||= '#000000';
  const input = $<HTMLInputElement>('.wm-input');
  const thumb = $<HTMLImageElement>('.wm-thumb');
  let file: File | null = null;
  let thumbUrl = '';

  const grid = anchorGrid((i) => {
    wm.position = i;
    onChange();
  });
  $('.wm-anchor').appendChild(grid.el);

  function showFile() {
    if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    thumbUrl = file ? URL.createObjectURL(file) : '';
    thumb.hidden = !file;
    thumb.src = thumbUrl;
    $('.wm-name').textContent = file ? file.name : t('wmNoImage');
    $('.wm-clear').hidden = !file;
  }

  $('.wm-pick').addEventListener('click', () => input.click());
  $('.wm-clear').addEventListener('click', () => {
    file = null;
    showFile();
    onChange();
  });
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    input.value = '';
    if (!f || !f.type.startsWith('image/')) return;
    file = f;
    showFile();
    onChange();
  });

  const previewCanvas = $<HTMLCanvasElement>('.wm-preview');
  /** Muestra el texto con su tamaño, color, borde, opacidad y posición sobre un fondo de ejemplo (proporción 16:9). */
  function drawPreview() {
    const size = getSize?.();
    const ratio = size && size.w > 0 && size.h > 0 ? size.w / size.h : 16 / 9;
    // Mismas proporciones que el resultado: el tamaño del texto y dónde se parte la línea dependen de ellas.
    previewCanvas.width = ratio >= 1 ? 320 : Math.max(60, Math.round(240 * ratio));
    previewCanvas.height = ratio >= 1 ? Math.max(60, Math.round(320 / ratio)) : 240;
    previewCanvas.style.aspectRatio = `${previewCanvas.width} / ${previewCanvas.height}`;
    const { width: cw, height: ch } = previewCanvas;
    const ctx = previewCanvas.getContext('2d')!;
    const bg = ctx.createLinearGradient(0, 0, cw, ch);
    bg.addColorStop(0, '#5f7fb8');
    bg.addColorStop(0.55, '#9b86d9');
    bg.addColorStop(1, '#e8a3c4');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cw, ch);
    if (wm.kind !== 'text' || !wm.text.trim()) {
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('watermarkText'), cw / 2, ch / 2 + 5);
      return;
    }
    const placed = placedSprite({ ...wm, image: null }, null, cw, ch);
    if (placed) drawSprite(ctx, placed.sprite, cw, ch, wm.position, placed.width);
  }

  const refresh = () => {
    $('.wm-box').hidden = !wm.enabled;
    $('.wm-text').hidden = wm.kind !== 'text';
    $<HTMLInputElement>('.wm-outline-color').disabled = !wm.outline;
    $('.wm-image').hidden = wm.kind !== 'image';
    root.querySelectorAll<HTMLElement>('[data-wm-size]').forEach((el) => {
      const only = el.dataset.wmSize;
      el.hidden = only === 'both' ? false : only !== wm.kind;
    });
    $('.wm-op').textContent = wm.opacity >= 100 ? t('wmOpacityFull') : `${wm.opacity} %`;
    grid.set(wm.position);
    if (wm.enabled && wm.kind === 'text') drawPreview();
  };
  showFile();

  return {
    refresh,
    hasImage: () => !!file,
    async options() {
      if (!wm.enabled) return null;
      const { enabled: _enabled, ...rest } = wm;
      if (wm.kind === 'image') {
        if (!file) return null;
        return { ...rest, image: { buffer: await file.arrayBuffer(), mime: file.type || 'image/png' } };
      }
      return wm.text.trim() ? { ...rest, image: null } : null;
    },
  };
}

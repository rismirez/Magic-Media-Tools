import { t } from '../i18n';
import type { WatermarkOptions } from '../engine/types';
import { anchorGrid } from './anchorGrid';
import { esc } from './format';

/** Ajustes guardables de la marca de agua (la imagen va aparte, sólo en memoria). */
export type WatermarkSettings = Omit<WatermarkOptions, 'image'> & { enabled: boolean };

export const defaultWatermark = (): WatermarkSettings => ({
  enabled: false,
  kind: 'text',
  text: '',
  position: 8,
  opacity: 100,
  sizePct: 5,
  imgPct: 20,
});

/**
 * Bloque de marca de agua compartido por imagen y vídeo. Los campos usan `data-bind="watermark.*"`,
 * así que el enlazado genérico de cada pestaña los gestiona; aquí sólo van la imagen, la cuadrícula y la visibilidad.
 * `video`: el tamaño es siempre «% del ancho» (el texto se convierte en una imagen que se superpone).
 */
export function watermarkHtml(prefix: string, video: boolean): string {
  const kinds = (['text', 'image'] as const)
    .map((k) => `<label><input type="radio" name="${prefix}-wm-kind" data-bind="watermark.kind" value="${k}" /><span>${esc(t(k === 'text' ? 'wm.kindText' : 'wm.kindImage'))}</span></label>`)
    .join('');
  const sizeText = video
    ? ''
    : `<label class="field" data-wm-size="text">${esc(t('textSize'))}<input type="range" min="2" max="20" data-bind="watermark.sizePct" data-type="number" /></label>`;
  const sizeImage = `<label class="field" data-wm-size="${video ? 'both' : 'image'}">${esc(t('wmImageSize'))}<input type="range" min="2" max="80" data-bind="watermark.imgPct" data-type="number" /></label>`;
  return `
    <fieldset class="wm-fieldset">
      <legend>${esc(t('watermark'))}</legend>
      <label class="chk"><input type="checkbox" data-bind="watermark.enabled" data-type="bool" />${esc(t('watermarkEnable'))}</label>
      <div class="wm-box">
        <div class="seg">${kinds}</div>
        <div class="wm-text">
          <input type="text" data-bind="watermark.text" data-type="text" maxlength="80" placeholder="${esc(t('watermarkText'))}" />
        </div>
        <div class="wm-image">
          <div class="row nowrap">
            <button type="button" class="btn wm-pick">${esc(t('wmPickImage'))}</button>
            <button type="button" class="link wm-clear" hidden>${esc(t('wmRemoveImage'))}</button>
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

export function mountWatermark(root: HTMLElement, wm: WatermarkSettings, onChange: () => void): WatermarkControl {
  const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
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

  const refresh = () => {
    $('.wm-box').hidden = !wm.enabled;
    $('.wm-text').hidden = wm.kind !== 'text';
    $('.wm-image').hidden = wm.kind !== 'image';
    root.querySelectorAll<HTMLElement>('[data-wm-size]').forEach((el) => {
      const only = el.dataset.wmSize;
      el.hidden = only === 'both' ? false : only !== wm.kind;
    });
    $('.wm-op').textContent = wm.opacity >= 100 ? t('wmOpacityFull') : `${wm.opacity} %`;
    grid.set(wm.position);
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

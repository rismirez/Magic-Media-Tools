import { t, type Key } from '../i18n';
import { WorkerPool } from '../engine/pool';
import { PRESET_ORDER } from '../engine/presets';
import { defaultResize, type FitMode, type ResizeOptions } from '../engine/geometry';
import { EXTENSIONS, type ConvertOptions, type OutputFormat, type PresetId, type WatermarkOptions } from '../engine/types';
import { ACCEPT, fromDrop, fromInput, isHeic, isSupported, mimeFor, readForConversion, type Source } from '../engine/input';
import { canPickFolder, createSink, isDesktop, type SinkKind } from '../platform/sinks';
import { anchorGrid } from '../ui/anchorGrid';
import { drawCropPreview } from '../ui/cropPreview';
import { openCompare } from '../ui/compare';
import { esc, fmtBytes, fmtDuration, getPath, pct, safeName, setPath, splitPath } from '../ui/format';
import { loadPresets, savePresets } from '../ui/savedPresets';

type Status = 'pending' | 'processing' | 'done' | 'error' | 'skipped';

interface Item {
  id: number;
  src: Source;
  status: Status;
  inSize: number;
  outSize?: number;
  outBlob?: Blob;
  outCount?: number;
  missedTarget?: boolean;
  error?: string;
}

interface Settings {
  format: OutputFormat;
  preset: PresetId;
  targetKB: number;
  resize: ResizeOptions;
  /** Anchos separados por coma/espacio. */
  sizes: string;
  rotate: 0 | 90 | 180 | 270;
  flipH: boolean;
  flipV: boolean;
  watermark: WatermarkOptions & { enabled: boolean };
  template: string;
  dest: SinkKind;
}

const FORMATS: Array<{ id: OutputFormat; label: string }> = [
  { id: 'webp', label: 'WebP' },
  { id: 'avif', label: 'AVIF' },
  { id: 'jpeg', label: 'JPEG' },
  { id: 'png', label: 'PNG' },
];

const MODES: FitMode[] = ['none', 'inside', 'cover', 'contain'];
const STORAGE_KEY = 'media-compressor:image';
const PRESETS_KEY = 'media-compressor:image-presets';

const defaults = (): Settings => ({
  format: 'webp',
  preset: 'balanced',
  targetKB: 0,
  resize: { ...defaultResize },
  sizes: '',
  rotate: 0,
  flipH: false,
  flipV: false,
  watermark: { enabled: false, text: '', position: 8, opacity: 70, sizePct: 5 },
  template: '{nombre}',
  dest: 'folder',
});

/** Mezcla ajustes guardados con los valores por defecto (por si faltan campos de versiones antiguas). */
function merge(base: Settings, saved: unknown): Settings {
  const s = (saved ?? {}) as Partial<Settings>;
  return {
    ...base,
    ...s,
    resize: { ...base.resize, ...(s.resize ?? {}) },
    watermark: { ...base.watermark, ...(s.watermark ?? {}) },
  };
}

function load(): Settings {
  try {
    return merge(defaults(), JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'));
  } catch {
    return defaults();
  }
}

export function mountImageTab(app: HTMLElement) {
  const settings = load();
  const saveSettings = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* almacenamiento no disponible: se ignora */
    }
  };

  let items: Item[] = [];
  let nextId = 1;
  let running = false;
  let cancelRequested = false;
  let lastMessage = '';
  let startedAt = 0;
  let pool: WorkerPool | null = null;
  let sample: { bitmap: ImageBitmap } | null = null;
  let sampleFor: File | null = null;

  app.innerHTML = `
    <div class="layout">
      <section class="panel">
        <div id="drop" class="drop" tabindex="0">
          <strong>${esc(t('dropTitle'))}</strong>
          <span>${esc(t('dropHint'))}</span>
          <div class="row">
            <button type="button" id="btn-files" class="btn">${esc(t('addFiles'))}</button>
            <button type="button" id="btn-folder" class="btn">${esc(t('addFolder'))}</button>
          </div>
          <small>${esc(t('pasteHint'))}</small>
        </div>
        <input id="in-files" type="file" multiple hidden accept="${ACCEPT}" />
        <input id="in-folder" type="file" multiple hidden webkitdirectory />

        <div class="queue-head">
          <h2>${esc(t('queue'))}</h2>
          <button type="button" id="btn-clear" class="link">${esc(t('clear'))}</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${esc(t('colName'))}</th>
                <th class="num">${esc(t('colSize'))}</th>
                <th class="num">${esc(t('colResult'))}</th>
                <th class="num">${esc(t('colSaved'))}</th>
                <th>${esc(t('colStatus'))}</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="rows"></tbody>
          </table>
          <p id="empty" class="empty">${esc(t('queueEmpty'))}</p>
        </div>
      </section>

      <aside class="panel settings">
        <h2>${esc(t('settings'))}</h2>

        <fieldset>
          <legend>${esc(t('saved'))}</legend>
          <div class="row nowrap">
            <select id="saved-sel" aria-label="${esc(t('saved'))}"></select>
            <button type="button" class="btn" id="saved-del" title="${esc(t('savedDelete'))}" aria-label="${esc(t('savedDelete'))}">🗑</button>
          </div>
          <div class="row nowrap saved-new">
            <input id="saved-name" type="text" maxlength="40" placeholder="${esc(t('savedNamePh'))}" />
            <button type="button" class="btn" id="saved-save">${esc(t('savedSave'))}</button>
          </div>
        </fieldset>

        <fieldset>
          <legend>${esc(t('format'))}</legend>
          <div class="seg">
            ${FORMATS.map((f) => `<label><input type="radio" name="format" data-bind="format" value="${f.id}" /><span>${f.label}</span></label>`).join('')}
          </div>
          <p id="format-note" class="note"></p>
        </fieldset>

        <fieldset>
          <legend>${esc(t('quality'))}</legend>
          <div class="presets">
            ${PRESET_ORDER.map(
              (p) => `
              <label class="preset">
                <input type="radio" name="preset" data-bind="preset" value="${p}" />
                <span><b>${esc(t(`preset.${p}.name` as Key))}</b><small>${esc(t(`preset.${p}.desc` as Key))}</small></span>
              </label>`,
            ).join('')}
          </div>
          <label class="field inline">${esc(t('targetKB'))}
            <input type="number" min="0" step="10" data-bind="targetKB" data-type="number" placeholder="${esc(t('off'))}" />
          </label>
          <p class="note">${esc(t('targetKBHint'))}</p>
        </fieldset>

        <fieldset>
          <legend>${esc(t('resize'))}</legend>
          <div class="seg seg-wrap">
            ${MODES.map((m) => `<label><input type="radio" name="mode" data-bind="resize.mode" value="${m}" /><span>${esc(t(`mode.${m}` as Key))}</span></label>`).join('')}
          </div>
          <p id="mode-note" class="note"></p>
          <div id="dims" class="row">
            <label class="field">${esc(t('width'))}<input type="number" min="0" step="1" data-bind="resize.width" data-type="number" placeholder="${esc(t('noLimit'))}" /></label>
            <label class="field">${esc(t('height'))}<input type="number" min="0" step="1" data-bind="resize.height" data-type="number" placeholder="${esc(t('noLimit'))}" /></label>
          </div>
          <div id="crop-box" class="crop-box">
            <div class="crop-row">
              <div>
                <span class="mini">${esc(t('position'))}</span>
                <div id="anchor-host"></div>
              </div>
              <div class="crop-prev">
                <canvas id="crop-canvas" width="320" height="200"></canvas>
                <small id="crop-caption"></small>
              </div>
            </div>
            <label id="bg-row" class="field inline">${esc(t('background'))}
              <span class="row nowrap">
                <label class="chk"><input type="checkbox" id="bg-transparent" />${esc(t('transparent'))}</label>
                <input type="color" id="bg-color" value="#ffffff" />
              </span>
            </label>
          </div>
          <label class="field inline">${esc(t('sizes'))}
            <input type="text" data-bind="sizes" data-type="text" placeholder="480, 768, 1080" />
          </label>
          <p class="note">${esc(t('sizesHint'))}</p>
        </fieldset>

        <fieldset>
          <legend>${esc(t('transform'))}</legend>
          <div class="row">
            <button type="button" class="btn" data-act="rot-l" title="${esc(t('rotateLeft'))}">↺</button>
            <button type="button" class="btn" data-act="rot-r" title="${esc(t('rotateRight'))}">↻</button>
            <button type="button" class="btn" data-act="flip-h" title="${esc(t('flipH'))}" aria-pressed="false">⇋</button>
            <button type="button" class="btn" data-act="flip-v" title="${esc(t('flipV'))}" aria-pressed="false">⇅</button>
          </div>
        </fieldset>

        <fieldset>
          <legend>${esc(t('watermark'))}</legend>
          <label class="chk"><input type="checkbox" data-bind="watermark.enabled" data-type="bool" />${esc(t('watermarkEnable'))}</label>
          <div id="wm-box">
            <input type="text" data-bind="watermark.text" data-type="text" maxlength="80" placeholder="${esc(t('watermarkText'))}" />
            <div class="crop-row">
              <div><span class="mini">${esc(t('position'))}</span><div id="wm-anchor"></div></div>
              <div class="grow">
                <label class="field">${esc(t('opacity'))}<input type="range" min="10" max="100" data-bind="watermark.opacity" data-type="number" /></label>
                <label class="field">${esc(t('textSize'))}<input type="range" min="2" max="20" data-bind="watermark.sizePct" data-type="number" /></label>
              </div>
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>${esc(t('naming'))}</legend>
          <input type="text" data-bind="template" data-type="text" maxlength="80" placeholder="{nombre}" />
          <p class="note">${esc(t('namingHint'))}</p>
        </fieldset>

        <fieldset id="dest-box">
          <legend>${esc(t('destination'))}</legend>
          <div class="seg">
            <label><input type="radio" name="dest" data-bind="dest" value="folder" /><span>${esc(t('destFolder'))}</span></label>
            <label><input type="radio" name="dest" data-bind="dest" value="zip" /><span>${esc(t('destZip'))}</span></label>
          </div>
          <p class="note">${esc(t('destHint'))}</p>
        </fieldset>

        <div class="actions">
          <button type="button" id="btn-convert" class="btn primary"></button>
          <button type="button" id="btn-cancel" class="btn" hidden>${esc(t('cancel'))}</button>
          <button type="button" id="btn-open" class="btn" hidden>${esc(t('openOutput'))}</button>
        </div>
        <progress id="progress" max="1" value="0" hidden></progress>
        <p id="summary" class="summary" role="status" aria-live="polite"></p>
      </aside>
    </div>
  `;

  const $ = <T extends HTMLElement>(sel: string) => app.querySelector<T>(sel)!;
  const drop = $('#drop');
  const rows = $('#rows');
  const emptyMsg = $('#empty');
  const btnConvert = $<HTMLButtonElement>('#btn-convert');
  const btnCancel = $<HTMLButtonElement>('#btn-cancel');
  const btnOpen = $<HTMLButtonElement>('#btn-open');
  const btnClear = $<HTMLButtonElement>('#btn-clear');
  const progress = $<HTMLProgressElement>('#progress');
  const summary = $('#summary');
  const cropCanvas = $<HTMLCanvasElement>('#crop-canvas');
  const bgTransparent = $<HTMLInputElement>('#bg-transparent');
  const bgColor = $<HTMLInputElement>('#bg-color');

  const cropAnchor = anchorGrid((i) => {
    settings.resize.anchorX = (i % 3) as 0 | 1 | 2;
    settings.resize.anchorY = Math.floor(i / 3) as 0 | 1 | 2;
    changed();
  });
  $('#anchor-host').appendChild(cropAnchor.el);
  const wmAnchor = anchorGrid((i) => {
    settings.watermark.position = i;
    changed();
  });
  $('#wm-anchor').appendChild(wmAnchor.el);

  // ---------- ajustes ----------

  function syncVisibility() {
    const mode = settings.resize.mode;
    const sizesActive = parseSizes().length > 0;
    $('#dims').hidden = mode === 'none';
    $('#crop-box').hidden = mode !== 'cover' && mode !== 'contain';
    $('#bg-row').hidden = mode !== 'contain';
    $('#wm-box').hidden = !settings.watermark.enabled;
    const modeNote = sizesActive ? 'modeNote.sizes' : (`modeNote.${mode}` as Key);
    $('#mode-note').textContent = t(modeNote);
    const noteKey = ({ png: 'note.png', jpeg: 'note.jpeg', avif: 'note.avif' } as Record<string, Key>)[settings.format];
    $('#format-note').textContent = noteKey ? t(noteKey) : '';
    app.querySelector('[data-act=flip-h]')!.setAttribute('aria-pressed', String(settings.flipH));
    app.querySelector('[data-act=flip-v]')!.setAttribute('aria-pressed', String(settings.flipV));
  }

  function syncToDom() {
    app.querySelectorAll<HTMLInputElement>('[data-bind]').forEach((el) => {
      const v = getPath(settings, el.dataset.bind!);
      if (el.type === 'radio') el.checked = String(v) === el.value;
      else if (el.type === 'checkbox') el.checked = Boolean(v);
      else el.value = el.dataset.type === 'number' && !v ? '' : String(v ?? '');
    });
    const dest = canPickFolder() ? settings.dest : 'zip';
    app.querySelector<HTMLInputElement>(`input[name=dest][value=${dest}]`)!.checked = true;
    cropAnchor.set(settings.resize.anchorY * 3 + settings.resize.anchorX);
    wmAnchor.set(settings.watermark.position);
    const transparent = settings.resize.background === 'transparent';
    bgTransparent.checked = transparent;
    bgColor.disabled = transparent;
    if (!transparent) bgColor.value = settings.resize.background;
    syncVisibility();
  }

  const parseSizes = () =>
    settings.sizes
      .split(/[\s,;]+/)
      .map((s) => Math.floor(Number(s)))
      .filter((n) => n > 0);

  function changed() {
    saveSettings();
    syncVisibility();
    schedulePreview();
  }

  if (isDesktop()) $('#dest-box').hidden = true;
  else if (!canPickFolder()) {
    app.querySelector<HTMLInputElement>('input[name=dest][value=folder]')!.disabled = true;
  }

  const onBind = (e: Event) => {
    const el = e.target as HTMLInputElement;
    const path = el.dataset?.bind;
    if (!path) return;
    if (el.type === 'radio' && !el.checked) return;
    let value: unknown;
    if (el.type === 'checkbox') value = el.checked;
    else if (el.dataset.type === 'number') value = Math.max(0, Math.floor(Number(el.value) || 0));
    else value = el.value;
    setPath(settings, path, value);
    changed();
  };
  // "input" para sliders y texto en vivo; "change" para radios y números al salir del campo.
  app.addEventListener('input', onBind);
  app.addEventListener('change', onBind);

  bgTransparent.addEventListener('change', () => {
    settings.resize.background = bgTransparent.checked ? 'transparent' : bgColor.value;
    bgColor.disabled = bgTransparent.checked;
    changed();
  });
  bgColor.addEventListener('input', () => {
    if (bgTransparent.checked) return;
    settings.resize.background = bgColor.value;
    changed();
  });

  app.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'rot-l') settings.rotate = ((settings.rotate + 270) % 360) as Settings['rotate'];
    else if (act === 'rot-r') settings.rotate = ((settings.rotate + 90) % 360) as Settings['rotate'];
    else if (act === 'flip-h') settings.flipH = !settings.flipH;
    else if (act === 'flip-v') settings.flipV = !settings.flipV;
    changed();
  });

  // ---------- ajustes guardados ----------

  const savedSel = $<HTMLSelectElement>('#saved-sel');
  const savedName = $<HTMLInputElement>('#saved-name');

  function renderSaved(selected = '') {
    const names = Object.keys(loadPresets(PRESETS_KEY));
    savedSel.innerHTML =
      `<option value="">${esc(t('savedNone'))}</option>` + names.map((n) => `<option value="${esc(n)}"${n === selected ? ' selected' : ''}>${esc(n)}</option>`).join('');
  }

  savedSel.addEventListener('change', () => {
    const preset = loadPresets(PRESETS_KEY)[savedSel.value] as Settings | undefined;
    if (!preset) return;
    const keepDest = settings.dest;
    Object.assign(settings, merge(defaults(), preset), { dest: keepDest });
    saveSettings();
    syncToDom();
    schedulePreview();
  });
  $('#saved-save').addEventListener('click', () => {
    const name = savedName.value.trim();
    if (!name) return;
    const all = loadPresets(PRESETS_KEY);
    all[name] = JSON.parse(JSON.stringify(settings));
    savePresets(PRESETS_KEY, all);
    savedName.value = '';
    renderSaved(name);
  });
  $('#saved-del').addEventListener('click', () => {
    const all = loadPresets(PRESETS_KEY);
    if (!(savedSel.value in all)) return;
    delete all[savedSel.value];
    savePresets(PRESETS_KEY, all);
    renderSaved();
  });

  // ---------- vista previa del recorte ----------

  let previewQueued = false;
  function schedulePreview() {
    if (previewQueued) return;
    previewQueued = true;
    setTimeout(() => {
      previewQueued = false;
      void renderPreview();
    }, 30);
  }

  async function ensureSample() {
    const first = items.find((i) => i.status !== 'skipped' && !isHeic(i.src.file.name) && !/tiff?$/i.test(i.src.file.name));
    if (!first) {
      if (sample) {
        sample.bitmap.close();
        sample = null;
        sampleFor = null;
      }
      return;
    }
    if (sampleFor === first.src.file) return;
    sampleFor = first.src.file;
    try {
      const bitmap = await createImageBitmap(first.src.file);
      sample?.bitmap.close();
      sample = { bitmap };
    } catch {
      sample = null;
    }
  }

  async function renderPreview() {
    if ($('#crop-box').hidden) return;
    await ensureSample();
    const { outW, outH } = drawCropPreview(cropCanvas, {
      image: sample?.bitmap ?? null,
      rotate: settings.rotate,
      flipH: settings.flipH,
      flipV: settings.flipV,
      resize: settings.resize,
    });
    $('#crop-caption').textContent = t('previewCaption', { w: outW, h: outH });
  }

  // ---------- cola ----------

  function addSources(sources: Source[]) {
    if (running) return;
    lastMessage = '';
    btnOpen.hidden = true;
    for (const src of sources) {
      const supported = isSupported(src.file.name);
      items.push({
        id: nextId++,
        src,
        status: supported ? 'pending' : 'skipped',
        inSize: src.file.size,
        error: supported ? undefined : t('errUnsupported'),
      });
    }
    render();
    schedulePreview();
  }

  function render() {
    const statusLabel = (i: Item) => {
      if (i.status === 'error') return `${t('status.error')}: ${i.error ?? t('errGeneric')}`;
      if (i.status === 'done' && i.missedTarget) return t('status.doneMissed');
      return t(`status.${i.status}` as Key);
    };

    rows.innerHTML = items
      .map((i) => {
        const saved = i.outSize != null ? pct(i.inSize, i.outSize) : null;
        const extra = i.outCount && i.outCount > 1 ? ` <small>(+${i.outCount - 1})</small>` : '';
        const compare =
          i.status === 'done' && i.outBlob
            ? `<button type="button" class="x cmp" data-id="${i.id}" title="${esc(t('compare'))}" aria-label="${esc(t('compare'))}">◐</button>`
            : '';
        const remove = running ? '' : `<button type="button" class="x" data-id="${i.id}" data-rm aria-label="${esc(t('clickToRemove'))}">×</button>`;
        return `<tr data-s="${i.status}">
          <td class="name" title="${esc(i.src.relPath)}">${esc(i.src.relPath)}</td>
          <td class="num">${fmtBytes(i.inSize)}</td>
          <td class="num">${i.outSize != null ? fmtBytes(i.outSize) : '—'}${extra}</td>
          <td class="num ${saved != null && saved < 0 ? 'bad' : ''}">${saved != null ? `${saved} %` : '—'}</td>
          <td class="st" title="${esc(statusLabel(i))}">${esc(statusLabel(i))}</td>
          <td class="acts">${compare}${remove}</td>
        </tr>`;
      })
      .join('');

    const convertible = items.filter((i) => i.status !== 'skipped');
    emptyMsg.hidden = items.length > 0;
    btnClear.hidden = items.length === 0 || running;
    btnConvert.disabled = running || convertible.length === 0;
    btnConvert.textContent = running ? t('converting') : t('convert');
    btnCancel.hidden = !running;

    const done = items.filter((i) => i.status === 'done');
    const finished = items.filter((i) => i.status === 'done' || i.status === 'error').length;
    progress.hidden = !running;
    progress.value = convertible.length ? finished / convertible.length : 0;

    const before = (list: Item[]) => list.reduce((s, i) => s + i.inSize, 0);
    const lines: string[] = [];
    if (running && finished > 0) {
      const eta = ((Date.now() - startedAt) / finished) * (convertible.length - finished) / 1000;
      lines.push(t('eta', { done: finished, total: convertible.length, eta: fmtDuration(eta) }));
    }
    if (done.length) {
      const after = done.reduce((s, i) => s + (i.outSize ?? 0), 0);
      lines.push(
        t('summary', {
          done: done.length,
          total: convertible.length,
          before: fmtBytes(before(done)),
          after: fmtBytes(after),
          saved: `${pct(before(done), after)} %`,
        }),
      );
    } else if (convertible.length && !running) {
      lines.push(t('summaryIdle', { total: convertible.length, before: fmtBytes(before(convertible)) }));
    }
    if (lastMessage) lines.push(lastMessage);
    summary.textContent = lines.join('\n');
  }

  rows.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button.x');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.classList.contains('cmp')) {
      const item = items.find((i) => i.id === id);
      if (!item?.outBlob) return;
      const displayable = !isHeic(item.src.file.name) && !/tiff?$/i.test(item.src.file.name);
      const beforeUrl = displayable ? URL.createObjectURL(item.src.file) : null;
      const afterUrl = URL.createObjectURL(item.outBlob);
      openCompare({
        title: item.src.relPath,
        beforeUrl,
        afterUrl,
        beforeLabel: `${t('before')} · ${fmtBytes(item.inSize)}`,
        afterLabel: `${t('after')} · ${fmtBytes(item.outSize ?? 0)}`,
      });
      return;
    }
    if (running) return;
    items = items.filter((i) => i.id !== id);
    render();
    schedulePreview();
  });

  btnClear.addEventListener('click', () => {
    if (running) return;
    items = [];
    lastMessage = '';
    btnOpen.hidden = true;
    render();
    schedulePreview();
  });

  // ---------- entrada de archivos ----------

  const inFiles = $<HTMLInputElement>('#in-files');
  const inFolder = $<HTMLInputElement>('#in-folder');
  $('#btn-files').addEventListener('click', () => inFiles.click());
  $('#btn-folder').addEventListener('click', () => inFolder.click());
  for (const input of [inFiles, inFolder]) {
    input.addEventListener('change', () => {
      if (input.files) addSources(fromInput(input.files));
      input.value = '';
    });
  }

  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', async (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    if (e.dataTransfer) addSources(await fromDrop(e.dataTransfer));
  });
  // Evita que soltar fuera de la zona navegue a la imagen.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  // Pegar imágenes del portapapeles (sólo con la pestaña de imagen visible).
  window.addEventListener('paste', (e) => {
    if (app.hidden || !e.clipboardData) return;
    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    addSources(
      files.map((f, n) => {
        const ext = f.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
        const file = f.name && f.name !== 'image.png' ? f : new File([f], `pegada-${stamp}${files.length > 1 ? `-${n + 1}` : ''}.${ext}`, { type: f.type });
        return { file, relPath: file.name };
      }),
    );
  });

  // ---------- conversión ----------

  const buildOptions = (): ConvertOptions => ({
    format: settings.format,
    preset: settings.preset,
    resize: settings.resize,
    rotate: settings.rotate,
    flipH: settings.flipH,
    flipV: settings.flipV,
    targetKB: settings.targetKB,
    sizes: parseSizes(),
    watermark: settings.watermark.enabled && settings.watermark.text.trim() ? settings.watermark : null,
  });

  function outputName(relPath: string, width: number, height: number, multi: boolean): string {
    const { dir, stem } = splitPath(relPath);
    let tpl = settings.template.trim() || '{nombre}';
    if (multi && !/\{(ancho|width)\}/.test(tpl)) tpl += '-{ancho}w';
    // Se aceptan las variables en español y en inglés.
    const name = tpl
      .replace(/\{(nombre|name)\}/g, stem)
      .replace(/\{(ancho|width)\}/g, String(width))
      .replace(/\{(alto|height)\}/g, String(height))
      .replace(/\{(formato|format)\}/g, settings.format);
    return `${dir}${safeName(name)}.${EXTENSIONS[settings.format]}`;
  }

  async function convertAll() {
    // Se puede volver a convertir la misma cola (otro destino, formato o ajustes): se reprocesa todo.
    const todo = items.filter((i) => i.status !== 'skipped');
    if (!todo.length || running) return;

    // Siempre se pregunta el destino (carpeta o ZIP) en cada conversión.
    let sink;
    try {
      sink = await createSink(settings.dest);
    } catch (err) {
      lastMessage = err instanceof Error ? err.message : String(err);
      render();
      return;
    }
    if (!sink) {
      lastMessage = t('errNoSink');
      render();
      return;
    }

    running = true;
    cancelRequested = false;
    lastMessage = '';
    startedAt = Date.now();
    btnOpen.hidden = true;
    pool ??= new WorkerPool();
    const queue = [...todo];
    for (const i of queue) {
      i.status = 'pending';
      i.error = undefined;
      i.outSize = undefined;
      i.outBlob = undefined;
      i.outCount = undefined;
      i.missedTarget = false;
    }
    render();

    const options = buildOptions();
    const multi = options.sizes.length > 0;

    const lane = async () => {
      for (;;) {
        if (cancelRequested) return;
        const item = queue.shift();
        if (!item) return;
        item.status = 'processing';
        render();
        try {
          const { buffer, mime } = await readForConversion(item.src.file);
          const res = await pool!.run({ buffer, mime, name: item.src.file.name, options });
          const mimeOut = mimeFor(`x.${EXTENSIONS[options.format]}`);
          for (const out of res.outputs) {
            const bytes = new Uint8Array(out.buffer);
            await sink.write(outputName(item.src.relPath, out.width, out.height, multi && res.outputs.length > 1), bytes);
            if (out === res.outputs[0]) {
              item.outSize = bytes.byteLength;
              item.outBlob = new Blob([bytes], { type: mimeOut });
            }
            if (out.targetMissed) item.missedTarget = true;
          }
          item.outCount = res.outputs.length;
          item.status = 'done';
        } catch (err) {
          item.status = 'error';
          item.error = err instanceof Error ? err.message : t('errGeneric');
        }
        render();
      }
    };

    const lanes = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
    await Promise.all(Array.from({ length: lanes }, lane));

    // Lo que quedó sin procesar por cancelación vuelve a "en espera".
    for (const i of items) if (i.status === 'processing') i.status = 'pending';

    try {
      await sink.finish();
      const anyDone = items.some((i) => i.status === 'done');
      if (cancelRequested) lastMessage = t('cancelled');
      else if (anyDone) {
        lastMessage = t(sink.label.endsWith('.zip') ? 'finishedZip' : 'finishedFolder', { where: sink.label });
        btnOpen.hidden = !isDesktop();
      }
    } catch (err) {
      lastMessage = err instanceof Error ? err.message : String(err);
    }
    running = false;
    render();
  }

  btnConvert.addEventListener('click', () => void convertAll());
  btnCancel.addEventListener('click', () => {
    cancelRequested = true;
  });
  btnOpen.addEventListener('click', () => void window.desktop?.openOutput());

  renderSaved();
  syncToDom();
  render();
  schedulePreview();
}

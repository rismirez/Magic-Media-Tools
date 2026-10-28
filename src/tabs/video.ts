import { t, type Key } from '../i18n';
import {
  VIDEO_ACCEPT,
  convertVideoWeb,
  defaultVideoOptions,
  extractFrameWeb,
  isVideoFile,
  outputExt,
  probeDuration,
  supportedWebFormats,
  type VideoFormat,
  type VideoKind,
  type VideoOptions,
  type VideoQuality,
  type WebHandle,
} from '../engine/video';
import { fromDrop, fromInput, type Source } from '../engine/input';
import { canPickFolder, createSink, isDesktop, type SinkKind } from '../platform/sinks';
import { esc, fmtBytes, fmtDuration, getPath, pct, safeName, setPath, splitPath } from '../ui/format';
import { loadPresets, savePresets } from '../ui/savedPresets';
import { iconSpinner, iconVideoAdd, iconWand } from '../ui/icons';
import { defaultWatermark, mountWatermark, watermarkHtml, type WatermarkSettings } from '../ui/watermark';
import { watermarkPng } from '../engine/watermark';

type Status = 'pending' | 'processing' | 'done' | 'error' | 'skipped';

interface Item {
  id: number;
  src: Source;
  status: Status;
  inSize: number;
  duration: number;
  progress: number;
  outSize?: number;
  error?: string;
}

type Settings = VideoOptions & { dest: SinkKind; watermark: WatermarkSettings };

const KINDS: VideoKind[] = ['video', 'gif', 'webp', 'frame'];
const FORMATS: VideoFormat[] = ['mp4-h264', 'mp4-h265', 'webm-vp9', 'webm-av1'];
const QUALITIES: VideoQuality[] = ['high', 'balanced', 'small'];
const HEIGHTS = [0, 2160, 1440, 1080, 720, 480, 360];
const FPS = [0, 60, 30, 24, 15];
const AUDIO_KBPS = [0, 64, 96, 128, 192, 256];
const STORAGE_KEY = 'media-compressor:video';
const PRESETS_KEY = 'media-compressor:video-presets';

const defaults = (): Settings => ({ ...defaultVideoOptions, dest: 'folder', watermark: defaultWatermark() });

function load(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return { ...defaults(), ...saved, watermark: { ...defaultWatermark(), ...(saved.watermark ?? {}) } };
  } catch {
    return defaults();
  }
}

export function mountVideoTab(app: HTMLElement) {
  const settings = load();
  // En la web no hay ffmpeg: GIF/WebP animado sólo existen en escritorio.
  const desktop = isDesktop() && !!window.desktop?.hasFfmpeg;
  if (!desktop && (settings.kind === 'gif' || settings.kind === 'webp')) settings.kind = 'video';

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
  let currentId = 0;
  let webHandle: WebHandle = {};
  let lastMessage = '';
  let startedAt = 0;
  let renderTimer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribe: (() => void) | null = null;

  const heightLabel = (h: number) => (h ? `${h}p` : t('original'));
  const fpsLabel = (f: number) => (f ? `${f} fps` : t('original'));
  const kbpsLabel = (k: number) => (k ? `${k} kbps` : t('auto'));

  app.innerHTML = `
    <div class="layout">
      <section class="panel">
        <div class="drop" tabindex="0">
          <div class="drop-icon">${iconVideoAdd}</div>
          <strong>${esc(t('v.dropTitle'))}</strong>
          <span>${esc(t('v.dropHint'))}</span>
          <div class="row">
            <button type="button" class="btn" data-act="files">${esc(t('v.addFiles'))}</button>
            <button type="button" class="btn" data-act="folder">${esc(t('addFolder'))}</button>
          </div>
        </div>
        <input class="in-files" type="file" multiple hidden accept="${VIDEO_ACCEPT}" />
        <input class="in-folder" type="file" multiple hidden webkitdirectory />

        <div class="queue-head">
          <h2>${esc(t('queue'))}</h2>
          <button type="button" class="link" data-act="clear">${esc(t('clear'))}</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>${esc(t('colName'))}</th>
                <th class="num">${esc(t('v.colDuration'))}</th>
                <th class="num">${esc(t('colSize'))}</th>
                <th class="num">${esc(t('colResult'))}</th>
                <th class="num">${esc(t('colSaved'))}</th>
                <th>${esc(t('colStatus'))}</th>
                <th></th>
              </tr>
            </thead>
            <tbody class="rows"></tbody>
          </table>
          <p class="empty">${esc(t('v.queueEmpty'))}</p>
        </div>
      </section>

      <aside class="panel settings">
        <h2>${esc(t('settings'))}</h2>

        <fieldset>
          <legend>${esc(t('saved'))}</legend>
          <div class="row nowrap">
            <select class="saved-sel" aria-label="${esc(t('saved'))}"></select>
            <button type="button" class="btn" data-act="saved-del" title="${esc(t('savedDelete'))}" aria-label="${esc(t('savedDelete'))}">🗑</button>
          </div>
          <div class="row nowrap saved-new">
            <input class="saved-name" type="text" maxlength="40" placeholder="${esc(t('savedNamePh'))}" />
            <button type="button" class="btn" data-act="saved-save">${esc(t('savedSave'))}</button>
          </div>
        </fieldset>

        <fieldset>
          <legend>${esc(t('v.output'))}</legend>
          <div class="seg seg-wrap">
            ${KINDS.map((k) => `<label data-only="${k === 'gif' || k === 'webp' ? 'desktop' : ''}"><input type="radio" name="kind" data-bind="kind" value="${k}" /><span>${esc(t(`v.kind.${k}` as Key))}</span></label>`).join('')}
          </div>
          <p class="note web-note" hidden>${esc(t('v.webOnlyNote'))}</p>
        </fieldset>

        <fieldset data-kinds="video">
          <legend>${esc(t('format'))}</legend>
          <div class="seg seg-wrap">
            ${FORMATS.map((f) => `<label><input type="radio" name="format" data-bind="format" value="${f}" /><span>${esc(t(`v.format.${f}` as Key))}</span></label>`).join('')}
          </div>
          <p class="note format-note"></p>
        </fieldset>

        <fieldset data-kinds="video webp">
          <legend>${esc(t('quality'))}</legend>
          <div class="presets">
            ${QUALITIES.map(
              (q) => `
              <label class="preset">
                <input type="radio" name="quality" data-bind="quality" value="${q}" />
                <span><b>${esc(t(`v.quality.${q}.name` as Key))}</b><small>${esc(t(`v.quality.${q}.desc` as Key))}</small></span>
              </label>`,
            ).join('')}
          </div>
          <label class="field inline" data-kinds="video">${esc(t('v.targetMB'))}
            <input type="number" min="0" step="1" data-bind="targetMB" data-type="float" placeholder="${esc(t('off'))}" />
          </label>
          <p class="note" data-kinds="video">${esc(t('v.targetMBHint'))}</p>
        </fieldset>

        <fieldset data-kinds="video frame">
          <legend>${esc(t('v.size'))}</legend>
          <label class="field">${esc(t('v.maxHeight'))}
            <select data-bind="maxHeight" data-type="number">${HEIGHTS.map((h) => `<option value="${h}">${esc(heightLabel(h))}</option>`).join('')}</select>
          </label>
          <label class="field inline" data-kinds="video">${esc(t('v.maxFps'))}
            <select data-bind="maxFps" data-type="number">${FPS.map((f) => `<option value="${f}">${esc(fpsLabel(f))}</option>`).join('')}</select>
          </label>
        </fieldset>

        <fieldset data-kinds="gif webp">
          <legend>${esc(t('v.animation'))}</legend>
          <div class="row">
            <label class="field">${esc(t('v.animWidth'))}<input type="number" min="16" step="10" data-bind="animWidth" data-type="number" /></label>
            <label class="field">${esc(t('v.animFps'))}<input type="number" min="1" max="30" step="1" data-bind="animFps" data-type="number" /></label>
          </div>
          <p class="note">${esc(t('v.animHint'))}</p>
        </fieldset>

        <fieldset data-kinds="video">
          <legend>${esc(t('v.audio'))}</legend>
          <div class="seg">
            <label><input type="radio" name="audio" data-bind="audio" value="keep" /><span>${esc(t('v.audioKeep'))}</span></label>
            <label><input type="radio" name="audio" data-bind="audio" value="drop" /><span>${esc(t('v.audioDrop'))}</span></label>
          </div>
          <label class="field inline">${esc(t('v.audioKbps'))}
            <select data-bind="audioKbps" data-type="number">${AUDIO_KBPS.map((k) => `<option value="${k}">${esc(kbpsLabel(k))}</option>`).join('')}</select>
          </label>
        </fieldset>

        <fieldset data-kinds="frame">
          <legend>${esc(t('v.frame'))}</legend>
          <label class="field">${esc(t('v.frameTime'))}<input type="number" min="0" step="0.1" data-bind="frameTime" data-type="float" /></label>
          <div class="seg frame-fmt">
            ${(['jpeg', 'png', 'webp'] as const).map((f) => `<label><input type="radio" name="frameFormat" data-bind="frameFormat" value="${f}" /><span>${f.toUpperCase()}</span></label>`).join('')}
          </div>
        </fieldset>

        <fieldset data-kinds="video gif webp">
          <legend>${esc(t('v.trim'))}</legend>
          <div class="row">
            <label class="field">${esc(t('v.trimStart'))}<input type="number" min="0" step="0.1" data-bind="start" data-type="float" /></label>
            <label class="field">${esc(t('v.trimEnd'))}<input type="number" min="0" step="0.1" data-bind="end" data-type="float" placeholder="${esc(t('v.untilEnd'))}" /></label>
          </div>
          <p class="note">${esc(t('v.trimHint'))}</p>
        </fieldset>

        ${watermarkHtml('vid', true)}

        <fieldset class="dest-box">
          <legend>${esc(t('destination'))}</legend>
          <div class="seg">
            <label><input type="radio" name="vdest" data-bind="dest" value="folder" /><span>${esc(t('destFolder'))}</span></label>
            <label><input type="radio" name="vdest" data-bind="dest" value="zip" /><span>${esc(t('destZip'))}</span></label>
          </div>
          <p class="note">${esc(t('destHint'))}</p>
        </fieldset>

        <div class="action-bar">
          <p class="summary" role="status" aria-live="polite"></p>
          <progress class="progress" max="1" value="0" hidden></progress>
          <div class="actions">
            <button type="button" class="btn primary convert" data-act="convert"></button>
            <button type="button" class="btn" data-act="cancel" hidden>${esc(t('cancel'))}</button>
            <button type="button" class="btn" data-act="open" hidden>${esc(t('openOutput'))}</button>
          </div>
        </div>
      </aside>
    </div>
  `;

  const $ = <T extends HTMLElement>(sel: string) => app.querySelector<T>(sel)!;
  const rows = $('.rows');
  const emptyMsg = $('.empty');
  const btn = (act: string) => app.querySelector<HTMLButtonElement>(`[data-act=${act}]`)!;
  const btnConvert = btn('convert');
  const btnCancel = btn('cancel');
  const btnOpen = btn('open');
  const btnClear = btn('clear');
  const progress = $<HTMLProgressElement>('.progress');
  const summary = $('.summary');
  const savedSel = $<HTMLSelectElement>('.saved-sel');
  const savedName = $<HTMLInputElement>('.saved-name');

  const wm = mountWatermark(app, settings.watermark, () => {
    saveSettings();
    wm.refresh();
  });

  // ---------- ajustes ----------

  function syncVisibility() {
    wm.refresh();
    app.querySelectorAll<HTMLElement>('[data-kinds]').forEach((el) => {
      el.hidden = !el.dataset.kinds!.split(' ').includes(settings.kind);
    });
    app.querySelectorAll<HTMLElement>('label[data-only=desktop]').forEach((el) => (el.hidden = !desktop));
    $('.web-note').hidden = desktop;
    $('.dest-box').hidden = isDesktop();
    const webNote = !desktop && settings.kind === 'video' ? t('v.webCodecNote') : '';
    $('.format-note').textContent = webNote;
  }

  function syncToDom() {
    app.querySelectorAll<HTMLInputElement>('[data-bind]').forEach((el) => {
      const v = getPath(settings, el.dataset.bind!);
      if (el.type === 'radio') el.checked = String(v) === el.value;
      else if (el.type === 'checkbox') el.checked = Boolean(v);
      else el.value = el.dataset.type && !v && el.tagName === 'INPUT' ? '' : String(v ?? '');
    });
    if (!canPickFolder()) {
      app.querySelector<HTMLInputElement>('input[name=vdest][value=zip]')!.checked = true;
      app.querySelector<HTMLInputElement>('input[name=vdest][value=folder]')!.disabled = true;
    }
    syncVisibility();
  }

  function onBind(e: Event) {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const path = el.dataset?.bind;
    if (!path) return;
    if (el instanceof HTMLInputElement && el.type === 'radio' && !el.checked) return;
    let value: unknown = el.value;
    if (el instanceof HTMLInputElement && el.type === 'checkbox') value = el.checked;
    else if (el.dataset.type === 'number') value = Math.max(0, Math.floor(Number(el.value) || 0));
    else if (el.dataset.type === 'float') value = Math.max(0, Number(el.value) || 0);
    setPath(settings, path, value);
    saveSettings();
    syncVisibility();
    render();
  }
  app.addEventListener('input', onBind);
  app.addEventListener('change', onBind);

  // En la web, desactiva los formatos que este navegador no puede codificar.
  if (!desktop) {
    void supportedWebFormats().then((ok) => {
      for (const f of FORMATS) {
        const input = app.querySelector<HTMLInputElement>(`input[name=format][value=${f}]`)!;
        input.disabled = !ok.includes(f);
        input.closest('label')!.title = ok.includes(f) ? '' : t('v.unsupportedHere');
      }
      if (ok.length && !ok.includes(settings.format)) {
        settings.format = ok[0];
        saveSettings();
        syncToDom();
      }
    });
  }

  // ---------- ajustes guardados ----------

  function renderSaved(selected = '') {
    const names = Object.keys(loadPresets(PRESETS_KEY));
    savedSel.innerHTML =
      `<option value="">${esc(t('savedNone'))}</option>` + names.map((n) => `<option value="${esc(n)}"${n === selected ? ' selected' : ''}>${esc(n)}</option>`).join('');
  }
  savedSel.addEventListener('change', () => {
    const preset = loadPresets(PRESETS_KEY)[savedSel.value] as Partial<Settings> | undefined;
    if (!preset) return;
    const keepDest = settings.dest;
    Object.assign(settings, defaults(), preset, { dest: keepDest });
    if (!desktop && (settings.kind === 'gif' || settings.kind === 'webp')) settings.kind = 'video';
    saveSettings();
    syncToDom();
    render();
  });

  // ---------- cola ----------

  function addSources(sources: Source[]) {
    if (running) return;
    lastMessage = '';
    btnOpen.hidden = true;
    for (const src of sources) {
      const supported = isVideoFile(src.file.name);
      const item: Item = {
        id: nextId++,
        src,
        status: supported ? 'pending' : 'skipped',
        inSize: src.file.size,
        duration: 0,
        progress: 0,
        error: supported ? undefined : t('errUnsupported'),
      };
      items.push(item);
      if (supported) {
        void probeDuration(src.file).then((d) => {
          item.duration = d;
          renderSoon();
        });
      }
    }
    render();
  }

  function renderSoon() {
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = null;
      render();
    }, 120);
  }

  function render() {
    const statusLabel = (i: Item) => {
      if (i.status === 'error') return `${t('status.error')}: ${i.error ?? t('errGeneric')}`;
      if (i.status === 'processing') return `${t('status.processing')} ${Math.round(i.progress * 100)} %`;
      return t(`status.${i.status}` as Key);
    };

    rows.innerHTML = items
      .map((i) => {
        const saved = i.outSize != null && settings.kind !== 'frame' ? pct(i.inSize, i.outSize) : null;
        return `<tr data-s="${i.status}">
          <td class="name" title="${esc(i.src.relPath)}">${esc(i.src.relPath)}</td>
          <td class="num">${i.duration ? fmtDuration(i.duration) : '—'}</td>
          <td class="num">${fmtBytes(i.inSize)}</td>
          <td class="num">${i.outSize != null ? fmtBytes(i.outSize) : '—'}</td>
          <td class="num ${saved != null && saved < 0 ? 'bad' : ''}">${saved != null ? `${saved} %` : '—'}</td>
          <td class="st" title="${esc(statusLabel(i))}">${esc(statusLabel(i))}</td>
          <td class="acts">${running ? '' : `<button type="button" class="x" data-id="${i.id}" aria-label="${esc(t('clickToRemove'))}">×</button>`}</td>
        </tr>`;
      })
      .join('');

    const convertible = items.filter((i) => i.status !== 'skipped');
    emptyMsg.hidden = items.length > 0;
    btnClear.hidden = items.length === 0 || running;
    btnConvert.disabled = running || convertible.length === 0;
    btnConvert.innerHTML = running ? `${iconSpinner}<span>${esc(t('converting'))}</span>` : `${iconWand}<span>${esc(t('convert'))}</span>`;
    btnCancel.hidden = !running;

    const finished = convertible.filter((i) => i.status === 'done' || i.status === 'error').length;
    const partial = convertible.reduce((s, i) => s + (i.status === 'done' || i.status === 'error' ? 1 : i.status === 'processing' ? i.progress : 0), 0);
    progress.hidden = !running;
    progress.value = convertible.length ? partial / convertible.length : 0;

    const lines: string[] = [];
    if (running && partial > 0.02) {
      const eta = ((Date.now() - startedAt) / partial) * (convertible.length - partial) / 1000;
      lines.push(t('v.eta', { done: finished, total: convertible.length, eta: fmtDuration(eta) }));
    }
    const done = items.filter((i) => i.status === 'done');
    if (done.length) {
      const before = done.reduce((s, i) => s + i.inSize, 0);
      const after = done.reduce((s, i) => s + (i.outSize ?? 0), 0);
      lines.push(
        settings.kind === 'frame'
          ? t('v.summaryFrames', { done: done.length, total: convertible.length })
          : t('v.summary', { done: done.length, total: convertible.length, before: fmtBytes(before), after: fmtBytes(after), saved: `${pct(before, after)} %` }),
      );
    } else if (convertible.length && !running) {
      lines.push(t('v.summaryIdle', { total: convertible.length, before: fmtBytes(convertible.reduce((s, i) => s + i.inSize, 0)) }));
    }
    if (lastMessage) lines.push(lastMessage);
    summary.textContent = lines.join('\n');
  }

  rows.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button.x');
    if (!b || running) return;
    items = items.filter((i) => i.id !== Number(b.dataset.id));
    render();
  });

  // ---------- entrada ----------

  const inFiles = $<HTMLInputElement>('.in-files');
  const inFolder = $<HTMLInputElement>('.in-folder');
  const drop = $('.drop');
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

  // ---------- conversión ----------

  function outputName(relPath: string, o: VideoOptions): string {
    const { dir, stem } = splitPath(relPath);
    const suffix = o.kind === 'frame' ? `-${String(o.frameTime).replace('.', '_')}s` : '';
    return `${dir}${safeName(stem + suffix)}.${outputExt(o)}`;
  }

  async function convertAll() {
    const todo = items.filter((i) => i.status !== 'skipped');
    if (!todo.length || running) return;

    // Siempre se pregunta el destino en cada conversión.
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
    for (const i of todo) {
      i.status = 'pending';
      i.progress = 0;
      i.error = undefined;
      i.outSize = undefined;
    }
    const options: VideoOptions = { ...settings };
    const wmOptions = await wm.options();
    const wmPng = wmOptions && desktop ? await watermarkPng(wmOptions) : null;
    unsubscribe = window.desktop?.onVideoProgress?.(({ id, ratio }) => {
      if (id !== currentId) return;
      const item = items.find((i) => i.id === id);
      if (item) item.progress = ratio;
      renderSoon();
    }) ?? null;
    render();

    // Un vídeo a la vez: ffmpeg y los códecs del navegador ya usan varios núcleos.
    for (const item of todo) {
      if (cancelRequested) break;
      item.status = 'processing';
      currentId = item.id;
      webHandle = {};
      render();
      try {
        const relOut = outputName(item.src.relPath, options);
        if (desktop) {
          const inputPath = window.desktop!.getPathForFile(item.src.file);
          const wmPayload = wmOptions && wmPng ? { png: wmPng, position: wmOptions.position, widthPct: wmOptions.imgPct } : null;
          const res = await window.desktop!.videoRun(item.id, inputPath, relOut, options as unknown as DesktopVideoOptions, wmPayload);
          item.outSize = res.size;
        } else {
          const buffer =
            options.kind === 'frame'
              ? await extractFrameWeb(item.src.file, options.frameTime, options.frameFormat, options.maxHeight, wmOptions)
              : await convertVideoWeb(item.src.file, options, (r) => {
                  item.progress = r;
                  renderSoon();
                }, webHandle, wmOptions);
          await sink.write(relOut, new Uint8Array(buffer));
          item.outSize = buffer.byteLength;
        }
        item.progress = 1;
        item.status = 'done';
      } catch (err) {
        const msg = err instanceof Error ? err.message : t('errGeneric');
        if (cancelRequested) item.status = 'pending';
        else {
          item.status = 'error';
          item.error = msg;
        }
      }
      render();
    }

    unsubscribe?.();
    unsubscribe = null;
    for (const i of items) if (i.status === 'processing') i.status = 'pending';

    try {
      await sink.finish();
      if (cancelRequested) lastMessage = t('cancelled');
      else if (items.some((i) => i.status === 'done')) {
        lastMessage = t(sink.label.endsWith('.zip') ? 'finishedZip' : 'finishedFolder', { where: sink.label });
        btnOpen.hidden = !isDesktop();
      }
    } catch (err) {
      lastMessage = err instanceof Error ? err.message : String(err);
    }
    running = false;
    render();
  }

  // ---------- acciones ----------

  app.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'files') inFiles.click();
    else if (act === 'folder') inFolder.click();
    else if (act === 'clear' && !running) {
      items = [];
      lastMessage = '';
      btnOpen.hidden = true;
      render();
    } else if (act === 'convert') void convertAll();
    else if (act === 'cancel') {
      cancelRequested = true;
      if (desktop) void window.desktop!.videoCancel(currentId);
      else void webHandle.cancel?.();
    } else if (act === 'open') void window.desktop?.openOutput();
    else if (act === 'saved-save') {
      const name = savedName.value.trim();
      if (!name) return;
      const all = loadPresets(PRESETS_KEY);
      all[name] = JSON.parse(JSON.stringify(settings));
      savePresets(PRESETS_KEY, all);
      savedName.value = '';
      renderSaved(name);
    } else if (act === 'saved-del') {
      const all = loadPresets(PRESETS_KEY);
      if (!(savedSel.value in all)) return;
      delete all[savedSel.value];
      savePresets(PRESETS_KEY, all);
      renderSaved();
    }
  });

  renderSaved();
  syncToDom();
  render();
}

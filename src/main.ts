import './style.css';
import { t, type Key } from './i18n';
import { WorkerPool } from './engine/pool';
import { PRESET_ORDER } from './engine/presets';
import { EXTENSIONS, type OutputFormat, type PresetId } from './engine/types';
import { ACCEPT, fromDrop, fromInput, isSupported, readForConversion, type Source } from './engine/input';
import { canPickFolder, createSink, isDesktop, type SinkKind } from './platform/sinks';

type Status = 'pending' | 'processing' | 'done' | 'error' | 'skipped';

interface Item {
  id: number;
  src: Source;
  status: Status;
  inSize: number;
  outSize?: number;
  error?: string;
}

interface Settings {
  format: OutputFormat;
  preset: PresetId;
  maxWidth: number;
  maxHeight: number;
  dest: SinkKind;
}

const FORMATS: Array<{ id: OutputFormat; label: string }> = [
  { id: 'webp', label: 'WebP' },
  { id: 'avif', label: 'AVIF' },
  { id: 'jpeg', label: 'JPEG' },
  { id: 'png', label: 'PNG' },
];

const STORAGE_KEY = 'webp-compressor:settings';

function loadSettings(): Settings {
  const defaults: Settings = { format: 'webp', preset: 'balanced', maxWidth: 0, maxHeight: 0, dest: 'folder' };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

const settings = loadSettings();
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
let pool: WorkerPool | null = null;

// ---------- utilidades ----------

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

const pct = (before: number, after: number) => (before > 0 ? Math.round((1 - after / before) * 100) : 0);

function outputPath(relPath: string, format: OutputFormat): string {
  const slash = relPath.lastIndexOf('/');
  const dir = slash >= 0 ? relPath.slice(0, slash + 1) : '';
  const base = relPath.slice(slash + 1);
  const dot = base.lastIndexOf('.');
  return `${dir}${dot > 0 ? base.slice(0, dot) : base}.${EXTENSIONS[format]}`;
}

// ---------- plantilla ----------

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <header class="top">
    <h1>${esc(t('appTitle'))}</h1>
    <p>${esc(t('appTagline'))}</p>
  </header>

  <main class="layout">
    <section class="panel">
      <div id="drop" class="drop" tabindex="0">
        <strong>${esc(t('dropTitle'))}</strong>
        <span>${esc(t('dropHint'))}</span>
        <div class="row">
          <button type="button" id="btn-files" class="btn">${esc(t('addFiles'))}</button>
          <button type="button" id="btn-folder" class="btn">${esc(t('addFolder'))}</button>
        </div>
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
        <legend>${esc(t('format'))}</legend>
        <div class="seg" id="formats">
          ${FORMATS.map(
            (f) => `<label><input type="radio" name="format" value="${f.id}" /><span>${f.label}</span></label>`,
          ).join('')}
        </div>
        <p id="format-note" class="note"></p>
      </fieldset>

      <fieldset>
        <legend>${esc(t('quality'))}</legend>
        <div class="presets" id="presets">
          ${PRESET_ORDER.map(
            (p) => `
            <label class="preset">
              <input type="radio" name="preset" value="${p}" />
              <span><b>${esc(t(`preset.${p}.name` as Key))}</b><small>${esc(t(`preset.${p}.desc` as Key))}</small></span>
            </label>`,
          ).join('')}
        </div>
      </fieldset>

      <fieldset>
        <legend>${esc(t('resize'))}</legend>
        <div class="row">
          <label class="field">${esc(t('maxWidth'))}<input id="max-w" type="number" min="0" step="1" placeholder="${esc(t('noLimit'))}" /></label>
          <label class="field">${esc(t('maxHeight'))}<input id="max-h" type="number" min="0" step="1" placeholder="${esc(t('noLimit'))}" /></label>
        </div>
        <p class="note">${esc(t('resizeHint'))}</p>
      </fieldset>

      <fieldset id="dest-box">
        <legend>${esc(t('destination'))}</legend>
        <div class="seg">
          <label><input type="radio" name="dest" value="folder" /><span>${esc(t('destFolder'))}</span></label>
          <label><input type="radio" name="dest" value="zip" /><span>${esc(t('destZip'))}</span></label>
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
  </main>
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
const maxW = $<HTMLInputElement>('#max-w');
const maxH = $<HTMLInputElement>('#max-h');

// ---------- ajustes ----------

function syncSettingsToDom() {
  app.querySelector<HTMLInputElement>(`input[name=format][value=${settings.format}]`)!.checked = true;
  app.querySelector<HTMLInputElement>(`input[name=preset][value=${settings.preset}]`)!.checked = true;
  const dest = canPickFolder() ? settings.dest : 'zip';
  app.querySelector<HTMLInputElement>(`input[name=dest][value=${dest}]`)!.checked = true;
  maxW.value = settings.maxWidth ? String(settings.maxWidth) : '';
  maxH.value = settings.maxHeight ? String(settings.maxHeight) : '';
  const noteKey = ({ png: 'note.png', jpeg: 'note.jpeg', avif: 'note.avif' } as Record<string, Key>)[settings.format];
  $('#format-note').textContent = noteKey ? t(noteKey) : '';
}

// El destino sólo se elige en la web; en escritorio siempre se pide carpeta.
if (isDesktop()) $('#dest-box').hidden = true;
else if (!canPickFolder()) {
  app.querySelector<HTMLInputElement>('input[name=dest][value=folder]')!.disabled = true;
}

app.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.name === 'format') settings.format = el.value as OutputFormat;
  else if (el.name === 'preset') settings.preset = el.value as PresetId;
  else if (el.name === 'dest') settings.dest = el.value as SinkKind;
  else if (el === maxW || el === maxH) {
    const v = Math.max(0, Math.floor(Number(el.value) || 0));
    if (el === maxW) settings.maxWidth = v;
    else settings.maxHeight = v;
  } else return;
  saveSettings();
  syncSettingsToDom();
});

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
}

function render() {
  const statusLabel = (i: Item) =>
    i.status === 'error' ? `${t('status.error')}: ${i.error ?? t('errGeneric')}` : t(`status.${i.status}` as Key);

  rows.innerHTML = items
    .map((i) => {
      const saved = i.outSize != null ? pct(i.inSize, i.outSize) : null;
      return `<tr data-s="${i.status}">
        <td class="name" title="${esc(i.src.relPath)}">${esc(i.src.relPath)}</td>
        <td class="num">${fmtBytes(i.inSize)}</td>
        <td class="num">${i.outSize != null ? fmtBytes(i.outSize) : '—'}</td>
        <td class="num ${saved != null && saved < 0 ? 'bad' : ''}">${saved != null ? `${saved} %` : '—'}</td>
        <td class="st" title="${esc(statusLabel(i))}">${esc(statusLabel(i))}</td>
        <td>${running ? '' : `<button type="button" class="x" data-id="${i.id}" aria-label="${esc(t('clickToRemove'))}">×</button>`}</td>
      </tr>`;
    })
    .join('');

  const convertible = items.filter((i) => i.status !== 'skipped');
  const hasWork = convertible.length > 0;
  emptyMsg.hidden = items.length > 0;
  btnClear.hidden = items.length === 0 || running;
  btnConvert.disabled = running || !hasWork;
  btnConvert.textContent = running ? t('converting') : t('convert');
  btnCancel.hidden = !running;

  const done = items.filter((i) => i.status === 'done');
  const finished = items.filter((i) => i.status === 'done' || i.status === 'error').length;
  progress.hidden = !running;
  progress.value = convertible.length ? finished / convertible.length : 0;

  const before = (list: Item[]) => list.reduce((s, i) => s + i.inSize, 0);
  if (done.length) {
    const after = done.reduce((s, i) => s + (i.outSize ?? 0), 0);
    const parts = t('summary', {
      done: done.length,
      total: convertible.length,
      before: fmtBytes(before(done)),
      after: fmtBytes(after),
      saved: `${pct(before(done), after)} %`,
    });
    summary.textContent = lastMessage ? `${parts}\n${lastMessage}` : parts;
  } else if (convertible.length) {
    summary.textContent = t('summaryIdle', { total: convertible.length, before: fmtBytes(before(convertible)) });
  } else {
    summary.textContent = lastMessage;
  }
}

rows.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button.x');
  if (!btn || running) return;
  items = items.filter((i) => i.id !== Number(btn.dataset.id));
  render();
});

btnClear.addEventListener('click', () => {
  if (running) return;
  items = [];
  lastMessage = '';
  btnOpen.hidden = true;
  render();
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

// ---------- conversión ----------

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
  btnOpen.hidden = true;
  pool ??= new WorkerPool();
  const queue = [...todo];
  queue.forEach((i) => {
    i.status = 'pending';
    i.error = undefined;
    i.outSize = undefined;
  });
  render();

  const options = {
    format: settings.format,
    preset: settings.preset,
    maxWidth: settings.maxWidth,
    maxHeight: settings.maxHeight,
  };

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
        const bytes = new Uint8Array(res.buffer);
        await sink.write(outputPath(item.src.relPath, options.format), bytes);
        item.outSize = bytes.byteLength;
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
  items.forEach((i) => {
    if (i.status === 'processing') i.status = 'pending';
  });

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

syncSettingsToDom();
render();

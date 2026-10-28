import { t } from '../i18n';
import { esc } from './format';

export interface CompareAfter {
  url: string;
  label: string;
}

/**
 * Ventana con comparador antes/después. `after` puede tardar (vista previa generada al momento).
 * Si no hay «antes» (p. ej. HEIC) muestra sólo el resultado. Libera las URL al cerrar.
 */
export function openCompare(opts: { title: string; beforeUrl: string | null; beforeLabel: string; after: Promise<CompareAfter>; onClose?: () => void }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'compare';
  dlg.innerHTML = `
    <form method="dialog" class="compare-head">
      <strong>${esc(opts.title)}</strong>
      <button class="btn">${esc(t('close'))}</button>
    </form>
    <div class="compare-body"><p class="note loading">${esc(t('comparePreparing'))}</p></div>
  `;
  const body = dlg.querySelector<HTMLElement>('.compare-body')!;
  const urls: string[] = [];
  if (opts.beforeUrl) urls.push(opts.beforeUrl);

  dlg.addEventListener('close', () => {
    for (const u of urls) URL.revokeObjectURL(u);
    opts.onClose?.();
    dlg.remove();
  });
  document.body.appendChild(dlg);
  dlg.showModal();

  opts.after.then(
    (after) => {
      urls.push(after.url);
      const both = !!opts.beforeUrl;
      body.innerHTML = `
        <div class="compare-stage" style="--pos:50%">
          <img class="after" src="${after.url}" alt="${esc(after.label)}" />
          ${both ? `<img class="before" src="${opts.beforeUrl}" alt="${esc(opts.beforeLabel)}" />` : ''}
          ${both ? `<span class="tag l">${esc(opts.beforeLabel)}</span><span class="tag r">${esc(after.label)}</span>` : ''}
          ${both ? '<span class="handle"></span>' : ''}
        </div>
        ${both ? `<input type="range" min="0" max="100" value="50" aria-label="${esc(t('compareSlider'))}" />` : `<p class="note">${esc(t('compareNoBefore'))}</p>`}
      `;
      const stage = body.querySelector<HTMLElement>('.compare-stage')!;
      body.querySelector<HTMLInputElement>('input[type=range]')?.addEventListener('input', (e) => {
        stage.style.setProperty('--pos', `${(e.target as HTMLInputElement).value}%`);
      });
    },
    (err) => {
      body.innerHTML = `<p class="note">${esc(t('compareFailed'))}${err instanceof Error && err.message ? `: ${esc(err.message)}` : ''}</p>`;
    },
  );
}

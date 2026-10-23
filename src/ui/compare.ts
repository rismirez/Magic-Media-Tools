import { t } from '../i18n';
import { esc } from './format';

/** Ventana con comparador antes/después. Si no hay "antes" (p. ej. HEIC) muestra sólo el resultado. */
export function openCompare(opts: { title: string; beforeUrl: string | null; afterUrl: string; beforeLabel: string; afterLabel: string }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'compare';
  const both = !!opts.beforeUrl;
  dlg.innerHTML = `
    <form method="dialog" class="compare-head">
      <strong>${esc(opts.title)}</strong>
      <button class="btn">${esc(t('close'))}</button>
    </form>
    <div class="compare-stage" style="--pos:50%">
      <img class="after" src="${opts.afterUrl}" alt="${esc(opts.afterLabel)}" />
      ${both ? `<img class="before" src="${opts.beforeUrl}" alt="${esc(opts.beforeLabel)}" />` : ''}
      ${both ? `<span class="tag l">${esc(opts.beforeLabel)}</span><span class="tag r">${esc(opts.afterLabel)}</span>` : ''}
      ${both ? '<span class="handle"></span>' : ''}
    </div>
    ${both ? `<input type="range" min="0" max="100" value="50" aria-label="${esc(t('compareSlider'))}" />` : `<p class="note">${esc(t('compareNoBefore'))}</p>`}
  `;
  const stage = dlg.querySelector<HTMLElement>('.compare-stage')!;
  dlg.querySelector<HTMLInputElement>('input[type=range]')?.addEventListener('input', (e) => {
    stage.style.setProperty('--pos', `${(e.target as HTMLInputElement).value}%`);
  });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.appendChild(dlg);
  dlg.showModal();
}

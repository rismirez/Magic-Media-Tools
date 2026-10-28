import { t } from '../i18n';
import { esc } from './format';
import { ico } from './icons';

export interface CompareAfter {
  url: string;
  label: string;
}

/**
 * Ventana con comparador antes/después. `after` puede tardar (vista previa generada al momento).
 * Cada lado es una capa opaca con su propia imagen: a la izquierda del divisor sólo se ve «antes» y a la
 * derecha sólo «después», sea cual sea el tamaño o la proporción de cada una.
 * Si no hay «antes» (p. ej. HEIC) muestra sólo el resultado. Libera las URL al cerrar.
 */
export function openCompare(opts: { title: string; beforeUrl: string | null; beforeLabel: string; after: Promise<CompareAfter>; onClose?: () => void }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'compare';
  dlg.innerHTML = `
    <form method="dialog" class="compare-head">
      <strong>${ico('compare', 20)}${esc(opts.title)}</strong>
      <button class="btn">${ico('x', 16)}${esc(t('close'))}</button>
    </form>
    <div class="compare-body"><p class="note loading">${ico('loader', 16)}${esc(t('comparePreparing'))}</p></div>
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
        <div class="compare-stage" style="--pos:50%" ${both ? `tabindex="0" role="slider" aria-label="${esc(t('compareSlider'))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"` : ''}>
          <div class="layer after"><img src="${after.url}" alt="${esc(after.label)}" draggable="false" /></div>
          ${both ? `<div class="layer before"><img src="${opts.beforeUrl}" alt="${esc(opts.beforeLabel)}" draggable="false" /></div>` : ''}
          ${both ? `<span class="tag l">${esc(opts.beforeLabel)}</span>` : ''}
          <span class="tag r">${esc(after.label)}</span>
          ${both ? `<span class="divider"><span class="knob">${ico('compare', 22)}</span></span>` : ''}
        </div>
        ${both ? '' : `<p class="note">${esc(t('compareNoBefore'))}</p>`}
      `;
      if (!both) return;
      const stage = body.querySelector<HTMLElement>('.compare-stage')!;
      const setPos = (pct: number) => {
        const v = Math.max(0, Math.min(100, pct));
        stage.style.setProperty('--pos', `${v}%`);
        stage.setAttribute('aria-valuenow', String(Math.round(v)));
      };
      const fromEvent = (e: PointerEvent) => {
        const r = stage.getBoundingClientRect();
        setPos(((e.clientX - r.left) / r.width) * 100);
      };
      stage.addEventListener('pointerdown', (e) => {
        stage.setPointerCapture(e.pointerId);
        stage.classList.add('dragging');
        fromEvent(e);
      });
      stage.addEventListener('pointermove', (e) => {
        if (stage.hasPointerCapture(e.pointerId)) fromEvent(e);
      });
      const end = (e: PointerEvent) => {
        stage.classList.remove('dragging');
        if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
      };
      stage.addEventListener('pointerup', end);
      stage.addEventListener('pointercancel', end);
      stage.addEventListener('keydown', (e) => {
        const cur = Number(stage.getAttribute('aria-valuenow'));
        const step = e.shiftKey ? 10 : 2;
        if (e.key === 'ArrowLeft') setPos(cur - step);
        else if (e.key === 'ArrowRight') setPos(cur + step);
        else if (e.key === 'Home') setPos(0);
        else if (e.key === 'End') setPos(100);
        else return;
        e.preventDefault();
      });
    },
    (err) => {
      body.innerHTML = `<p class="note">${esc(t('compareFailed'))}${err instanceof Error && err.message ? `: ${esc(err.message)}` : ''}</p>`;
    },
  );
}

import { t } from '../i18n';

const NAMES = [
  'anchor.tl', 'anchor.tc', 'anchor.tr',
  'anchor.ml', 'anchor.mc', 'anchor.mr',
  'anchor.bl', 'anchor.bc', 'anchor.br',
] as const;

export interface AnchorGrid {
  el: HTMLElement;
  set(index: number): void;
}

/** Selector de posición 3×3 (arriba/centro/abajo × izquierda/centro/derecha). */
export function anchorGrid(onChange: (index: number) => void): AnchorGrid {
  const el = document.createElement('div');
  el.className = 'anchor';
  el.setAttribute('role', 'radiogroup');
  el.innerHTML = NAMES.map(
    (n, i) => `<button type="button" role="radio" aria-checked="false" data-i="${i}" title="${t(n)}" aria-label="${t(n)}"><i></i></button>`,
  ).join('');

  const set = (index: number) => {
    el.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.i) === index)));
  };
  el.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-i]');
    if (!btn) return;
    const i = Number(btn.dataset.i);
    set(i);
    onChange(i);
  });
  return { el, set };
}

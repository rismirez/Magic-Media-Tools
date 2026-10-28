import { ico } from './icons';
import { esc } from './format';

/**
 * Sustituye los <select> por un desplegable propio. El <select> original sigue en el DOM (oculto) y es el que
 * se lee y escribe, así que el resto del código no cambia: al elegir se lanzan "input" y "change".
 * Opcional: data-icon="nombre" pinta un icono en el botón.
 */
export function enhanceSelects(root: ParentNode = document) {
  root.querySelectorAll<HTMLSelectElement>('select:not([data-dd])').forEach(enhance);
}

let openDd: { close: () => void } | null = null;
document.addEventListener('pointerdown', (e) => {
  if (openDd && !(e.target as HTMLElement).closest('.dd')) openDd.close();
});

function enhance(sel: HTMLSelectElement) {
  sel.dataset.dd = '1';
  const wrap = document.createElement('div');
  wrap.className = 'dd';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dd-btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  const label = sel.getAttribute('aria-label');
  if (label) btn.setAttribute('aria-label', label);
  const list = document.createElement('ul');
  list.className = 'dd-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;

  sel.before(wrap);
  wrap.append(btn, list, sel);
  sel.hidden = true;
  sel.tabIndex = -1;

  const icon = sel.dataset.icon ? ico(sel.dataset.icon, 16) : '';
  let active = -1;

  function paintButton() {
    const o = sel.options[sel.selectedIndex];
    btn.innerHTML = `${icon}<span class="dd-text">${esc(o?.textContent ?? '')}</span>${ico('chevron-down', 16)}`;
    btn.disabled = sel.disabled;
  }

  function paintList() {
    list.innerHTML = Array.from(sel.options)
      .map(
        (o, i) =>
          `<li role="option" class="dd-item" data-i="${i}" aria-selected="${i === sel.selectedIndex}"><span class="dd-check">${i === sel.selectedIndex ? ico('check', 14) : ''}</span><span>${esc(o.textContent ?? '')}</span></li>`,
      )
      .join('');
  }

  function setActive(i: number) {
    const items = list.querySelectorAll<HTMLElement>('.dd-item');
    if (!items.length) return;
    active = Math.max(0, Math.min(items.length - 1, i));
    items.forEach((el, n) => el.classList.toggle('active', n === active));
    items[active].scrollIntoView({ block: 'nearest' });
  }

  function open() {
    if (sel.disabled) return;
    openDd?.close();
    paintList();
    list.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    wrap.classList.add('open');
    // Si no cabe a la derecha, se abre alineado al borde derecho.
    wrap.classList.remove('right');
    if (list.getBoundingClientRect().right > window.innerWidth - 8) wrap.classList.add('right');
    setActive(sel.selectedIndex);
    openDd = { close };
  }

  function close() {
    list.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    wrap.classList.remove('open');
    if (openDd?.close === close) openDd = null;
  }

  function choose(i: number) {
    if (i < 0 || i >= sel.options.length) return;
    const changed = i !== sel.selectedIndex;
    sel.selectedIndex = i;
    paintButton();
    close();
    btn.focus();
    if (changed) {
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  btn.addEventListener('click', () => (list.hidden ? open() : close()));
  list.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('.dd-item');
    if (li) choose(Number(li.dataset.i));
  });
  list.addEventListener('pointermove', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('.dd-item');
    if (li) setActive(Number(li.dataset.i));
  });
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.hidden) open();
      else setActive(active + (e.key === 'ArrowDown' ? 1 : -1));
    } else if ((e.key === 'Enter' || e.key === ' ') && !list.hidden) {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape' && !list.hidden) {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') close();
  });

  // El resto del código asigna `select.value` y cambia las <option>: el desplegable se mantiene al día.
  const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!;
  Object.defineProperty(sel, 'value', {
    configurable: true,
    get() {
      return desc.get!.call(this);
    },
    set(v: string) {
      desc.set!.call(this, v);
      paintButton();
    },
  });
  new MutationObserver(() => {
    paintButton();
    if (!list.hidden) paintList();
  }).observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });

  paintButton();
}

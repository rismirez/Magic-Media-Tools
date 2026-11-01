/** Botón flotante de «Buy me a coffee» (sólo en la web: la app de escritorio no carga scripts externos). */
export function mountSupportWidget(): void {
  const s = document.createElement('script');
  s.src = 'https://cdnjs.buymeacoffee.com/1.0.0/widget.prod.min.js';
  s.async = true;
  s.dataset.name = 'BMC-Widget';
  s.dataset.cfasync = 'false';
  s.dataset.id = 'rismirez';
  s.dataset.description = 'Support me on Buy me a coffee!';
  s.dataset.message = '';
  s.dataset.color = '#BD5FFF';
  s.dataset.position = 'Right';
  s.dataset.x_margin = '18';
  s.dataset.y_margin = '18';
  // El widget se monta al recibir DOMContentLoaded, que ya pasó cuando lo añadimos desde el código.
  s.onload = () => window.dispatchEvent(new Event('DOMContentLoaded'));
  document.body.appendChild(s);
  trackActionBar();
}

/** Publica en `--bar-h` la altura de la barra de Convertir visible, para que el widget quede por encima y no la tape. */
function trackActionBar(): void {
  const update = () => {
    const h = Math.max(0, ...Array.from(document.querySelectorAll<HTMLElement>('.action-bar')).filter((b) => b.offsetParent !== null || getComputedStyle(b).position === 'fixed').map((b) => (b.hidden ? 0 : b.offsetHeight)));
    document.documentElement.style.setProperty('--bar-h', `${h}px`);
  };
  const ro = new ResizeObserver(update);
  document.querySelectorAll('.action-bar').forEach((b) => ro.observe(b));
  new MutationObserver(update).observe(document.querySelector('main') ?? document.body, { attributes: true, attributeFilter: ['hidden'], subtree: true });
  update();
}

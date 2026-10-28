/**
 * Fondo «mágico»: dos resplandores (primario y secundario) que siguen al cursor con distinto retraso,
 * más una deriva lenta cuando el cursor está quieto. Sólo mueve variables CSS (el dibujo lo hace .magic-bg).
 * Con «reducir movimiento» se queda fijo.
 */
export function mountMagicBackground() {
  const el = document.createElement('div');
  el.className = 'magic-bg';
  el.setAttribute('aria-hidden', 'true');
  document.body.prepend(el);

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const target = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.3 };
  const a = { ...target };
  const b = { ...target };
  let lastMove = 0;
  let running = false;

  const frame = (now: number) => {
    // Sin movimiento del ratón, el objetivo deriva despacio en una elipse para que el fondo siga vivo.
    if (now - lastMove > 2500) {
      const t = now / 4000;
      target.x = window.innerWidth * (0.5 + 0.28 * Math.cos(t));
      target.y = window.innerHeight * (0.4 + 0.22 * Math.sin(t * 1.3));
    }
    a.x += (target.x - a.x) * 0.14;
    a.y += (target.y - a.y) * 0.14;
    b.x += (target.x - b.x) * 0.05;
    b.y += (target.y - b.y) * 0.05;
    el.style.setProperty('--mx', `${a.x.toFixed(1)}px`);
    el.style.setProperty('--my', `${a.y.toFixed(1)}px`);
    el.style.setProperty('--mx2', `${(b.x - (b.x - window.innerWidth / 2) * 0.35).toFixed(1)}px`);
    el.style.setProperty('--my2', `${(b.y + 60).toFixed(1)}px`);
    if (running) requestAnimationFrame(frame);
  };

  const start = () => {
    if (running || reduce.matches) return;
    running = true;
    requestAnimationFrame(frame);
  };

  window.addEventListener(
    'pointermove',
    (e) => {
      target.x = e.clientX;
      target.y = e.clientY;
      lastMove = performance.now();
    },
    { passive: true },
  );
  // Con la pestaña oculta no se gasta CPU.
  document.addEventListener('visibilitychange', () => {
    running = false;
    if (!document.hidden) start();
  });
  reduce.addEventListener('change', () => {
    running = false;
    start();
  });
  el.style.setProperty('--mx', `${target.x}px`);
  el.style.setProperty('--my', `${target.y}px`);
  el.style.setProperty('--mx2', `${target.x}px`);
  el.style.setProperty('--my2', `${target.y}px`);
  start();
}

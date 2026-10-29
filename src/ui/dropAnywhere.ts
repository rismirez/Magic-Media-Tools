/**
 * Permite soltar archivos en cualquier parte de la ventana mientras `panel` está visible.
 * La zona de soltar (`zone`) se resalta mientras se arrastran archivos por encima de la app.
 */
export function dropAnywhere(panel: HTMLElement, zone: HTMLElement, onDrop: (dt: DataTransfer) => void): void {
  let depth = 0;
  const active = () => !panel.hidden && !document.querySelector('dialog[open]');
  const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
  const reset = () => {
    depth = 0;
    zone.classList.remove('over');
  };

  window.addEventListener('dragenter', (e) => {
    if (!active() || !hasFiles(e)) return;
    e.preventDefault();
    depth++;
    zone.classList.add('over');
  });
  window.addEventListener('dragover', (e) => {
    e.preventDefault(); // también evita que el navegador abra el archivo al soltarlo fuera
    if (active() && hasFiles(e)) zone.classList.add('over');
  });
  window.addEventListener('dragleave', (e) => {
    if (!active() || !hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) zone.classList.remove('over');
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const was = active() && hasFiles(e);
    reset();
    if (was && e.dataTransfer) onDrop(e.dataTransfer);
  });
  window.addEventListener('dragend', reset);
}

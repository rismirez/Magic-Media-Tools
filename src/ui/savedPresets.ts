/** Ajustes con nombre guardados en el navegador (por pestaña). */
export type SavedPresets = Record<string, unknown>;

export function loadPresets(key: string): SavedPresets {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function savePresets(key: string, value: SavedPresets) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* almacenamiento no disponible: se ignora */
  }
}

import { es, type Dict } from './es';
import { en } from './en';

export const LANGS = { es: 'Español', en: 'English' } as const;
export type Lang = keyof typeof LANGS;

const dicts: Record<Lang, Dict> = { es, en };
const LANG_KEY = 'media-compressor:lang';

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === 'es' || stored === 'en') return stored;
  } catch {
    /* almacenamiento no disponible */
  }
  return 'es';
}

let current: Lang = initialLang();

export type Key = keyof Dict;

export const getLang = () => current;

/** Guarda el idioma; la interfaz se recarga para aplicarlo. */
export function setLang(lang: Lang) {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* se aplicará sólo hasta cerrar la app */
  }
  current = lang;
}

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  const text = dicts[current][key] ?? es[key];
  // Sólo se sustituyen las variables recibidas: otros {…} (p. ej. plantillas de nombre) se dejan tal cual.
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

import { es, type Dict } from './es';

// Para añadir inglés: crear ./en.ts (export const en: Dict = {...}) y registrarlo aquí.
const dicts: Record<string, Dict> = { es };
let current = 'es';

export type Key = keyof Dict;

export function setLang(lang: string) {
  if (dicts[lang]) current = lang;
}

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  const text = dicts[current][key] ?? es[key];
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

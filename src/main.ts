import './style.css';
import { LANGS, getLang, setLang, t, type Lang } from './i18n';
import { mountImageTab } from './tabs/image';
import { mountVideoTab } from './tabs/video';
import { isDesktop } from './platform/sinks';
import { iconDownload } from './ui/icons';

/** Última versión publicada del instalador de Windows en GitHub Releases. */
const DOWNLOAD_URL = 'https://github.com/rismirez/Magic-Media-Tools/releases/latest';

type TabId = 'image' | 'video';

const TAB_KEY = 'media-compressor:tab';

const THEME_KEY = 'media-compressor:theme';
type Theme = 'auto' | 'light' | 'dark';

function applyTheme(theme: Theme) {
  if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = theme;
}

function storedTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* se usa el tema del sistema */
  }
  return 'auto';
}

applyTheme(storedTheme());
document.documentElement.lang = getLang();

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <header class="top">
    <img class="logo" src="${import.meta.env.BASE_URL}favicon.png" alt="" width="48" height="48" />
    <div class="titles">
      <h1>${t('appTitle')}</h1>
      <p>${t('appTagline')}</p>
    </div>
    <div class="top-tools">
      ${
        isDesktop()
          ? ''
          : `<div class="dl-wrap">
        <a class="btn dl" href="${DOWNLOAD_URL}" target="_blank" rel="noopener noreferrer" aria-describedby="dl-tip">${iconDownload}<span>${t('download')}</span></a>
        <span id="dl-tip" class="dl-tip" role="tooltip">${t('downloadTip')}</span>
      </div>`
      }
      <select id="sel-lang" aria-label="${t('language')}">
        ${(Object.keys(LANGS) as Lang[]).map((l) => `<option value="${l}"${l === getLang() ? ' selected' : ''}>${LANGS[l]}</option>`).join('')}
      </select>
      <select id="sel-theme" aria-label="${t('theme')}">
        ${(['auto', 'light', 'dark'] as const).map((m) => `<option value="${m}">${t(`theme.${m}` as const)}</option>`).join('')}
      </select>
    </div>
    <nav class="tabs" role="tablist">
      <button type="button" role="tab" id="tab-image" data-tab="image">${t('tab.image')}</button>
      <button type="button" role="tab" id="tab-video" data-tab="video">${t('tab.video')}</button>
    </nav>
  </header>
  <main>
    <div id="panel-image" role="tabpanel" aria-labelledby="tab-image"></div>
    <div id="panel-video" role="tabpanel" aria-labelledby="tab-video" hidden></div>
  </main>
`;

const panels: Record<TabId, HTMLElement> = {
  image: app.querySelector('#panel-image')!,
  video: app.querySelector('#panel-video')!,
};

mountImageTab(panels.image);
mountVideoTab(panels.video);

const selTheme = app.querySelector<HTMLSelectElement>('#sel-theme')!;
selTheme.value = storedTheme();
selTheme.addEventListener('change', () => {
  const theme = selTheme.value as Theme;
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* se aplica sólo en esta sesión */
  }
});

// Cambiar de idioma recarga la interfaz (los ajustes y la cola se pierden; los ajustes se conservan guardados).
app.querySelector<HTMLSelectElement>('#sel-lang')!.addEventListener('change', (e) => {
  setLang((e.target as HTMLSelectElement).value as Lang);
  location.reload();
});

function select(tab: TabId) {
  for (const id of Object.keys(panels) as TabId[]) {
    panels[id].hidden = id !== tab;
    const btn = app.querySelector<HTMLButtonElement>(`#tab-${id}`)!;
    btn.setAttribute('aria-selected', String(id === tab));
  }
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    /* almacenamiento no disponible */
  }
}

app.querySelector('.tabs')!.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-tab]');
  if (btn) select(btn.dataset.tab as TabId);
});

let initial: TabId = 'image';
try {
  if (localStorage.getItem(TAB_KEY) === 'video') initial = 'video';
} catch {
  /* se usa la pestaña por defecto */
}
select(initial);

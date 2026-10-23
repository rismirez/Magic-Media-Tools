import './style.css';
import { t } from './i18n';
import { mountImageTab } from './tabs/image';
import { mountVideoTab } from './tabs/video';

type TabId = 'image' | 'video';

const TAB_KEY = 'media-compressor:tab';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <header class="top">
    <img class="logo" src="${import.meta.env.BASE_URL}favicon.png" alt="" width="48" height="48" />
    <div class="titles">
      <h1>${t('appTitle')}</h1>
      <p>${t('appTagline')}</p>
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

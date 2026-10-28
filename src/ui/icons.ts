import { createIcon, type IconData, type IconElement } from '@animateicons/vanilla';
import { BadgeCheck } from '@animateicons/vanilla/lucide/badge-check';
import { Bookmark } from '@animateicons/vanilla/lucide/bookmark';
import { Camera } from '@animateicons/vanilla/lucide/camera';
import { Check } from '@animateicons/vanilla/lucide/check';
import { ChevronDown } from '@animateicons/vanilla/lucide/chevron-down';
import { Clapperboard } from '@animateicons/vanilla/lucide/clapperboard';
import { Crop } from '@animateicons/vanilla/lucide/crop';
import { Download } from '@animateicons/vanilla/lucide/download';
import { Droplet } from '@animateicons/vanilla/lucide/droplet';
import { Expand } from '@animateicons/vanilla/lucide/expand';
import { Feather } from '@animateicons/vanilla/lucide/feather';
import { FileImage } from '@animateicons/vanilla/lucide/file-image';
import { FolderOpen } from '@animateicons/vanilla/lucide/folder-open';
import { FolderPlus } from '@animateicons/vanilla/lucide/folder-plus';
import { Gauge } from '@animateicons/vanilla/lucide/gauge';
import { Gem } from '@animateicons/vanilla/lucide/gem';
import { Image } from '@animateicons/vanilla/lucide/image';
import { ImagePlus } from '@animateicons/vanilla/lucide/image-plus';
import { Languages } from '@animateicons/vanilla/lucide/languages';
import { Layers } from '@animateicons/vanilla/lucide/layers';
import { LoaderCircle } from '@animateicons/vanilla/lucide/loader-circle';
import { Monitor } from '@animateicons/vanilla/lucide/monitor';
import { PackageOpen } from '@animateicons/vanilla/lucide/package-open';
import { Repeat } from '@animateicons/vanilla/lucide/repeat';
import { RotateCcw } from '@animateicons/vanilla/lucide/rotate-ccw';
import { RotateCw } from '@animateicons/vanilla/lucide/rotate-cw';
import { Ruler } from '@animateicons/vanilla/lucide/ruler';
import { Save } from '@animateicons/vanilla/lucide/save';
import { Scan } from '@animateicons/vanilla/lucide/scan';
import { Scissors } from '@animateicons/vanilla/lucide/scissors';
import { Settings } from '@animateicons/vanilla/lucide/settings';
import { Shrink } from '@animateicons/vanilla/lucide/shrink';
import { Sparkles } from '@animateicons/vanilla/lucide/sparkles';
import { Stamp } from '@animateicons/vanilla/lucide/stamp';
import { SunMoon } from '@animateicons/vanilla/lucide/sun-moon';
import { Trash2 } from '@animateicons/vanilla/lucide/trash-2';
import { Type } from '@animateicons/vanilla/lucide/type';
import { Volume2 } from '@animateicons/vanilla/lucide/volume-2';
import { VolumeX } from '@animateicons/vanilla/lucide/volume-x';
import { WandSparkles } from '@animateicons/vanilla/lucide/wand-sparkles';
import { X } from '@animateicons/vanilla/lucide/x';
import { List } from '@animateicons/vanilla/lucide/list';
import { Film } from '@animateicons/vanilla/lucide/film';

/** Iconos propios con el mismo formato que animateicons (los que la librería no trae). */
const custom = (name: string, children: unknown[]): IconData =>
  ({
    name,
    library: 'lucide',
    tag: 'svg',
    attrs: {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    },
    children,
  }) as unknown as IconData;

const pivot = (x: number, y: number) => ({ transformBox: 'view-box', originX: `${x}px`, originY: `${y}px` });
const path = (d: string) => ({ tag: 'path', attrs: { d } });

const FlipH = custom('flip-horizontal', [
  {
    tag: 'g',
    normal: { scaleX: 1 },
    animate: { scaleX: [1, -1, 1], transition: { duration: 0.7, ease: 'easeInOut' } },
    style: pivot(12, 12),
    children: [
      path('M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3'),
      path('M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3'),
    ],
  },
  path('M12 20v2M12 14v2M12 8v2M12 2v2'),
]);

const FlipV = custom('flip-vertical', [
  {
    tag: 'g',
    normal: { scaleY: 1 },
    animate: { scaleY: [1, -1, 1], transition: { duration: 0.7, ease: 'easeInOut' } },
    style: pivot(12, 12),
    children: [
      path('M3 8V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3'),
      path('M3 16v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3'),
    ],
  },
  path('M2 12h2M8 12h2M14 12h2M20 12h2'),
]);

const Compare = custom('compare', [
  { tag: 'rect', attrs: { x: '3', y: '4', width: '18', height: '16', rx: '2' } },
  path('M12 4v16'),
  {
    tag: 'path',
    attrs: { d: 'M8 10l-2 2 2 2' },
    normal: { x: 0 },
    animate: { x: [0, -2, 0], transition: { duration: 0.5, ease: 'easeInOut' } },
  },
  {
    tag: 'path',
    attrs: { d: 'M16 10l2 2-2 2' },
    normal: { x: 0 },
    animate: { x: [0, 2, 0], transition: { duration: 0.5, ease: 'easeInOut' } },
  },
]);

const Ratio = custom('ratio', [
  {
    tag: 'rect',
    attrs: { x: '2', y: '6', width: '20', height: '12', rx: '2' },
    normal: { scale: 1 },
    animate: { scale: [1, 1.12, 0.94, 1], transition: { duration: 0.6, ease: 'easeInOut' } },
    style: pivot(12, 12),
  },
  path('M6 10V8h2M18 14v2h-2'),
]);

const REGISTRY: Record<string, IconData> = {
  'badge-check': BadgeCheck,
  bookmark: Bookmark,
  camera: Camera,
  check: Check,
  'chevron-down': ChevronDown,
  clapperboard: Clapperboard,
  compare: Compare,
  crop: Crop,
  download: Download,
  droplet: Droplet,
  expand: Expand,
  feather: Feather,
  'file-image': FileImage,
  film: Film,
  'flip-h': FlipH,
  'flip-v': FlipV,
  'folder-open': FolderOpen,
  'folder-plus': FolderPlus,
  gauge: Gauge,
  gem: Gem,
  image: Image,
  'image-plus': ImagePlus,
  languages: Languages,
  layers: Layers,
  list: List,
  loader: LoaderCircle,
  monitor: Monitor,
  'package-open': PackageOpen,
  ratio: Ratio,
  repeat: Repeat,
  'rotate-ccw': RotateCcw,
  'rotate-cw': RotateCw,
  ruler: Ruler,
  save: Save,
  scan: Scan,
  scissors: Scissors,
  settings: Settings,
  shrink: Shrink,
  sparkles: Sparkles,
  stamp: Stamp,
  'sun-moon': SunMoon,
  trash: Trash2,
  type: Type,
  'volume-on': Volume2,
  'volume-off': VolumeX,
  wand: WandSparkles,
  x: X,
};

export type IconName = keyof typeof REGISTRY;

/** Marcador de icono para plantillas HTML: `hydrateIcons` lo sustituye por el SVG animado. */
export const ico = (name: IconName | string, size = 18) => `<i class="ico" data-ico="${name}" data-size="${size}" aria-hidden="true"></i>`;

/** Elemento ya montado (para código que crea DOM a mano). */
export function iconEl(name: string, size = 18): HTMLElement {
  const host = document.createElement('i');
  host.className = 'ico';
  host.dataset.ico = name;
  host.dataset.size = String(size);
  hydrate(host);
  return host;
}

const HOVER_HOSTS = 'button, a, label, legend, h2, .dd-item, .tab';

function hydrate(el: HTMLElement) {
  const data = REGISTRY[el.dataset.ico ?? ''];
  el.dataset.hydrated = '1';
  if (!data) return;
  // La animación la dispara el elemento interactivo que lo contiene (botón, etiqueta…), no sólo el icono.
  let icon: IconElement;
  try {
    icon = createIcon(data, { size: Number(el.dataset.size) || 18, isAnimated: false });
  } catch {
    return;
  }
  el.replaceChildren(icon);
  const host = el.closest<HTMLElement>(HOVER_HOSTS) ?? el;
  const start = () => icon.startAnimation?.();
  const stop = () => icon.stopAnimation?.();
  host.addEventListener('pointerenter', start);
  host.addEventListener('pointerleave', stop);
  host.addEventListener('focusin', start);
  host.addEventListener('focusout', stop);
}

export function hydrateIcons(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('i.ico[data-ico]:not([data-hydrated])').forEach(hydrate);
}

/** Hidrata también lo que se pinte después (filas de la cola, botones que cambian de texto…). */
export function observeIcons(root: HTMLElement = document.body) {
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      hydrateIcons(root);
    });
  }).observe(root, { childList: true, subtree: true });
  hydrateIcons(root);
}

/* ---- Iconos grandes de la zona de soltar: se «dibujan» al pasar el ratón (ver .draw en el CSS). ---- */

const draw = (inner: string) =>
  `<svg class="icon-lg draw" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;

const back = `<path pathLength="1" style="--i:0" d="M20 15 L47 10.5 A5 5 0 0 1 53 14.5 L57 35"/>`;
const plus = `<circle pathLength="1" style="--i:5" cx="47" cy="47" r="11" fill="var(--panel)"/><path pathLength="1" style="--i:6" d="M47 41.5v11M41.5 47h11"/>`;

/** Fotos apiladas con un «+»: añadir imágenes. */
export const iconImageAdd = draw(
  `${back}<rect pathLength="1" style="--i:1" x="6" y="18" width="40" height="34" rx="6"/>
   <circle pathLength="1" style="--i:2" cx="17" cy="29" r="3.5"/>
   <path pathLength="1" style="--i:3" d="M6 45 L19 35 L28 43 L35 37 L46 46"/>${plus}`,
);

/** Fotograma con «play» y un «+»: añadir vídeos. */
export const iconVideoAdd = draw(
  `${back}<rect pathLength="1" style="--i:1" x="6" y="18" width="40" height="34" rx="6"/>
   <path pathLength="1" style="--i:3" d="M20 27.5 L33 35 L20 42.5 Z"/>
   <path pathLength="1" style="--i:2" d="M12 24h2M12 46h2M38 24h2M38 46h2"/>${plus}`,
);

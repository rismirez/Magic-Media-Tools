const base = (cls: string, vb: number, body: string, strokeWidth = 2) =>
  `<svg class="${cls}" viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

/** Fotos apiladas con un «+»: arrastrar/añadir imágenes. */
export const iconImageAdd = base(
  'icon-lg',
  64,
  `<path d="M20 15 L47 10.5 A5 5 0 0 1 53 14.5 L57 35"/>
   <rect x="6" y="18" width="40" height="34" rx="6"/>
   <circle cx="17" cy="29" r="3.5"/>
   <path d="M6 45 L19 35 L28 43 L35 37 L46 46"/>
   <circle cx="47" cy="47" r="11" fill="var(--panel)"/>
   <path d="M47 41.5v11M41.5 47h11"/>`,
  3,
);

/** Fotograma con «play» y un «+»: añadir vídeos. */
export const iconVideoAdd = base(
  'icon-lg',
  64,
  `<path d="M20 15 L47 10.5 A5 5 0 0 1 53 14.5 L57 35"/>
   <rect x="6" y="18" width="40" height="34" rx="6"/>
   <path d="M20 27.5 L33 35 L20 42.5 Z"/>
   <circle cx="47" cy="47" r="11" fill="var(--panel)"/>
   <path d="M47 41.5v11M41.5 47h11"/>`,
  3,
);

export const iconWand = base(
  'icon',
  24,
  `<path d="M4 20 L14 10"/><path d="M15 6v6M12 9h6"/><path d="M8 3v3M6.5 4.5h3"/><path d="M19 15v4M17 17h4"/>`,
);

export const iconSpinner = base('icon spin', 24, `<path d="M21 12a9 9 0 1 1-6.2-8.56"/>`);

export const iconDownload = base('icon', 24, `<path d="M12 3v12M7 11l5 5 5-5M5 21h14"/>`);

export const iconCompare = base('icon', 24, `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16M8 10l-2 2 2 2M16 10l2 2-2 2"/>`);

export const iconImage = base('icon', 24, `<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M3 17l5-4 4 3 3-2.5 6 4.5"/>`);

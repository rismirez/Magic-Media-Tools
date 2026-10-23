/** Diccionario base. El resto de idiomas deben cumplir el mismo tipo (ver ./index.ts). */
export const es = {
  appTitle: 'WebP Compressor',
  appTagline: 'Convierte y comprime imágenes por lotes. Todo ocurre en tu equipo: nada se sube a ningún servidor.',

  dropTitle: 'Arrastra imágenes o carpetas aquí',
  dropHint: 'WebP, AVIF, JPEG, PNG, HEIC y TIFF',
  addFiles: 'Añadir imágenes',
  addFolder: 'Añadir carpeta',

  settings: 'Ajustes de salida',
  format: 'Formato de salida',
  quality: 'Calidad',
  resize: 'Redimensionar',
  resizeHint: 'Se ajusta al recuadro manteniendo la proporción. Nunca se amplía. Deja en blanco para no cambiar el tamaño.',
  maxWidth: 'Ancho máx. (px)',
  maxHeight: 'Alto máx. (px)',
  noLimit: 'Sin límite',
  destination: 'Destino',
  destFolder: 'Carpeta',
  destZip: 'Archivo ZIP',
  destHint: 'Los originales nunca se modifican: cada resultado se guarda como un archivo nuevo.',

  'preset.keep.name': 'Mantener calidad original',
  'preset.keep.desc': 'Calidad casi idéntica. Ahorro bajo (5–15 %).',
  'preset.lossless.name': 'Optimización sin pérdida',
  'preset.lossless.desc': 'Idéntico píxel a píxel. Ahorro moderado (15–35 %).',
  'preset.balanced.name': 'Equilibrado',
  'preset.balanced.desc': 'Compresión adaptativa casi imperceptible. Ahorro alto (40–70 %).',
  'preset.smallest.name': 'Más pequeño',
  'preset.smallest.desc': 'Cuantización agresiva. Ahorro muy alto (> 75 %), con artefactos leves.',

  'note.png': 'PNG siempre es sin pérdida: el perfil sólo cambia el esfuerzo de optimización.',
  'note.jpeg': 'JPEG no admite transparencia (se rellena de blanco) ni modo sin pérdida real: «sin pérdida» usa calidad 100.',
  'note.avif': 'AVIF comprime más pero tarda más en procesarse.',

  queue: 'Cola',
  queueEmpty: 'Todavía no hay imágenes. Añade algunas para empezar.',
  colName: 'Archivo',
  colSize: 'Original',
  colResult: 'Resultado',
  colSaved: 'Ahorro',
  colStatus: 'Estado',

  'status.pending': 'En espera',
  'status.processing': 'Procesando…',
  'status.done': 'Listo',
  'status.error': 'Error',
  'status.skipped': 'No compatible',

  convert: 'Convertir',
  converting: 'Convirtiendo…',
  cancel: 'Cancelar',
  clear: 'Vaciar cola',
  openOutput: 'Abrir carpeta de destino',

  summary: '{done} de {total} imágenes · {before} → {after} ({saved} de ahorro)',
  summaryIdle: '{total} imágenes en cola · {before}',
  finishedFolder: 'Guardado en: {where}',
  finishedZip: 'ZIP descargado: {where}',
  cancelled: 'Conversión cancelada.',
  errNoSink: 'No se eligió destino.',
  errUnsupported: 'Formato no compatible',
  errGeneric: 'No se pudo convertir',
  clickToRemove: 'Quitar de la cola',
} as const;

export type Dict = { [K in keyof typeof es]: string };

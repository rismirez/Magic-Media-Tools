export interface Source {
  file: File;
  /** Ruta relativa con "/" (conserva la estructura de carpetas). */
  relPath: string;
}

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
};

export const ACCEPT = Object.keys(EXT_MIME)
  .map((e) => `.${e}`)
  .join(',');

const extOf = (name: string) => name.slice(name.lastIndexOf('.') + 1).toLowerCase();

export const isSupported = (name: string) => extOf(name) in EXT_MIME;
export const isHeic = (name: string) => ['heic', 'heif'].includes(extOf(name));
export const mimeFor = (name: string) => EXT_MIME[extOf(name)] ?? 'application/octet-stream';

/** Lee el archivo; HEIC/HEIF se decodifica a PNG (sin pérdida) porque el navegador no lo soporta. */
export async function readForConversion(file: File): Promise<{ buffer: ArrayBuffer; mime: string }> {
  if (isHeic(file.name)) {
    const { heicTo } = await import('heic-to');
    const png = await heicTo({ blob: file, type: 'image/png' });
    return { buffer: await png.arrayBuffer(), mime: 'image/png' };
  }
  return { buffer: await file.arrayBuffer(), mime: mimeFor(file.name) };
}

/** Archivos elegidos con <input type="file"> (con o sin webkitdirectory). */
export function fromInput(files: FileList): Source[] {
  return Array.from(files).map((file) => ({
    file,
    relPath: (file.webkitRelativePath || file.name).replace(/\\/g, '/'),
  }));
}

/** Archivos y carpetas soltados (recorre carpetas con webkitGetAsEntry). */
export async function fromDrop(dt: DataTransfer): Promise<Source[]> {
  const entries = Array.from(dt.items)
    .map((i) => i.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e);

  if (!entries.length) return fromInput(dt.files);

  const out: Source[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ file, relPath: prefix + file.name });
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries devuelve por tandas (~100): hay que repetir hasta que venga vacío.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
      }
    }
  };
  for (const e of entries) await walk(e, '');
  return out;
}

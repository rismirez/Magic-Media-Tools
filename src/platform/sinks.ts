import JSZip from 'jszip';

/** Destino de los archivos convertidos. Nunca sobrescribe: si el nombre existe, añade un sufijo. */
export interface Sink {
  /** Texto para mostrar al terminar (ruta o nombre del ZIP). */
  readonly label: string;
  write(relPath: string, data: Uint8Array): Promise<void>;
  finish(): Promise<void>;
}

export type SinkKind = 'folder' | 'zip';

export const isDesktop = () => !!window.desktop;
export const canPickFolder = () => isDesktop() || typeof window.showDirectoryPicker === 'function';

function withSuffix(path: string, n: number) {
  const dot = path.lastIndexOf('.');
  const slash = path.lastIndexOf('/');
  if (dot <= slash) return `${path}-${n}`;
  return `${path.slice(0, dot)}-${n}${path.slice(dot)}`;
}

class ElectronSink implements Sink {
  constructor(readonly label: string) {}
  async write(relPath: string, data: Uint8Array) {
    await window.desktop!.writeFile(relPath, data);
  }
  async finish() {}
}

class DirectorySink implements Sink {
  private used = new Set<string>();
  constructor(
    private root: FileSystemDirectoryHandle,
    readonly label: string,
  ) {}

  private async dirFor(parts: string[]) {
    let dir = this.root;
    for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
    return dir;
  }

  private async exists(dir: FileSystemDirectoryHandle, name: string) {
    try {
      await dir.getFileHandle(name);
      return true;
    } catch {
      return false;
    }
  }

  async write(relPath: string, data: Uint8Array) {
    let path = relPath;
    const parts = () => path.split('/');
    let n = 0;
    let dir = await this.dirFor(parts().slice(0, -1));
    while (this.used.has(path) || (await this.exists(dir, parts().at(-1)!))) {
      path = withSuffix(relPath, ++n);
    }
    this.used.add(path);
    dir = await this.dirFor(parts().slice(0, -1));
    const handle = await dir.getFileHandle(parts().at(-1)!, { create: true });
    const w = await handle.createWritable();
    await w.write(data as unknown as BufferSource);
    await w.close();
  }
  async finish() {}
}

class ZipSink implements Sink {
  private zip = new JSZip();
  private used = new Set<string>();
  readonly label: string;
  constructor() {
    this.label = `magic-media-tools-${new Date().toISOString().slice(0, 10)}.zip`;
  }
  async write(relPath: string, data: Uint8Array) {
    let path = relPath;
    let n = 0;
    while (this.used.has(path)) path = withSuffix(relPath, ++n);
    this.used.add(path);
    this.zip.file(path, data, { binary: true });
  }
  async finish() {
    // Las imágenes ya están comprimidas: STORE evita gastar CPU sin ganar tamaño.
    const blob = await this.zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.label;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/** Pide el destino al usuario. Devuelve null si cancela. */
export async function createSink(kind: SinkKind): Promise<Sink | null> {
  if (isDesktop()) {
    const dir = await window.desktop!.chooseOutputDir();
    return dir ? new ElectronSink(dir) : null;
  }
  if (kind === 'folder' && window.showDirectoryPicker) {
    try {
      const root = await window.showDirectoryPicker({ mode: 'readwrite' });
      return new DirectorySink(root, root.name);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null;
      throw e;
    }
  }
  return new ZipSink();
}

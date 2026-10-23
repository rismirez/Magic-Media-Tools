/// <reference types="vite/client" />

interface DesktopVideoOptions {
  kind: 'video' | 'gif' | 'webp' | 'frame';
  [key: string]: unknown;
}

interface DesktopApi {
  platform: string;
  /** Pide una carpeta de destino. Devuelve su ruta o null si se cancela. */
  chooseOutputDir(): Promise<string | null>;
  /** Escribe dentro de la carpeta elegida. Devuelve la ruta relativa final (sin sobrescribir). */
  writeFile(relPath: string, data: Uint8Array): Promise<string>;
  openOutput(): Promise<void>;
  /** ffmpeg incluido en la app. */
  hasFfmpeg: boolean;
  getPathForFile(file: File): string;
  videoRun(id: number, inputPath: string, relOut: string, options: DesktopVideoOptions): Promise<{ relPath: string; size: number }>;
  videoCancel(id: number): Promise<void>;
  onVideoProgress(cb: (p: { id: number; ratio: number }) => void): () => void;
}

interface Window {
  desktop?: DesktopApi;
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}

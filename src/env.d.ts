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
  videoRun(
    id: number,
    inputPath: string,
    relOut: string,
    options: DesktopVideoOptions,
    /** PNG ya dibujado (con opacidad), posición 3×3 y % del ancho del vídeo. */
    watermark?: { png: Uint8Array; position: number; widthPct: number } | null,
  ): Promise<{ relPath: string; size: number }>;
  videoCancel(id: number): Promise<void>;
  /** Medidas del vídeo de entrada (0 si no se pudieron leer). */
  videoProbe(inputPath: string): Promise<{ width: number; height: number }>;
  onVideoProgress(cb: (p: { id: number; ratio: number }) => void): () => void;
}

interface Window {
  desktop?: DesktopApi;
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}

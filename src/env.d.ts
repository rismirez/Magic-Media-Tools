/// <reference types="vite/client" />

interface DesktopApi {
  platform: string;
  /** Pide una carpeta de destino. Devuelve su ruta o null si se cancela. */
  chooseOutputDir(): Promise<string | null>;
  /** Escribe dentro de la carpeta elegida. Devuelve la ruta relativa final (sin sobrescribir). */
  writeFile(relPath: string, data: Uint8Array): Promise<string>;
  openOutput(): Promise<void>;
}

interface Window {
  desktop?: DesktopApi;
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
}

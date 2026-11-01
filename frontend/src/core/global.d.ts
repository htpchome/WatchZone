declare const __WATCHZONE_VERSION__: string;
declare const __WATCHZONE_BUILD__: string;

interface Window {
  watchZone?: Readonly<{
    activeCardVersion: string | null;
    build: string;
    loadedAt: string;
    version: string;
  }>;
  customCards?: Array<{
    type: string;
    name: string;
    description?: string;
    preview?: boolean;
    documentationURL?: string;
  }>;
}

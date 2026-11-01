declare const __WATCHZONE_VERSION__: string;
declare const __WATCHZONE_BUILD__: string;

interface Window {
  customCards?: Array<{
    type: string;
    name: string;
    description?: string;
    preview?: boolean;
    documentationURL?: string;
  }>;
}

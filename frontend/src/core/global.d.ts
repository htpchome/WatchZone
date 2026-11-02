declare const __APP_VERSION__: string;
declare const __APP_BUILD__: string;

interface Window {
  customCards?: Array<{
    type: string;
    name: string;
    description?: string;
    preview?: boolean;
    documentationURL?: string;
  }>;
}

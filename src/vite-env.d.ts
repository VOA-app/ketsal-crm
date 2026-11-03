/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;

declare module '*.svg?raw' {
  const content: string;
  export default content;
}

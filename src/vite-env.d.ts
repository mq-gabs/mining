/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Feature flag overrides, e.g. "-ads". See `src/flags.ts`. */
  readonly VITE_FLAGS?: string;
}

declare const __BUILD__: string | undefined;

/** Which build this is, e.g. "PR #9 · b4054f8". Filled in by vite.config.ts. */
export const BUILD_LABEL: string = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';

import { defineConfig } from 'vitest/config';

// `base: './'` keeps asset paths relative so the build can be dropped onto
// itch.io or GitHub Pages without changes.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
  test: { include: ['tests/**/*.test.ts'] },
});

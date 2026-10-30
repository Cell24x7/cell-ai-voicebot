import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// https://vite.dev/config/ · https://vitest.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // pre-bundle the dependencies of lazy screens at start-up: a dependency found on first
  // use makes the dev server reload the page (lost dialogs / state in E2E runs)
  optimizeDeps: {
    entries: ['index.html', 'src/**/*.tsx', '!src/**/*.test.tsx', '!src/test/**'],
  },
  server: {
    port: 3100,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:5100', changeOrigin: true },
      '/ws': { target: 'ws://localhost:5100', ws: true },
    },
  },
  preview: {
    port: 3101,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Long user-flow tests take ~1 s alone but can pass 5 s on a busy machine
    // under coverage (Phase 4: seen with load average > 10).
    testTimeout: 15_000,
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**'],
      // main.tsx only mounts <App /> into the DOM (App itself is tested).
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/**/README.md',
        'src/vite-env.d.ts',
        'src/main.tsx',
      ],
      // Gate = measured coverage rounded down to the nearest 5, never lowered — CI fails
      // below it. Phase 4 sign-off measured 95.77 / 91.09 / 92.77 / 96.75 (gate unchanged).
      thresholds: { statements: 95, branches: 90, functions: 90, lines: 95 },
    },
  },
});

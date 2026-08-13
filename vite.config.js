import {resolve} from 'node:path';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  server: {
    allowedHosts: true,
  },
  build: {
    // Magenta/TensorFlow is an opt-in lazy chunk loaded by the ML button.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        vae: resolve(import.meta.dirname, 'vae/index.html'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.js'],
    exclude: ['tests/**/*.browser.test.js'],
    environment: 'node',
  },
});

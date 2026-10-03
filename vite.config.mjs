import { defineConfig } from 'vite';

// dist/abap2ui5-wc.js: the ESM bundle (registers <abap2ui5-app>); icons and
// extra themes are split into chunks next to it and load on demand.
// dist/index.html: the standalone page (copied by scripts/report-size.mjs).
export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    minify: true,
    sourcemap: true,
    lib: {
      entry: 'src/index.js',
      formats: ['es'],
      fileName: () => 'abap2ui5-wc.js',
    },
    rollupOptions: {
      output: { chunkFileNames: 'chunks/[name]-[hash].js' },
    },
  },
});

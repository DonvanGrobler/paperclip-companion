import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/main',
    emptyOutDir: true,
    target: 'node24',
    lib: {
      entry: { index: 'src/main/index.ts', preload: 'src/preload/index.ts' },
      formats: ['cjs'],
      fileName: (_format, entryName) => `${entryName}.cjs`,
    },
    rollupOptions: { external: [/^node:/, 'electron'] },
  },
});

import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/main',
    emptyOutDir: true,
    target: 'node24',
    lib: {
      entry: 'src/main/index.ts',
      formats: ['cjs'],
      fileName: () => 'index.cjs',
    },
    rollupOptions: { external: [/^node:/, 'electron'] },
  },
});

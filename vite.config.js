import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: {
    watch: {
      ignored: [
        '**/release/**',
        '**/release-source/**',
        '**/dist/**',
        '**/.voice-runtime/**',
        '**/recordings/**',
      ],
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
});

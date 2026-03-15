import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: '/run-sheep-run/',
  plugins: [
    glsl({
      include: ['**/*.glsl', '**/*.vert', '**/*.frag', '**/*.vs', '**/*.fs'],
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true, // expose to local network for mobile testing
  },
});

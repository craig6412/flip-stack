import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
  },
  server: {
    host: true, // allow phone on same LAN to test motion (use HTTPS tunnel for DeviceMotion in production)
    port: 5173,
  },
});

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => ({
  build: {
    outDir: mode === 'native' ? 'dist-native' : 'dist',
    // WebKit retains failed modulepreload responses across reloads. Load optional
    // radar scripts through import() so a temporary download failure can recover.
    modulePreload: { resolveDependencies: (_filename, dependencies) => dependencies.filter(path => !/radar-(?:map|vendor|worker)-.*\.js$/.test(path)) },
    rollupOptions: { output: {
      chunkFileNames: chunk => `assets/${chunk.name === 'RadarMap' ? 'radar-map' : chunk.name}-[hash].js`,
      assetFileNames: asset => `assets/${asset.names?.some(name => /RadarMap|radar-map/.test(name)) ? 'radar-map' : '[name]'}-[hash][extname]`,
      manualChunks: id => id.includes('/node_modules/maplibre-gl/') || id.includes('/node_modules/@maplibre/') ? 'radar-vendor' : undefined,
    } },
  },
  worker: { format: 'es', rollupOptions: { output: { entryFileNames: 'assets/radar-worker-[hash].js', chunkFileNames: 'assets/radar-worker-[name]-[hash].js' } } },
  resolve: { alias: mode === 'native' ? [{
    find: 'virtual:pwa-register/react', replacement: fileURLToPath(new URL('./src/lib/pwa-native.ts', import.meta.url)),
  }] : [] },
  plugins: [
    react(),
    ...(mode === 'native' ? [] : [VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'art/*.webp', 'radar/*-license.txt'],
      manifest: {
        id: '/',
        name: '8-Bit Weather',
        short_name: '8-Bit Weather',
        description: 'Your weather, in a little pixel world.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#fff7e8',
        theme_color: '#fff7e8',
        lang: 'en',
        categories: ['weather', 'utilities'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        globIgnores: ['**/radar-map-*', '**/radar-vendor-*', '**/radar-worker-*'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        cleanupOutdatedCaches: true,
      },
    })]),
  ],
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], setupFiles: ['./src/test/setup.ts'], restoreMocks: true },
}));

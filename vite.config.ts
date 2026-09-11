import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => ({
  build: { outDir: mode === 'native' ? 'dist-native' : 'dist' },
  resolve: { alias: mode === 'native' ? [{
    find: 'virtual:pwa-register/react', replacement: fileURLToPath(new URL('./src/lib/pwa-native.ts', import.meta.url)),
  }] : [] },
  plugins: [
    react(),
    ...(mode === 'native' ? [] : [VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'art/*.webp'],
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
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api(?:\/|$)/],
        cleanupOutdatedCaches: true,
      },
    })]),
  ],
  test: { environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'], setupFiles: ['./src/test/setup.ts'], restoreMocks: true },
}));

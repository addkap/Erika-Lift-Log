import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { SW_CACHE_ID } from './src/appIdentity.ts';

// GitHub Pages serves the site from a sub-path like /lift-log/. The deploy workflow sets VITE_BASE for that.
// Locally (and on hosts that give the site its own address) it stays "/".
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    // Makes the site installable and lets it work with no internet:
    // the service worker saves every app file on first visit and serves them from the phone afterwards.
    VitePWA({
      registerType: 'autoUpdate', // new versions install themselves; the next open uses them
      includeAssets: ['icons/apple-touch-icon.png'],
      manifest: {
        name: 'Lift Log',
        short_name: 'Lift Log',
        description: 'Simple workout and exercise log',
        display: 'standalone', // opens full-screen, no browser bars
        orientation: 'portrait',
        start_url: base,
        scope: base,
        background_color: '#e6f8f6',
        theme_color: '#034078',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        cacheId: SW_CACHE_ID, // this app's offline cache is named after it, never mixed with Lift Log's
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest}'],
        navigateFallback: 'index.html', // any page address opens the app, even offline
      },
    }),
  ],
  test: { include: ['src/**/*.test.ts'] },
});

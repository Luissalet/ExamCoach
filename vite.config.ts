import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { initResourcesPlugin } from './vite-plugin-init-resources'

// Base URL configurable: se puede sobreescribir con la variable de entorno VITE_BASE_URL.
// Útil para forks o despliegues en rutas distintas a /ExamCoach/.
// En GitHub Actions se puede pasar: VITE_BASE_URL=/${{ github.event.repository.name }}/
const BASE_URL = process.env.VITE_BASE_URL ?? '/ExamCoach/'

export default defineConfig({
  plugins: [
    react(),
    initResourcesPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB — bundle includes pdfjs
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Cachea recursos estáticos (PDFs, imágenes) de cualquier GitHub Pages
            urlPattern: /^https:\/\/[^/]+\.github\.io\/.*\/resources\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'resources-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Cachea datos JSON (banco global) con NetworkFirst para tener siempre lo más reciente
            urlPattern: /^https:\/\/[^/]+\.github\.io\/.*\/data\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'data-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 24 * 60 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-style',
              expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfont',
              expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
        ],
      },
      manifest: {
        name: 'ExamCoach',
        short_name: 'ExamCoach',
        description: 'Aplicación colaborativa de estudio para preparar exámenes universitarios',
        theme_color: '#0a0907',
        background_color: '#0a0907',
        display: 'standalone',
        orientation: 'any',
        scope: BASE_URL,
        start_url: BASE_URL,
        lang: 'es',
        categories: ['education'],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  base: BASE_URL,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['pdfjs-dist'],
  },
  worker: {
    format: 'es',
  },
})

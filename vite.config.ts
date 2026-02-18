import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { initResourcesPlugin } from './vite-plugin-init-resources'

export default defineConfig({
  plugins: [
    react(),
    initResourcesPlugin(),
  ],
  base: './',
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

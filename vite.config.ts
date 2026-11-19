import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const apiTarget = `http://127.0.0.1:${process.env.API_PORT || 3301}`

// Kept in built JS/CSS, never rendered: origin marker for distributed copies.
const COPYRIGHT_BANNER =
  '/*! DoPrint Designer | Copyright © 2025-2026 eonsee | https://doprint.top | Apache-2.0 | doprint-designer-f9900b51 */'

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: { banner: COPYRIGHT_BANNER },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: apiTarget },
    },
  },
  preview: {
    proxy: {
      '/api': { target: apiTarget },
    },
  },
})

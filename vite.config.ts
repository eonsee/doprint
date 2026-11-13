import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const apiTarget = `http://127.0.0.1:${process.env.API_PORT || 3301}`

export default defineConfig({
  plugins: [vue()],
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

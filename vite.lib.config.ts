import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Vue 3 build of the component library. Consumers import
// `doprint-designer/vue3` and `doprint-designer/vue3/style.css`.
export default defineConfig({
  plugins: [vue()],
  build: {
    outDir: 'dist-lib/vue3',
    emptyOutDir: true,
    lib: {
      entry: fileURLToPath(new URL('./src/lib.ts', import.meta.url)),
      name: 'DoPrintDesigner',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.mjs' : 'index.cjs'),
    },
    rollupOptions: {
      external: ['vue', 'fabric', 'qrcode', 'jsbarcode', 'pdf-lib'],
      output: {
        globals: { vue: 'Vue' },
      },
    },
  },
})

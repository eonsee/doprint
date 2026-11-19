import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue2 from '@vitejs/plugin-vue2'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, '../..')

// Vue 2.7 build of the component library. The build lives in its own package
// so `@vitejs/plugin-vue2` resolves Vue 2.7's compiler instead of the Vue 3
// compiler used by the demo app. Consumers import `doprint-designer/vue2`.
export default defineConfig({
  root: here,
  plugins: [vue2()],
  resolve: {
    alias: [
      {
        find: 'lucide-vue-next',
        replacement: path.resolve(here, 'node_modules/lucide-vue'),
      },
    ],
  },
  build: {
    outDir: path.resolve(projectRoot, 'dist-lib/vue2'),
    emptyOutDir: true,
    lib: {
      entry: path.resolve(projectRoot, 'src/lib.ts'),
      name: 'DoPrintDesigner',
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'index.mjs' : 'index.cjs'),
    },
    rollupOptions: {
      external: ['vue', 'fabric', 'qrcode', 'jsbarcode', 'pdf-lib'],
      output: {
        globals: { vue: 'Vue' },
        banner:
          '/*! DoPrint Designer | Copyright © 2025-2026 eonsee | https://doprint.top | Apache-2.0 | doprint-designer-f9900b51 */',
      },
    },
  },
})

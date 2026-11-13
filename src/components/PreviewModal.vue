<script setup lang="ts">
import { Download, FileText, X } from 'lucide-vue-next'
import { useDesigner } from '../designer/context'

const props = defineProps<{
  open: boolean
  mode: 'vector' | 'pdf'
  svg: string
  pdfUrl: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const designer = useDesigner()
const { templateName, page, dataFields } = designer

function fileName(ext: string) {
  const name = (templateName.value || 'template').replace(/[\\/:*?"<>|]+/g, '-')
  return `${name}.${ext}`
}

function downloadPdf() {
  if (!props.pdfUrl) return
  const a = document.createElement('a')
  a.href = props.pdfUrl
  a.download = fileName('pdf')
  a.click()
}

function downloadSvg() {
  if (!props.svg) return
  const blob = new Blob([props.svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName('svg')
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="preview-mask" data-modal @click.self="emit('close')">
      <div class="preview-dialog">
        <div class="preview-head">
          <div>
            <strong>{{ templateName }}</strong>
            <span>
              {{ page.width }} × {{ page.height }} mm ·
              {{ mode === 'pdf' ? 'PDF 预览' : '矢量预览' }}
              <template v-if="dataFields.length">
                · 已应用 {{ dataFields.length }} 个示例字段
              </template>
            </span>
          </div>
          <div class="preview-actions">
            <button
              v-if="mode === 'pdf'"
              class="btn ghost"
              :disabled="!pdfUrl"
              @click="downloadPdf"
            >
              <Download :size="15" />
              下载 PDF
            </button>
            <button
              v-else
              class="btn ghost"
              :disabled="!svg"
              @click="downloadSvg"
            >
              <FileText :size="15" />
              下载 SVG
            </button>
            <button class="icon-btn" title="关闭" @click="emit('close')">
              <X :size="17" />
            </button>
          </div>
        </div>

        <template v-if="mode === 'vector'">
          <div v-if="svg" class="preview-stage" v-html="svg"></div>
          <div v-else class="preview-stage">
            <span class="preview-loading">正在生成矢量预览…</span>
          </div>
        </template>
        <div v-else class="preview-stage preview-stage-pdf">
          <iframe
            v-if="pdfUrl"
            class="preview-pdf"
            :src="pdfUrl"
            title="PDF 预览"
          ></iframe>
          <span v-else class="preview-loading">正在生成 PDF 预览…</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

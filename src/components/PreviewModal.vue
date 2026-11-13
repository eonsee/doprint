<script setup lang="ts">
import { Download, X } from 'lucide-vue-next'
import { useDesigner } from '../designer/context'

const props = defineProps<{
  open: boolean
  svg: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const designer = useDesigner()
const { templateName, page, dataFields } = designer

function downloadSvg() {
  if (!props.svg) return
  const name = (templateName.value || 'template').replace(/[\\/:*?"<>|]+/g, '-')
  const blob = new Blob([props.svg], {
    type: 'image/svg+xml;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.svg`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="preview-mask" @click.self="emit('close')">
      <div class="preview-dialog">
        <div class="preview-head">
          <div>
            <strong>{{ templateName }}</strong>
            <span>
              {{ page.width }} × {{ page.height }} mm · 矢量输出
              <template v-if="dataFields.length">
                · 已应用 {{ dataFields.length }} 个示例字段
              </template>
            </span>
          </div>
          <div class="preview-actions">
            <button class="btn ghost" @click="downloadSvg">
              <Download :size="15" />
              下载 SVG
            </button>
            <button class="icon-btn" title="关闭" @click="emit('close')">
              <X :size="17" />
            </button>
          </div>
        </div>
        <div v-if="svg" class="preview-stage" v-html="svg"></div>
        <div v-else class="preview-stage">
          <span style="color: #64748b; font-size: 12px">正在生成矢量预览…</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

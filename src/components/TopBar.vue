<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, Eye, Redo2, Undo2, Upload } from 'lucide-vue-next'
import { useDesigner } from '../designer/context'

defineProps<{
  previewLoading: boolean
}>()

const emit = defineEmits<{
  (e: 'preview'): void
}>()

const designer = useDesigner()
const { templateName, canUndo, canRedo, savedAt } = designer

const fileInput = ref<HTMLInputElement>()

const savedLabel = computed(() => {
  if (!savedAt.value) return '尚未保存'
  const date = new Date(savedAt.value)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `已自动保存 ${hh}:${mm}`
})

function onNameChange(event: Event) {
  designer.setTemplateName((event.target as HTMLInputElement).value)
}

function onImportClick() {
  fileInput.value?.click()
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    await designer.importTemplate(text)
  } finally {
    input.value = ''
  }
}
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark">D</span>
      <span class="brand-name">DoPrint <span class="brand-sub">设计器</span></span>
    </div>

    <div class="topbar-divider"></div>

    <input
      class="template-name"
      :value="templateName"
      placeholder="模板名称"
      @change="onNameChange"
    />

    <div class="topbar-actions">
      <button
        class="icon-btn"
        title="撤销 (Ctrl+Z)"
        :disabled="!canUndo"
        @click="designer.undo()"
      >
        <Undo2 :size="17" />
      </button>
      <button
        class="icon-btn"
        title="重做 (Ctrl+Shift+Z)"
        :disabled="!canRedo"
        @click="designer.redo()"
      >
        <Redo2 :size="17" />
      </button>
    </div>

    <div class="topbar-spacer"></div>

    <span class="autosave">{{ savedLabel }}</span>

    <button class="btn ghost" :disabled="previewLoading" @click="emit('preview')">
      <Eye :size="15" />
      {{ previewLoading ? '生成中…' : '矢量预览' }}
    </button>

    <button class="btn ghost" @click="onImportClick">
      <Upload :size="15" />
      导入
    </button>

    <button class="btn primary" @click="designer.downloadTemplate()">
      <Download :size="15" />
      导出 JSON
    </button>

    <input
      ref="fileInput"
      class="visually-hidden"
      type="file"
      accept="application/json,.json"
      @change="onFileChange"
    />
  </header>
</template>

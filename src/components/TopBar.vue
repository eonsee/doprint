<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Check,
  ChevronDown,
  Download,
  Eye,
  FilePlus2,
  FileText,
  Redo2,
  Undo2,
  Upload,
} from 'lucide-vue-next'
import TopBarProps from './TopBarProps.vue'
import { useDesigner } from '../designer/context'
import type { TemplateSummary } from '../designer/designer'

defineProps<{
  previewLoading: 'vector' | 'pdf' | null
}>()

const emit = defineEmits<{
  (e: 'preview', mode: 'vector' | 'pdf'): void
}>()

const designer = useDesigner()
const { templateName, templates, canUndo, canRedo, savedAt } = designer

const fileInput = ref<HTMLInputElement>()
const pickerEl = ref<HTMLDivElement>()
const menuOpen = ref(false)

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

function onDocumentPointerDown(event: PointerEvent) {
  if (!menuOpen.value) return
  if (pickerEl.value?.contains(event.target as Node)) return
  menuOpen.value = false
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && menuOpen.value) menuOpen.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeydown)
})

async function createTemplate() {
  menuOpen.value = false
  await designer.newTemplate()
}

async function switchTemplate(id: string) {
  menuOpen.value = false
  await designer.openTemplate(id)
}

function formatUpdated(timestamp: number) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return sameDay
    ? `${hh}:${mm} 更新`
    : `${date.getMonth() + 1}/${date.getDate()} 更新`
}

function thumbStyle(template: TemplateSummary) {
  const maxWidth = 18
  const maxHeight = 26
  const ratio =
    template.width > 0 && template.height > 0
      ? template.width / template.height
      : 0.707
  let width = maxWidth
  let height = width / ratio
  if (height > maxHeight) {
    height = maxHeight
    width = height * ratio
  }
  return {
    width: `${Math.max(5, Number(width.toFixed(1)))}px`,
    height: `${Math.max(5, Number(height.toFixed(1)))}px`,
  }
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
    <div class="topbar-main">
      <div class="brand">
        <span class="brand-mark">D</span>
        <span class="brand-name">DoPrint <span class="brand-sub">设计器</span></span>
      </div>

      <div class="topbar-divider"></div>

      <div ref="pickerEl" class="template-picker">
        <input
          class="template-name"
          :value="templateName"
          placeholder="模板名称"
          @change="onNameChange"
        />
        <button
          class="icon-btn template-toggle"
          :class="{ active: menuOpen }"
          title="模板列表"
          :aria-expanded="menuOpen"
          @click="menuOpen = !menuOpen"
        >
          <ChevronDown :size="15" />
        </button>
        <button
          class="icon-btn template-new"
          title="新建空白模板"
          @click="createTemplate"
        >
          <FilePlus2 :size="16" />
        </button>

        <div v-if="menuOpen" class="template-menu">
          <div class="template-menu-head">
            <span class="template-menu-title">模板列表</span>
            <button class="btn primary template-create" @click="createTemplate">
              <FilePlus2 :size="13" />
              新建模板
            </button>
          </div>
          <div class="template-list">
            <button
              v-for="template in templates"
              :key="template.id"
              class="template-item"
              :class="{ active: template.active }"
              :aria-current="template.active ? 'page' : undefined"
              @click="switchTemplate(template.id)"
            >
              <span class="template-thumb">
                <i :style="thumbStyle(template)"></i>
              </span>
              <span class="template-item-main">
                <span class="template-item-name">{{ template.name }}</span>
                <span class="template-item-meta">
                  {{ template.width }} × {{ template.height }} mm ·
                  {{ formatUpdated(template.updatedAt) }}
                </span>
              </span>
              <Check
                v-if="template.active"
                class="template-item-check"
                :size="15"
              />
            </button>
            <p v-if="!templates.length" class="template-empty">暂无模板</p>
          </div>
        </div>
      </div>

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

      <button
        class="btn ghost"
        title="矢量预览（SVG，可缩放）"
        :disabled="previewLoading !== null"
        @click="emit('preview', 'vector')"
      >
        <Eye :size="15" />
        {{ previewLoading === 'vector' ? '生成中…' : '矢量预览' }}
      </button>

      <button
        class="btn ghost"
        title="PDF 预览（按打印尺寸生成）"
        :disabled="previewLoading !== null"
        @click="emit('preview', 'pdf')"
      >
        <FileText :size="15" />
        {{ previewLoading === 'pdf' ? '生成中…' : 'PDF 预览' }}
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
    </div>

    <TopBarProps />
  </header>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  Eye,
  FilePlus2,
  FileText,
  ImageDown,
  LayoutTemplate,
  Moon,
  Redo2,
  Save,
  Settings2,
  Sun,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-vue-next'
import type { ImageExportFormat } from '../designer/designer'
import TopBarProps from './TopBarProps.vue'
import { useDesigner } from '../designer/context'
import type { TemplateSummary } from '../designer/designer'

const props = withDefaults(
  defineProps<{
    previewLoading: 'vector' | 'pdf' | null
    /** Show the close button so the host can dismiss the designer. */
    closable?: boolean
  }>(),
  { closable: false },
)

const emit = defineEmits<{
  (e: 'preview', mode: 'vector' | 'pdf'): void
  (e: 'close'): void
  (e: 'settings'): void
  (e: 'template-center'): void
}>()

const designer = useDesigner()
const {
  templateName,
  templates,
  canUndo,
  canRedo,
  savedAt,
  theme,
  uiVisibility,
} = designer

const fileInput = ref<HTMLInputElement>()
const pickerEl = ref<HTMLDivElement>()
const menuOpen = ref(false)
const imageMenuEl = ref<HTMLDivElement>()
const imageMenuOpen = ref(false)
const imageBusy = ref(false)

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
  const target = event.target as Node
  if (menuOpen.value && !pickerEl.value?.contains(target)) {
    menuOpen.value = false
  }
  if (imageMenuOpen.value && !imageMenuEl.value?.contains(target)) {
    imageMenuOpen.value = false
  }
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  menuOpen.value = false
  imageMenuOpen.value = false
}

function toggleTemplateMenu() {
  imageMenuOpen.value = false
  menuOpen.value = !menuOpen.value
}

function toggleImageMenu() {
  menuOpen.value = false
  imageMenuOpen.value = !imageMenuOpen.value
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

function openTemplateCenter() {
  menuOpen.value = false
  emit('template-center')
}

async function switchTemplate(id: string) {
  menuOpen.value = false
  await designer.openTemplate(id)
}

async function duplicateTemplate(id: string) {
  menuOpen.value = false
  await designer.duplicateTemplate(id)
}

async function removeTemplate(template: TemplateSummary) {
  const ok = window.confirm(
    `删除模板「${template.name}」？删除后不可恢复。`,
  )
  if (!ok) return
  menuOpen.value = false
  await designer.deleteTemplate(template.id)
}

async function exportImage(format: ImageExportFormat) {
  imageMenuOpen.value = false
  if (imageBusy.value) return
  imageBusy.value = true
  try {
    await designer.downloadImage(format)
  } finally {
    imageBusy.value = false
  }
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
      <a
        class="brand"
        href="https://doprint.top"
        target="_blank"
        rel="noopener noreferrer"
        title="访问 DoPrint 官网（新标签页）"
      >
        <span class="brand-mark">D</span>
        <span class="brand-name">DoPrint <span class="brand-sub">设计器</span></span>
      </a>

      <div class="topbar-divider"></div>

      <div
        v-if="uiVisibility.topbarMain.template"
        ref="pickerEl"
        class="template-picker"
      >
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
          @click="toggleTemplateMenu"
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
            <div class="template-menu-actions">
              <button class="btn ghost template-create" @click="openTemplateCenter">
                <LayoutTemplate :size="13" />
                模板中心
              </button>
              <button class="btn primary template-create" @click="createTemplate">
                <FilePlus2 :size="13" />
                新建模板
              </button>
            </div>
          </div>
          <div class="template-list">
            <div
              v-for="template in templates"
              :key="template.id"
              class="template-item"
              :class="{ active: template.active }"
            >
              <button
                class="template-item-select"
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
              <div class="template-item-actions">
                <button
                  class="icon-btn tiny"
                  title="复制模板"
                  @click="duplicateTemplate(template.id)"
                >
                  <Copy :size="13" />
                </button>
                <button
                  class="icon-btn tiny danger"
                  title="删除模板"
                  @click="removeTemplate(template)"
                >
                  <Trash2 :size="13" />
                </button>
              </div>
            </div>
            <p v-if="!templates.length" class="template-empty">暂无模板</p>
          </div>
        </div>
      </div>

      <div class="topbar-actions">
        <button
          v-if="uiVisibility.topbarMain.history"
          class="icon-btn"
          title="撤销 (Ctrl+Z)"
          :disabled="!canUndo"
          @click="designer.undo()"
        >
          <Undo2 :size="17" />
        </button>
        <button
          v-if="uiVisibility.topbarMain.history"
          class="icon-btn"
          title="重做 (Ctrl+Shift+Z)"
          :disabled="!canRedo"
          @click="designer.redo()"
        >
          <Redo2 :size="17" />
        </button>
        <button
          class="icon-btn"
          title="模板中心 · 官方示例模板"
          @click="emit('template-center')"
        >
          <LayoutTemplate :size="17" />
        </button>
        <button
          class="icon-btn"
          title="全局属性 · 自定义显示内容"
          @click="emit('settings')"
        >
          <Settings2 :size="17" />
        </button>
        <button
          class="icon-btn theme-toggle"
          :title="theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'"
          @click="designer.toggleTheme()"
        >
          <Sun v-if="theme === 'dark'" :size="17" />
          <Moon v-else :size="17" />
        </button>
      </div>

      <div class="topbar-spacer"></div>

      <span
        v-if="uiVisibility.topbarMain.autosave"
        class="autosave"
        title="模板已自动保存到浏览器"
      >
        <Save :size="13" />
        {{ savedLabel }}
      </span>

      <button
        v-if="uiVisibility.topbarMain.preview"
        class="btn ghost"
        title="矢量预览（SVG，可缩放）"
        :disabled="previewLoading !== null"
        @click="emit('preview', 'vector')"
      >
        <Eye :size="15" />
        {{ previewLoading === 'vector' ? '生成中…' : '矢量预览' }}
      </button>

      <button
        v-if="uiVisibility.topbarMain.preview"
        class="btn ghost"
        title="PDF 预览（按打印尺寸生成）"
        :disabled="previewLoading !== null"
        @click="emit('preview', 'pdf')"
      >
        <FileText :size="15" />
        {{ previewLoading === 'pdf' ? '生成中…' : 'PDF 预览' }}
      </button>

      <div
        v-if="uiVisibility.topbarMain.io"
        ref="imageMenuEl"
        class="image-export"
      >
        <button
          class="btn ghost"
          title="导出图片（PNG / JPG / WebP）"
          :disabled="imageBusy"
          @click="toggleImageMenu"
        >
          <ImageDown :size="15" />
          {{ imageBusy ? '生成中…' : '图片' }}
        </button>
        <div v-if="imageMenuOpen" class="image-menu">
          <button type="button" @click="exportImage('png')">
            <strong>PNG</strong>
            <span>无损，适合打印与分享</span>
          </button>
          <button type="button" @click="exportImage('jpeg')">
            <strong>JPG</strong>
            <span>体积更小，适合发送</span>
          </button>
          <button type="button" @click="exportImage('webp')">
            <strong>WebP</strong>
            <span>高压缩，文件最小</span>
          </button>
        </div>
      </div>

      <button
        v-if="uiVisibility.topbarMain.io"
        class="btn ghost"
        @click="onImportClick"
      >
        <Upload :size="15" />
        导入
      </button>

      <button
        v-if="uiVisibility.topbarMain.io"
        class="btn primary"
        @click="designer.downloadTemplate()"
      >
        <Download :size="15" />
        导出 JSON
      </button>

      <button
        v-if="props.closable"
        class="icon-btn topbar-close"
        title="关闭设计器"
        @click="emit('close')"
      >
        <X :size="17" />
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

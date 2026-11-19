<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import DataSourceModal from './DataSourceModal.vue'
import DesignerStage from './DesignerStage.vue'
import GlobalSettingsModal from './GlobalSettingsModal.vue'
import InspectorPanel from './InspectorPanel.vue'
import PreviewModal from './PreviewModal.vue'
import SpecialCharacterModal from './SpecialCharacterModal.vue'
import TemplateCenterModal from './TemplateCenterModal.vue'
import ToolRail from './ToolRail.vue'
import TopBar from './TopBar.vue'
import { provideDesigner } from '../designer/context'
import { createDesigner, type Designer } from '../designer/designer'
import { PROJECT_SIGNATURE } from '../designer/copyright'

const props = withDefaults(
  defineProps<{
    /**
     * Show a close button in the top bar. The component does not hide itself;
     * the host hides / unmounts it in response to the `close` event.
     */
    closable?: boolean
  }>(),
  { closable: false },
)

const emit = defineEmits<{
  (e: 'ready', designer: Designer): void
  (e: 'close'): void
}>()

const designer = createDesigner()
provideDesigner(designer)
defineExpose({ designer })

const { notice, dataSourceOpen, symbolPickerOpen } = designer

function closeDataSource() {
  dataSourceOpen.value = false
}

const settingsOpen = ref(false)
const templateCenterOpen = ref(false)

type PreviewMode = 'vector' | 'pdf'

const previewOpen = ref(false)
const previewMode = ref<PreviewMode>('pdf')
const previewSvg = ref('')
const previewUrl = ref('')
const previewLoadingMode = ref<PreviewMode | null>(null)

function revokePreviewUrl() {
  if (!previewUrl.value) return
  URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
}

async function openPreview(mode: PreviewMode) {
  if (previewLoadingMode.value) return
  previewLoadingMode.value = mode
  try {
    if (mode === 'vector') {
      const svg = await designer.generateSVG()
      if (!svg) throw new Error('empty svg')
      previewMode.value = 'vector'
      previewSvg.value = svg
    } else {
      const bytes = await designer.generatePDF()
      if (!bytes.length) throw new Error('empty pdf')
      const blob = new Blob([bytes], { type: 'application/pdf' })
      revokePreviewUrl()
      previewUrl.value = URL.createObjectURL(blob)
      previewMode.value = 'pdf'
    }
    previewOpen.value = true
  } catch (err) {
    console.error(`generate ${mode} preview failed`, err)
    designer.notice.value =
      mode === 'vector' ? '矢量预览生成失败' : 'PDF 预览生成失败'
    setTimeout(() => {
      designer.notice.value = ''
    }, 3200)
  } finally {
    previewLoadingMode.value = null
  }
}

function closePreview() {
  previewOpen.value = false
  previewSvg.value = ''
  revokePreviewUrl()
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  )
}

function onKeydown(event: KeyboardEvent) {
  if (previewOpen.value) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closePreview()
    }
    return
  }

  // Any other modal (e.g. the data source dialog) owns the keyboard while open.
  if (document.querySelector('[data-modal]')) return

  // Direct cell editing owns the keyboard: arrows / Delete / typing belong to
  // the table overlay, not to canvas nudging or deletion.
  if (designer.tableEditing.value) {
    if (event.key === 'Escape') {
      event.preventDefault()
      designer.endTableEdit()
    }
    return
  }

  // Underlay alignment owns Escape so it can be dismissed without clearing
  // the template; other shortcuts (undo, etc.) keep working.
  if (designer.backgroundAligning.value && event.key === 'Escape') {
    event.preventDefault()
    designer.setBackgroundAligning(false)
    return
  }

  const mod = event.ctrlKey || event.metaKey
  const typing = isTypingTarget(event.target)
  const key = event.key.toLowerCase()

  if (mod && !typing && key === 'z') {
    event.preventDefault()
    if (event.shiftKey) void designer.redo()
    else void designer.undo()
    return
  }

  if (mod && !typing && key === 'y') {
    event.preventDefault()
    void designer.redo()
    return
  }

  if (typing) return

  if (event.key === 'Escape') {
    designer.clearSelection()
    return
  }

  if (mod && key === 'd') {
    event.preventDefault()
    void designer.duplicateSelected()
    return
  }

  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (designer.selection.count === 0) return
    event.preventDefault()
    designer.deleteSelected()
    return
  }

  if (designer.selection.count === 0) return

  const step = event.shiftKey ? 5 : 0.5
  let dx = 0
  let dy = 0
  switch (event.key) {
    case 'ArrowLeft':
      dx = -step
      break
    case 'ArrowRight':
      dx = step
      break
    case 'ArrowUp':
      dy = -step
      break
    case 'ArrowDown':
      dy = step
      break
    default:
      return
  }
  event.preventDefault()
  designer.nudge(dx, dy)
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  emit('ready', designer)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  revokePreviewUrl()
  designer.destroy()
})
</script>

<template>
  <div
    class="app-shell doprint-designer"
    data-doprint-designer="true"
    :data-doprint-signature="PROJECT_SIGNATURE"
  >
    <TopBar
      :preview-loading="previewLoadingMode"
      :closable="props.closable"
      @preview="openPreview"
      @close="emit('close')"
      @settings="settingsOpen = true"
      @template-center="templateCenterOpen = true"
    />
    <div class="app-body">
      <ToolRail />
      <DesignerStage />
      <InspectorPanel />
    </div>

    <PreviewModal
      :open="previewOpen"
      :mode="previewMode"
      :svg="previewSvg"
      :pdf-url="previewUrl"
      @close="closePreview"
    />

    <DataSourceModal v-if="dataSourceOpen" @close="closeDataSource" />

    <GlobalSettingsModal
      v-if="settingsOpen"
      @close="settingsOpen = false"
    />

    <SpecialCharacterModal
      v-if="symbolPickerOpen"
      @close="symbolPickerOpen = false"
    />

    <TemplateCenterModal
      v-if="templateCenterOpen"
      @close="templateCenterOpen = false"
    />

    <transition name="toast">
      <div v-if="notice" class="toast">{{ notice }}</div>
    </transition>
  </div>
</template>

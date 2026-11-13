<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import DesignerStage from './components/DesignerStage.vue'
import InspectorPanel from './components/InspectorPanel.vue'
import PreviewModal from './components/PreviewModal.vue'
import ToolRail from './components/ToolRail.vue'
import TopBar from './components/TopBar.vue'
import { provideDesigner } from './designer/context'
import { createDesigner } from './designer/designer'

const designer = createDesigner()
provideDesigner(designer)

const { notice } = designer

const previewOpen = ref(false)
const previewSvg = ref('')
const previewLoading = ref(false)

async function openPreview() {
  if (previewLoading.value) return
  previewLoading.value = true
  try {
    previewSvg.value = await designer.generateSVG()
    previewOpen.value = true
  } catch (err) {
    console.error('generate SVG failed', err)
    designer.notice.value = '矢量预览生成失败'
    setTimeout(() => {
      designer.notice.value = ''
    }, 3200)
  } finally {
    previewLoading.value = false
  }
}

function closePreview() {
  previewOpen.value = false
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

  // Direct cell editing owns the keyboard: arrows / Delete / typing belong to
  // the table overlay, not to canvas nudging or deletion.
  if (designer.tableEditing.value) {
    if (event.key === 'Escape') {
      event.preventDefault()
      designer.endTableEdit()
    }
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

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  designer.destroy()
})
</script>

<template>
  <div class="app-shell">
    <TopBar :preview-loading="previewLoading" @preview="openPreview" />
    <div class="app-body">
      <ToolRail />
      <DesignerStage />
      <InspectorPanel />
    </div>

    <PreviewModal :open="previewOpen" :svg="previewSvg" @close="closePreview" />

    <Transition name="toast">
      <div v-if="notice" class="toast">{{ notice }}</div>
    </Transition>
  </div>
</template>

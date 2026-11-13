<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Maximize2, Minus, Plus } from 'lucide-vue-next'
import CanvasTableEditor from './CanvasTableEditor.vue'
import { useDesigner } from '../designer/context'

const designer = useDesigner()
const { page, grid, view, objectCount, zoomPercent } = designer

const canvasEl = ref<HTMLCanvasElement>()
const scrollEl = ref<HTMLDivElement>()
let resizeObserver: ResizeObserver | undefined

onMounted(() => {
  if (!canvasEl.value) return
  designer.mount(canvasEl.value)

  const el = scrollEl.value
  if (el) {
    resizeObserver = new ResizeObserver(() => {
      designer.setViewportSize(el.clientWidth, el.clientHeight)
    })
    resizeObserver.observe(el)
    designer.setViewportSize(el.clientWidth, el.clientHeight)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})

watch(
  () => [page.width, page.height, view.zoom],
  () => designer.syncViewport(),
  { flush: 'post' },
)

const pageStyle = computed(() => {
  const g = Math.max(2, grid.size * view.zoom)
  const major = g * 2
  const gridImage = [
    'linear-gradient(to right, rgba(15,23,42,0.09) 1px, transparent 1px)',
    'linear-gradient(to bottom, rgba(15,23,42,0.09) 1px, transparent 1px)',
    'linear-gradient(to right, rgba(15,23,42,0.05) 1px, transparent 1px)',
    'linear-gradient(to bottom, rgba(15,23,42,0.05) 1px, transparent 1px)',
  ].join(', ')

  return {
    width: `${page.width * view.zoom}px`,
    height: `${page.height * view.zoom}px`,
    backgroundImage: grid.visible ? gridImage : 'none',
    backgroundSize: grid.visible
      ? `${major}px ${major}px, ${major}px ${major}px, ${g}px ${g}px, ${g}px ${g}px`
      : undefined,
  }
})
</script>

<template>
  <section class="stage">
    <div ref="scrollEl" class="stage-scroll">
      <div class="stage-inner">
        <div class="stage-page" :style="pageStyle">
          <canvas ref="canvasEl"></canvas>
          <CanvasTableEditor />
        </div>
      </div>
    </div>

    <div v-if="objectCount === 0" class="empty-hint">
      <div class="empty-card">
        <strong>空白画布</strong>
        <span>从左侧工具栏添加文本、形状或图片开始设计</span>
      </div>
    </div>

    <div class="zoom-bar">
      <button class="zoom-btn" title="缩小" @click="designer.zoomOut()">
        <Minus :size="15" />
      </button>
      <button class="zoom-value" title="恢复 100% 显示比例" @click="designer.resetZoom()">
        {{ zoomPercent }}%
      </button>
      <button class="zoom-btn" title="放大" @click="designer.zoomIn()">
        <Plus :size="15" />
      </button>
      <span class="zoom-sep"></span>
      <button class="zoom-btn" title="适应窗口" @click="designer.fitToViewport()">
        <Maximize2 :size="15" />
      </button>
    </div>
  </section>
</template>

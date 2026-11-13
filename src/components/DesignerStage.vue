<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Maximize2, Minus, Plus, Ruler } from 'lucide-vue-next'
import CanvasTableEditor from './CanvasTableEditor.vue'
import { useDesigner } from '../designer/context'
import type { GuideOrientation, PageGuide } from '../designer/types'
import { clamp, round } from '../designer/units'

const designer = useDesigner()
const { page, grid, view, objectCount, zoomPercent, rulersVisible } = designer

const canvasEl = ref<HTMLCanvasElement>()
const scrollEl = ref<HTMLDivElement>()
const pageEl = ref<HTMLDivElement>()
const rulerTopEl = ref<HTMLCanvasElement>()
const rulerLeftEl = ref<HTMLCanvasElement>()
let resizeObserver: ResizeObserver | undefined
let drawFrame = 0

interface GuideDraft {
  orientation: GuideOrientation
  position: number
  inside: boolean
}

const guideDraft = ref<GuideDraft | null>(null)
const movingGuideId = ref('')
const movingGuideInside = ref(true)

const NICE_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
const RULER_FONT = '9px "Segoe UI", system-ui, -apple-system, sans-serif'

function pickStep(zoom: number, minPx: number) {
  return (
    NICE_STEPS.find((step) => step * zoom >= minPx) ??
    NICE_STEPS[NICE_STEPS.length - 1]
  )
}

/**
 * Draw a millimetre ruler. `originPx` is the page origin relative to the
 * ruler's start edge, so ticks stay aligned while the canvas scrolls.
 */
function drawRuler(
  canvas: HTMLCanvasElement | undefined,
  axis: 'x' | 'y',
  originPx: number,
  pageLengthPx: number,
  pageLengthMm: number,
) {
  if (!canvas) return
  const width = canvas.clientWidth
  const height = canvas.clientHeight
  if (!width || !height) return

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const pixelWidth = Math.round(width * dpr)
  const pixelHeight = Math.round(height * dpr)
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth
    canvas.height = pixelHeight
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const horizontal = axis === 'x'
  const along = horizontal ? width : height
  const across = horizontal ? height : width

  ctx.fillStyle = '#f8fafc'
  ctx.fillRect(0, 0, width, height)

  // Soft band marking the page extent.
  const bandStart = Math.max(0, Math.min(along, originPx))
  const bandEnd = Math.max(0, Math.min(along, originPx + pageLengthPx))
  if (bandEnd > bandStart) {
    ctx.fillStyle = '#eef2f7'
    if (horizontal) ctx.fillRect(bandStart, 0, bandEnd - bandStart, height)
    else ctx.fillRect(0, bandStart, width, bandEnd - bandStart)
  }

  const zoom = pageLengthMm > 0 ? pageLengthPx / pageLengthMm : 1
  const labelStep = pickStep(zoom, 26)
  const minorStep = Math.min(labelStep, pickStep(zoom, 5))
  const visibleStart = Math.max(0, -originPx / zoom)
  const visibleEnd = Math.min(pageLengthMm, (along - originPx) / zoom)

  ctx.strokeStyle = '#a9b4c4'
  ctx.lineWidth = 1
  ctx.beginPath()
  for (
    let index = Math.ceil(visibleStart / minorStep);
    index * minorStep <= visibleEnd + 1e-6;
    index++
  ) {
    const mm = index * minorStep
    const pos = Math.round(originPx + mm * zoom) + 0.5
    const major = mm % labelStep === 0
    const tick = major ? 8 : 4
    if (horizontal) {
      ctx.moveTo(pos, across)
      ctx.lineTo(pos, across - tick)
    } else {
      ctx.moveTo(across, pos)
      ctx.lineTo(across - tick, pos)
    }
  }
  ctx.stroke()

  ctx.font = RULER_FONT
  ctx.fillStyle = '#68758a'
  for (
    let index = Math.ceil(visibleStart / labelStep);
    index * labelStep <= visibleEnd + 1e-6;
    index++
  ) {
    const mm = index * labelStep
    const pos = Math.round(originPx + mm * zoom) + 0.5
    const label = String(mm)
    if (horizontal) {
      const labelWidth = ctx.measureText(label).width
      if (pos + 4 + labelWidth > along - 1) {
        ctx.textAlign = 'right'
        ctx.fillText(label, pos - 3, 9)
      } else {
        ctx.textAlign = 'left'
        ctx.fillText(label, pos + 3, 9)
      }
    } else {
      ctx.save()
      ctx.translate(9, pos - 3)
      ctx.rotate(-Math.PI / 2)
      ctx.textAlign = 'right'
      ctx.fillText(label, 0, 0)
      ctx.restore()
    }
  }

  // Divider between the ruler and the scrollable canvas viewport.
  ctx.strokeStyle = '#dfe5ee'
  ctx.beginPath()
  if (horizontal) {
    ctx.moveTo(0, across - 0.5)
    ctx.lineTo(width, across - 0.5)
  } else {
    ctx.moveTo(across - 0.5, 0)
    ctx.lineTo(across - 0.5, height)
  }
  ctx.stroke()
}

function drawRulers() {
  drawFrame = 0
  const scroll = scrollEl.value
  const pageBox = pageEl.value
  const top = rulerTopEl.value
  const left = rulerLeftEl.value
  if (!scroll || !pageBox || !top || !left) return

  const scrollRect = scroll.getBoundingClientRect()
  const pageRect = pageBox.getBoundingClientRect()
  drawRuler(
    top,
    'x',
    pageRect.left - scrollRect.left,
    pageRect.width,
    page.width,
  )
  drawRuler(
    left,
    'y',
    pageRect.top - scrollRect.top,
    pageRect.height,
    page.height,
  )
}

function scheduleDraw() {
  if (drawFrame) return
  drawFrame = requestAnimationFrame(drawRulers)
}

function onRulerWheel(event: WheelEvent) {
  const scroll = scrollEl.value
  if (!scroll) return
  const unit =
    event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroll.clientHeight : 1
  scroll.scrollLeft += event.deltaX * unit
  scroll.scrollTop += event.deltaY * unit
  event.preventDefault()
}

// ------------------------------------------------------------- ruler guides

function guideMax(orientation: GuideOrientation): number {
  return orientation === 'horizontal' ? page.height : page.width
}

function clampGuidePosition(
  orientation: GuideOrientation,
  value: number,
): number {
  return clamp(round(value, 1), 0, round(guideMax(orientation), 1))
}

interface PointerInfo {
  inside: boolean
  position: (orientation: GuideOrientation) => number
}

function pointerInfo(event: PointerEvent): PointerInfo | null {
  const el = pageEl.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return {
    inside:
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom,
    position(orientation) {
      const raw =
        orientation === 'horizontal'
          ? (event.clientY - rect.top) / view.zoom
          : (event.clientX - rect.left) / view.zoom
      return clampGuidePosition(orientation, raw)
    },
  }
}

function setGuideCursor(orientation: GuideOrientation | null) {
  document.body.classList.toggle('guide-drag-h', orientation === 'horizontal')
  document.body.classList.toggle('guide-drag-v', orientation === 'vertical')
}

function addGuideWindowListeners() {
  window.addEventListener('pointermove', onGuidePointerMove)
  window.addEventListener('pointerup', onGuidePointerUp)
  window.addEventListener('pointercancel', onGuidePointerCancel)
}

function removeGuideWindowListeners() {
  window.removeEventListener('pointermove', onGuidePointerMove)
  window.removeEventListener('pointerup', onGuidePointerUp)
  window.removeEventListener('pointercancel', onGuidePointerCancel)
}

function onRulerPointerDown(
  orientation: GuideOrientation,
  event: PointerEvent,
) {
  if (event.button !== 0) return
  const info = pointerInfo(event)
  if (!info) return
  event.preventDefault()
  if (!page.guidesVisible) designer.setGuidesVisible(true)
  movingGuideId.value = ''
  guideDraft.value = {
    orientation,
    position: info.position(orientation),
    inside: info.inside,
  }
  addGuideWindowListeners()
  setGuideCursor(orientation)
}

function startMoveGuide(guide: PageGuide, event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  guideDraft.value = null
  movingGuideId.value = guide.id
  movingGuideInside.value = true
  addGuideWindowListeners()
  setGuideCursor(guide.orientation)
}

function onGuidePointerMove(event: PointerEvent) {
  const info = pointerInfo(event)
  if (!info) return
  if (movingGuideId.value) {
    const guide = page.guides.find((item) => item.id === movingGuideId.value)
    if (!guide) return
    designer.moveGuide(guide.id, info.position(guide.orientation))
    movingGuideInside.value = info.inside
    return
  }
  if (guideDraft.value) {
    guideDraft.value.position = info.position(guideDraft.value.orientation)
    guideDraft.value.inside = info.inside
  }
}

function finishGuideDrag() {
  guideDraft.value = null
  movingGuideId.value = ''
  movingGuideInside.value = true
  removeGuideWindowListeners()
  setGuideCursor(null)
}

function onGuidePointerUp(event: PointerEvent) {
  const info = pointerInfo(event)
  const draft = guideDraft.value
  const movingId = movingGuideId.value
  if (movingId) {
    const guide = page.guides.find((item) => item.id === movingId)
    if (guide && info) {
      designer.moveGuide(guide.id, info.position(guide.orientation))
      if (info.inside) designer.commitGuides()
      else designer.removeGuide(guide.id)
    }
  } else if (draft && info?.inside) {
    designer.addGuide(draft.orientation, info.position(draft.orientation))
  }
  finishGuideDrag()
}

function onGuidePointerCancel() {
  if (movingGuideId.value) designer.commitGuides()
  finishGuideDrag()
}

function guideStyle(orientation: GuideOrientation, position: number) {
  const offset = `${position * view.zoom}px`
  return orientation === 'horizontal'
    ? {
        left: '0px',
        top: offset,
        width: '100%',
        height: '7px',
        marginTop: '-3px',
      }
    : {
        left: offset,
        top: '0px',
        height: '100%',
        width: '7px',
        marginLeft: '-3px',
      }
}

function formatGuide(position: number) {
  return `${round(position, 1)} mm`
}

onMounted(() => {
  if (!canvasEl.value) return
  designer.mount(canvasEl.value)

  const el = scrollEl.value
  if (el) {
    resizeObserver = new ResizeObserver(() => {
      designer.setViewportSize(el.clientWidth, el.clientHeight)
      scheduleDraw()
    })
    resizeObserver.observe(el)
    designer.setViewportSize(el.clientWidth, el.clientHeight)
    el.addEventListener('scroll', scheduleDraw, { passive: true })
  }

  rulerTopEl.value?.addEventListener('wheel', onRulerWheel, {
    passive: false,
  })
  rulerLeftEl.value?.addEventListener('wheel', onRulerWheel, {
    passive: false,
  })
  scheduleDraw()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  scrollEl.value?.removeEventListener('scroll', scheduleDraw)
  rulerTopEl.value?.removeEventListener('wheel', onRulerWheel)
  rulerLeftEl.value?.removeEventListener('wheel', onRulerWheel)
  removeGuideWindowListeners()
  setGuideCursor(null)
  if (drawFrame) cancelAnimationFrame(drawFrame)
})

watch(
  () => [page.width, page.height, view.zoom],
  () => {
    designer.syncViewport()
    scheduleDraw()
  },
  { flush: 'post' },
)

watch(rulersVisible, () => scheduleDraw(), { flush: 'post' })

const marginGuideStyle = computed(() => {
  if (!page.marginVisible) return null
  const { top, right, bottom, left } = page.margin
  if (top <= 0 && right <= 0 && bottom <= 0 && left <= 0) return null
  return {
    left: `${left * view.zoom}px`,
    top: `${top * view.zoom}px`,
    width: `${Math.max(0, page.width - left - right) * view.zoom}px`,
    height: `${Math.max(0, page.height - top - bottom) * view.zoom}px`,
  }
})

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
  <section class="stage" :class="{ 'no-rulers': !rulersVisible }">
    <div class="ruler-corner" aria-hidden="true">mm</div>
    <canvas
      ref="rulerTopEl"
      class="ruler ruler-top"
      aria-hidden="true"
      @pointerdown="onRulerPointerDown('horizontal', $event)"
    ></canvas>
    <canvas
      ref="rulerLeftEl"
      class="ruler ruler-left"
      aria-hidden="true"
      @pointerdown="onRulerPointerDown('vertical', $event)"
    ></canvas>

    <div ref="scrollEl" class="stage-scroll">
      <div class="stage-inner">
        <div ref="pageEl" class="stage-page" :style="pageStyle">
          <canvas ref="canvasEl"></canvas>
          <div
            v-if="marginGuideStyle"
            class="page-margin-guide"
            :style="marginGuideStyle"
            aria-hidden="true"
          ></div>
          <div
            v-for="guide in page.guides"
            v-show="page.guidesVisible"
            :key="guide.id"
            class="page-guide"
            :class="[
              guide.orientation,
              {
                dragging: movingGuideId === guide.id,
                outside: movingGuideId === guide.id && !movingGuideInside,
              },
            ]"
            :style="guideStyle(guide.orientation, guide.position)"
            @pointerdown.stop.prevent="startMoveGuide(guide, $event)"
            @dblclick.stop.prevent="designer.removeGuide(guide.id)"
          >
            <span class="page-guide-label">
              {{
                movingGuideId === guide.id && !movingGuideInside
                  ? '松开删除'
                  : formatGuide(guide.position)
              }}
            </span>
          </div>
          <div
            v-if="guideDraft"
            class="page-guide draft"
            :class="[guideDraft.orientation, { outside: !guideDraft.inside }]"
            :style="guideStyle(guideDraft.orientation, guideDraft.position)"
            aria-hidden="true"
          >
            <span class="page-guide-label">
              {{ formatGuide(guideDraft.position) }}
            </span>
          </div>
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
      <button
        class="zoom-btn"
        :class="{ active: rulersVisible }"
        :title="rulersVisible ? '隐藏刻度尺' : '显示刻度尺'"
        @click="designer.setRulersVisible(!rulersVisible)"
      >
        <Ruler :size="15" />
      </button>
      <button class="zoom-btn" title="适应窗口" @click="designer.fitToViewport()">
        <Maximize2 :size="15" />
      </button>
    </div>
  </section>
</template>

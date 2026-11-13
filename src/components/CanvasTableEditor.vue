<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Bold,
  Check,
  Merge,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  Split,
} from 'lucide-vue-next'
import { useDesigner } from '../designer/context'
import {
  buildRegions,
  cellAt,
  cellAtPoint,
  cloneTableConfig,
  regionAtCell,
  type TableAlign,
  type TableCell,
  type TableRegion,
  type TableVAlign,
} from '../designer/table'
import type { TableConfig } from '../designer/types'
import { clamp, round } from '../designer/units'

const designer = useDesigner()
const {
  table,
  tableSelection,
  tableEditing,
  requestedCellEdit,
  tableFrame,
  tableRangeLabel,
  tableSelectionCount,
  tableCanMerge,
  tableCanSplit,
  tableBorderState,
  view,
  page,
} = designer

const overlayEl = ref<HTMLDivElement>()
const editorEl = ref<HTMLTextAreaElement>()

interface CellEditorState {
  row: number
  col: number
}

const editing = ref<CellEditorState | null>(null)
const draft = ref('')

const regions = computed<TableRegion[]>(() =>
  table.value ? buildRegions(table.value) : [],
)

const overlayStyle = computed(() => ({
  left: `${tableFrame.left * view.zoom}px`,
  top: `${tableFrame.top * view.zoom}px`,
  width: `${tableFrame.width * view.zoom}px`,
  height: `${tableFrame.height * view.zoom}px`,
}))

const toolbarStyle = computed(() => {
  const pageWidth = page.width * view.zoom
  const tableLeft = tableFrame.left * view.zoom
  const tableTop = tableFrame.top * view.zoom
  const below = tableTop < 58
  return {
    top: below
      ? `${tableFrame.height * view.zoom + 10}px`
      : '-46px',
    ...(tableLeft > pageWidth / 2 ? { right: '0px' } : { left: '0px' }),
  }
})

const anchorRegion = computed<TableRegion | null>(() => {
  if (!table.value) return null
  return regionAtCell(table.value, tableSelection.row, tableSelection.col)
})

const anchorCell = computed<TableCell>(() =>
  table.value && anchorRegion.value
    ? cellAt(table.value, anchorRegion.value.row, anchorRegion.value.col)
    : { align: 'left', valign: 'middle' },
)

const editorRegion = computed<TableRegion | null>(() => {
  if (!table.value || !editing.value) return null
  return regionAtCell(table.value, editing.value.row, editing.value.col)
})

const editorStyle = computed(() => {
  const config = table.value
  const region = editorRegion.value
  if (!config || !region) return {}
  const cell = cellAt(config, region.row, region.col)
  const padding = Math.min(
    config.padding,
    Math.max(0, region.width / 3),
    Math.max(0, region.height / 3),
  )
  const availableHeight = Math.max(0.5, region.height - padding * 2)
  // Match tableFabric's effective font size so the edited text does not jump.
  const fontSize = Math.max(
    0.5,
    Math.min(config.fontSize, availableHeight * 1.25),
  )
  const lineHeight = 1.15
  let paddingTop = padding
  if (cell.valign === 'middle') {
    paddingTop = Math.max(padding, (region.height - fontSize * lineHeight) / 2)
  } else if (cell.valign === 'bottom') {
    paddingTop = Math.max(
      padding,
      region.height - padding - fontSize * lineHeight,
    )
  }
  return {
    left: `${region.x * view.zoom}px`,
    top: `${region.y * view.zoom}px`,
    width: `${region.width * view.zoom}px`,
    height: `${region.height * view.zoom}px`,
    padding: `${paddingTop * view.zoom}px ${padding * view.zoom}px ${padding * view.zoom}px`,
    fontSize: `${fontSize * view.zoom}px`,
    lineHeight,
    fontFamily: config.fontFamily,
    fontWeight: cell.bold ? 'bold' : 'normal',
    color: cell.color || config.color || '#111827',
    textAlign: cell.align || 'left',
    background: cell.fill || config.background || '#ffffff',
  }
})

function regionStyle(region: TableRegion) {
  return {
    left: `${region.x * view.zoom}px`,
    top: `${region.y * view.zoom}px`,
    width: `${region.width * view.zoom}px`,
    height: `${region.height * view.zoom}px`,
  }
}

function isSelected(region: TableRegion): boolean {
  return !(
    region.row + region.rowSpan - 1 <
      Math.min(tableSelection.row, tableSelection.endRow) ||
    region.row > Math.max(tableSelection.row, tableSelection.endRow) ||
    region.col + region.colSpan - 1 <
      Math.min(tableSelection.col, tableSelection.endCol) ||
    region.col > Math.max(tableSelection.col, tableSelection.endCol)
  )
}

function isAnchor(region: TableRegion): boolean {
  return (
    region.row === Math.min(tableSelection.row, tableSelection.endRow) &&
    region.col === Math.min(tableSelection.col, tableSelection.endCol)
  )
}

function focusOverlay() {
  nextTick(() => {
    if (tableEditing.value && !editing.value) {
      overlayEl.value?.focus({ preventScroll: true })
    }
  })
}

function openEditor(row: number, col: number, selectAll: boolean, seed?: string) {
  const config = table.value
  if (!config) return
  const region = regionAtCell(config, row, col)
  if (!region) return
  designer.selectTableCells(region.row, region.col)
  editing.value = { row: region.row, col: region.col }
  draft.value = seed ?? cellAt(config, region.row, region.col).text ?? ''
  void nextTick(() => {
    const el = editorEl.value
    if (!el) return
    el.focus({ preventScroll: true })
    if (seed !== undefined) {
      el.setSelectionRange(el.value.length, el.value.length)
    } else if (selectAll) {
      el.select()
    } else {
      el.setSelectionRange(el.value.length, el.value.length)
    }
  })
}

function commitEditor(move: 'next' | 'prev' | null = null) {
  const current = editing.value
  if (!current) return
  const text = draft.value
  editing.value = null
  designer.setTableCellText(current.row, current.col, text)
  if (move) {
    const dCol = move === 'next' ? 1 : -1
    stepSelection(0, dCol)
  }
  focusOverlay()
}

function cancelEditor() {
  editing.value = null
  focusOverlay()
}

function onCellPointerDown(_region: TableRegion, event: PointerEvent) {
  if (event.button !== 0) return
  event.preventDefault()
  // Clicking another cell finishes the open editor first. preventDefault stops
  // the browser's native focus change, so this must be explicit.
  if (editing.value) commitEditor()
  overlayEl.value?.focus({ preventScroll: true })
  const cell = cellPointFromEvent(event)
  if (!cell) return
  if (event.shiftKey) {
    designer.selectTableCells(cell.row, cell.col, true)
  } else {
    designer.selectTableCells(cell.row, cell.col)
  }
  beginDrag()
}

let dragging = false

function beginDrag() {
  if (dragging) return
  dragging = true
  window.addEventListener('pointermove', onWindowPointerMove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
}

function endDrag() {
  dragging = false
  window.removeEventListener('pointermove', onWindowPointerMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
}

function onWindowPointerMove(event: PointerEvent) {
  if (!dragging) return
  const cell = cellPointFromEvent(event)
  if (!cell) return
  designer.selectTableCells(cell.row, cell.col, true)
}

function cellPointFromEvent(event: PointerEvent) {
  const el = overlayEl.value
  if (!el || !table.value) return null
  const rect = el.getBoundingClientRect()
  const x = (event.clientX - rect.left) / view.zoom
  const y = (event.clientY - rect.top) / view.zoom
  return cellAtPoint(table.value, x, y)
}

// ------------------------------------------------- table resize handles

type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const RESIZE_HANDLES: ResizeDir[] = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
]

interface ResizeState {
  dir: ResizeDir
  startX: number
  startY: number
  startW: number
  startH: number
  startLeft: number
  startTop: number
  /** Config snapshot so repeated frames scale from the same baseline. */
  base: TableConfig
}

let resizeState: ResizeState | null = null
let resizePointer: { x: number; y: number; shift: boolean } | null = null
let resizeRaf = 0

function startResize(dir: ResizeDir, event: PointerEvent) {
  if (event.button !== 0 || !table.value) return
  event.preventDefault()
  event.stopPropagation()
  if (editing.value) commitEditor()
  const config = table.value
  if (!config) return
  resizeState = {
    dir,
    startX: event.clientX,
    startY: event.clientY,
    startW: tableFrame.width,
    startH: tableFrame.height,
    startLeft: tableFrame.left,
    startTop: tableFrame.top,
    base: cloneTableConfig(config),
  }
  resizePointer = { x: event.clientX, y: event.clientY, shift: event.shiftKey }
  window.addEventListener('pointermove', onResizeMove)
  window.addEventListener('pointerup', endResize)
  window.addEventListener('pointercancel', endResize)
}

function onResizeMove(event: PointerEvent) {
  if (!resizeState) return
  resizePointer = { x: event.clientX, y: event.clientY, shift: event.shiftKey }
  if (!resizeRaf) resizeRaf = requestAnimationFrame(applyResize)
}

function applyResize() {
  resizeRaf = 0
  const state = resizeState
  const pointer = resizePointer
  const config = table.value
  if (!state || !pointer || !config) return

  const dx = (pointer.x - state.startX) / view.zoom
  const dy = (pointer.y - state.startY) / view.zoom
  const hasE = state.dir.includes('e')
  const hasW = state.dir.includes('w')
  const hasS = state.dir.includes('s')
  const hasN = state.dir.includes('n')

  // Keep every row / column at or above the 0.5 mm floor used by the config.
  const minWidth = Math.max(2, 0.5 * config.cols)
  const minHeight = Math.max(1, 0.5 * config.rows)

  let width = hasW ? state.startW - dx : hasE ? state.startW + dx : state.startW
  let height = hasN ? state.startH - dy : hasS ? state.startH + dy : state.startH

  const isCorner = (hasE || hasW) && (hasN || hasS)
  if (isCorner && pointer.shift) {
    // Proportional corner scaling: follow the axis that moved the most.
    const sx = width / state.startW
    const sy = height / state.startH
    let scale = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy
    scale = Math.max(scale, minWidth / state.startW, minHeight / state.startH)
    width = state.startW * scale
    height = state.startH * scale
  }

  width = Math.max(minWidth, width)
  height = Math.max(minHeight, height)
  // Dragging a left / top handle keeps the opposite edge anchored.
  const left = hasW
    ? round(state.startLeft + state.startW - width, 2)
    : undefined
  const top = hasN
    ? round(state.startTop + state.startH - height, 2)
    : undefined

  if (
    Math.abs(width - tableFrame.width) < 0.01 &&
    Math.abs(height - tableFrame.height) < 0.01 &&
    (left === undefined || Math.abs(left - tableFrame.left) < 0.01) &&
    (top === undefined || Math.abs(top - tableFrame.top) < 0.01)
  ) {
    return
  }

  designer.resizeTableFrom(
    state.base,
    round(width, 2),
    round(height, 2),
    left,
    top,
  )
}

function endResize() {
  if (resizeRaf) {
    cancelAnimationFrame(resizeRaf)
    resizeRaf = 0
  }
  if (resizeState) applyResize()
  resizeState = null
  resizePointer = null
  window.removeEventListener('pointermove', onResizeMove)
  window.removeEventListener('pointerup', endResize)
  window.removeEventListener('pointercancel', endResize)
}

function stepSelection(dRow: number, dCol: number, extend = false) {
  const config = table.value
  if (!config) return
  const anchorRow = extend ? tableSelection.endRow : tableSelection.row
  const anchorCol = extend ? tableSelection.endCol : tableSelection.col
  const region = regionAtCell(config, anchorRow, anchorCol)
  let row = anchorRow
  let col = anchorCol
  if (!extend && region) {
    // Move past the whole merged region instead of landing inside it.
    if (dRow > 0) row = region.row + region.rowSpan
    else if (dRow < 0) row = region.row - 1
    if (dCol > 0) col = region.col + region.colSpan
    else if (dCol < 0) col = region.col - 1
  } else {
    row += dRow
    col += dCol
  }
  row = clamp(row, 0, config.rows - 1)
  col = clamp(col, 0, config.cols - 1)
  designer.selectTableCells(row, col, extend)
}

function onKeydown(event: KeyboardEvent) {
  if (!table.value) return
  const target = event.target as HTMLElement | null
  if (
    target &&
    (target.tagName === 'TEXTAREA' ||
      target.tagName === 'INPUT' ||
      target.isContentEditable)
  ) {
    return
  }

  const mod = event.ctrlKey || event.metaKey
  if (mod) {
    if (event.key.toLowerCase() === 'a') {
      event.preventDefault()
      event.stopPropagation()
      designer.selectAllTableCells()
    }
    return
  }

  switch (event.key) {
    case 'ArrowLeft':
      event.preventDefault()
      event.stopPropagation()
      stepSelection(0, -1, event.shiftKey)
      return
    case 'ArrowRight':
      event.preventDefault()
      event.stopPropagation()
      stepSelection(0, 1, event.shiftKey)
      return
    case 'ArrowUp':
      event.preventDefault()
      event.stopPropagation()
      stepSelection(-1, 0, event.shiftKey)
      return
    case 'ArrowDown':
      event.preventDefault()
      event.stopPropagation()
      stepSelection(1, 0, event.shiftKey)
      return
    case 'Tab':
      event.preventDefault()
      event.stopPropagation()
      stepSelection(0, event.shiftKey ? -1 : 1)
      return
    case 'Enter':
    case 'F2': {
      event.preventDefault()
      event.stopPropagation()
      const region = anchorRegion.value
      if (region) openEditor(region.row, region.col, false)
      return
    }
    case 'Delete':
    case 'Backspace':
      event.preventDefault()
      event.stopPropagation()
      designer.clearTableCellText()
      return
    case 'Escape':
      event.preventDefault()
      event.stopPropagation()
      designer.endTableEdit()
      return
    default:
      break
  }

  if (event.altKey) return
  // Typing a printable character starts editing and replaces the cell text.
  if (event.key.length === 1) {
    const region = anchorRegion.value
    if (!region) return
    event.preventDefault()
    event.stopPropagation()
    const seed = event.key === ' ' ? ' ' : event.key
    openEditor(region.row, region.col, true, seed)
  }
}

function setAlign(align: TableAlign) {
  designer.updateSelectedCells({ align })
}

function setValign(valign: TableVAlign) {
  designer.updateSelectedCells({ valign })
}

function toggleBold() {
  const next = !anchorCell.value.bold
  designer.updateSelectedCells({ bold: next })
}

function onToolbarPointerDown(event: MouseEvent) {
  // Keep focus inside the textarea so its blur does not fire mid-click, then
  // commit explicitly before the toolbar action runs.
  event.preventDefault()
  if (editing.value) commitEditor()
}

function finishEditing() {
  commitEditor()
  designer.endTableEdit()
}

/**
 * A pointer down outside the table (canvas, panels, page) must save the open
 * cell first; clicking a non-focusable target does not reliably blur it.
 */
function onDocumentPointerDown(event: PointerEvent) {
  if (!editing.value) return
  const el = overlayEl.value
  if (el && event.target instanceof Node && el.contains(event.target)) return
  commitEditor()
}

onMounted(() => {
  window.addEventListener('pointerdown', onDocumentPointerDown, true)
})

watch(tableEditing, (active) => {
  if (!active) {
    editing.value = null
    endDrag()
    endResize()
    return
  }
  if (!requestedCellEdit.value) focusOverlay()
})

watch(requestedCellEdit, (request) => {
  if (!request || !tableEditing.value) return
  openEditor(request.row, request.col, request.selectAll)
  designer.consumeCellEditRequest()
})

onBeforeUnmount(() => {
  endDrag()
  endResize()
  window.removeEventListener('pointerdown', onDocumentPointerDown, true)
})
</script>

<template>
  <div
    v-if="table && tableEditing"
    ref="overlayEl"
    class="canvas-table-editor"
    :style="overlayStyle"
    tabindex="0"
    @keydown="onKeydown"
  >
    <div
      v-for="region in regions"
      :key="`${region.row}-${region.col}`"
      class="cte-cell"
      :class="{
        selected: isSelected(region),
        anchor: isAnchor(region),
      }"
      :style="regionStyle(region)"
      @pointerdown="onCellPointerDown(region, $event)"
      @dblclick="openEditor(region.row, region.col, true)"
    ></div>

    <textarea
      v-if="editing && editorRegion"
      ref="editorEl"
      v-model="draft"
      class="cte-input"
      :style="editorStyle"
      spellcheck="false"
      placeholder="输入内容"
      @blur="commitEditor()"
      @keydown.enter.exact.prevent.stop="commitEditor()"
      @keydown.esc.prevent.stop="cancelEditor"
      @keydown.tab.prevent.stop="commitEditor($event.shiftKey ? 'prev' : 'next')"
    ></textarea>

    <div v-if="!editing" class="cte-frame">
      <span
        v-for="dir in RESIZE_HANDLES"
        :key="dir"
        class="cte-handle"
        :class="`dir-${dir}`"
        @pointerdown="startResize(dir, $event)"
      ></span>
    </div>

    <div class="cte-toolbar" :style="toolbarStyle" @mousedown="onToolbarPointerDown">
      <button
        type="button"
        class="cte-btn"
        title="合并所选单元格"
        :disabled="!tableCanMerge"
        @click="designer.mergeTableCells()"
      >
        <Merge :size="14" />
        <span>合并</span>
      </button>
      <button
        type="button"
        class="cte-btn"
        title="拆分单元格"
        :disabled="!tableCanSplit"
        @click="designer.splitTableCells()"
      >
        <Split :size="14" />
      </button>
      <span class="cte-sep"></span>
      <button
        type="button"
        class="cte-btn icon"
        title="左对齐"
        :class="{ active: (anchorCell.align ?? 'left') === 'left' }"
        @click="setAlign('left')"
      >
        <AlignLeft :size="15" />
      </button>
      <button
        type="button"
        class="cte-btn icon"
        title="水平居中"
        :class="{ active: anchorCell.align === 'center' }"
        @click="setAlign('center')"
      >
        <AlignCenter :size="15" />
      </button>
      <button
        type="button"
        class="cte-btn icon"
        title="右对齐"
        :class="{ active: anchorCell.align === 'right' }"
        @click="setAlign('right')"
      >
        <AlignRight :size="15" />
      </button>
      <span class="cte-sep"></span>
      <button
        type="button"
        class="cte-btn icon"
        title="顶端对齐"
        :class="{ active: (anchorCell.valign ?? 'middle') === 'top' }"
        @click="setValign('top')"
      >
        <AlignVerticalJustifyStart :size="15" />
      </button>
      <button
        type="button"
        class="cte-btn icon"
        title="垂直居中"
        :class="{ active: (anchorCell.valign ?? 'middle') === 'middle' }"
        @click="setValign('middle')"
      >
        <AlignVerticalJustifyCenter :size="15" />
      </button>
      <button
        type="button"
        class="cte-btn icon"
        title="底端对齐"
        :class="{ active: (anchorCell.valign ?? 'middle') === 'bottom' }"
        @click="setValign('bottom')"
      >
        <AlignVerticalJustifyEnd :size="15" />
      </button>
      <span class="cte-sep"></span>
      <button
        type="button"
        class="cte-btn icon"
        title="加粗"
        :class="{ active: anchorCell.bold === true }"
        @click="toggleBold"
      >
        <Bold :size="15" />
      </button>
      <span class="cte-sep"></span>
      <button
        type="button"
        class="cte-btn icon"
        :title="tableBorderState.top ? '隐藏上边框' : '显示上边框'"
        :class="{ active: tableBorderState.top }"
        @click="designer.toggleTableBorder('top')"
      >
        <PanelTop :size="15" />
      </button>
      <button
        type="button"
        class="cte-btn icon"
        :title="tableBorderState.right ? '隐藏右边框' : '显示右边框'"
        :class="{ active: tableBorderState.right }"
        @click="designer.toggleTableBorder('right')"
      >
        <PanelRight :size="15" />
      </button>
      <button
        type="button"
        class="cte-btn icon"
        :title="tableBorderState.bottom ? '隐藏下边框' : '显示下边框'"
        :class="{ active: tableBorderState.bottom }"
        @click="designer.toggleTableBorder('bottom')"
      >
        <PanelBottom :size="15" />
      </button>
      <button
        type="button"
        class="cte-btn icon"
        :title="tableBorderState.left ? '隐藏左边框' : '显示左边框'"
        :class="{ active: tableBorderState.left }"
        @click="designer.toggleTableBorder('left')"
      >
        <PanelLeft :size="15" />
      </button>
      <span class="cte-sep"></span>
      <span class="cte-range">{{ tableRangeLabel }} · {{ tableSelectionCount }}</span>
      <button type="button" class="cte-btn done" title="退出表格编辑" @click="finishEditing">
        <Check :size="14" />
        <span>完成</span>
      </button>
    </div>
  </div>
</template>

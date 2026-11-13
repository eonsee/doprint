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
  cellAt,
  regionAtCell,
  type TableAlign,
  type TableCell,
  type TableRegion,
  type TableVAlign,
} from '../designer/table'
import { clamp } from '../designer/units'

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

const tableLayerStyle = computed(() => {
  const width = tableFrame.width * view.zoom
  const height = tableFrame.height * view.zoom
  return {
    left: `${tableFrame.centerX * view.zoom - width / 2}px`,
    top: `${tableFrame.centerY * view.zoom - height / 2}px`,
    width: `${width}px`,
    height: `${height}px`,
    transform: `rotate(${tableFrame.angle}deg)`,
  }
})

const toolbarStyle = computed(() => {
  const radians = (tableFrame.angle * Math.PI) / 180
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))
  const width = tableFrame.width * view.zoom
  const height = tableFrame.height * view.zoom
  // Axis-aligned bounds of the rotated table, in CSS pixels.
  const boxWidth = cos * width + sin * height
  const boxHeight = sin * width + cos * height
  const left = tableFrame.centerX * view.zoom - boxWidth / 2
  const right = tableFrame.centerX * view.zoom + boxWidth / 2
  const top = tableFrame.centerY * view.zoom - boxHeight / 2
  const bottom = tableFrame.centerY * view.zoom + boxHeight / 2
  const below = top < 58
  return {
    top: `${below ? bottom + 10 : top - 46}px`,
    // The toolbar is wider than a table, so anchor it to the table edge that
    // faces the middle of the page: that keeps it inside the canvas stage for
    // tables in either half instead of running under the inspector.
    ...(tableFrame.centerX > page.width / 2
      ? { right: `${Math.max(0, page.width * view.zoom - right)}px` }
      : { left: `${Math.max(0, left)}px` }),
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

function openEditor(
  row: number,
  col: number,
  selectAll: boolean,
  seed?: string,
) {
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
}

function cancelEditor() {
  editing.value = null
}

function stepSelection(dRow: number, dCol: number, extend = false) {
  const config = table.value
  if (!config) return
  // `endRow / endCol` is the active edge of the range. After a Shift-selection
  // an arrow should continue from that edge, not snap back to the anchor.
  const baseRow = tableSelection.endRow
  const baseCol = tableSelection.endCol
  const region = regionAtCell(config, baseRow, baseCol)
  let row = baseRow
  let col = baseCol
  if (region) {
    // Move past the whole merged region instead of landing inside it.
    if (dRow > 0) row = region.row + region.rowSpan
    else if (dRow < 0) row = region.row - 1
    if (dCol > 0) col = region.col + region.colSpan
    else if (dCol < 0) col = region.col - 1
  } else {
    row += dRow
    col += dCol
  }
  row = clamp(row, 0, config.rowCount - 1)
  col = clamp(col, 0, config.columnCount - 1)
  designer.selectTableCells(row, col, extend)
}

function isTextInput(target: EventTarget | null): boolean {
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
  if (!table.value || !tableEditing.value) return
  if (document.querySelector('[data-modal]')) return
  // While the inline textarea is open it owns the keyboard.
  if (editing.value || isTextInput(event.target)) return

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
  window.addEventListener('keydown', onKeydown)
})

watch(tableEditing, (active) => {
  if (!active) editing.value = null
})

watch(requestedCellEdit, (request) => {
  if (!request || !tableEditing.value) return
  openEditor(request.row, request.col, request.selectAll)
  designer.consumeCellEditRequest()
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onDocumentPointerDown, true)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    v-if="table && tableEditing"
    ref="overlayEl"
    class="canvas-table-editor"
  >
    <div class="cte-cell-layer" :style="tableLayerStyle">
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

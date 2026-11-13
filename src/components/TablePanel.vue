<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  Merge,
  Pencil,
  Split,
} from 'lucide-vue-next'
import BindingPicker from './ui/BindingPicker.vue'
import ColorField from './ui/ColorField.vue'
import InspectorSection from './ui/InspectorSection.vue'
import NumField from './ui/NumField.vue'
import { useDesigner } from '../designer/context'
import type { TableAlign, TableCell, TableRegion, TableVAlign } from '../designer/table'
import {
  TABLE_LIMITS,
  buildRegions,
  cellAt,
  normalizeRange,
} from '../designer/table'
import {
  FONT_OPTIONS,
  MM_TO_PT,
  PT_TO_MM,
  clamp,
  round,
} from '../designer/units'

const designer = useDesigner()
const {
  table,
  tableSelection,
  tableEditing,
  tableSize,
  tableRangeLabel,
  tableSelectionCount,
  tableCanMerge,
  tableCanSplit,
  dataFields,
} = designer

const cellTextarea = ref<HTMLTextAreaElement>()

const regions = computed<TableRegion[]>(() =>
  table.value ? buildRegions(table.value) : [],
)

const selectedRange = computed(() => normalizeRange(tableSelection))

const exactRegion = computed<TableRegion | null>(() => {
  if (!table.value) return null
  const range = selectedRange.value
  return (
    regions.value.find(
      (region) =>
        region.row === range.row &&
        region.col === range.col &&
        region.row + region.rowSpan - 1 === range.endRow &&
        region.col + region.colSpan - 1 === range.endCol,
    ) ?? null
  )
})

const activeCell = computed<TableCell>(() => {
  if (!table.value) return { align: 'left', valign: 'middle' }
  const region =
    exactRegion.value ??
    regions.value.find(
      (item) =>
        item.row === selectedRange.value.row &&
        item.col === selectedRange.value.col,
    )
  return region
    ? cellAt(table.value, region.row, region.col)
    : { align: 'left', valign: 'middle' }
})

const canEditText = computed(() => exactRegion.value !== null)
const cellText = computed(() => activeCell.value.text ?? '')
const fontSizePt = computed(() =>
  table.value ? round(table.value.fontSize * MM_TO_PT, 1) : 0,
)
const gridStyle = computed(() => {
  if (!table.value) return {}
  return {
    gridTemplateColumns: table.value.colWidths
      .map((width) => `minmax(0, ${width}fr)`)
      .join(' '),
  }
})

function isCellSelected(region: TableRegion): boolean {
  const range = selectedRange.value
  return !(
    region.row + region.rowSpan - 1 < range.row ||
    region.row > range.endRow ||
    region.col + region.colSpan - 1 < range.col ||
    region.col > range.endCol
  )
}

function isAnchor(region: TableRegion): boolean {
  const range = selectedRange.value
  return region.row === range.row && region.col === range.col
}

function cellLabel(region: TableRegion): string {
  if (!table.value) return ''
  return cellAt(table.value, region.row, region.col).text ?? ''
}

function cellStyle(region: TableRegion) {
  const cell = table.value
    ? cellAt(table.value, region.row, region.col)
    : { align: 'left' as const }
  const justifyContent =
    cell.align === 'center'
      ? 'center'
      : cell.align === 'right'
        ? 'flex-end'
        : 'flex-start'
  return {
    gridRow: `${region.row + 1} / span ${region.rowSpan}`,
    gridColumn: `${region.col + 1} / span ${region.colSpan}`,
    background: cell.fill || '#ffffff',
    color: cell.color || undefined,
    fontWeight: cell.bold ? '650' : undefined,
    textAlign: cell.align ?? 'left',
    justifyContent,
  }
}

function onCellClick(region: TableRegion, event: MouseEvent) {
  designer.selectTableCells(region.row, region.col, event.shiftKey)
}

function onRows(value: number) {
  if (!table.value) return
  designer.setTableSize(Math.round(value), table.value.cols)
}

function onCols(value: number) {
  if (!table.value) return
  designer.setTableSize(table.value.rows, Math.round(value))
}

function setAlign(align: TableAlign) {
  designer.updateSelectedCells({ align })
}

function setValign(valign: TableVAlign) {
  designer.updateSelectedCells({ valign })
}

function toggleBold() {
  designer.updateSelectedCells({ bold: !activeCell.value.bold })
}

function onCellText(event: Event) {
  designer.updateSelectedCells({
    text: (event.target as HTMLTextAreaElement).value,
  })
}

function insertCellBinding(key: string) {
  const token = `{{${key}}}`
  const current = cellText.value
  const el = cellTextarea.value
  const start = el?.selectionStart ?? current.length
  const end = el?.selectionEnd ?? current.length
  const next = current.slice(0, start) + token + current.slice(end)
  designer.updateSelectedCells({ text: next })
  void nextTick(() => {
    el?.focus()
    const caret = start + token.length
    el?.setSelectionRange(caret, caret)
  })
}

function setFontSizePt(value: number) {
  designer.updateTableStyle({
    fontSize: clamp(value, 4, 300) * PT_TO_MM,
  })
}

function onFontFamily(event: Event) {
  designer.updateTableStyle({
    fontFamily: (event.target as HTMLSelectElement).value,
  })
}

function toggleCanvasEditing() {
  if (tableEditing.value) designer.endTableEdit()
  else designer.beginTableEdit()
}
</script>

<template>
  <div v-if="table" class="table-panel">
    <InspectorSection title="表格">
      <div class="field-grid">
        <NumField
          label="行数"
          :model-value="table.rows"
          :step="1"
          :min="TABLE_LIMITS.minRows"
          :max="TABLE_LIMITS.maxRows"
          @update:model-value="onRows"
        />
        <NumField
          label="列数"
          :model-value="table.cols"
          :step="1"
          :min="TABLE_LIMITS.minCols"
          :max="TABLE_LIMITS.maxCols"
          @update:model-value="onCols"
        />
        <NumField
          label="宽度"
          :model-value="tableSize.width"
          unit="mm"
          :step="0.5"
          :min="2"
          @update:model-value="designer.setTableWidthValue"
        />
        <NumField
          label="高度"
          :model-value="tableSize.height"
          unit="mm"
          :step="0.5"
          :min="1"
          @update:model-value="designer.setTableHeightValue"
        />
      </div>

      <div class="table-grid-wrap">
        <div class="table-cell-grid" :style="gridStyle">
          <button
            v-for="region in regions"
            :key="`${region.row}-${region.col}`"
            type="button"
            class="table-cell-btn"
            :class="{
              selected: isCellSelected(region),
              anchor: isAnchor(region),
            }"
            :style="cellStyle(region)"
            :title="`R${region.row + 1}C${region.col + 1}`"
            @click="onCellClick(region, $event)"
          >
            <span>{{ cellLabel(region) }}</span>
          </button>
        </div>
      </div>

      <div class="table-range-row">
        <span class="table-range-label">{{ tableRangeLabel }}</span>
        <span class="table-range-count">{{ tableSelectionCount }} 个单元格</span>
      </div>

      <button
        class="btn wide table-canvas-toggle"
        :class="{ active: tableEditing }"
        @click="toggleCanvasEditing"
      >
        <Check v-if="tableEditing" :size="14" />
        <Pencil v-else :size="14" />
        {{ tableEditing ? '完成表格编辑' : '在画布上编辑表格' }}
      </button>

      <div class="table-actions">
        <button
          class="btn ghost"
          :disabled="!tableCanMerge"
          @click="designer.mergeTableCells()"
        >
          <Merge :size="14" />
          合并
        </button>
        <button
          class="btn ghost"
          :disabled="!tableCanSplit"
          @click="designer.splitTableCells()"
        >
          <Split :size="14" />
          拆分
        </button>
      </div>
      <p class="field-note">
        双击画布上的表格可直接框选、合并、拆分和输入内容；按住 Shift
        点击可扩展选区。合并或拆分都会保留左上角内容。
      </p>
    </InspectorSection>

    <InspectorSection title="单元格">
      <template v-if="canEditText">
        <textarea
          ref="cellTextarea"
          class="text-content cell-text"
          rows="2"
          :value="cellText"
          placeholder="单元格内容"
          @input="onCellText"
        ></textarea>
        <BindingPicker :fields="dataFields" @insert="insertCellBinding" />
      </template>
      <p v-else class="field-note">
        已选择 {{ tableSelectionCount }} 个单元格。文本请选择单个单元格后编辑，
        对齐和颜色会应用到整个选区。
      </p>

      <div class="inline-row">
        <span>水平对齐</span>
        <div class="segmented">
          <button
            title="左对齐"
            :class="{ active: (activeCell.align ?? 'left') === 'left' }"
            @click="setAlign('left')"
          >
            <AlignLeft :size="15" />
          </button>
          <button
            title="居中"
            :class="{ active: activeCell.align === 'center' }"
            @click="setAlign('center')"
          >
            <AlignCenter :size="15" />
          </button>
          <button
            title="右对齐"
            :class="{ active: activeCell.align === 'right' }"
            @click="setAlign('right')"
          >
            <AlignRight :size="15" />
          </button>
        </div>
      </div>

      <div class="inline-row">
        <span>垂直对齐</span>
        <div class="segmented text-seg">
          <button
            :class="{ active: (activeCell.valign ?? 'middle') === 'top' }"
            @click="setValign('top')"
          >
            上
          </button>
          <button
            :class="{ active: (activeCell.valign ?? 'middle') === 'middle' }"
            @click="setValign('middle')"
          >
            中
          </button>
          <button
            :class="{ active: (activeCell.valign ?? 'middle') === 'bottom' }"
            @click="setValign('bottom')"
          >
            下
          </button>
        </div>
      </div>

      <div class="inline-row">
        <span>文字样式</span>
        <div class="segmented">
          <button
            title="加粗"
            :class="{ active: activeCell.bold === true }"
            @click="toggleBold"
          >
            <Bold :size="15" />
          </button>
        </div>
      </div>

      <ColorField
        label="单元格填充"
        clearable
        :model-value="activeCell.fill ?? ''"
        @update:model-value="designer.updateSelectedCells({ fill: $event })"
      />
      <ColorField
        label="单元格文字颜色"
        clearable
        :model-value="activeCell.color ?? ''"
        @update:model-value="designer.updateSelectedCells({ color: $event })"
      />
    </InspectorSection>

    <InspectorSection title="表格样式">
      <label class="select-field">
        <span>字体</span>
        <select :value="table.fontFamily" @change="onFontFamily">
          <option
            v-for="font in FONT_OPTIONS"
            :key="font.value"
            :value="font.value"
          >
            {{ font.label }}
          </option>
        </select>
      </label>

      <div class="field-grid">
        <NumField
          label="字号"
          :model-value="fontSizePt"
          unit="pt"
          :step="0.5"
          :min="4"
          :max="300"
          @update:model-value="setFontSizePt"
        />
        <NumField
          label="内边距"
          :model-value="table.padding"
          unit="mm"
          :step="0.1"
          :min="0"
          :max="10"
          @update:model-value="designer.updateTableStyle({ padding: $event })"
        />
        <NumField
          label="边框宽度"
          :model-value="table.borderWidth"
          unit="mm"
          :step="0.05"
          :min="0"
          :max="2"
          @update:model-value="designer.updateTableStyle({ borderWidth: $event })"
        />
      </div>

      <ColorField
        label="边框颜色"
        :model-value="table.borderColor"
        @update:model-value="designer.updateTableStyle({ borderColor: $event })"
      />
      <ColorField
        label="表格底色"
        :model-value="table.background"
        @update:model-value="designer.updateTableStyle({ background: $event })"
      />
    </InspectorSection>
  </div>
</template>

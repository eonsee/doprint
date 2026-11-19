<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Merge,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  Pencil,
  Split,
  Underline,
  X,
} from 'lucide-vue-next'
import BindingPicker from './ui/BindingPicker.vue'
import ColorField from './ui/ColorField.vue'
import FontSizeSelect from './ui/FontSizeSelect.vue'
import InspectorSection from './ui/InspectorSection.vue'
import NumField from './ui/NumField.vue'
import { useDesigner } from '../designer/context'
import type { TableAlign, TableCell, TableRegion, TableVAlign } from '../designer/table'
import {
  TABLE_LIMITS,
  buildRegions,
  cellAt,
  getColumnWidths,
  normalizeRange,
} from '../designer/table'
import {
  FONT_OPTIONS,
  PX_PER_MM,
  PX_TO_MM,
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
  tableBorderState,
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

/** Detail collections available for repeating a table row. */
const detailFields = computed(() =>
  dataFields.value.filter(
    (field) => Array.isArray(field.rows) && field.rows.length > 0,
  ),
)
const repeatConfig = computed(() => table.value?.repeat ?? null)
const selectedRowLabel = computed(() => tableSelection.row + 1)

function onRepeatSource(event: Event) {
  const source = (event.target as HTMLSelectElement).value
  if (!source) designer.clearTableRepeatRow()
  else designer.setTableRepeatRow(source)
}

const canEditText = computed(() => exactRegion.value !== null)
const cellText = computed(() => activeCell.value.text ?? '')
const fontSizePx = computed(() =>
  table.value ? round(table.value.fontSize * PX_PER_MM, 1) : 0,
)
/** Effective values for the selected cell, not the table defaults. */
const cellFontSizePx = computed(() =>
  table.value
    ? round(
        (activeCell.value.fontSize ?? table.value.fontSize) * PX_PER_MM,
        1,
      )
    : 0,
)
const cellFontFamily = computed(
  () => activeCell.value.fontFamily || table.value?.fontFamily || 'SimSun',
)
const gridStyle = computed(() => {
  if (!table.value) return {}
  return {
    gridTemplateColumns: getColumnWidths(table.value)
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
    fontStyle: cell.italic ? 'italic' : undefined,
    textDecoration: cell.underline ? 'underline' : undefined,
    fontFamily: cell.fontFamily || table.value?.fontFamily || undefined,
    textAlign: cell.align ?? 'left',
    justifyContent,
  }
}

function onCellClick(region: TableRegion, event: MouseEvent) {
  designer.selectTableCells(region.row, region.col, event.shiftKey)
}

function onRows(value: number) {
  if (!table.value) return
  designer.setTableSize(Math.round(value), table.value.columnCount)
}

function onCols(value: number) {
  if (!table.value) return
  designer.setTableSize(table.value.rowCount, Math.round(value))
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

function setFontSizePx(value: number) {
  designer.updateTableStyle({
    fontSize: clamp(value, 4, 300) * PX_TO_MM,
  })
}

function setCellFontSizePx(value: number) {
  designer.updateSelectedCells({
    fontSize: clamp(value, 4, 300) * PX_TO_MM,
  })
}

function onCellFontFamily(event: Event) {
  designer.updateSelectedCells({
    fontFamily: (event.target as HTMLSelectElement).value,
  })
}

function toggleItalic() {
  designer.updateSelectedCells({ italic: !activeCell.value.italic })
}

function toggleUnderline() {
  designer.updateSelectedCells({ underline: !activeCell.value.underline })
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
          :model-value="table.rowCount"
          :step="1"
          :min="TABLE_LIMITS.minRows"
          :max="TABLE_LIMITS.maxRows"
          @update:model-value="onRows"
        />
        <NumField
          label="列数"
          :model-value="table.columnCount"
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
              'doprint-repeat':
                repeatConfig !== null && repeatConfig.row === region.row,
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
        <X v-if="tableEditing" :size="14" />
        <Pencil v-else :size="14" />
        {{ tableEditing ? '退出表格编辑' : '在画布上编辑表格' }}
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
        选中表格后可拖动 8 个控制点缩放整张表格（角点按 Shift
        等比缩放），上方旋转控制点可调整角度。双击表格进入单元格编辑：拖拽框选、Shift
        扩展选区，双击或直接输入即可编辑内容，工具栏可合并、拆分及显示或隐藏选区四边边框。
        选中表格后无需双击，把指针移到表格内部的列线或行线上，光标变成双向箭头即可拖动：
        相邻的列或行会反向补偿，整张表格的尺寸和位置保持不变。
      </p>
    </InspectorSection>

    <InspectorSection title="明细行绑定">
      <label class="select-field compact">
        <span>明细数据（作用于当前第 {{ selectedRowLabel }} 行）</span>
        <select :value="repeatConfig?.source ?? ''" @change="onRepeatSource">
          <option value="">不使用明细数据</option>
          <option v-for="field in detailFields" :key="field.key" :value="field.key">
            {{ field.key }}（{{ field.rows?.length ?? 0 }} 行）
          </option>
        </select>
      </label>
      <p v-if="repeatConfig" class="field-note">
        第 {{ repeatConfig.row + 1 }} 行将按「{{ repeatConfig.source }}」的数据行数重复。
        设计画布用第一条明细作为示例，预览 / 导出时自动扩展；明细字段用
        <code v-pre>{{items.字段}}</code> 绑定。
      </p>
      <template v-else-if="detailFields.length">
        <p class="field-note">
          选择明细数据后，当前选中的行将成为明细模板行，按子表记录重复。
          行内使用 <code v-pre>{{明细字段.列名}}</code> 绑定子表字段。
        </p>
      </template>
      <p v-else class="field-note">
        暂无明细数据。可在「数据」标签的「从 JSON 导入」中粘贴主表对象与对象数组，例如
        <code v-pre>{"customer": "客户", "items": [{"name": "A", "qty": 1}]}</code>，
        items 会成为可重复的明细集合。
      </p>
      <button
        v-if="repeatConfig"
        class="btn ghost wide"
        @click="designer.clearTableRepeatRow()"
      >
        取消明细行
      </button>
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
          <button
            title="斜体"
            :class="{ active: activeCell.italic === true }"
            @click="toggleItalic"
          >
            <Italic :size="15" />
          </button>
          <button
            title="下划线"
            :class="{ active: activeCell.underline === true }"
            @click="toggleUnderline"
          >
            <Underline :size="15" />
          </button>
        </div>
      </div>

      <label class="select-field">
        <span>单元格字体</span>
        <select :value="cellFontFamily" @change="onCellFontFamily">
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
        <FontSizeSelect
          label="单元格字号"
          :model-value="cellFontSizePx"
          @update:model-value="setCellFontSizePx"
        />
      </div>
      <p class="field-note">
        这里的字体和字号只作用于当前选中的单元格（或选区），不会影响整张表格。
      </p>

      <div class="inline-row">
        <span>选区边框</span>
        <div class="segmented">
          <button
            :title="tableBorderState.top ? '隐藏上边框' : '显示上边框'"
            :class="{ active: tableBorderState.top }"
            @click="designer.toggleTableBorder('top')"
          >
            <PanelTop :size="15" />
          </button>
          <button
            :title="tableBorderState.right ? '隐藏右边框' : '显示右边框'"
            :class="{ active: tableBorderState.right }"
            @click="designer.toggleTableBorder('right')"
          >
            <PanelRight :size="15" />
          </button>
          <button
            :title="tableBorderState.bottom ? '隐藏下边框' : '显示下边框'"
            :class="{ active: tableBorderState.bottom }"
            @click="designer.toggleTableBorder('bottom')"
          >
            <PanelBottom :size="15" />
          </button>
          <button
            :title="tableBorderState.left ? '隐藏左边框' : '显示左边框'"
            :class="{ active: tableBorderState.left }"
            @click="designer.toggleTableBorder('left')"
          >
            <PanelLeft :size="15" />
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
        <span>默认字体</span>
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
        <FontSizeSelect
          label="默认字号"
          :model-value="fontSizePx"
          @update:model-value="setFontSizePx"
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
      <p class="field-note">
        默认字体和字号作为整张表格的基准；在“单元格”中单独设置的字体、
        字号会覆盖这里的默认值。
      </p>
    </InspectorSection>
  </div>
</template>

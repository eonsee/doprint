<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  Bold,
  Copy,
  Globe,
  ImagePlus,
  Italic,
  Lock,
  Settings2,
  Trash2,
  Underline,
  Unlock,
} from 'lucide-vue-next'
import { useDesigner } from '../designer/context'
import { getCellStyle } from '../designer/table'
import type { AlignAction } from '../designer/designer'
import type { UpdatePatch } from '../designer/types'
import {
  DEFAULT_FONT_PX,
  FONT_OPTIONS,
  PAGE_PRESETS,
  PX_PER_MM,
  PX_TO_MM,
  clamp,
  fontSizeOptions,
  round,
} from '../designer/units'

const designer = useDesigner()
const {
  selection,
  table,
  tableSelection,
  globalTextStyle,
  page,
  pagePreset,
} = designer

const isMulti = computed(() => selection.count > 1)
const isLandscape = computed(() => page.width > page.height)
const backgroundOpacityPercent = computed(() =>
  Math.round(page.backgroundOpacity * 100),
)
const isTextSelected = computed(() => !isMulti.value && selection.isText)
const isTableSelected = computed(() => !isMulti.value && selection.isTable)
/** A multi-selection that contains text elements or tables. */
const multiFontTargets = computed(
  () =>
    isMulti.value &&
    (selection.textCount > 0 || selection.tableCount > 0),
)
const multiTextSelected = computed(
  () => isMulti.value && selection.textCount > 0,
)
const showFontControls = computed(
  () =>
    isTextSelected.value ||
    isTableSelected.value ||
    multiFontTargets.value,
)
const showWidth = computed(() => !isMulti.value && !selection.isTable)
const showHeight = computed(
  () => !isMulti.value && !selection.isTable && !selection.isText,
)
const showTextControls = computed(
  () => isTextSelected.value || multiTextSelected.value,
)
// For a table, the top bar edits the selected cell range (Excel-style); the
// whole-table defaults live in the inspector's "表格样式" section.
const editingCells = computed(() => isTableSelected.value && !!table.value)

/** Effective style of the active cell while editing a table range. */
const cellStyle = computed(() =>
  editingCells.value && table.value
    ? getCellStyle(table.value, tableSelection.row, tableSelection.col)
    : undefined,
)

const fontFamily = computed(() => {
  if (isTableSelected.value && table.value) {
    return cellStyle.value?.fontFamily ?? table.value.fontFamily
  }
  return selection.text.fontFamily
})
const fontSizePx = computed(() => {
  if (isTableSelected.value && table.value) {
    return round(
      (cellStyle.value?.fontSize ?? table.value.fontSize) * PX_PER_MM,
      1,
    )
  }
  return round(selection.text.fontSize * PX_PER_MM, 1)
})
const selectionSizeOptions = computed(() => fontSizeOptions(fontSizePx.value))

/* ------------------------------------------------------------ global mode */

const globalFont = ref(FONT_OPTIONS[0]?.value ?? 'SimSun')
const globalSizePx = ref(DEFAULT_FONT_PX)
const globalSizeOptions = computed(() => fontSizeOptions(globalSizePx.value))
/** When on, font / size changes are pushed to every text and table at once. */
const applyToAll = ref(false)
let noticeTimer: number | undefined

watch(
  globalTextStyle,
  (value) => {
    globalFont.value = value.fontFamily
    globalSizePx.value = value.fontSizePx || DEFAULT_FONT_PX
  },
  { immediate: true },
)

watch(
  () => globalTextStyle.value.count,
  (count) => {
    if (!count) applyToAll.value = false
  },
)

onBeforeUnmount(() => {
  if (noticeTimer) window.clearTimeout(noticeTimer)
})

function onGlobalFont(event: Event) {
  globalFont.value = (event.target as HTMLSelectElement).value
  if (applyToAll.value) applyGlobalStyle()
}

function onGlobalSize(event: Event) {
  const value = Number((event.target as HTMLSelectElement).value)
  if (!Number.isFinite(value)) return
  globalSizePx.value = clamp(value, 4, 300)
  if (applyToAll.value) applyGlobalStyle()
}

function onApplyToAll(event: Event) {
  applyToAll.value = (event.target as HTMLInputElement).checked
  if (applyToAll.value) applyGlobalStyle()
}

function fontLabel(value: string) {
  return FONT_OPTIONS.find((font) => font.value === value)?.label ?? value
}

function applyGlobalStyle() {
  if (!globalTextStyle.value.count) return
  designer.applyGlobalTextStyle({
    fontFamily: globalFont.value,
    fontSizePx: globalSizePx.value,
  })
  const message = `已应用全局字体：${fontLabel(globalFont.value)} ${globalSizePx.value}px`
  designer.notice.value = message
  if (noticeTimer) window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    if (designer.notice.value === message) designer.notice.value = ''
  }, 2400)
}

/* ------------------------------------------------------ page-level props */

const backgroundInput = ref<HTMLInputElement>()

function onPreset(event: Event) {
  designer.setPreset((event.target as HTMLSelectElement).value)
}

function onPageWidth(event: Event) {
  const value = readNumber(event)
  if (value !== null) designer.setPageSize(value, page.height)
}

function onPageHeight(event: Event) {
  const value = readNumber(event)
  if (value !== null) designer.setPageSize(page.width, value)
}

function setOrientation(orientation: 'portrait' | 'landscape') {
  const wantLandscape = orientation === 'landscape'
  if (wantLandscape === isLandscape.value) return
  designer.setPageSize(page.height, page.width)
}

function onPageMargin(
  side: 'top' | 'right' | 'bottom' | 'left',
  event: Event,
) {
  const value = readNumber(event)
  if (value !== null) designer.setPageMargin(side, value)
}

function pickBackground() {
  backgroundInput.value?.click()
}

async function onBackgroundFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) await designer.setPageBackgroundFile(file)
  input.value = ''
}

function onBackgroundVisible(event: Event) {
  designer.setPageBackgroundVisible(
    (event.target as HTMLInputElement).checked,
  )
}

function onBackgroundOpacity(event: Event) {
  const value = readNumber(event)
  if (value !== null) {
    designer.setPageBackgroundOpacity(clamp(value, 0, 100) / 100)
  }
}

function onBackgroundPrint(event: Event) {
  designer.setPageBackgroundPrint((event.target as HTMLInputElement).checked)
}

function onWatermarkVisible(event: Event) {
  designer.setWatermarkVisible((event.target as HTMLInputElement).checked)
}

function onWatermarkText(event: Event) {
  designer.setWatermarkText((event.target as HTMLInputElement).value)
}

/* --------------------------------------------------------- selection mode */

function update(patch: UpdatePatch) {
  designer.updateSelected(patch)
}

function onFontFamily(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (isMulti.value) designer.updateSelectedTextStyle({ fontFamily: value })
  else if (editingCells.value) designer.updateSelectedCells({ fontFamily: value })
  else if (isTableSelected.value) designer.updateTableStyle({ fontFamily: value })
  else update({ fontFamily: value })
}

function onFontSize(event: Event) {
  const select = event.target as HTMLSelectElement
  const value = Number(select.value)
  if (!Number.isFinite(value)) {
    select.value = String(fontSizePx.value)
    return
  }
  const mm = clamp(value, 4, 300) * PX_TO_MM
  if (isMulti.value) designer.updateSelectedTextStyle({ fontSize: mm })
  else if (editingCells.value) designer.updateSelectedCells({ fontSize: mm })
  else if (isTableSelected.value) designer.updateTableStyle({ fontSize: mm })
  else update({ fontSize: mm })
}

function readNumber(event: Event): number | null {
  const input = event.target as HTMLInputElement
  const value = Number(input.value)
  return Number.isFinite(value) ? value : null
}

function onPosition(axis: 'left' | 'top', event: Event) {
  const value = readNumber(event)
  if (value === null) return
  update(axis === 'left' ? { left: value } : { top: value })
}

function onSize(axis: 'width' | 'height', event: Event) {
  const value = readNumber(event)
  if (value === null) return
  update(axis === 'width' ? { width: value } : { height: value })
}

function onAngle(event: Event) {
  const value = readNumber(event)
  if (value === null) return
  update({ angle: value })
}

function toggleBold() {
  const fontWeight =
    selection.text.fontWeight === 'bold' ? 'normal' : 'bold'
  if (isMulti.value) designer.updateSelectedTextStyle({ fontWeight })
  else update({ fontWeight })
}

function toggleItalic() {
  const fontStyle =
    selection.text.fontStyle === 'italic' ? 'normal' : 'italic'
  if (isMulti.value) designer.updateSelectedTextStyle({ fontStyle })
  else update({ fontStyle })
}

function toggleUnderline() {
  const underline = !selection.text.underline
  if (isMulti.value) designer.updateSelectedTextStyle({ underline })
  else update({ underline })
}

function setTextAlign(align: string) {
  update({ textAlign: align })
}

function alignObjects(action: AlignAction) {
  designer.alignSelected(action)
}
</script>

<template>
  <div class="topbar-props">
    <!-- ------------------------------------------------ nothing selected -->
    <template v-if="selection.count === 0">
      <span class="tbp-title">
        <Settings2 :size="13" />
        页面
      </span>

      <label class="tbp-select tbp-paper" title="纸张预设">
        <select :value="pagePreset" @change="onPreset">
          <option
            v-for="preset in PAGE_PRESETS"
            :key="preset.key"
            :value="preset.key"
            :disabled="preset.key === 'custom'"
          >
            {{ preset.label }}
          </option>
        </select>
      </label>

      <label class="tbp-num" title="页面宽度">
        <span>W</span>
        <input
          type="number"
          step="1"
          min="20"
          max="1000"
          :value="page.width"
          @change="onPageWidth"
        />
        <em>mm</em>
      </label>
      <label class="tbp-num" title="页面高度">
        <span>H</span>
        <input
          type="number"
          step="1"
          min="20"
          max="1000"
          :value="page.height"
          @change="onPageHeight"
        />
        <em>mm</em>
      </label>

      <div class="segmented text-seg tbp-seg">
        <button
          title="纵向纸张"
          :class="{ active: !isLandscape }"
          @click="setOrientation('portrait')"
        >
          纵向
        </button>
        <button
          title="横向纸张"
          :class="{ active: isLandscape }"
          @click="setOrientation('landscape')"
        >
          横向
        </button>
      </div>

      <span class="tbp-sep"></span>
      <span class="tbp-title">底图</span>
      <button
        class="btn ghost tbp-apply"
        title="导入扫描件或模板图片作为纸张底图"
        @click="pickBackground"
      >
        <ImagePlus :size="13" />
        {{ page.backgroundImage ? '更换' : '导入' }}
      </button>
      <template v-if="page.backgroundImage">
        <label class="tbp-switch" title="在画布上显示纸张底图">
          <input
            class="switch"
            type="checkbox"
            :checked="page.backgroundVisible"
            @change="onBackgroundVisible"
          />
          <span>显示</span>
        </label>
        <label class="tbp-num" title="底图不透明度">
          <span>透明</span>
          <input
            type="number"
            step="5"
            min="0"
            max="100"
            :value="backgroundOpacityPercent"
            @change="onBackgroundOpacity"
          />
          <em>%</em>
        </label>
        <label class="tbp-switch" title="SVG / PDF 输出时包含底图">
          <input
            class="switch"
            type="checkbox"
            :checked="page.backgroundPrint"
            @change="onBackgroundPrint"
          />
          <span>随打印</span>
        </label>
        <button
          class="icon-btn tiny"
          title="移除纸张底图"
          @click="designer.removePageBackground()"
        >
          <Trash2 :size="14" />
        </button>
      </template>

      <span class="tbp-sep"></span>
      <span class="tbp-title">水印</span>
      <label class="tbp-switch" title="显示 / 隐藏版权水印">
        <input
          class="switch"
          type="checkbox"
          :checked="page.watermarkVisible"
          @change="onWatermarkVisible"
        />
        <span>显示</span>
      </label>
      <label class="tbp-select" title="水印文字">
        <input
          type="text"
          maxlength="60"
          placeholder="水印文字"
          :disabled="!page.watermarkVisible"
          :value="page.watermarkText"
          @change="onWatermarkText"
        />
      </label>

      <span class="tbp-sep"></span>
      <span class="tbp-title" title="全局字体 / 字号">
        <Globe :size="13" />
        全局
      </span>

      <label class="tbp-select">
        <span>字体</span>
        <select :value="globalFont" @change="onGlobalFont">
          <option
            v-for="font in FONT_OPTIONS"
            :key="font.value"
            :value="font.value"
          >
            {{ font.label }}
          </option>
        </select>
      </label>

      <label class="tbp-select">
        <span>字号</span>
        <select :value="globalSizePx" @change="onGlobalSize">
          <option v-for="size in globalSizeOptions" :key="size" :value="size">
            {{ size }} px
          </option>
        </select>
      </label>

      <label
        class="tbp-switch"
        :class="{ disabled: !globalTextStyle.count }"
        title="开启后，修改字体或字号会立即应用到全部文本与表格"
      >
        <input
          class="switch"
          type="checkbox"
          :checked="applyToAll"
          :disabled="!globalTextStyle.count"
          @change="onApplyToAll"
        />
        <span>应用到全部</span>
      </label>

      <span class="tbp-hint" :title="applyToAll ? '修改字体 / 字号会实时应用到全部文本与表格' : '开启开关后，修改字体 / 字号会应用到全部文本与表格'">
        {{
          globalTextStyle.count
            ? `${globalTextStyle.count} 个文本 / 表格`
            : '暂无文本或表格'
        }}
      </span>

      <span class="tbp-sep"></span>
      <span class="tbp-title">边距</span>
      <label class="tbp-num" title="上边距">
        <span>上</span>
        <input
          type="number"
          step="1"
          min="0"
          :value="page.margin.top"
          @change="onPageMargin('top', $event)"
        />
      </label>
      <label class="tbp-num" title="下边距">
        <span>下</span>
        <input
          type="number"
          step="1"
          min="0"
          :value="page.margin.bottom"
          @change="onPageMargin('bottom', $event)"
        />
      </label>
      <label class="tbp-num" title="左边距">
        <span>左</span>
        <input
          type="number"
          step="1"
          min="0"
          :value="page.margin.left"
          @change="onPageMargin('left', $event)"
        />
      </label>
      <label class="tbp-num" title="右边距">
        <span>右</span>
        <input
          type="number"
          step="1"
          min="0"
          :value="page.margin.right"
          @change="onPageMargin('right', $event)"
        />
        <em>mm</em>
      </label>

      <div class="topbar-spacer"></div>
      <span class="tbp-hint tbp-hint-end">
        选中元素后，这里会显示字体、大小与位置等快捷属性
      </span>

      <input
        ref="backgroundInput"
        class="visually-hidden"
        type="file"
        accept="image/*"
        @change="onBackgroundFile"
      />
    </template>

    <!-- ---------------------------------------------------- has selection -->
    <template v-else>
      <span class="kind-chip">{{ selection.kindLabel }}</span>

      <template v-if="showFontControls">
        <label class="tbp-select">
          <span>字体</span>
          <select :value="fontFamily" @change="onFontFamily">
            <option
              v-for="font in FONT_OPTIONS"
              :key="font.value"
              :value="font.value"
            >
              {{ font.label }}
            </option>
          </select>
        </label>

        <label class="tbp-select">
          <span>字号</span>
          <select :value="fontSizePx" @change="onFontSize">
            <option v-for="size in selectionSizeOptions" :key="size" :value="size">
              {{ size }} px
            </option>
          </select>
        </label>
      </template>

      <div v-if="showTextControls" class="segmented tbp-seg">
        <button
          title="加粗"
          :class="{ active: selection.text.fontWeight === 'bold' }"
          @click="toggleBold"
        >
          <Bold :size="15" />
        </button>
        <button
          title="斜体"
          :class="{ active: selection.text.fontStyle === 'italic' }"
          @click="toggleItalic"
        >
          <Italic :size="15" />
        </button>
        <button
          title="下划线"
          :class="{ active: selection.text.underline }"
          @click="toggleUnderline"
        >
          <Underline :size="15" />
        </button>
      </div>

      <div v-if="showTextControls" class="segmented tbp-seg">
        <button
          title="左对齐"
          :class="{ active: (selection.text.textAlign || 'left') === 'left' }"
          @click="setTextAlign('left')"
        >
          <AlignLeft :size="15" />
        </button>
        <button
          title="居中"
          :class="{ active: selection.text.textAlign === 'center' }"
          @click="setTextAlign('center')"
        >
          <AlignCenter :size="15" />
        </button>
        <button
          title="右对齐"
          :class="{ active: selection.text.textAlign === 'right' }"
          @click="setTextAlign('right')"
        >
          <AlignRight :size="15" />
        </button>
      </div>

      <span class="tbp-sep"></span>

      <template v-if="!isMulti">
        <label class="tbp-num" title="水平位置">
          <span>X</span>
          <input
            type="number"
            step="0.5"
            :disabled="selection.layout.locked"
            :value="selection.layout.left"
            @change="onPosition('left', $event)"
          />
          <em>mm</em>
        </label>
        <label class="tbp-num" title="垂直位置">
          <span>Y</span>
          <input
            type="number"
            step="0.5"
            :disabled="selection.layout.locked"
            :value="selection.layout.top"
            @change="onPosition('top', $event)"
          />
          <em>mm</em>
        </label>
        <label
          v-if="showWidth"
          class="tbp-num"
          :title="selection.isLine ? '线条长度' : '宽度'"
        >
          <span>{{ selection.isLine ? '长' : 'W' }}</span>
          <input
            type="number"
            step="0.5"
            min="0.2"
            :disabled="selection.layout.locked"
            :value="selection.layout.width"
            @change="onSize('width', $event)"
          />
          <em>mm</em>
        </label>
        <label
          v-if="showHeight"
          class="tbp-num"
          :title="selection.isLine ? '线条粗细' : '高度'"
        >
          <span>{{ selection.isLine ? '粗' : 'H' }}</span>
          <input
            type="number"
            :step="selection.isLine ? 0.05 : 0.5"
            :min="selection.isLine ? 0.05 : 0.1"
            :disabled="selection.layout.locked"
            :value="selection.layout.height"
            @change="onSize('height', $event)"
          />
          <em>mm</em>
        </label>
        <label class="tbp-num" title="旋转角度">
          <span>∠</span>
          <input
            type="number"
            step="1"
            :disabled="selection.layout.locked"
            :value="selection.layout.angle"
            @change="onAngle"
          />
          <em>°</em>
        </label>
      </template>

      <div v-else class="segmented tbp-seg">
        <button title="左对齐" @click="alignObjects('left')">
          <AlignStartVertical :size="15" />
        </button>
        <button title="水平居中" @click="alignObjects('center')">
          <AlignCenterVertical :size="15" />
        </button>
        <button title="右对齐" @click="alignObjects('right')">
          <AlignEndVertical :size="15" />
        </button>
        <button title="顶对齐" @click="alignObjects('top')">
          <AlignStartHorizontal :size="15" />
        </button>
        <button title="垂直居中" @click="alignObjects('middle')">
          <AlignCenterHorizontal :size="15" />
        </button>
        <button title="底对齐" @click="alignObjects('bottom')">
          <AlignEndHorizontal :size="15" />
        </button>
      </div>

      <div class="topbar-spacer"></div>

      <button
        class="icon-btn tiny"
        :class="{ active: selection.layout.locked }"
        :title="selection.layout.locked ? '解锁元素' : '锁定元素'"
        @click="designer.toggleLocked()"
      >
        <Lock v-if="selection.layout.locked" :size="15" />
        <Unlock v-else :size="15" />
      </button>
      <button
        class="icon-btn tiny"
        title="复制 (Ctrl+D)"
        @click="designer.duplicateSelected()"
      >
        <Copy :size="15" />
      </button>
      <button
        class="icon-btn tiny tbp-danger"
        title="删除 (Delete)"
        @click="designer.deleteSelected()"
      >
        <Trash2 :size="15" />
      </button>
    </template>
  </div>
</template>

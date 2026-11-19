<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import {
  AlignCenter,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  ChevronDown,
  ChevronUp,
  Copy,
  ImagePlus,
  Italic,
  Lock,
  Move,
  Printer,
  RotateCcw,
  Trash2,
  Underline,
  Unlock,
} from 'lucide-vue-next'
import TablePanel from './TablePanel.vue'
import BindingPicker from './ui/BindingPicker.vue'
import ColorField from './ui/ColorField.vue'
import FontSizeSelect from './ui/FontSizeSelect.vue'
import InspectorSection from './ui/InspectorSection.vue'
import NumField from './ui/NumField.vue'
import SliderField from './ui/SliderField.vue'
import { useDesigner } from '../designer/context'
import type { AlignAction } from '../designer/designer'
import type { PageBackgroundFit, UpdatePatch } from '../designer/types'
import {
  FONT_OPTIONS,
  GRID_SIZES,
  PAGE_PRESETS,
  PX_PER_MM,
  PX_TO_MM,
  clamp,
  round,
} from '../designer/units'

const designer = useDesigner()
const {
  selection,
  page,
  grid,
  pagePreset,
  dataFields,
  rulersVisible,
  uiVisibility,
} = designer
const backgroundAligning = designer.backgroundAligning
const backgroundLayout = designer.backgroundLayout

/** Live underlay frame; zeros while the sheet image is still loading. */
const backgroundFrame = computed(
  () =>
    backgroundLayout.value ?? {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
    },
)

const isMulti = computed(() => selection.count > 1)
const multiFontTargets = computed(
  () =>
    isMulti.value &&
    (selection.textCount > 0 || selection.tableCount > 0),
)
const multiTextSelected = computed(
  () => isMulti.value && selection.textCount > 0,
)
const fontSizePx = computed(() => round(selection.text.fontSize * PX_PER_MM, 1))
const opacityPercent = computed(() =>
  Math.round(selection.layout.opacity * 100),
)
const isLandscape = computed(() => page.width > page.height)
const canDistribute = computed(() => selection.count >= 3)
const contentWidth = computed(() =>
  Math.max(0, round(page.width - page.margin.left - page.margin.right, 1)),
)
const contentHeight = computed(() =>
  Math.max(0, round(page.height - page.margin.top - page.margin.bottom, 1)),
)
const backgroundOpacityPercent = computed(() =>
  Math.round(page.backgroundOpacity * 100),
)

const strokeStyle = computed<'solid' | 'dashed' | 'dotted'>(() => {
  const dash = selection.style.strokeDash
  if (!dash.length) return 'solid'
  return dash[0] >= 1.2 ? 'dashed' : 'dotted'
})

const imageInput = ref<HTMLInputElement>()
const backgroundInput = ref<HTMLInputElement>()
const textarea = ref<HTMLTextAreaElement>()
const codeTextarea = ref<HTMLTextAreaElement>()

function update(patch: UpdatePatch) {
  designer.updateSelected(patch)
}

function setOpacityPercent(value: number) {
  update({ opacity: clamp(value, 0, 100) / 100 })
}

function setFontSizePx(value: number) {
  update({ fontSize: clamp(value, 4, 300) * PX_TO_MM })
}

function setMultiFontSizePx(value: number) {
  designer.updateSelectedTextStyle({
    fontSize: clamp(value, 4, 300) * PX_TO_MM,
  })
}

function onMultiFontFamily(event: Event) {
  designer.updateSelectedTextStyle({
    fontFamily: (event.target as HTMLSelectElement).value,
  })
}

function setTextAlign(align: string) {
  update({ textAlign: align })
}

function toggleBold() {
  update({
    fontWeight: selection.text.fontWeight === 'bold' ? 'normal' : 'bold',
  })
}

function toggleItalic() {
  update({
    fontStyle: selection.text.fontStyle === 'italic' ? 'normal' : 'italic',
  })
}

function toggleUnderline() {
  update({ underline: !selection.text.underline })
}

function setStrokeStyle(style: 'solid' | 'dashed' | 'dotted') {
  const width = Math.max(0.2, selection.style.strokeWidth)
  if (style === 'solid') update({ strokeDash: [] })
  else if (style === 'dashed') {
    update({ strokeDash: [Math.max(2, width * 4), Math.max(1.5, width * 3)] })
  } else {
    update({ strokeDash: [Math.max(0.5, width), Math.max(1, width * 2)] })
  }
}

function onNameChange(event: Event) {
  update({ name: (event.target as HTMLInputElement).value })
}

function onTextInput(event: Event) {
  update({ text: (event.target as HTMLTextAreaElement).value })
}

function insertTextBinding(key: string) {
  const token = `{{${key}}}`
  const current = selection.text.content
  const el = textarea.value
  const start = el?.selectionStart ?? current.length
  const end = el?.selectionEnd ?? current.length
  update({ text: current.slice(0, start) + token + current.slice(end) })
  void nextTick(() => {
    el?.focus()
    const caret = start + token.length
    el?.setSelectionRange(caret, caret)
  })
}

function onFontFamily(event: Event) {
  update({ fontFamily: (event.target as HTMLSelectElement).value })
}

function onPreset(event: Event) {
  designer.setPreset((event.target as HTMLSelectElement).value)
}

function setOrientation(orientation: 'portrait' | 'landscape') {
  const wantLandscape = orientation === 'landscape'
  if (wantLandscape === isLandscape.value) return
  designer.setPageSize(page.height, page.width)
}

function onPageWidth(value: number) {
  designer.setPageSize(value, page.height)
}

function onPageHeight(value: number) {
  designer.setPageSize(page.width, value)
}

function onPageMargin(side: 'top' | 'right' | 'bottom' | 'left', value: number) {
  designer.setPageMargin(side, value)
}

function onMarginVisible(event: Event) {
  designer.setPageMarginVisible((event.target as HTMLInputElement).checked)
}

function onWatermarkVisible(event: Event) {
  designer.setWatermarkVisible((event.target as HTMLInputElement).checked)
}

function onWatermarkText(event: Event) {
  designer.setWatermarkText((event.target as HTMLInputElement).value)
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

function onBackgroundOpacity(value: number) {
  designer.setPageBackgroundOpacity(clamp(value, 0, 100) / 100)
}

function onBackgroundFit(event: Event) {
  designer.setPageBackgroundFit(
    (event.target as HTMLSelectElement).value as PageBackgroundFit,
  )
}

function onBackgroundPrint(event: Event) {
  designer.setPageBackgroundPrint((event.target as HTMLInputElement).checked)
}

function toggleBackgroundAligning() {
  designer.setBackgroundAligning(!backgroundAligning.value)
}

function onBackgroundFrame(
  axis: 'left' | 'top' | 'width' | 'height',
  value: number,
) {
  const frame = backgroundLayout.value
  if (!frame) return
  designer.setBackgroundTransform({ ...frame, [axis]: value })
}

function onBackgroundReset() {
  designer.resetBackgroundTransform()
}

function onOverprint(event: Event) {
  designer.setOverprint((event.target as HTMLInputElement).checked)
}

function onPrintOffset(axis: 'x' | 'y', value: number) {
  const offset = { ...page.printOffset, [axis]: value }
  designer.setPrintOffset(offset.x, offset.y)
}

function onCodeContent(event: Event) {
  void designer.updateCodeContent((event.target as HTMLTextAreaElement).value)
}

function insertCodeBinding(key: string) {
  const token = `{{${key}}}`
  const current = selection.code.content
  const el = codeTextarea.value
  const start = el?.selectionStart ?? current.length
  const end = el?.selectionEnd ?? current.length
  const next = current.slice(0, start) + token + current.slice(end)
  void designer.updateCodeContent(next)
  void nextTick(() => {
    el?.focus()
    const caret = start + token.length
    el?.setSelectionRange(caret, caret)
  })
}

function onRulersVisible(event: Event) {
  designer.setRulersVisible((event.target as HTMLInputElement).checked)
}

function onGuidesVisible(event: Event) {
  designer.setGuidesVisible((event.target as HTMLInputElement).checked)
}

function onGridSize(event: Event) {
  designer.setGridSize(Number((event.target as HTMLSelectElement).value))
}

function onGridVisible(event: Event) {
  designer.setGridVisible((event.target as HTMLInputElement).checked)
}

function onGridSnap(event: Event) {
  designer.setGridSnap((event.target as HTMLInputElement).checked)
}

function pickImage() {
  imageInput.value?.click()
}

async function onImageFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) await designer.replaceSelectedImage(file)
  input.value = ''
}

function align(action: AlignAction) {
  designer.alignSelected(action)
}
</script>

<template>
  <div class="props-panel">
    <!-- ------------------------------------------------------------ page -->
    <template v-if="selection.count === 0">
      <InspectorSection
        v-if="uiVisibility.inspectorSections.page"
        title="页面设置"
      >
        <label class="select-field">
          <span>预设尺寸</span>
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
        <div class="field-grid">
          <NumField
            label="宽度"
            :model-value="page.width"
            unit="mm"
            :step="1"
            :min="20"
            :max="1000"
            @update:model-value="onPageWidth"
          />
          <NumField
            label="高度"
            :model-value="page.height"
            unit="mm"
            :step="1"
            :min="20"
            :max="1000"
            @update:model-value="onPageHeight"
          />
        </div>
        <div class="orientation-row">
          <span>方向</span>
          <div class="segmented wide-seg">
            <button
              :class="{ active: !isLandscape }"
              @click="setOrientation('portrait')"
            >
              纵向
            </button>
            <button
              :class="{ active: isLandscape }"
              @click="setOrientation('landscape')"
            >
              横向
            </button>
          </div>
        </div>
        <p class="field-note">
          宽度和高度可自由输入（20–1000 mm），修改后即使用自定义纸张尺寸。
        </p>
      </InspectorSection>

      <InspectorSection
        v-if="uiVisibility.inspectorSections.margins"
        title="页边距"
      >
        <div class="field-grid">
          <NumField
            label="上"
            :model-value="page.margin.top"
            unit="mm"
            :step="1"
            :min="0"
            :max="round(page.height / 2, 1)"
            @update:model-value="onPageMargin('top', $event)"
          />
          <NumField
            label="下"
            :model-value="page.margin.bottom"
            unit="mm"
            :step="1"
            :min="0"
            :max="round(page.height / 2, 1)"
            @update:model-value="onPageMargin('bottom', $event)"
          />
          <NumField
            label="左"
            :model-value="page.margin.left"
            unit="mm"
            :step="1"
            :min="0"
            :max="round(page.width / 2, 1)"
            @update:model-value="onPageMargin('left', $event)"
          />
          <NumField
            label="右"
            :model-value="page.margin.right"
            unit="mm"
            :step="1"
            :min="0"
            :max="round(page.width / 2, 1)"
            @update:model-value="onPageMargin('right', $event)"
          />
        </div>
        <label class="switch-row">
          <span>显示边距虚线框</span>
          <input
            class="switch"
            type="checkbox"
            :checked="page.marginVisible"
            @change="onMarginVisible"
          />
        </label>
        <p class="field-note">
          内容区 {{ contentWidth }} × {{ contentHeight }} mm，虚线框只用于设计参考，不会打印。
          设置边距后，元素的移动、缩放、新建和键盘微调都会被限制在内容区内。
        </p>
      </InspectorSection>

      <InspectorSection
        v-if="uiVisibility.inspectorSections.background"
        title="纸张底图"
      >
        <template v-if="page.backgroundImage">
          <div class="background-preview">
            <img :src="page.backgroundImage" alt="纸张底图预览" />
          </div>
          <div class="background-actions">
            <button class="btn ghost" @click="pickBackground">
              <ImagePlus :size="15" />
              更换
            </button>
            <button
              class="btn ghost danger-ghost"
              @click="designer.removePageBackground()"
            >
              <Trash2 :size="15" />
              移除
            </button>
          </div>
          <label class="switch-row">
            <span>显示底图</span>
            <input
              class="switch"
              type="checkbox"
              :checked="page.backgroundVisible"
              @change="onBackgroundVisible"
            />
          </label>
          <SliderField
            label="不透明度"
            unit="%"
            :min="0"
            :max="100"
            :step="1"
            :model-value="backgroundOpacityPercent"
            @update:model-value="onBackgroundOpacity"
          />
          <label class="select-field compact">
            <span>填充方式</span>
            <select :value="page.backgroundFit" @change="onBackgroundFit">
              <option value="cover">铺满纸张（等比裁剪）</option>
              <option value="contain">适应纸张（完整显示）</option>
              <option value="stretch">拉伸铺满</option>
            </select>
          </label>
          <div class="background-align-row">
            <button
              class="btn ghost"
              :class="{ active: backgroundAligning }"
              :disabled="!page.backgroundVisible"
              @click="toggleBackgroundAligning"
            >
              <Move :size="15" />
              {{ backgroundAligning ? '结束对位' : '对位调整' }}
            </button>
            <button
              class="btn ghost"
              :disabled="!page.backgroundTransform"
              @click="onBackgroundReset"
            >
              <RotateCcw :size="15" />
              恢复填充
            </button>
          </div>
          <div class="field-grid background-frame-grid">
            <NumField
              label="X"
              :model-value="backgroundFrame.left"
              unit="mm"
              :step="1"
              :min="-2000"
              :max="2000"
              @update:model-value="onBackgroundFrame('left', $event)"
            />
            <NumField
              label="Y"
              :model-value="backgroundFrame.top"
              unit="mm"
              :step="1"
              :min="-2000"
              :max="2000"
              @update:model-value="onBackgroundFrame('top', $event)"
            />
            <NumField
              label="底图宽"
              :model-value="backgroundFrame.width"
              unit="mm"
              :step="1"
              :min="5"
              :max="2000"
              @update:model-value="onBackgroundFrame('width', $event)"
            />
            <NumField
              label="底图高"
              :model-value="backgroundFrame.height"
              unit="mm"
              :step="1"
              :min="5"
              :max="2000"
              @update:model-value="onBackgroundFrame('height', $event)"
            />
          </div>
          <p class="field-note">
            点击「对位调整」后可在画布上拖动底图平移、滚轮缩放，双击恢复填充方式；
            也可直接输入毫米值精确定位。
          </p>
          <label class="switch-row">
            <span>随模板打印</span>
            <input
              class="switch"
              type="checkbox"
              :checked="page.backgroundPrint"
              :disabled="page.overprint"
              @change="onBackgroundPrint"
            />
          </label>
          <p class="field-note">
            底图固定在纸张最底层，位于所有元素下方，不会遮挡选中和拖拽。
            默认只在编辑器中显示；开启「随模板打印」后会一起进入 SVG / PDF 输出。
          </p>
        </template>
        <template v-else>
          <button class="btn ghost wide" @click="pickBackground">
            <ImagePlus :size="15" />
            导入纸张底图
          </button>
          <p class="field-note">
            可导入扫描件或已有模板图片作为纸张底图，在底图上对齐文字、表格和条码，
            便于复刻现成的纸质单据。
          </p>
        </template>

        <div class="overprint-block">
          <label class="switch-row">
            <span class="switch-label">
              <Printer :size="14" />
              套打模式
            </span>
            <input
              class="switch"
              type="checkbox"
              :checked="page.overprint"
              @change="onOverprint"
            />
          </label>
          <div v-if="page.overprint" class="field-grid">
            <NumField
              label="偏移 X"
              :model-value="page.printOffset.x"
              unit="mm"
              :step="0.5"
              :min="-50"
              :max="50"
              @update:model-value="onPrintOffset('x', $event)"
            />
            <NumField
              label="偏移 Y"
              :model-value="page.printOffset.y"
              unit="mm"
              :step="0.5"
              :min="-50"
              :max="50"
              @update:model-value="onPrintOffset('y', $event)"
            />
          </div>
          <p class="field-note">
            套打用于预印纸张：底图只作为对位参考，不会进入打印输出。
            打印偏移用于校准打印机与预印表单的错位，正值向右 / 向下，仅影响 SVG / PDF。
          </p>
        </div>
        <input
          ref="backgroundInput"
          class="visually-hidden"
          type="file"
          accept="image/*"
          @change="onBackgroundFile"
        />
      </InspectorSection>

      <InspectorSection
        v-if="uiVisibility.inspectorSections.watermark"
        title="版权水印"
      >
        <label class="switch-row">
          <span>显示版权水印</span>
          <input
            class="switch"
            type="checkbox"
            :checked="page.watermarkVisible"
            @change="onWatermarkVisible"
          />
        </label>
        <label class="select-field compact">
          <span>水印文字</span>
          <input
            type="text"
            maxlength="60"
            :value="page.watermarkText"
            :disabled="!page.watermarkVisible"
            @change="onWatermarkText"
          />
        </label>
        <p class="field-note">
          水印会以浅灰色平铺在页面内容之上，并包含在 SVG / PDF 预览中；关闭后不显示也不导出。
        </p>
      </InspectorSection>

      <InspectorSection
        v-if="uiVisibility.inspectorSections.view"
        title="视图与吸附"
      >
        <label class="select-field compact">
          <span>网格间距</span>
          <select :value="grid.size" @change="onGridSize">
            <option v-for="size in GRID_SIZES" :key="size" :value="size">
              {{ size }} mm
            </option>
          </select>
        </label>
        <label class="switch-row">
          <span>显示网格</span>
          <input
            class="switch"
            type="checkbox"
            :checked="grid.visible"
            @change="onGridVisible"
          />
        </label>
        <label class="switch-row">
          <span>显示刻度尺</span>
          <input
            class="switch"
            type="checkbox"
            :checked="rulersVisible"
            @change="onRulersVisible"
          />
        </label>
        <label class="switch-row">
          <span>显示参考线</span>
          <input
            class="switch"
            type="checkbox"
            :checked="page.guidesVisible"
            @change="onGuidesVisible"
          />
        </label>
        <div v-if="page.guides.length" class="guide-actions">
          <span>{{ page.guides.length }} 条参考线</span>
          <button class="clear-btn" @click="designer.clearGuides()">清除全部</button>
        </div>
        <label class="switch-row">
          <span>拖动吸附到 1 mm</span>
          <input
            class="switch"
            type="checkbox"
            :checked="grid.snap"
            @change="onGridSnap"
          />
        </label>
        <p class="field-note">
          从上方或左侧刻度尺向页面内拖动可拉出参考线；拖动参考线可移动，拖回刻度尺或双击可删除。
        </p>
      </InspectorSection>

      <InspectorSection title="使用提示" :open="false">
        <p class="hint-line">从左侧添加文本、矩形、椭圆、线条、表格或图片。</p>
        <p class="hint-line">双击文本可在画布内直接编辑；选中元素后在此调整位置、尺寸和样式。</p>
        <p class="hint-line">画布坐标与尺寸统一使用毫米（mm），字号按像素（px）显示。</p>
        <p class="hint-line" v-pre>在「数据」页维护示例字段，用 {{字段名}} 绑定到文本或表格单元格。</p>
        <p class="hint-line">拖动多个元素时可按住 Shift 点选，属性面板会显示对齐工具。</p>
      </InspectorSection>
    </template>

    <!-- ------------------------------------------------------- selection -->
    <template v-else>
      <section class="panel-section selection-section">
        <div class="selection-head">
          <span class="kind-chip">{{ selection.kindLabel }}</span>
          <input
            v-if="!isMulti"
            class="name-input"
            :value="selection.style.name"
            placeholder="元素名称"
            @change="onNameChange"
          />
          <span v-else class="multi-count">已选 {{ selection.count }} 个</span>
          <button
            class="icon-btn tiny"
            :class="{ active: selection.layout.locked }"
            :title="selection.layout.locked ? '解锁元素' : '锁定元素'"
            @click="designer.toggleLocked()"
          >
            <Lock v-if="selection.layout.locked" :size="14" />
            <Unlock v-else :size="14" />
          </button>
        </div>
        <p v-if="isMulti" class="multi-note">
          可批量修改颜色、描边、透明度以及文字样式，使用下方对齐工具整理位置。
        </p>
      </section>

      <InspectorSection
        v-if="isMulti && uiVisibility.inspectorSelection.align"
        title="对齐与分布"
      >
        <div class="align-grid">
          <button title="左对齐" @click="align('left')">
            <AlignStartVertical :size="16" />
          </button>
          <button title="水平居中" @click="align('center')">
            <AlignCenterVertical :size="16" />
          </button>
          <button title="右对齐" @click="align('right')">
            <AlignEndVertical :size="16" />
          </button>
          <button
            title="水平等距分布"
            :disabled="!canDistribute"
            @click="designer.distributeSelected('horizontal')"
          >
            <AlignHorizontalDistributeCenter :size="16" />
          </button>
          <button title="顶对齐" @click="align('top')">
            <AlignStartHorizontal :size="16" />
          </button>
          <button title="垂直居中" @click="align('middle')">
            <AlignCenterHorizontal :size="16" />
          </button>
          <button title="底对齐" @click="align('bottom')">
            <AlignEndHorizontal :size="16" />
          </button>
          <button
            title="垂直等距分布"
            :disabled="!canDistribute"
            @click="designer.distributeSelected('vertical')"
          >
            <AlignVerticalDistributeCenter :size="16" />
          </button>
        </div>
        <p v-if="!canDistribute" class="field-note">
          等距分布需要至少 3 个元素
        </p>
      </InspectorSection>

      <InspectorSection
        v-if="multiFontTargets && uiVisibility.inspectorSelection.textStyle"
        title="文字样式"
      >
        <label class="select-field">
          <span>字体</span>
          <select
            :value="selection.text.fontFamily"
            @change="onMultiFontFamily"
          >
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
            label="字号"
            :model-value="fontSizePx"
            @update:model-value="setMultiFontSizePx"
          />
        </div>

        <template v-if="multiTextSelected">
          <div class="text-tools">
            <div class="segmented">
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
            <div class="segmented">
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
          </div>
        </template>
        <p v-else class="field-note">
          当前选区只包含表格，字体和字号会修改表格的默认值。
        </p>
      </InspectorSection>

      <InspectorSection
        v-if="!isMulti && uiVisibility.inspectorSelection.position"
        title="位置与尺寸"
      >
        <div class="field-grid">
          <NumField
            label="X"
            :model-value="selection.layout.left"
            unit="mm"
            :step="0.5"
            :disabled="selection.layout.locked"
            @update:model-value="update({ left: $event })"
          />
          <NumField
            label="Y"
            :model-value="selection.layout.top"
            unit="mm"
            :step="0.5"
            :disabled="selection.layout.locked"
            @update:model-value="update({ top: $event })"
          />
          <template v-if="!selection.isTable">
            <NumField
              :label="selection.isLine ? '长度' : '宽度'"
              :model-value="selection.layout.width"
              unit="mm"
              :step="0.5"
              :min="0.2"
              :disabled="selection.layout.locked"
              @update:model-value="update({ width: $event })"
            />
            <NumField
              v-if="selection.isLine"
              label="粗细"
              :model-value="selection.layout.height"
              unit="mm"
              :step="0.05"
              :min="0.05"
              :disabled="selection.layout.locked"
              @update:model-value="update({ height: $event })"
            />
            <NumField
              v-else-if="selection.isText"
              label="高度"
              :model-value="selection.layout.height"
              unit="mm"
              disabled
            />
            <NumField
              v-else
              label="高度"
              :model-value="selection.layout.height"
              unit="mm"
              :step="0.5"
              :min="0.1"
              :disabled="selection.layout.locked"
              @update:model-value="update({ height: $event })"
            />
          </template>
          <NumField
            label="旋转"
            :model-value="selection.layout.angle"
            unit="°"
            :step="1"
            :disabled="selection.layout.locked"
            @update:model-value="update({ angle: $event })"
          />
        </div>
        <SliderField
          class="opacity-field"
          label="不透明度"
          unit="%"
          :model-value="opacityPercent"
          :min="0"
          :max="100"
          :step="1"
          @update:model-value="setOpacityPercent"
        />
        <p v-if="selection.layout.locked" class="field-note">
          元素已锁定，位置与尺寸不可修改
        </p>
        <p v-else-if="selection.isTable" class="field-note">
          表格尺寸、行数与列数请在下方「表格」面板调整；旋转可在此设置或直接拖动旋转控制点
        </p>
        <p v-else-if="selection.isText" class="field-note">
          文本高度由字号和换行自动决定
        </p>
        <p v-else-if="selection.isLine" class="field-note">
          拖动画布上的左右控制点只改变线条长度，粗细请在这里设置
        </p>
      </InspectorSection>

      <InspectorSection
        v-if="isMulti && uiVisibility.inspectorSelection.multiAdjust"
        title="批量调整"
      >
        <ColorField
          label="填充 / 颜色"
          palette
          :model-value="selection.style.fill"
          @update:model-value="update({ fill: $event })"
        />
        <SliderField
          label="不透明度"
          unit="%"
          :model-value="opacityPercent"
          :min="0"
          :max="100"
          :step="1"
          @update:model-value="setOpacityPercent"
        />
      </InspectorSection>

      <InspectorSection
        v-if="
          !isMulti &&
          !selection.isImage &&
          !selection.isTable &&
          !selection.isCode &&
          uiVisibility.inspectorSelection.appearance
        "
        title="外观"
      >
        <ColorField
          :label="
            selection.isLine
              ? '线条颜色'
              : selection.isText
                ? '文字颜色'
                : '填充'
          "
          palette
          :clearable="selection.isShape"
          :model-value="selection.style.fill"
          @update:model-value="update({ fill: $event })"
        />

        <template v-if="selection.isShape">
          <ColorField
            label="描边"
            clearable
            :model-value="selection.style.stroke"
            @update:model-value="update({ stroke: $event })"
          />
          <div class="field-grid">
            <NumField
              label="描边宽度"
              :model-value="selection.style.strokeWidth"
              unit="mm"
              :step="0.05"
              :min="0"
              @update:model-value="update({ strokeWidth: $event })"
            />
            <NumField
              v-if="selection.kind === 'rect'"
              label="圆角"
              :model-value="selection.style.radius"
              unit="mm"
              :step="0.5"
              :min="0"
              @update:model-value="update({ radius: $event })"
            />
          </div>
          <div class="inline-row">
            <span>描边样式</span>
            <div class="segmented text-seg">
              <button
                :class="{ active: strokeStyle === 'solid' }"
                @click="setStrokeStyle('solid')"
              >
                实线
              </button>
              <button
                :class="{ active: strokeStyle === 'dashed' }"
                @click="setStrokeStyle('dashed')"
              >
                虚线
              </button>
              <button
                :class="{ active: strokeStyle === 'dotted' }"
                @click="setStrokeStyle('dotted')"
              >
                点线
              </button>
            </div>
          </div>
          <p class="field-note">
            填充留空时只显示描边，不会遮挡下方内容。
          </p>
        </template>
      </InspectorSection>

      <InspectorSection
        v-if="
          !isMulti &&
          selection.isCode &&
          uiVisibility.inspectorSelection.code
        "
        :title="selection.kind === 'qrcode' ? '二维码内容' : '条形码内容'"
      >
        <textarea
          ref="codeTextarea"
          class="text-content"
          rows="2"
          :value="selection.code.content"
          placeholder="输入二维码 / 条形码内容"
          @change="onCodeContent"
        ></textarea>
        <BindingPicker :fields="dataFields" @insert="insertCodeBinding" />
        <p class="field-note" v-pre>
          修改后失焦生效；二维码支持任意文字，条形码使用 Code128（字母、数字和常用符号）。
          可用 {{字段名}} 绑定示例数据，预览和导出时自动替换。
        </p>
      </InspectorSection>

      <InspectorSection
        v-if="!isMulti && selection.isImage && uiVisibility.inspectorSelection.image"
        title="图片"
      >
        <button class="btn ghost wide" @click="pickImage">
          <ImagePlus :size="15" />
          替换图片
        </button>
        <input
          ref="imageInput"
          class="visually-hidden"
          type="file"
          accept="image/*"
          @change="onImageFile"
        />
      </InspectorSection>

      <TablePanel
        v-if="
          !isMulti && selection.isTable && uiVisibility.inspectorSelection.table
        "
      />

      <InspectorSection
        v-if="!isMulti && selection.isText && uiVisibility.inspectorSelection.text"
        title="文本"
      >
        <textarea
          ref="textarea"
          class="text-content"
          rows="3"
          :value="selection.text.content"
          placeholder="输入文本内容"
          @input="onTextInput"
        ></textarea>
        <BindingPicker :fields="dataFields" @insert="insertTextBinding" />

        <label class="select-field">
          <span>字体</span>
          <select :value="selection.text.fontFamily" @change="onFontFamily">
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
            label="字号"
            :model-value="fontSizePx"
            @update:model-value="setFontSizePx"
          />
          <NumField
            label="行高"
            :model-value="selection.text.lineHeight"
            :step="0.1"
            :min="0.8"
            :max="3"
            @update:model-value="update({ lineHeight: $event })"
          />
          <NumField
            label="字距"
            :model-value="selection.text.letterSpacing"
            unit="mm"
            :step="0.1"
            :min="-2"
            :max="10"
            @update:model-value="update({ letterSpacing: $event })"
          />
          <NumField
            label="文本框宽度"
            :model-value="selection.layout.width"
            unit="mm"
            :step="0.5"
            :min="2"
            @update:model-value="update({ width: $event })"
          />
        </div>

        <div class="text-tools">
          <div class="segmented">
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
          <div class="segmented">
            <button
              title="左对齐"
              :class="{ active: selection.text.textAlign === 'left' }"
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
        </div>

        <ColorField
          class="text-bg-field"
          label="文字底色"
          clearable
          :model-value="selection.text.backgroundColor"
          @update:model-value="update({ textBackground: $event })"
        />
      </InspectorSection>

      <InspectorSection
        v-if="uiVisibility.inspectorSelection.arrange"
        title="图层与操作"
      >
        <div class="action-grid">
          <button class="btn ghost" @click="designer.duplicateSelected()">
            <Copy :size="14" />
            复制
          </button>
          <button class="btn danger-ghost" @click="designer.deleteSelected()">
            <Trash2 :size="14" />
            删除
          </button>
        </div>
        <div class="order-row">
          <span>图层顺序</span>
          <div class="segmented">
            <button title="上移一层" @click="designer.moveSelected('up')">
              <ChevronUp :size="15" />
            </button>
            <button title="下移一层" @click="designer.moveSelected('down')">
              <ChevronDown :size="15" />
            </button>
            <button title="置于顶层" @click="designer.moveSelected('top')">
              <ArrowUpToLine :size="15" />
            </button>
            <button title="置于底层" @click="designer.moveSelected('bottom')">
              <ArrowDownToLine :size="15" />
            </button>
          </div>
        </div>
      </InspectorSection>
    </template>
  </div>
</template>

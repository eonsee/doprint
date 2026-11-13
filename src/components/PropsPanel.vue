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
import type { AlignAction, UpdatePatch } from '../designer/types'
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
} = designer

const isMulti = computed(() => selection.count > 1)
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

const strokeStyle = computed<'solid' | 'dashed' | 'dotted'>(() => {
  const dash = selection.style.strokeDash
  if (!dash.length) return 'solid'
  return dash[0] >= 1.2 ? 'dashed' : 'dotted'
})

const imageInput = ref<HTMLInputElement>()
const textarea = ref<HTMLTextAreaElement>()

function update(patch: UpdatePatch) {
  designer.updateSelected(patch)
}

function setOpacityPercent(value: number) {
  update({ opacity: clamp(value, 0, 100) / 100 })
}

function setFontSizePx(value: number) {
  update({ fontSize: clamp(value, 4, 300) * PX_TO_MM })
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
      <InspectorSection title="页面设置">
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

      <InspectorSection title="页边距">
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
        </p>
      </InspectorSection>

      <InspectorSection title="视图与吸附">
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
          可批量修改颜色、描边与透明度，使用下方对齐工具整理位置。
        </p>
      </section>

      <InspectorSection v-if="isMulti" title="对齐与分布">
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

      <InspectorSection v-if="!isMulti" title="位置与尺寸">
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
              label="宽度"
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
            <NumField
              label="旋转"
              :model-value="selection.layout.angle"
              unit="°"
              :step="1"
              :disabled="selection.layout.locked"
              @update:model-value="update({ angle: $event })"
            />
          </template>
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
          表格尺寸、行数与列数请在下方「表格」面板调整
        </p>
        <p v-else-if="selection.isText" class="field-note">
          文本高度由字号和换行自动决定
        </p>
      </InspectorSection>

      <InspectorSection v-if="isMulti" title="批量调整">
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
        v-if="!isMulti && !selection.isImage && !selection.isTable"
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
        </template>
      </InspectorSection>

      <InspectorSection v-if="!isMulti && selection.isImage" title="图片">
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

      <TablePanel v-if="!isMulti && selection.isTable" />

      <InspectorSection v-if="!isMulti && selection.isText" title="文本">
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

      <InspectorSection title="图层与操作">
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

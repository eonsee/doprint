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
  Check,
  Copy,
  Globe,
  Italic,
  Lock,
  Trash2,
  Underline,
  Unlock,
} from 'lucide-vue-next'
import { useDesigner } from '../designer/context'
import type { AlignAction, UpdatePatch } from '../designer/types'
import {
  DEFAULT_FONT_PX,
  FONT_OPTIONS,
  PX_PER_MM,
  PX_TO_MM,
  clamp,
  fontSizeOptions,
  round,
} from '../designer/units'

const designer = useDesigner()
const { selection, table, globalTextStyle } = designer

const isMulti = computed(() => selection.count > 1)
const isTextSelected = computed(() => !isMulti.value && selection.isText)
const isTableSelected = computed(() => !isMulti.value && selection.isTable)
const showFontControls = computed(
  () => isTextSelected.value || isTableSelected.value,
)
const showWidth = computed(() => !isMulti.value && !selection.isTable)
const showHeight = computed(
  () => !isMulti.value && !selection.isTable && !selection.isText,
)
const showTextControls = computed(() => isTextSelected.value)

const fontFamily = computed(() =>
  isTableSelected.value && table.value
    ? table.value.fontFamily
    : selection.text.fontFamily,
)
const fontSizePx = computed(() =>
  isTableSelected.value && table.value
    ? round(table.value.fontSize * PX_PER_MM, 1)
    : round(selection.text.fontSize * PX_PER_MM, 1),
)
const selectionSizeOptions = computed(() => fontSizeOptions(fontSizePx.value))

/* ------------------------------------------------------------ global mode */

const globalFont = ref(FONT_OPTIONS[0]?.value ?? 'SimSun')
const globalSizePx = ref(DEFAULT_FONT_PX)
const globalSizeOptions = computed(() => fontSizeOptions(globalSizePx.value))
let noticeTimer: number | undefined

watch(
  globalTextStyle,
  (value) => {
    globalFont.value = value.fontFamily
    globalSizePx.value = value.fontSizePx || DEFAULT_FONT_PX
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (noticeTimer) window.clearTimeout(noticeTimer)
})

function onGlobalFont(event: Event) {
  globalFont.value = (event.target as HTMLSelectElement).value
}

function onGlobalSize(event: Event) {
  const value = Number((event.target as HTMLSelectElement).value)
  if (!Number.isFinite(value)) return
  globalSizePx.value = clamp(value, 4, 300)
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

/* --------------------------------------------------------- selection mode */

function update(patch: UpdatePatch) {
  designer.updateSelected(patch)
}

function onFontFamily(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (isTableSelected.value) designer.updateTableStyle({ fontFamily: value })
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
  if (isTableSelected.value) designer.updateTableStyle({ fontSize: mm })
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
        <Globe :size="13" />
        全局样式
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

      <button
        class="btn ghost tbp-apply"
        title="把当前字体和字号应用到所有文本与表格"
        :disabled="!globalTextStyle.count"
        @click="applyGlobalStyle"
      >
        <Check :size="13" />
        应用到全部
      </button>

      <span class="tbp-hint">
        {{
          globalTextStyle.count
            ? `将同时修改 ${globalTextStyle.count} 个文本 / 表格`
            : '模板中暂无文本或表格'
        }}
      </span>

      <div class="topbar-spacer"></div>
      <span class="tbp-hint tbp-hint-end">
        选中元素后，这里会显示字体、大小与位置等快捷属性
      </span>
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
        <label v-if="showWidth" class="tbp-num" title="宽度">
          <span>W</span>
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

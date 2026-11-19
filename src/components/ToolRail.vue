<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Barcode,
  Circle,
  ImagePlus,
  Minus,
  Omega,
  QrCode,
  Square,
  Table,
  Tags,
  Type,
} from 'lucide-vue-next'
import { useDesigner } from '../designer/context'

const designer = useDesigner()
const { uiVisibility } = designer
const hasVisibleTools = computed(() =>
  Object.values(uiVisibility.tools).some(Boolean),
)
const fileInput = ref<HTMLInputElement>()

function pickImage() {
  fileInput.value?.click()
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    await designer.addImageFile(file)
  }
  input.value = ''
}

function openSymbols() {
  designer.symbolPickerOpen.value = true
}
</script>

<template>
  <aside v-if="hasVisibleTools" class="tool-rail doprint-tool-rail" data-doprint-component="tool-rail">
    <button
      v-if="uiVisibility.tools.text"
      class="tool"
      title="添加文本"
      @click="designer.addText()"
    >
      <Type :size="20" />
      <span>文本</span>
    </button>
    <button
      v-if="uiVisibility.tools.table"
      class="tool"
      title="添加表格"
      @click="designer.addTable()"
    >
      <Table :size="20" />
      <span>表格</span>
    </button>
    <button
      v-if="uiVisibility.tools.labels"
      class="tool"
      title="添加多联标签（一次生成整版标签）"
      @click="designer.addLabelGrid()"
    >
      <Tags :size="20" />
      <span>标签</span>
    </button>
    <button
      v-if="uiVisibility.tools.symbols"
      class="tool"
      title="插入特殊字符 / 字段复选框"
      @click="openSymbols"
    >
      <Omega :size="20" />
      <span>符号</span>
    </button>
    <button
      v-if="uiVisibility.tools.rect"
      class="tool"
      title="添加矩形"
      @click="designer.addRect()"
    >
      <Square :size="20" />
      <span>矩形</span>
    </button>
    <button
      v-if="uiVisibility.tools.ellipse"
      class="tool"
      title="添加椭圆"
      @click="designer.addEllipse()"
    >
      <Circle :size="20" />
      <span>椭圆</span>
    </button>
    <button
      v-if="uiVisibility.tools.line"
      class="tool"
      title="添加线条"
      @click="designer.addLine()"
    >
      <Minus :size="20" />
      <span>线条</span>
    </button>
    <button
      v-if="uiVisibility.tools.image"
      class="tool"
      title="添加图片"
      @click="pickImage"
    >
      <ImagePlus :size="20" />
      <span>图片</span>
    </button>
    <button
      v-if="uiVisibility.tools.qrcode"
      class="tool"
      title="添加二维码"
      @click="designer.addQrCode()"
    >
      <QrCode :size="20" />
      <span>二维码</span>
    </button>
    <button
      v-if="uiVisibility.tools.barcode"
      class="tool"
      title="添加条形码"
      @click="designer.addBarcode()"
    >
      <Barcode :size="20" />
      <span>条形码</span>
    </button>

    <input
      ref="fileInput"
      class="visually-hidden"
      type="file"
      accept="image/*"
      @change="onFileChange"
    />
  </aside>
</template>

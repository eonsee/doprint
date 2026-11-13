<script setup lang="ts">
import { ref } from 'vue'
import { Circle, ImagePlus, Minus, Square, Table, Type } from 'lucide-vue-next'
import { useDesigner } from '../designer/context'

const designer = useDesigner()
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
</script>

<template>
  <aside class="tool-rail">
    <button class="tool" title="添加文本" @click="designer.addText()">
      <Type :size="20" />
      <span>文本</span>
    </button>
    <button class="tool" title="添加矩形" @click="designer.addRect()">
      <Square :size="20" />
      <span>矩形</span>
    </button>
    <button class="tool" title="添加椭圆" @click="designer.addEllipse()">
      <Circle :size="20" />
      <span>椭圆</span>
    </button>
    <button class="tool" title="添加线条" @click="designer.addLine()">
      <Minus :size="20" />
      <span>线条</span>
    </button>
    <button class="tool" title="添加表格" @click="designer.addTable()">
      <Table :size="20" />
      <span>表格</span>
    </button>
    <button class="tool" title="添加图片" @click="pickImage">
      <ImagePlus :size="20" />
      <span>图片</span>
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

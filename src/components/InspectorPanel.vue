<script setup lang="ts">
import { ref } from 'vue'
import { Database, Layers, SlidersHorizontal } from 'lucide-vue-next'
import DataPanel from './DataPanel.vue'
import LayersPanel from './LayersPanel.vue'
import PropsPanel from './PropsPanel.vue'
import { useDesigner } from '../designer/context'

const designer = useDesigner()
const { dataFields } = designer
const tab = ref<'props' | 'layers' | 'data'>('props')
</script>

<template>
  <aside class="inspector">
    <div class="tabs">
      <button :class="{ active: tab === 'props' }" @click="tab = 'props'">
        <SlidersHorizontal :size="15" />
        属性
      </button>
      <button :class="{ active: tab === 'layers' }" @click="tab = 'layers'">
        <Layers :size="15" />
        图层
      </button>
      <button :class="{ active: tab === 'data' }" @click="tab = 'data'">
        <Database :size="15" />
        数据
        <span v-if="dataFields.length" class="tab-badge">{{ dataFields.length }}</span>
      </button>
    </div>
    <div class="inspector-body">
      <PropsPanel v-show="tab === 'props'" />
      <LayersPanel v-show="tab === 'layers'" />
      <DataPanel v-show="tab === 'data'" />
    </div>
  </aside>
</template>

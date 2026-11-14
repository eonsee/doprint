<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Database, Layers, SlidersHorizontal } from 'lucide-vue-next'
import DataPanel from './DataPanel.vue'
import LayersPanel from './LayersPanel.vue'
import PropsPanel from './PropsPanel.vue'
import { useDesigner } from '../designer/context'

const designer = useDesigner()
const { dataFields, uiVisibility } = designer

type TabKey = 'props' | 'layers' | 'data'

const tab = ref<TabKey>('props')

const tabs = computed(() =>
  (
    [
      {
        key: 'props',
        label: '属性',
        icon: SlidersHorizontal,
        visible: uiVisibility.inspectorTabs.props,
      },
      {
        key: 'layers',
        label: '图层',
        icon: Layers,
        visible: uiVisibility.inspectorTabs.layers,
      },
      {
        key: 'data',
        label: '数据',
        icon: Database,
        visible: uiVisibility.inspectorTabs.data,
      },
    ] as const
  ).filter((item) => item.visible),
)

const hasTabs = computed(() => tabs.value.length > 0)

// If the active tab is hidden from the global settings, fall back to the
// first remaining one instead of showing an empty panel.
watch(
  tabs,
  (list) => {
    if (!list.some((item) => item.key === tab.value)) {
      tab.value = list[0]?.key ?? 'props'
    }
  },
  { immediate: true },
)
</script>

<template>
  <aside v-if="hasTabs" class="inspector">
    <div class="tabs">
      <button
        v-for="item in tabs"
        :key="item.key"
        :class="{ active: tab === item.key }"
        @click="tab = item.key"
      >
        <component :is="item.icon" :size="15" />
        {{ item.label }}
        <span
          v-if="item.key === 'data' && dataFields.length"
          class="tab-badge"
        >
          {{ dataFields.length }}
        </span>
      </button>
    </div>
    <div class="inspector-body">
      <PropsPanel
        v-show="tab === 'props' && uiVisibility.inspectorTabs.props"
      />
      <LayersPanel
        v-show="tab === 'layers' && uiVisibility.inspectorTabs.layers"
      />
      <DataPanel v-show="tab === 'data' && uiVisibility.inspectorTabs.data" />
    </div>
  </aside>
</template>

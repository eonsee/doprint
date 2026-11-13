<script setup lang="ts">
import { Eye, EyeOff, Lock } from 'lucide-vue-next'
import { useDesigner } from '../designer/context'
import { KIND_LABEL } from '../designer/designer'

const designer = useDesigner()
const { layers } = designer

function onLayerClick(id: string, event: MouseEvent) {
  designer.selectById(id, event.shiftKey || event.ctrlKey || event.metaKey)
}
</script>

<template>
  <div class="layers-panel">
    <div v-if="layers.length === 0" class="layers-empty">画布还没有元素</div>
    <ul v-else>
      <li
        v-for="layer in layers"
        :key="layer.id"
        class="layer-row"
        :class="{ active: layer.active, hidden: !layer.visible }"
        title="点击选择，按住 Shift / Ctrl 可多选"
        @click="onLayerClick(layer.id, $event)"
      >
        <button
          class="eye"
          :title="layer.visible ? '隐藏' : '显示'"
          @click.stop="designer.toggleVisible(layer.id)"
        >
          <Eye v-if="layer.visible" :size="14" />
          <EyeOff v-else :size="14" />
        </button>
        <span class="layer-name">{{ layer.name }}</span>
        <Lock v-if="layer.locked" :size="12" class="layer-lock" />
        <span class="layer-kind">{{ KIND_LABEL[layer.kind] }}</span>
      </li>
    </ul>
  </div>
</template>

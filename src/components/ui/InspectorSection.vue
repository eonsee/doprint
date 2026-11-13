<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    title: string
    open?: boolean
  }>(),
  { open: true },
)

const expanded = ref(props.open)
</script>

<template>
  <section class="panel-section inspector-section" :class="{ collapsed: !expanded }">
    <header class="section-head">
      <button
        type="button"
        class="section-toggle"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <ChevronDown :size="13" class="section-chevron" />
        <span>{{ title }}</span>
      </button>
      <div v-if="$slots.actions" class="section-actions">
        <slot name="actions" />
      </div>
    </header>
    <div v-show="expanded" class="section-body">
      <slot />
    </div>
  </section>
</template>

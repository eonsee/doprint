<script setup lang="ts">
import { computed } from 'vue'
import { fontSizeOptions } from '../../designer/units'

const props = withDefaults(
  defineProps<{
    modelValue: number
    label?: string
    min?: number
    max?: number
    disabled?: boolean
  }>(),
  { label: '', min: 4, max: 300, disabled: false },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
}>()

const options = computed(() =>
  fontSizeOptions(props.modelValue, props.min, props.max),
)

function onChange(event: Event) {
  const value = Number((event.target as HTMLSelectElement).value)
  if (Number.isFinite(value)) emit('update:modelValue', value)
}
</script>

<template>
  <label class="num-field font-size-field" :class="{ 'is-disabled': disabled }">
    <span v-if="label" class="num-label">{{ label }}</span>
    <span class="num-control">
      <select :value="modelValue" :disabled="disabled" @change="onChange">
        <option v-for="size in options" :key="size" :value="size">
          {{ size }} px
        </option>
      </select>
    </span>
  </label>
</template>

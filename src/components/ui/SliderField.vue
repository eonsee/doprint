<script setup lang="ts">
import { computed } from 'vue'
import { clamp, round } from '../../designer/units'

const props = withDefaults(
  defineProps<{
    modelValue: number
    label?: string
    unit?: string
    min?: number
    max?: number
    step?: number
    disabled?: boolean
    /** decimal places used in the readout */
    precision?: number
  }>(),
  {
    label: '',
    unit: '',
    min: 0,
    max: 100,
    step: 1,
    disabled: false,
    precision: 0,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
}>()

const display = computed(() => round(props.modelValue, props.precision))

function onRange(event: Event) {
  emit(
    'update:modelValue',
    clamp(Number((event.target as HTMLInputElement).value), props.min, props.max),
  )
}

function onNumber(event: Event) {
  const input = event.target as HTMLInputElement
  const value = Number(input.value)
  if (!Number.isFinite(value)) {
    input.value = String(display.value)
    return
  }
  emit('update:modelValue', clamp(value, props.min, props.max))
}
</script>

<template>
  <div class="slider-field" :class="{ 'is-disabled': disabled }">
    <div class="slider-head">
      <span class="slider-label">{{ label }}</span>
      <span class="slider-value">
        <input
          type="number"
          class="slider-number"
          :value="display"
          :min="min"
          :max="max"
          :step="step"
          :disabled="disabled"
          @change="onNumber"
        />
        <span v-if="unit" class="slider-unit">{{ unit }}</span>
      </span>
    </div>
    <input
      class="slider-range"
      type="range"
      :value="modelValue"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      @input="onRange"
    />
  </div>
</template>

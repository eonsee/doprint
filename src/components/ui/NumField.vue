<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: number
    label?: string
    unit?: string
    step?: number
    min?: number
    max?: number
    disabled?: boolean
  }>(),
  { step: 0.5, unit: '', disabled: false },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void
}>()

function onChange(event: Event) {
  const input = event.target as HTMLInputElement
  const value = Number(input.value)
  if (!Number.isFinite(value)) {
    input.value = String(props.modelValue)
    return
  }
  emit('update:modelValue', value)
}
</script>

<template>
  <label class="num-field" :class="{ 'is-disabled': disabled }">
    <span v-if="label" class="num-label">{{ label }}</span>
    <span class="num-control">
      <input
        type="number"
        :value="modelValue"
        :step="step"
        :min="min"
        :max="max"
        :disabled="disabled"
        @change="onChange"
      />
      <span v-if="unit" class="num-unit">{{ unit }}</span>
    </span>
  </label>
</template>

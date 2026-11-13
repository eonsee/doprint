<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  label: string
  clearable?: boolean
  /** show the quick preset palette */
  palette?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const PRESET_COLORS = [
  '#111827',
  '#ffffff',
  '#6b7280',
  '#dc2626',
  '#ea580c',
  '#d97706',
  '#16a34a',
  '#0d9488',
  '#2563eb',
  '#4f46e5',
  '#7c3aed',
  '#db2777',
]

function onColorInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}

function onHexChange(event: Event) {
  const input = event.target as HTMLInputElement
  const raw = input.value.trim()
  if (!raw) {
    input.value = ''
    if (clearable) emit('update:modelValue', '')
    return
  }
  const normalized = raw.startsWith('#') ? raw : `#${raw}`
  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    emit('update:modelValue', normalized.toLowerCase())
  } else {
    input.value = props.modelValue ? props.modelValue.toUpperCase() : ''
  }
}

function onHexKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
}
</script>

<template>
  <div class="color-field">
    <span class="color-label">{{ label }}</span>
    <div class="color-control" :class="{ 'is-empty': !modelValue }">
      <label class="swatch" :style="{ background: modelValue || 'transparent' }">
        <input
          type="color"
          :value="modelValue || '#ffffff'"
          @input="onColorInput"
        />
      </label>
      <input
        class="hex-input"
        type="text"
        spellcheck="false"
        maxlength="7"
        :value="modelValue ? modelValue.toUpperCase() : ''"
        placeholder="无"
        @change="onHexChange"
        @keydown="onHexKeydown"
      />
      <button
        v-if="clearable && modelValue"
        type="button"
        class="clear-btn"
        title="清除颜色"
        @click="emit('update:modelValue', '')"
      >
        清除
      </button>
    </div>

    <div v-if="palette" class="color-palette">
      <button
        v-for="color in PRESET_COLORS"
        :key="color"
        type="button"
        class="palette-dot"
        :class="{ active: color === modelValue.toLowerCase() }"
        :style="{ background: color }"
        :title="color.toUpperCase()"
        @click="emit('update:modelValue', color)"
      ></button>
    </div>
  </div>
</template>

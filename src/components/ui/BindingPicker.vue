<script setup lang="ts">
import { Link2 } from 'lucide-vue-next'
import type { DataField } from '../../designer/types'

defineProps<{
  fields: DataField[]
}>()

const emit = defineEmits<{
  (e: 'insert', key: string): void
}>()

function onChange(event: Event) {
  const select = event.target as HTMLSelectElement
  const key = select.value
  if (key) emit('insert', key)
  select.value = ''
}
</script>

<template>
  <label class="binding-picker" :class="{ empty: !fields.length }">
    <Link2 :size="13" class="binding-icon" />
    <select :disabled="!fields.length" @change="onChange">
      <option value="">
        {{ fields.length ? '插入数据字段…' : '先在「数据」页添加字段' }}
      </option>
      <option v-for="field in fields" :key="field.key" :value="field.key">
        {{ field.key }}{{ field.value ? ` · ${field.value}` : '' }}
      </option>
    </select>
  </label>
</template>

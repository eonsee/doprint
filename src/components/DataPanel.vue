<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Trash2 } from 'lucide-vue-next'
import InspectorSection from './ui/InspectorSection.vue'
import { useDesigner } from '../designer/context'

const designer = useDesigner()
const { dataFields } = designer

const jsonText = ref('')

function addField() {
  designer.addDataField()
}

function onKeyChange(index: number, event: Event) {
  const input = event.target as HTMLInputElement
  designer.updateDataField(index, { key: input.value })
  // Rejected (empty / duplicate) keys snap back to the stored value.
  input.value = designer.dataFields.value[index]?.key ?? ''
}

function onValueChange(index: number, event: Event) {
  designer.updateDataField(index, {
    value: (event.target as HTMLInputElement).value,
  })
}

function removeField(index: number) {
  designer.removeDataField(index)
}

function importJson() {
  if (!jsonText.value.trim()) return
  designer.importDataJson(jsonText.value)
  jsonText.value = ''
}
</script>

<template>
  <div class="data-panel">
    <InspectorSection title="示例数据">
      <p class="data-hint">
        在文本或单元格中输入
        <code v-pre>{{ 字段名 }}</code>
        ，预览与导出时会替换为这里的示例值。未匹配的字段保持原样，方便排查。
      </p>

      <div v-if="dataFields.length" class="data-field-list">
        <div
          v-for="(field, index) in dataFields"
          :key="`${index}-${field.key}`"
          class="data-field-row"
        >
          <input
            class="field-key"
            :value="field.key"
            placeholder="字段名"
            spellcheck="false"
            @change="onKeyChange(index, $event)"
          />
          <input
            class="field-value"
            :value="field.value"
            placeholder="示例值"
            @change="onValueChange(index, $event)"
          />
          <button
            class="icon-btn tiny"
            title="删除字段"
            @click="removeField(index)"
          >
            <Trash2 :size="13" />
          </button>
        </div>
      </div>
      <p v-else class="data-empty">还没有数据字段。</p>

      <button class="btn ghost wide data-add" @click="addField">
        <Plus :size="14" />
        新增字段
      </button>
    </InspectorSection>

    <InspectorSection title="从 JSON 导入" :open="false">
      <p class="data-hint">
        粘贴一个 JSON 对象，嵌套字段会转换为点号路径，例如
        <code>order.customer</code>。同名字段会覆盖现有值。
      </p>
      <textarea
        v-model="jsonText"
        class="text-content json-input"
        rows="6"
        spellcheck="false"
        placeholder='{"customer": "张三", "order": {"no": "A-1001"}}'
      ></textarea>
      <button class="btn ghost wide" :disabled="!jsonText.trim()" @click="importJson">
        导入 JSON 数据
      </button>
    </InspectorSection>

    <InspectorSection title="绑定说明" :open="false">
      <p class="data-hint">
        文本与表格单元格都支持数据绑定。字段名可以使用中文、下划线、点号等，
        例如 <code v-pre>{{ 客户名称 }}</code> 或 <code v-pre>{{ order.no }}</code>。
      </p>
      <p class="data-hint">
        设计画布显示占位符本身，点击顶部「矢量预览」即可看到使用示例数据替换后的效果。
      </p>
    </InspectorSection>
  </div>
</template>

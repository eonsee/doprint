<script setup lang="ts">
import { computed, ref } from 'vue'
import { Eye, GripVertical, PlugZap, Plus, Trash2 } from 'lucide-vue-next'
import InspectorSection from './ui/InspectorSection.vue'
import { useDesigner } from '../designer/context'
import { FIELD_DRAG_MIME } from '../designer/dataDrag'

const designer = useDesigner()
const { dataFields } = designer
const detailFields = computed(() =>
  dataFields.value.filter(
    (field) => Array.isArray(field.rows) && field.rows.length > 0,
  ),
)
const dataDragEnabled = designer.dataDragEnabled
const showSampleValues = designer.showSampleValues

const jsonText = ref('')

function onDragToggle(event: Event) {
  designer.setDataDragEnabled((event.target as HTMLInputElement).checked)
}

function onSampleToggle(event: Event) {
  designer.setShowSampleValues((event.target as HTMLInputElement).checked)
}

function onFieldDragStart(key: string, event: DragEvent) {
  if (!dataDragEnabled.value || !event.dataTransfer) {
    event.preventDefault()
    return
  }
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData(FIELD_DRAG_MIME, key)
  event.dataTransfer.setData('text/plain', `{{${key}}}`)
}

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

      <label class="switch-row data-drag-switch">
        <span class="switch-label">
          <Eye :size="14" />
          设计时显示示例值
        </span>
        <input
          class="switch"
          type="checkbox"
          :checked="showSampleValues"
          @change="onSampleToggle"
        />
      </label>
      <p v-if="showSampleValues" class="data-hint sample-hint">
        画布上的文本和表格会显示示例数据，避免 <code v-pre>{{ 字段 }}</code>
        占位符过长导致换行、遮挡其他元素；双击编辑时仍显示绑定原文。
      </p>

      <label class="switch-row data-drag-switch">
        <span class="switch-label">
          <GripVertical :size="14" />
          拖入页面
        </span>
        <input
          class="switch"
          type="checkbox"
          :checked="dataDragEnabled"
          @change="onDragToggle"
        />
      </label>

      <div v-if="dataFields.length" class="data-field-list">
        <div
          v-for="(field, index) in dataFields"
          :key="`${index}-${field.key}`"
          class="data-field-row"
          :class="{ 'drag-enabled': dataDragEnabled }"
        >
          <span
            class="field-drag-handle"
            :class="{ disabled: !!field.rows }"
            :draggable="dataDragEnabled && !field.rows"
            :title="
              field.rows
                ? '明细集合会在表格中按行重复，不直接拖入页面'
                : dataDragEnabled
                  ? '拖到页面插入绑定文本'
                  : '请先开启「拖入页面」'
            "
            @dragstart="onFieldDragStart(field.key, $event)"
          >
            <GripVertical :size="13" />
          </span>
          <input
            class="field-key"
            :value="field.key"
            placeholder="字段名"
            spellcheck="false"
            @change="onKeyChange(index, $event)"
          />
          <div
            v-if="field.rows"
            class="field-detail-value"
            :title="`${field.rows.length} 行明细数据，可通过 JSON 导入更新`"
          >
            明细 {{ field.rows.length }} 行
          </div>
          <input
            v-else
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

      <p v-if="detailFields.length" class="data-hint detail-hint">
        明细集合：{{ detailFields.map((field) => field.key).join('、') }}。
        在表格「明细行绑定」中选择集合后，选中的行会按明细行数重复；单元格用
        <code v-pre>{{集合.列名}}</code> 绑定子表字段。
      </p>

      <button class="btn ghost wide data-add" @click="addField">
        <Plus :size="14" />
        新增字段
      </button>
    </InspectorSection>

    <InspectorSection title="数据源">
      <p class="data-hint">
        从数据库读取表结构，把字段和首行示例值导入下方「示例数据」。
      </p>
      <button
        class="btn ghost wide"
        @click="designer.dataSourceOpen.value = true"
      >
        <PlugZap :size="14" />
        连接数据源
      </button>
      <p class="data-hint source-support-hint">
        当前支持 MySQL，PostgreSQL / SQL Server 即将支持。
      </p>
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
        文本和普通字段绑定在设计画布中保留占位符；表格单元格中的复选框绑定会直接显示勾选符号。
        点击顶部「矢量预览」即可查看使用示例数据替换后的完整效果。
      </p>
    </InspectorSection>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Omega, X } from 'lucide-vue-next'
import { useDesigner } from '../designer/context'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const designer = useDesigner()
const { dataFields, selectedCheckboxCount, bindCheckboxValues } = designer

const symbolGroups = [
  {
    title: '方框与勾选',
    chars: ['□', '☑', '☒', '☐', '✓', '✔', '✗', '✘'],
  },
  {
    title: '图形与标记',
    chars: ['■', '◼', '○', '●', '◎', '◇', '◆', '☆', '★', '※', '§', '¶'],
  },
  {
    title: '数学与单位',
    chars: ['°', '±', '×', '÷', '≈', '≠', '≤', '≥', '℃', '￥', '%', '№', '#', '@', '&'],
  },
]

const mode = ref<'single' | 'batch'>('single')
const fieldKey = ref(dataFields.value[0]?.key ?? '')
const condition = ref('')
/** Optional description printed before the bound checkbox character. */
const label = ref('')
const checked = ref('☑')
const unchecked = ref('□')
const values = ref<string[]>([])
const labels = ref<string[]>([])
const status = ref('')

const targetCount = computed(() => selectedCheckboxCount.value)
const canBind = computed(() => !!fieldKey.value)
const canBatchBind = computed(
  () =>
    canBind.value &&
    targetCount.value > 0 &&
    values.value
      .slice(0, targetCount.value)
      .every((value) => value.trim().length > 0),
)

const tokenPreview = computed(() => {
  const key = fieldKey.value || '字段'
  const cond = condition.value.trim()
  const checkedChar = checked.value.trim() || '☑'
  const uncheckedChar = unchecked.value.trim() || '□'
  return `{{#${key}${cond ? `=${cond}` : ''}|${checkedChar}|${uncheckedChar}}}`
})

watch(
  targetCount,
  (count) => {
    values.value = Array.from(
      { length: count },
      (_, index) => values.value[index] ?? '',
    )
    labels.value = Array.from(
      { length: count },
      (_, index) => labels.value[index] ?? '',
    )
  },
  { immediate: true },
)

function insert(symbol: string) {
  designer.insertTextSymbol(symbol)
}

function insertBound() {
  if (!canBind.value) return
  designer.insertTextSymbol(`${label.value.trim()}${tokenPreview.value}`)
  status.value = '已插入 1 个绑定复选框'
}

function setValue(index: number, event: Event) {
  const next = [...values.value]
  next[index] = (event.target as HTMLInputElement).value
  values.value = next
}

function setLabel(index: number, event: Event) {
  const next = [...labels.value]
  next[index] = (event.target as HTMLInputElement).value
  labels.value = next
}

function bindAll() {
  if (!canBatchBind.value) return
  const filled = values.value
    .slice(0, targetCount.value)
    .map((value) => value.trim())
  const count = bindCheckboxValues(
    fieldKey.value,
    filled,
    checked.value,
    unchecked.value,
    labels.value.slice(0, targetCount.value),
  )
  status.value = count
    ? `已绑定 ${count} 个方框`
    : '没有找到可绑定的方框'
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="source-modal-mask doprint-modal" data-doprint-modal="symbols" data-modal @click.self="emit('close')">
    <div class="source-modal symbol-modal" role="dialog" aria-label="特殊字符">
      <div class="source-modal-head">
        <div class="source-modal-title">
          <span class="source-modal-icon">
            <Omega :size="17" />
          </span>
          <div>
            <strong>特殊字符</strong>
            <span>插入符号，或把复选框绑定到数据字段</span>
          </div>
        </div>
        <button class="icon-btn" title="关闭" @click="emit('close')">
          <X :size="17" />
        </button>
      </div>

      <div class="source-modal-body">
        <section class="symbol-section">
          <div class="settings-group-head">
            <h3>常用符号</h3>
            <span>点击插入到当前文本或表格单元格</span>
          </div>
          <div
            v-for="group in symbolGroups"
            :key="group.title"
            class="symbol-group"
          >
            <span class="symbol-group-title">{{ group.title }}</span>
            <div class="symbol-grid">
              <button
                v-for="symbol in group.chars"
                :key="symbol"
                type="button"
                class="symbol-btn"
                :title="`插入 ${symbol}`"
                @click="insert(symbol)"
              >
                {{ symbol }}
              </button>
            </div>
          </div>
          <p class="field-note">
            正在编辑文本时插入到光标处；选中文本 / 表格单元格时追加到内容末尾；未选中时自动新建一个文本元素。
          </p>
        </section>

        <section class="symbol-section">
          <div class="settings-group-head">
            <h3>字段复选框</h3>
            <span>预览与导出时按字段值显示勾选状态</span>
          </div>

          <div class="symbol-form">
            <label class="source-field">
              <span>数据字段</span>
              <select v-model="fieldKey">
                <option v-if="!dataFields.length" value="">
                  暂无字段，请先在「数据」面板添加
                </option>
                <option
                  v-for="field in dataFields"
                  :key="field.key"
                  :value="field.key"
                >
                  {{ field.key }}
                </option>
              </select>
            </label>
            <label class="source-field">
              <span>选中字符</span>
              <input v-model="checked" maxlength="4" placeholder="☑" />
            </label>
            <label class="source-field">
              <span>未选中字符</span>
              <input v-model="unchecked" maxlength="4" placeholder="□" />
            </label>
          </div>

          <div class="segmented text-seg symbol-mode">
            <button
              type="button"
              :class="{ active: mode === 'single' }"
              @click="mode = 'single'"
            >
              单个条件
            </button>
            <button
              type="button"
              :class="{ active: mode === 'batch' }"
              @click="mode = 'batch'"
            >
              批量绑定方框
            </button>
          </div>

          <template v-if="mode === 'single'">
            <div class="symbol-form symbol-form-two">
              <label class="source-field">
                <span>描述文本（可选）</span>
                <input
                  v-model="label"
                  placeholder="如：普"
                  maxlength="20"
                />
              </label>
              <label class="source-field">
                <span>条件值（可选）</span>
                <input
                  v-model="condition"
                  placeholder="留空表示非空 / 真值"
                  maxlength="40"
                />
              </label>
            </div>
            <div class="symbol-preview">
              <span>示例预览</span>
              <strong>{{ label.trim() }}{{ checked.trim() || '☑' }} / {{ label.trim() }}{{ unchecked.trim() || '□' }}</strong>
              <code>{{ label.trim() }}{{ tokenPreview }}</code>
            </div>
            <button
              class="btn primary symbol-insert"
              :disabled="!canBind"
              @click="insertBound"
            >
              插入绑定复选框
            </button>
            <p class="field-note" v-pre>
              描述文本会插入在复选框字符前面，例如填写「普」得到 普{{#字段|☑|□}}。
              勾选判定：1 / true / 是 / √ 视为已勾选，0 / false / 否 / 空视为未勾选；
              填写条件值后，只有字段值等于该条件时才显示勾选。
              插入到表格单元格时，画布会按示例数据直接显示勾选符号；
              文本元素保留绑定原文，预览和导出时再替换。
            </p>
          </template>

          <template v-else>
            <p class="source-lead symbol-batch-lead">
              适用于一个字段有多个取值的情况：选中含有方框的文本或单元格，
              为每个方框填写描述文本（可选）和一个字段值，即可一次完成绑定。
            </p>
            <div v-if="targetCount > 0" class="batch-values">
              <div
                v-for="index in targetCount"
                :key="index"
                class="batch-item"
              >
                <span class="batch-index">方框 {{ index }}</span>
                <label class="source-field">
                  <span>描述文本（可选）</span>
                  <input
                    :value="labels[index - 1] ?? ''"
                    placeholder="如：普"
                    maxlength="20"
                    @input="setLabel(index - 1, $event)"
                  />
                </label>
                <label class="source-field">
                  <span>字段值</span>
                  <input
                    :value="values[index - 1] ?? ''"
                    :placeholder="`字段值 ${index}`"
                    maxlength="40"
                    @input="setValue(index - 1, $event)"
                  />
                </label>
              </div>
            </div>
            <p v-else class="symbol-empty">
              当前选中的文本 / 单元格中没有方框。请先在上方插入 □ 符号，
              或直接在单元格里输入方框后再回来批量绑定；如果是表格，
              请先双击进入单元格编辑并选中含方框的单元格。
            </p>
            <button
              class="btn primary symbol-insert"
              :disabled="!canBatchBind"
              @click="bindAll"
            >
              绑定到 {{ targetCount }} 个方框
            </button>
            <p v-if="status" class="symbol-status">{{ status }}</p>
            <p class="field-note">
              描述文本会显示在对应复选框前面；第 1 个方框使用第 1 行的描述和值，
              第 2 个方框使用第 2 行，依此类推。绑定到表格单元格后，
              画布会按示例数据直接显示勾选符号，单元格仍保留绑定原文供编辑。
              已存在的 <code v-pre>{{#...}}</code> 绑定不会被重复替换。
            </p>
          </template>
        </section>
      </div>

      <div class="source-modal-foot">
        <span class="source-foot-spacer"></span>
        <button class="btn primary" @click="emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

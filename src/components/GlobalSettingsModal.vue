<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { RotateCcw, SlidersHorizontal, X } from 'lucide-vue-next'
import { useDesigner } from '../designer/context'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const designer = useDesigner()
const { uiVisibility } = designer

interface Option {
  key: string
  label: string
}

const toolOptions: Option[] = [
  { key: 'text', label: '文本' },
  { key: 'table', label: '表格' },
  { key: 'labels', label: '标签' },
  { key: 'symbols', label: '特殊字符' },
  { key: 'rect', label: '矩形' },
  { key: 'ellipse', label: '椭圆' },
  { key: 'line', label: '线条' },
  { key: 'image', label: '图片' },
  { key: 'qrcode', label: '二维码' },
  { key: 'barcode', label: '条形码' },
]

const topbarOptions: Option[] = [
  { key: 'page', label: '页面设置' },
  { key: 'background', label: '纸张底图' },
  { key: 'globalStyle', label: '全局字体' },
  { key: 'margins', label: '页边距' },
]

const tabOptions: Option[] = [
  { key: 'props', label: '属性' },
  { key: 'layers', label: '图层' },
  { key: 'data', label: '数据' },
]

const sectionOptions: Option[] = [
  { key: 'page', label: '页面设置' },
  { key: 'margins', label: '页边距' },
  { key: 'background', label: '纸张底图' },
  { key: 'watermark', label: '版权水印' },
  { key: 'view', label: '视图与吸附' },
]

const topbarMainOptions: Option[] = [
  { key: 'template', label: '模板管理' },
  { key: 'history', label: '撤销 / 重做' },
  { key: 'autosave', label: '自动保存状态' },
  { key: 'preview', label: '矢量 / PDF 预览' },
  { key: 'io', label: '导入 / 导出 JSON' },
]

const topbarSelectionOptions: Option[] = [
  { key: 'font', label: '字体与字号' },
  { key: 'textStyle', label: '加粗 / 斜体 / 下划线' },
  { key: 'align', label: '文本对齐' },
  { key: 'geometry', label: '位置与尺寸' },
  { key: 'actions', label: '锁定 / 复制 / 删除' },
]

const inspectorSelectionOptions: Option[] = [
  { key: 'align', label: '对齐与分布' },
  { key: 'textStyle', label: '文字样式' },
  { key: 'position', label: '位置与尺寸' },
  { key: 'multiAdjust', label: '批量调整' },
  { key: 'appearance', label: '外观' },
  { key: 'code', label: '二维码 / 条形码内容' },
  { key: 'image', label: '图片' },
  { key: 'text', label: '文本' },
  { key: 'table', label: '表格' },
  { key: 'arrange', label: '图层与操作' },
]

const groups: Array<{
  group: string
  title: string
  hint: string
  options: Option[]
}> = [
  {
    group: 'tools',
    title: '左侧工具栏',
    hint: '控制可以添加到画布的元素类型',
    options: toolOptions,
  },
  {
    group: 'topbar',
    title: '顶部属性栏',
    hint: '未选中元素时显示的快捷设置',
    options: topbarOptions,
  },
  {
    group: 'inspectorTabs',
    title: '右侧面板标签页',
    hint: '隐藏后右侧不再显示对应标签页',
    options: tabOptions,
  },
  {
    group: 'inspectorSections',
    title: '右侧页面属性',
    hint: '未选中元素时的页面级设置分组',
    options: sectionOptions,
  },
  {
    group: 'topbarMain',
    title: '顶部主栏功能',
    hint: '模板、历史、预览与导入导出（全局属性与主题按钮始终显示）',
    options: topbarMainOptions,
  },
  {
    group: 'topbarSelection',
    title: '顶部选中元素属性',
    hint: '选中元素时顶部属性栏的快捷分组',
    options: topbarSelectionOptions,
  },
  {
    group: 'inspectorSelection',
    title: '右侧选中元素属性',
    hint: '选中元素时右侧属性面板的分组',
    options: inspectorSelectionOptions,
  },
]

function isVisible(group: string, key: string): boolean {
  const source = (uiVisibility as Record<string, Record<string, boolean>>)[
    group
  ]
  return !!source?.[key]
}

function onToggle(group: string, key: string, event: Event) {
  designer.setUiVisible(
    `${group}.${key}`,
    (event.target as HTMLInputElement).checked,
  )
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="source-modal-mask" data-modal @click.self="emit('close')">
    <div class="source-modal settings-modal" role="dialog" aria-label="全局属性">
      <div class="source-modal-head">
        <div class="source-modal-title">
          <span class="source-modal-icon">
            <SlidersHorizontal :size="17" />
          </span>
          <div>
            <strong>全局属性</strong>
            <span>勾选需要在界面中显示的工具栏、属性栏与面板</span>
          </div>
        </div>
        <button class="icon-btn" title="关闭" @click="emit('close')">
          <X :size="17" />
        </button>
      </div>

      <div class="source-modal-body">
        <section v-for="group in groups" :key="group.group" class="settings-group">
          <div class="settings-group-head">
            <h3>{{ group.title }}</h3>
            <span>{{ group.hint }}</span>
          </div>
          <div class="settings-grid">
            <label
              v-for="option in group.options"
              :key="option.key"
              class="settings-row"
            >
              <span>{{ option.label }}</span>
              <input
                class="switch"
                type="checkbox"
                :checked="isVisible(group.group, option.key)"
                @change="onToggle(group.group, option.key, $event)"
              />
            </label>
          </div>
        </section>

        <p class="field-note">
          隐藏的项只影响界面显示，不会删除模板中的元素或数据；可以随时在这里重新开启。
        </p>
      </div>

      <div class="source-modal-foot">
        <button class="btn ghost" @click="designer.resetUiVisibility()">
          <RotateCcw :size="14" />
          恢复默认
        </button>
        <span class="source-foot-spacer"></span>
        <button class="btn primary" @click="emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

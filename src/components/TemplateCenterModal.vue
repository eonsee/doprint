<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { LayoutTemplate, X } from 'lucide-vue-next'
import { useDesigner } from '../designer/context'
import {
  OFFICIAL_TEMPLATES,
  cachedOfficialThumbnail,
  rememberOfficialThumbnail,
  type OfficialTemplate,
} from '../designer/officialTemplates'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const designer = useDesigner()
const thumbs = ref<Record<string, string>>({})
const failed = ref<Record<string, boolean>>({})
const busyId = ref('')

async function loadThumb(item: OfficialTemplate) {
  const cached = cachedOfficialThumbnail(item.id)
  if (cached) {
    thumbs.value = { ...thumbs.value, [item.id]: cached }
    return
  }
  try {
    const url = await designer.renderTemplateThumbnail(item.template, 560, 560)
    rememberOfficialThumbnail(item.id, url)
    thumbs.value = { ...thumbs.value, [item.id]: url }
  } catch (err) {
    console.warn(`template thumbnail failed: ${item.id}`, err)
    failed.value = { ...failed.value, [item.id]: true }
  }
}

async function useTemplate(item: OfficialTemplate) {
  if (busyId.value) return
  busyId.value = item.id
  try {
    await designer.useOfficialTemplate(item.id)
    emit('close')
  } finally {
    busyId.value = ''
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  void Promise.all(OFFICIAL_TEMPLATES.map((item) => loadThumb(item)))
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="source-modal-mask" data-modal @click.self="emit('close')">
    <div
      class="source-modal template-center-modal"
      role="dialog"
      aria-label="模板中心"
    >
      <div class="source-modal-head">
        <div class="source-modal-title">
          <span class="source-modal-icon">
            <LayoutTemplate :size="17" />
          </span>
          <div>
            <strong>模板中心</strong>
            <span>官方精选模板，点击卡片即可复制到本地</span>
          </div>
        </div>
        <button class="icon-btn" title="关闭" @click="emit('close')">
          <X :size="17" />
        </button>
      </div>

      <div class="source-modal-body template-center-body">
        <div class="tc-topline">
          <div class="tc-heading">
            <strong>官方模板</strong>
            <span>{{ OFFICIAL_TEMPLATES.length }} 个精选示例</span>
          </div>
          <span class="tc-tip">使用后为独立副本，可自由修改</span>
        </div>

        <div class="tc-grid">
          <button
            v-for="item in OFFICIAL_TEMPLATES"
            :key="item.id"
            type="button"
            class="tc-card"
            :disabled="!!busyId"
            :aria-label="`使用官方模板 ${item.name}`"
            @click="useTemplate(item)"
          >
            <span class="tc-thumb">
              <img
                v-if="thumbs[item.id]"
                :src="thumbs[item.id]"
                :alt="item.name"
                loading="lazy"
              />
              <span v-else-if="failed[item.id]" class="tc-state">
                预览生成失败
              </span>
              <span v-else class="tc-state">预览生成中…</span>
              <span class="tc-badge">官方</span>
              <span class="tc-use">{{
                busyId === item.id ? '正在打开…' : '使用此模板'
              }}</span>
            </span>
            <span class="tc-meta">
              <span class="tc-name">{{ item.name }}</span>
              <span class="tc-size">{{ item.width }} × {{ item.height }} mm</span>
            </span>
            <span class="tc-desc">{{ item.description }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

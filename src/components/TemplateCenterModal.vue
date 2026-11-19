<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
/** Template shown in the large hover preview. */
const previewId = ref(OFFICIAL_TEMPLATES[0]?.id ?? '')
const previewItem = computed(
  () =>
    OFFICIAL_TEMPLATES.find((item) => item.id === previewId.value) ??
    OFFICIAL_TEMPLATES[0],
)

function showPreview(item: OfficialTemplate) {
  previewId.value = item.id
}

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
            <span>悬停查看大图，点击卡片复制到本地</span>
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
          <span class="tc-tip">悬停查看大图 · 使用后为独立副本</span>
        </div>

        <div class="tc-layout">
          <div class="tc-grid">
            <button
              v-for="item in OFFICIAL_TEMPLATES"
              :key="item.id"
              type="button"
              class="tc-card"
              :class="{ current: previewId === item.id }"
              :disabled="!!busyId"
              :aria-label="`使用官方模板 ${item.name}`"
              @mouseenter="showPreview(item)"
              @focus="showPreview(item)"
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
              </span>
              <span class="tc-meta">
                <span class="tc-name">{{ item.name }}</span>
                <span class="tc-size">{{ item.width }} × {{ item.height }} mm</span>
              </span>
              <span class="tc-desc">{{ item.description }}</span>
            </button>
          </div>

          <aside v-if="previewItem" class="tc-preview" aria-live="polite">
            <div class="tc-preview-stage">
              <img
                v-if="thumbs[previewItem.id]"
                :src="thumbs[previewItem.id]"
                :alt="previewItem.name"
              />
              <span v-else-if="failed[previewItem.id]" class="tc-state">
                预览生成失败
              </span>
              <span v-else class="tc-state">预览生成中…</span>
            </div>
            <div class="tc-preview-info">
              <div class="tc-preview-title">
                <strong>{{ previewItem.name }}</strong>
                <span>
                  {{ previewItem.width }} × {{ previewItem.height }} mm
                </span>
              </div>
              <p>{{ previewItem.description }}</p>
              <button
                class="btn primary wide"
                :disabled="!!busyId"
                @click="useTemplate(previewItem)"
              >
                {{
                  busyId === previewItem.id ? '正在打开…' : '使用此模板'
                }}
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  </div>
</template>

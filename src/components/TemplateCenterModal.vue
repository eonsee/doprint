<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ArrowRight, LayoutTemplate, X } from 'lucide-vue-next'
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
            <span>官方示例模板，一键复制到本地模板库</span>
          </div>
        </div>
        <button class="icon-btn" title="关闭" @click="emit('close')">
          <X :size="17" />
        </button>
      </div>

      <div class="source-modal-body template-center-body">
        <p class="source-lead">
          以下模板由项目官方维护，使用后会克隆一份到你的本地模板列表，
          修改不会影响官方原件；示例数据可直接在「数据」面板中替换。
        </p>

        <div class="template-center-grid">
          <article
            v-for="item in OFFICIAL_TEMPLATES"
            :key="item.id"
            class="template-card"
          >
            <div class="template-card-thumb">
              <img
                v-if="thumbs[item.id]"
                :src="thumbs[item.id]"
                :alt="item.name"
                loading="lazy"
              />
              <span v-else-if="failed[item.id]" class="template-card-state">
                预览生成失败
              </span>
              <span v-else class="template-card-state">正在生成预览…</span>
            </div>
            <div class="template-card-body">
              <div class="template-card-title">
                <strong>{{ item.name }}</strong>
                <span>{{ item.width }} × {{ item.height }} mm</span>
              </div>
              <p class="template-card-desc">{{ item.description }}</p>
              <div class="template-card-tags">
                <span v-for="tag in item.tags" :key="tag">{{ tag }}</span>
              </div>
              <button
                class="btn primary template-card-use"
                :disabled="!!busyId"
                @click="useTemplate(item)"
              >
                {{ busyId === item.id ? '正在打开…' : '使用此模板' }}
                <ArrowRight v-if="busyId !== item.id" :size="14" />
              </button>
            </div>
          </article>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { NButton, NModal, NSpin, NImage } from 'naive-ui'
import Player from 'xgplayer'
import 'xgplayer/dist/index.min.css'
import type { RemoteEntry } from '@shared/ipc'

const props = defineProps<{
  show: boolean
  serverId: string | null
  remotePath: string | null
  entries: RemoteEntry[]
}>()

const emit = defineEmits<{
  (e: 'update:show', v: boolean): void
  (e: 'navigate', remotePath: string): void
}>()

const localUrl = ref<string | null>(null)
const loading = ref(false)
const videoContainerRef = ref<HTMLElement | null>(null)
const videoPlayer = ref<Player | null>(null)

const IMAGE_EXT_RE = /\.(avif|bmp|gif|ico|jpe?g|png|svg|tiff?|webp|heic|heif)$/i
const VIDEO_EXT_RE = /\.(mp4|webm|ogg|mov|m4v|mkv|avi|wmv|flv|ts|m2ts)$/i

type MediaLike = Pick<RemoteEntry, 'contentType' | 'name' | 'path'> | null | undefined

const isImageLike = (entry: MediaLike): boolean => {
  if (!entry) return false
  if (entry.contentType?.startsWith('image/')) return true
  const target = entry.name || entry.path || ''
  return IMAGE_EXT_RE.test(target)
}

const isVideoLike = (entry: MediaLike): boolean => {
  if (!entry) return false
  if (entry.contentType?.startsWith('video/')) return true
  const target = entry.name || entry.path || ''
  return VIDEO_EXT_RE.test(target)
}

const mediaEntries = computed(() =>
  props.entries.filter((e) => (isImageLike(e) || isVideoLike(e)) && e.kind === 'file')
)

const index = computed(() => {
  if (!props.remotePath) return -1
  return mediaEntries.value.findIndex((e) => e.path === props.remotePath)
})

const current = computed(() => {
  if (!props.remotePath) return null
  return props.entries.find((e) => e.path === props.remotePath) ?? null
})

const isImage = computed(() => isImageLike(current.value))
const isVideo = computed(() => isVideoLike(current.value))

const load = async (): Promise<void> => {
  localUrl.value = null
  if (!props.show || !props.serverId || !props.remotePath) return
  loading.value = true
  try {
    localUrl.value = await window.api.preview.getOnlineUrl(props.serverId, props.remotePath)
  } finally {
    loading.value = false
  }
}

const destroyPlayer = (): void => {
  videoPlayer.value?.destroy()
  videoPlayer.value = null
}

watch(
  () => [props.show, props.serverId, props.remotePath],
  () => {
    load()
  },
  { immediate: true }
)

watch(
  [() => props.show, isVideo, localUrl],
  async ([show, videoLike, url]) => {
    destroyPlayer()
    if (!show || !videoLike || !url) return
    await nextTick()
    if (!videoContainerRef.value) return
    videoPlayer.value = new Player({
      el: videoContainerRef.value,
      url,
      fluid: true,
      videoFillMode: 'contain'
    })
  },
  { flush: 'post' }
)

onBeforeUnmount(() => {
  destroyPlayer()
})

const close = (): void => emit('update:show', false)

const goPrev = (): void => {
  if (index.value <= 0) return
  const prev = mediaEntries.value[index.value - 1]
  if (!prev) return
  emit('navigate', prev.path)
}

const goNext = (): void => {
  if (index.value < 0 || index.value >= mediaEntries.value.length - 1) return
  const next = mediaEntries.value[index.value + 1]
  if (!next) return
  emit('navigate', next.path)
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    style="width: min(980px, calc(100vw - 32px)); height: 720px; max-height: calc(100vh - 32px)"
    :mask-closable="false"
    @update:show="(v) => emit('update:show', v)"
  >
    <template #header>
      {{ current?.name ?? '预览' }}
    </template>
    <div class="h-full flex flex-col overflow-hidden">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-[12px] text-white/45 mt-1 truncate">{{ remotePath ?? '' }}</div>
        </div>
        <div class="flex items-center gap-2">
          <NButton size="small" secondary :disabled="index <= 0" @click="goPrev">上一张</NButton>
          <NButton
            size="small"
            secondary
            :disabled="index < 0 || index >= mediaEntries.length - 1"
            @click="goNext"
          >
            下一张
          </NButton>
        </div>
      </div>

      <div
        class="flex-1 h-full min-h-0 mt-3 rounded-[10px]  border border-white/10 overflow-hidden"
      >
        <div v-if="loading" class="h-full flex items-center justify-center">
          <NSpin size="large" />
        </div>

        <div v-else class="h-full flex items-center justify-center">
          <NImage
            v-if="isImage && localUrl"
            :src="localUrl"
            class=" h-[600px]"
          />
          <div v-else-if="isVideo && localUrl" ref="videoContainerRef" class="w-full h-full" />
          <div v-else class="h-full flex items-center justify-center text-white/50">不支持预览</div>
        </div>
      </div>
    </div>
  </NModal>
</template>

<style scoped>
:deep(.xgplayer) {
  width: 100% !important;
  height: 100% !important;
}

/* .img {
  width: 100%;
  height: 100%;
} */

/* :deep(.img img) {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
} */
</style>

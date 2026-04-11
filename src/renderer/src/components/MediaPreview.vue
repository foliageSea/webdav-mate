<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
const imageLoading = ref(false)
const imageScale = ref(1)
const imageTranslateX = ref(0)
const imageTranslateY = ref(0)
const draggingImage = ref(false)
const imageStageRef = ref<HTMLElement | null>(null)
const dragStartX = ref(0)
const dragStartY = ref(0)
const dragOriginX = ref(0)
const dragOriginY = ref(0)
const hasDragged = ref(false)
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

const resetImageTransform = (): void => {
  imageScale.value = 1
  imageTranslateX.value = 0
  imageTranslateY.value = 0
  draggingImage.value = false
  hasDragged.value = false
}

const getClampBoundary = (scale = imageScale.value): { maxX: number; maxY: number } => {
  const stage = imageStageRef.value
  if (!stage || scale <= 1) return { maxX: 0, maxY: 0 }
  const maxX = (stage.clientWidth * (scale - 1)) / 2
  const maxY = (stage.clientHeight * (scale - 1)) / 2
  return { maxX, maxY }
}

const clampTranslate = (
  x: number,
  y: number,
  scale = imageScale.value
): { x: number; y: number } => {
  const { maxX, maxY } = getClampBoundary(scale)
  return {
    x: Math.min(maxX, Math.max(-maxX, x)),
    y: Math.min(maxY, Math.max(-maxY, y))
  }
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

watch(
  [() => props.show, isImage, localUrl],
  ([show, imageLike, url]) => {
    imageLoading.value = Boolean(show && imageLike && url)
    if (!show || !imageLike || !url) resetImageTransform()
  },
  { immediate: true }
)

const onImageWheel = (event: WheelEvent): void => {
  if (imageLoading.value) return
  const step = event.deltaY < 0 ? 0.12 : -0.12
  const nextScale = Math.min(5, Math.max(1, Number((imageScale.value + step).toFixed(2))))
  imageScale.value = nextScale
  const clamped = clampTranslate(imageTranslateX.value, imageTranslateY.value, nextScale)
  imageTranslateX.value = clamped.x
  imageTranslateY.value = clamped.y
  if (nextScale <= 1) {
    imageTranslateX.value = 0
    imageTranslateY.value = 0
  }
}

const onImageMouseDown = (event: MouseEvent): void => {
  if (imageScale.value <= 1) return
  draggingImage.value = true
  hasDragged.value = false
  dragStartX.value = event.clientX
  dragStartY.value = event.clientY
  dragOriginX.value = imageTranslateX.value
  dragOriginY.value = imageTranslateY.value
}

const onWindowMouseMove = (event: MouseEvent): void => {
  if (!draggingImage.value) return
  const dx = event.clientX - dragStartX.value
  const dy = event.clientY - dragStartY.value
  if (!hasDragged.value && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
    hasDragged.value = true
  }
  const clamped = clampTranslate(dragOriginX.value + dx, dragOriginY.value + dy)
  imageTranslateX.value = clamped.x
  imageTranslateY.value = clamped.y
}

const onWindowMouseUp = (): void => {
  draggingImage.value = false
}

const onImageClickCapture = (event: MouseEvent): void => {
  if (!hasDragged.value) return
  event.preventDefault()
  event.stopPropagation()
  hasDragged.value = false
}

onMounted(() => {
  window.addEventListener('mousemove', onWindowMouseMove)
  window.addEventListener('mouseup', onWindowMouseUp)
})

onBeforeUnmount(() => {
  destroyPlayer()
  window.removeEventListener('mousemove', onWindowMouseMove)
  window.removeEventListener('mouseup', onWindowMouseUp)
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
    preset="dialog"
    :mask-closable="false"
    class="media-preview-modal"
    @update:show="(v) => emit('update:show', v)"
    style="width: calc(100vw - 24px); max-width: none"
  >
    <template #header>
      {{ current?.name ?? '预览' }}
    </template>
    <div
      class="w-full h-full flex flex-col overflow-hidden"
      style="width: 100%; height: calc(100vh - 88px); max-height: none"
    >
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
        class="flex-1 w-full h-full min-h-0 mt-3 rounded-[10px] bg-black/20 border border-white/10 overflow-hidden"
      >
        <div v-if="loading" class="h-full flex items-center justify-center">
          <NSpin size="large" />
        </div>

        <div v-else class="relative w-full h-full">
          <div
            v-if="isImage && localUrl"
            ref="imageStageRef"
            class="image-stage"
            :class="{ 'is-draggable': imageScale > 1, 'is-dragging': draggingImage }"
            :style="{
              '--preview-scale': String(imageScale),
              '--preview-translate-x': `${imageTranslateX}px`,
              '--preview-translate-y': `${imageTranslateY}px`,
              '--preview-transition': draggingImage ? 'none' : 'transform 0.12s ease'
            }"
            @wheel.prevent="onImageWheel"
            @mousedown.prevent="onImageMouseDown"
            @click.capture="onImageClickCapture"
          >
            <NImage
              :src="localUrl"
              :preview-src="localUrl"
              alt="preview"
              object-fit="contain"
              width="100%"
              height="100%"
              class="preview-image cursor-zoom-in"
              :class="{ invisible: imageLoading }"
              @load="imageLoading = false"
              @error="imageLoading = false"
            />
            <div v-if="imageLoading" class="absolute inset-0 flex items-center justify-center">
              <NSpin size="large" />
            </div>
            <div v-else class="preview-tip">滚轮缩放，点击可全屏放大</div>
          </div>
          <div v-else-if="isVideo && localUrl" ref="videoContainerRef" class="w-full h-full" />
          <div v-else class="h-full flex items-center justify-center text-white/50"></div>
        </div>
      </div>
    </div>
  </NModal>
</template>

<style scoped>
:deep(.media-preview-modal .n-card) {
  width: calc(100vw - 24px);
  max-width: none;
  height: calc(100vh - 24px);
  margin: 12px;
}

:deep(.media-preview-modal .n-card > .n-card__content) {
  height: 100%;
}

:deep(.xgplayer) {
  width: 100% !important;
  height: 100% !important;
}

.image-stage {
  width: 100%;
  height: 100%;
  position: relative;
}

.image-stage.is-draggable {
  cursor: grab;
}

.image-stage.is-dragging {
  cursor: grabbing;
}

.preview-image {
  width: 100%;
  height: 100%;
  display: block;
}

.preview-image :deep(img) {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform: translate(var(--preview-translate-x, 0), var(--preview-translate-y, 0))
    scale(var(--preview-scale, 1));
  transform-origin: center;
  transition: var(--preview-transition, transform 0.12s ease);
}

.preview-tip {
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  background: rgba(0, 0, 0, 0.4);
  pointer-events: none;
}
</style>

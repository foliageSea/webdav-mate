<script setup lang="ts">
import { computed, ref } from 'vue'
import { Document, Folder, Image, Video } from '@vicons/carbon'
import { NCheckbox, NEmpty, NIcon, NSpin } from 'naive-ui'
import type { RemoteEntry } from '@shared/ipc'

const props = defineProps<{
  entries: RemoteEntry[]
  selected: Set<string>
  loading: boolean
}>()

const emit = defineEmits<{
  (e: 'activate', entry: RemoteEntry): void
  (e: 'external-drop', paths: string[]): void
  (e: 'move-into-folder', fromPath: string, targetFolderPath: string): void
  (e: 'update:selected', selected: Set<string>): void
}>()

const draggingExternal = ref(false)

const sorted = computed(() => {
  return [...props.entries].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
})

const toggle = (p: string): void => {
  const next = new Set(props.selected)
  if (next.has(p)) next.delete(p)
  else next.add(p)
  emit('update:selected', next)
}

const onDragEnter = (e: DragEvent): void => {
  if (!e.dataTransfer) return
  if (e.dataTransfer.types.includes('Files')) draggingExternal.value = true
}

const onDragLeave = (): void => {
  draggingExternal.value = false
}

const onDrop = (e: DragEvent): void => {
  draggingExternal.value = false
  const dt = e.dataTransfer
  if (!dt) return

  const internal = dt.getData('text/webdav-path')
  if (internal) return

  const files = Array.from(dt.files)
  type DroppedFile = File & { path?: string }
  const paths = files.map((f) => String((f as DroppedFile).path ?? '')).filter(Boolean)
  emit('external-drop', paths)
}

const onDragStartInternal = (e: DragEvent, entry: RemoteEntry): void => {
  if (!e.dataTransfer) return
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/webdav-path', entry.path)
}

const onDropOnFolder = (e: DragEvent, folder: RemoteEntry): void => {
  if (!e.dataTransfer) return
  const fromPath = e.dataTransfer.getData('text/webdav-path')
  if (!fromPath) return
  if (folder.kind !== 'folder') return
  if (fromPath === folder.path) return
  emit('move-into-folder', fromPath, folder.path)
}

const isMedia = (entry: RemoteEntry): boolean => {
  if (!entry.contentType) return false
  return entry.contentType.startsWith('image/') || entry.contentType.startsWith('video/')
}

const isVideo = (entry: RemoteEntry): boolean => {
  if (!entry.contentType) return false
  return entry.contentType.startsWith('video/')
}

const onDoubleClick = (entry: RemoteEntry): void => emit('activate', entry)
</script>

<template>
  <div
    class="h-full relative"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div class="h-full overflow-auto">
      <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(160px, 1fr))">
        <div
          v-for="entry in sorted"
          :key="entry.path"
          class="group relative rounded-[10px] border border-white/10 bg-white/3 hover:bg-white/5 transition p-3"
          :class="selected.has(entry.path) ? 'ring-1 ring-brand-500/70 border-brand-500/50' : ''"
          :draggable="true"
          @dragstart="(e) => onDragStartInternal(e, entry)"
          @dragover.prevent
          @drop.prevent="(e) => onDropOnFolder(e, entry)"
          @click="() => toggle(entry.path)"
          @dblclick.stop="() => onDoubleClick(entry)"
        >
          <div class="absolute left-2 top-2 opacity-0 group-hover:opacity-100 transition">
            <NCheckbox
              :checked="selected.has(entry.path)"
              @update:checked="() => toggle(entry.path)"
            />
          </div>

          <div class="h-[86px] flex items-center justify-center">
            <div
              class="w-[56px] h-[56px] rounded-[14px] flex items-center justify-center"
              :class="
                entry.kind === 'folder'
                  ? 'bg-brand-500/18 text-brand-200'
                  : 'bg-white/6 text-white/80'
              "
            >
              <div class="text-[20px]">
                <NIcon size="22" v-if="entry.kind === 'folder'"><Folder /></NIcon>
                <NIcon size="22" v-else-if="isMedia(entry) && isVideo(entry)"><Video /></NIcon>
                <NIcon size="22" v-else-if="isMedia(entry)"><Image /></NIcon>
                <NIcon size="22" v-else><Document /></NIcon>
              </div>
            </div>
          </div>

          <div class="text-[12px] text-white/90 font-600 line-clamp-2">{{ entry.name }}</div>
          <div class="mt-1 text-[11px] text-white/45 flex items-center justify-between gap-2">
            <div class="truncate">{{ entry.lastModified ?? '' }}</div>
            <div class="truncate">{{ entry.size ?? '' }}</div>
          </div>
        </div>
      </div>

      <div v-if="!loading && entries.length === 0" class="py-14">
        <NEmpty description="此目录为空" />
      </div>
    </div>

    <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-black/20">
      <NSpin size="large" />
    </div>

    <div
      v-if="draggingExternal"
      class="absolute inset-0 rounded-[12px] border-2 border-dashed border-brand-500/70 bg-brand-500/10 flex items-center justify-center"
    >
      <div class="text-[14px] font-600 text-brand-100">松开以上传到当前目录</div>
    </div>
  </div>
</template>

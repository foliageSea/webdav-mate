<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NButton, NCard, NDivider, NSelect, useMessage } from 'naive-ui'
import type { RemoteEntry, WebDavConnection } from '@shared/ipc'
import FileGrid from '../components/FileGrid.vue'
import MediaPreview from '../components/MediaPreview.vue'

const route = useRoute()
const router = useRouter()
const message = useMessage()

const connections = ref<WebDavConnection[]>([])
const serverId = ref<string | null>(null)
const path = ref<string>('/')

const entries = ref<RemoteEntry[]>([])
const loading = ref(false)
const selected = ref<Set<string>>(new Set())

const showPreview = ref(false)
const previewPath = ref<string | null>(null)

const serverOptions = computed(() => connections.value.map((c) => ({ label: c.name, value: c.id })))

const currentName = computed(() => {
  const c = connections.value.find((x) => x.id === serverId.value)
  return c?.name ?? '未选择'
})

const refresh = async (): Promise<void> => {
  if (!serverId.value) return
  loading.value = true
  try {
    entries.value = await window.api.files.list(serverId.value, path.value)
  } catch (e) {
    message.error(String(e))
  } finally {
    loading.value = false
  }
}

const loadConnections = async (): Promise<void> => {
  connections.value = await window.api.connections.list()
  const current = await window.api.connections.getCurrentId()
  const rid = (route.params.serverId as string | undefined) ?? null
  serverId.value = rid ?? current ?? null
  if (!serverId.value) {
    router.replace('/servers')
    return
  }
  if (!rid) router.replace(`/files/${serverId.value}`)
}

const activateEntry = async (entry: RemoteEntry): Promise<void> => {
  if (!serverId.value) return
  if (entry.kind === 'folder') {
    path.value = entry.path
    selected.value = new Set()
    await window.api.connections.setLastPath(serverId.value, path.value)
    await refresh()
    return
  }

  if (entry.contentType?.startsWith('image/') || entry.contentType?.startsWith('video/')) {
    previewPath.value = entry.path
    showPreview.value = true
    return
  }

  const dir = await window.api.dialogs.pickDirectory('选择下载目录')
  if (!dir) return
  await window.api.transfers.enqueueDownload({
    serverId: serverId.value,
    localDir: dir,
    remotePaths: [entry.path],
    overwrite: false
  })
  message.success('已加入下载队列')
}

const uploadFiles = async (): Promise<void> => {
  if (!serverId.value) return
  const files = await window.api.dialogs.pickFiles('选择要上传的文件')
  if (!files.length) return
  await window.api.transfers.enqueueUpload({
    serverId: serverId.value,
    remoteDir: path.value,
    localPaths: files,
    overwrite: false
  })
  message.success('已加入上传队列')
}

const uploadFolder = async (): Promise<void> => {
  if (!serverId.value) return
  const folder = await window.api.dialogs.pickFolder('选择要上传的文件夹')
  if (!folder) return
  await window.api.transfers.enqueueUpload({
    serverId: serverId.value,
    remoteDir: path.value,
    localPaths: [folder],
    overwrite: false
  })
  message.success('已加入上传队列')
}

const downloadSelected = async (): Promise<void> => {
  if (!serverId.value) return
  const paths = [...selected.value]
  if (!paths.length) return
  const dir = await window.api.dialogs.pickDirectory('选择下载目录')
  if (!dir) return
  await window.api.transfers.enqueueDownload({
    serverId: serverId.value,
    localDir: dir,
    remotePaths: paths,
    overwrite: false
  })
  message.success('已加入下载队列')
}

const deleteSelected = async (): Promise<void> => {
  if (!serverId.value) return
  const paths = [...selected.value]
  if (!paths.length) return
  for (const p of paths) {
    await window.api.files.delete(serverId.value, p)
  }
  selected.value = new Set()
  await refresh()
  message.success('已删除')
}

const onExternalDrop = async (pathsDropped: string[]): Promise<void> => {
  if (!serverId.value) return
  if (pathsDropped.length === 0) return
  await window.api.transfers.enqueueUpload({
    serverId: serverId.value,
    remoteDir: path.value,
    localPaths: pathsDropped,
    overwrite: false
  })
  message.success('已加入上传队列')
}

const onMoveIntoFolder = async (fromPath: string, targetFolderPath: string): Promise<void> => {
  if (!serverId.value) return
  await window.api.files.moveInto(serverId.value, fromPath, targetFolderPath)
  await refresh()
}

const goUp = async (): Promise<void> => {
  if (!serverId.value) return
  if (path.value === '/' || path.value === '') return
  const parts = path.value.split('/').filter(Boolean)
  parts.pop()
  path.value = '/' + parts.join('/')
  await window.api.connections.setLastPath(serverId.value, path.value)
  await refresh()
}

watch(serverId, async (id) => {
  if (!id) return
  await window.api.connections.setCurrentId(id)
  router.replace(`/files/${id}`)
  const last = await window.api.connections.getLastPath(id)
  path.value = last ?? '/'
  selected.value = new Set()
  await refresh()
})

onMounted(async () => {
  await loadConnections()
  if (!serverId.value) return
  const last = await window.api.connections.getLastPath(serverId.value)
  path.value = last ?? '/'
  await refresh()
})
</script>

<template>
  <div class="h-full overflow-hidden">
    <div class="h-full flex flex-col">
      <div class="px-4 pt-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="text-[16px] font-700 text-white/90">文件浏览</div>
            <div class="text-[12px] text-white/55 mt-1">{{ currentName }} · {{ path }}</div>
          </div>
          <div class="flex items-center gap-2">
            <NSelect
              class="w-[240px]"
              size="small"
              :options="serverOptions"
              :value="serverId"
              @update:value="(v) => (serverId = v)"
            />
            <NButton size="small" secondary :disabled="!serverId" @click="uploadFiles"
              >上传文件</NButton
            >
            <NButton size="small" secondary :disabled="!serverId" @click="uploadFolder"
              >上传文件夹</NButton
            >
            <NButton
              size="small"
              secondary
              :disabled="!serverId || selected.size === 0"
              @click="downloadSelected"
            >
              下载所选
            </NButton>
            <NButton
              size="small"
              secondary
              type="error"
              :disabled="!serverId || selected.size === 0"
              @click="deleteSelected"
            >
              删除所选
            </NButton>
            <NButton size="small" secondary :disabled="!serverId" @click="goUp">上一级</NButton>
            <NButton
              size="small"
              secondary
              :loading="loading"
              :disabled="!serverId"
              @click="refresh"
            >
              刷新
            </NButton>
          </div>
        </div>

        <NDivider class="my-3" />
      </div>

      <div class="flex-1 overflow-hidden px-4 pb-4">
        <NCard
          class="h-full bg-[#0F1A2B]"
          size="small"
          :bordered="true"
          content-style="height: 100%"
        >
          <FileGrid
            :entries="entries"
            :selected="selected"
            :loading="loading"
            @activate="activateEntry"
            @external-drop="onExternalDrop"
            @move-into-folder="onMoveIntoFolder"
            @update:selected="(s) => (selected = s)"
          />
        </NCard>
      </div>
    </div>

    <MediaPreview
      v-model:show="showPreview"
      :server-id="serverId"
      :remote-path="previewPath"
      :entries="entries"
      @navigate="(p) => (previewPath = p)"
    />
  </div>
</template>

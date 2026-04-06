<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Add, ArrowUp, Download, Renew, TrashCan, Upload } from '@vicons/carbon'
import {
  NButton,
  NCard,
  NDivider,
  NIcon,
  NInput,
  NModal,
  NScrollbar,
  NTreeSelect,
  useMessage
} from 'naive-ui'
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

const showBatchModal = ref(false)
const batchTargetPath = ref('/')
const batchTreeLoading = ref(false)
type FolderTreeOption = {
  label: string
  key: string
  value: string
  children?: FolderTreeOption[]
  isLeaf?: boolean
}
const batchFolderOptions = ref<FolderTreeOption[]>([])
const showCreateFolderModal = ref(false)
const newFolderName = ref('')

const currentName = computed(() => {
  const c = connections.value.find((x) => x.id === serverId.value)
  return c?.name ?? '未选择'
})

const breadcrumbItems = computed(() => {
  const parts = path.value.split('/').filter(Boolean)
  const items: Array<{ label: string; value: string }> = [{ label: '根目录', value: '/' }]

  let current = ''
  for (const part of parts) {
    current += `/${part}`
    items.push({ label: part, value: current })
  }

  return items
})

const refresh = async (): Promise<void> => {
  if (!serverId.value) return
  loading.value = true
  try {
    entries.value = await window.api.files.list(serverId.value, path.value)
    console.log(serverId.value, path.value, entries.value)
  } catch (e) {
    message.error(String(e))
  } finally {
    loading.value = false
  }
}

const loadConnections = async (): Promise<void> => {
  try {
    connections.value = await window.api.connections.list()
    const current = await window.api.connections.getCurrentId()
    const rid = (route.params.serverId as string | undefined) ?? null

    const preferred = rid ?? current ?? null
    const exists = (id: string | null): id is string =>
      !!id && connections.value.some((c) => c.id === id)

    if (exists(preferred)) {
      serverId.value = preferred
    } else {
      serverId.value = connections.value[0]?.id ?? null
      if (preferred) message.warning('连接不存在，已切换到其他连接')
    }

    if (!serverId.value) {
      message.info('请先在“连接管理”新增一个连接')
      return
    }

    if (rid !== serverId.value) router.replace(`/files/${serverId.value}`)
  } catch (e) {
    message.error(String(e))
  }
}

const activateEntry = async (entry: RemoteEntry): Promise<void> => {
  if (!serverId.value) return
  if (entry.kind === 'folder') {
    await jumpToPath(entry.path)
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

const openBatchModal = (): void => {
  if (!serverId.value || selected.value.size === 0) return
  batchTargetPath.value = path.value
  showBatchModal.value = true
  void loadBatchFolderTree()
}

const listFolderNodes = async (folderPath: string): Promise<FolderTreeOption[]> => {
  if (!serverId.value) return []
  const list = await window.api.files.list(serverId.value, folderPath)
  return list
    .filter((entry) => entry.kind === 'folder')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((folder) => ({
      label: folder.name,
      key: folder.path,
      value: folder.path,
      isLeaf: false
    }))
}

const loadBatchFolderTree = async (): Promise<void> => {
  if (!serverId.value) return
  batchTreeLoading.value = true
  try {
    const rootChildren = await listFolderNodes('/')
    batchFolderOptions.value = [
      {
        label: '根目录',
        key: '/',
        value: '/',
        children: rootChildren,
        isLeaf: rootChildren.length === 0
      }
    ]
  } catch (e) {
    batchFolderOptions.value = []
    message.error(`目录树加载失败：${String(e)}`)
  } finally {
    batchTreeLoading.value = false
  }
}

const onBatchTreeLoad = async (option: any): Promise<void> => {
  if (!serverId.value) return
  if (option.children !== undefined) return
  if (typeof option.key !== 'string') return

  const children = await listFolderNodes(option.key)
  option.children = children
  if (children.length === 0) {
    ;(option as FolderTreeOption).isLeaf = true
  }
  batchFolderOptions.value = [...batchFolderOptions.value]
}

const runBatchAction = async (mode: 'copy' | 'move'): Promise<void> => {
  if (!serverId.value) return
  const fromPaths = [...selected.value]
  if (!fromPaths.length) return
  const targetFolderPath = (batchTargetPath.value || '/').trim() || '/'

  if (mode === 'copy') {
    await window.api.files.batchCopyInto({
      serverId: serverId.value,
      fromPaths,
      targetFolderPath
    })
    message.success('批量复制已完成')
  } else {
    await window.api.files.batchMoveInto({
      serverId: serverId.value,
      fromPaths,
      targetFolderPath
    })
    message.success('批量移动已完成')
  }

  showBatchModal.value = false
  selected.value = new Set()
  await refresh()
}

const openCreateFolderModal = (): void => {
  if (!serverId.value) return
  newFolderName.value = ''
  showCreateFolderModal.value = true
}

const createFolderInCurrentPath = async (): Promise<void> => {
  if (!serverId.value) return
  const folderName = newFolderName.value.trim()
  if (!folderName) {
    message.warning('请输入目录名称')
    return
  }

  await window.api.files.createFolder({
    serverId: serverId.value,
    parentPath: path.value,
    folderName
  })
  showCreateFolderModal.value = false
  message.success('目录已创建')
  await refresh()
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

const jumpToPath = async (targetPath: string): Promise<void> => {
  if (!serverId.value) return
  const nextPath = targetPath || '/'
  if (nextPath === path.value) return

  path.value = nextPath
  selected.value = new Set()
  await window.api.connections.setLastPath(serverId.value, path.value)
  await refresh()
}

const goUp = async (): Promise<void> => {
  if (!serverId.value) return
  if (path.value === '/' || path.value === '') return
  const parts = path.value.split('/').filter(Boolean)
  parts.pop()
  await jumpToPath('/' + parts.join('/'))
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
})
</script>

<template>
  <div class="h-full overflow-hidden">
    <div class="h-full flex flex-col">
      <div class="px-3 pt-3 sm:px-4 sm:pt-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="min-w-0 space-y-2">
            <div class="flex flex-wrap items-center gap-2">
              <div class="text-[18px] font-700 leading-none tracking-[0.01em] text-white/95">
                文件浏览
              </div>
              <div
                class="max-w-full truncate rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] text-white/75"
              >
                {{ currentName }}
              </div>
            </div>
            <div
              class="flex items-center rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[12px] text-white/65"
            >
              <span class="mr-1 shrink-0 text-white/45">路径</span>
              <div class="min-w-0 flex flex-wrap items-center gap-1 leading-5">
                <template v-for="(item, index) in breadcrumbItems" :key="item.value">
                  <button
                    type="button"
                    class="max-w-[180px] truncate rounded px-1.5 py-0.5 text-left text-white/80 transition hover:bg-white/10 hover:text-white disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-white/80"
                    :disabled="item.value === path || !serverId"
                    @click="jumpToPath(item.value)"
                  >
                    {{ item.label }}
                  </button>
                  <span v-if="index < breadcrumbItems.length - 1" class="text-white/35">/</span>
                </template>
              </div>
            </div>
          </div>
        </div>
        <div class="flex w-full flex-col gap-2 sm:w-auto sm:items-end mt-2">
          <!-- <NSelect class="w-full sm:w-[260px]" size="small" :options="serverOptions" :value="serverId"
            @update:value="(v) => (serverId = v)" /> -->

          <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <NButton
              class="flex-1 min-w-[112px] sm:flex-none"
              size="small"
              secondary
              :disabled="!serverId"
              @click="goUp"
            >
              <template #icon>
                <NIcon>
                  <ArrowUp />
                </NIcon>
              </template>
              上一级
            </NButton>
            <NButton
              class="flex-1 min-w-[112px] sm:flex-none"
              size="small"
              secondary
              :loading="loading"
              :disabled="!serverId"
              @click="refresh"
            >
              <template #icon>
                <NIcon>
                  <Renew />
                </NIcon>
              </template>
              刷新
            </NButton>
            <NButton
              class="flex-1 min-w-[112px] sm:flex-none"
              size="small"
              secondary
              :disabled="!serverId"
              @click="uploadFiles"
            >
              <template #icon>
                <NIcon>
                  <Upload />
                </NIcon>
              </template>
              上传文件
            </NButton>
            <NButton
              class="flex-1 min-w-[112px] sm:flex-none"
              size="small"
              secondary
              :disabled="!serverId"
              @click="uploadFolder"
            >
              <template #icon>
                <NIcon>
                  <Upload />
                </NIcon>
              </template>
              上传文件夹
            </NButton>
            <NButton
              class="flex-1 min-w-[112px] sm:flex-none"
              size="small"
              secondary
              :disabled="!serverId"
              @click="openCreateFolderModal"
            >
              新建目录
            </NButton>

            <NButton
              class="flex-1 min-w-[112px] sm:flex-none"
              size="small"
              secondary
              :disabled="!serverId || selected.size === 0"
              @click="downloadSelected"
            >
              <template #icon>
                <NIcon>
                  <Download />
                </NIcon>
              </template>
              下载所选
            </NButton>
            <NButton
              class="flex-1 min-w-[112px] sm:flex-none"
              size="small"
              secondary
              :disabled="!serverId || selected.size === 0"
              @click="openBatchModal"
            >
              批量复制/移动
            </NButton>
            <NButton
              class="flex-1 min-w-[112px] sm:flex-none"
              size="small"
              secondary
              type="error"
              :disabled="!serverId || selected.size === 0"
              @click="deleteSelected"
            >
              <template #icon>
                <NIcon>
                  <TrashCan />
                </NIcon>
              </template>
              删除所选
            </NButton>
          </div>
        </div>

        <NDivider class="my-3" />
      </div>

      <div class="flex-1 overflow-hidden px-3 pb-3 sm:px-4 sm:pb-4">
        <NCard
          class="h-full bg-[rgba(15,26,43,0.58)] backdrop-blur-[1px]"
          size="small"
          :bordered="true"
          content-style="height: 100%"
        >
          <NScrollbar class="h-full">
            <div v-if="!serverId" class="h-full flex items-center justify-center">
              <div class="text-center">
                <div class="text-[13px] text-white/70">请先在“连接管理”新增一个连接</div>
                <NButton class="mt-3" type="primary" @click="router.push('/servers')">
                  <template #icon>
                    <NIcon>
                      <Add />
                    </NIcon>
                  </template>
                  去新增
                </NButton>
              </div>
            </div>
            <FileGrid
              v-else
              :entries="entries"
              :selected="selected"
              :loading="loading"
              @activate="activateEntry"
              @external-drop="onExternalDrop"
              @move-into-folder="onMoveIntoFolder"
              @update:selected="(s) => (selected = s)"
            />
          </NScrollbar>
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

    <NModal v-model:show="showBatchModal" preset="card" style="width: 520px" title="批量复制/移动">
      <div class="text-[13px] text-white/70 mb-3">已选 {{ selected.size }} 项，选择目标目录。</div>
      <NTreeSelect
        v-model:value="batchTargetPath"
        :options="batchFolderOptions"
        :loading="batchTreeLoading"
        :on-load="onBatchTreeLoad"
        filterable
        placeholder="请选择目标目录"
      />
      <div class="mt-3 text-[12px] text-white/55">支持复制与移动到同一连接下的目标目录。</div>
      <template #footer>
        <div class="flex items-center justify-end gap-2">
          <NButton secondary @click="showBatchModal = false">取消</NButton>
          <NButton secondary type="info" @click="runBatchAction('copy')">批量复制</NButton>
          <NButton secondary type="primary" @click="runBatchAction('move')">批量移动</NButton>
        </div>
      </template>
    </NModal>

    <NModal
      v-model:show="showCreateFolderModal"
      preset="card"
      style="width: 460px"
      title="新建目录"
    >
      <div class="text-[13px] text-white/70 mb-3">将在当前路径 {{ path }} 下创建目录。</div>
      <NInput
        v-model:value="newFolderName"
        placeholder="请输入目录名称"
        @keyup.enter="createFolderInCurrentPath"
      />
      <template #footer>
        <div class="flex items-center justify-end gap-2">
          <NButton secondary @click="showCreateFolderModal = false">取消</NButton>
          <NButton secondary type="primary" @click="createFolderInCurrentPath">创建</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

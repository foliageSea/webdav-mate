<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NProgress, NTag } from 'naive-ui'
import type { TransferTask } from '@shared/ipc'

const props = defineProps<{ tasks: TransferTask[] }>()

const ordered = computed(() =>
  [...props.tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
)

const pct = (t: TransferTask): number | null => {
  if (!t.totalBytes || t.totalBytes <= 0) return null
  return Math.max(0, Math.min(100, Math.round((t.transferredBytes / t.totalBytes) * 100)))
}

const statusType = (s: TransferTask['status']): 'default' | 'success' | 'warning' | 'error' => {
  if (s === 'done') return 'success'
  if (s === 'failed') return 'error'
  if (s === 'paused') return 'warning'
  return 'default'
}

const actionLabel = (t: TransferTask): string => {
  if (t.status === 'running') return '暂停'
  if (t.status === 'paused') return '继续'
  return ''
}

const toggle = async (t: TransferTask): Promise<void> => {
  if (t.status === 'running') await window.api.transfers.pause(t.id)
  else if (t.status === 'paused') await window.api.transfers.resume(t.id)
}

const cancel = async (t: TransferTask): Promise<void> => {
  await window.api.transfers.cancel(t.id)
}

const retry = async (t: TransferTask): Promise<void> => {
  await window.api.transfers.retry(t.id)
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <div
      v-for="t in ordered"
      :key="t.id"
      class="rounded-[10px] border border-white/10 bg-white/3 p-3"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <div class="text-[12px] text-white/85 font-600 truncate">
              {{ t.kind === 'upload' ? '上传' : '下载' }} · {{ t.remotePath.split('/').pop() }}
            </div>
            <NTag size="small" :type="statusType(t.status)" :bordered="false">{{ t.status }}</NTag>
          </div>
          <div class="text-[11px] text-white/45 mt-1 truncate">{{ t.remotePath }}</div>
          <div class="text-[11px] text-white/35 mt-1 truncate">{{ t.localPath }}</div>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <NButton
            v-if="t.status === 'running' || t.status === 'paused'"
            size="tiny"
            secondary
            @click="toggle(t)"
          >
            {{ actionLabel(t) }}
          </NButton>
          <NButton v-if="t.status === 'failed'" size="tiny" secondary @click="retry(t)"
            >重试</NButton
          >
          <NButton
            v-if="t.status !== 'done' && t.status !== 'canceled'"
            size="tiny"
            secondary
            type="error"
            @click="cancel(t)"
          >
            取消
          </NButton>
        </div>
      </div>

      <div class="mt-3">
        <NProgress
          v-if="pct(t) !== null"
          type="line"
          :percentage="pct(t) as number"
          :height="10"
          :border-radius="6"
          :show-indicator="true"
        />
        <NProgress
          v-else
          type="line"
          :percentage="0"
          :height="10"
          :border-radius="6"
          :show-indicator="false"
        />
        <div v-if="t.errorMessage" class="text-[11px] text-red-300/80 mt-2">
          {{ t.errorMessage }}
        </div>
      </div>
    </div>

    <div v-if="ordered.length === 0" class="text-white/50 text-[12px] py-10 text-center">
      暂无任务
    </div>
  </div>
</template>

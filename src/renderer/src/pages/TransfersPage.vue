<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { NButton, NCard, NDivider } from 'naive-ui'
import type { TransferTask } from '@shared/ipc'
import TransferList from '../components/TransferList.vue'

const tasks = ref<TransferTask[]>([])
const loading = ref(false)

let off: null | (() => void) = null

const refresh = async (): Promise<void> => {
  loading.value = true
  try {
    tasks.value = await window.api.transfers.list()
  } finally {
    loading.value = false
  }
}

const clearDone = async (): Promise<void> => {
  await window.api.transfers.clearDone()
  await refresh()
}

onMounted(async () => {
  await refresh()
  off = window.api.transfers.onChanged(async () => {
    await refresh()
  })
})

onUnmounted(() => {
  off?.()
  off = null
})
</script>

<template>
  <div class="h-full overflow-auto p-4">
    <div class="max-w-[1040px] mx-auto">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-[16px] font-700 text-white/90">传输队列</div>
          <div class="text-[12px] text-white/55 mt-1">批量上传/下载任务进度与控制</div>
        </div>
        <div class="flex items-center gap-2">
          <NButton size="small" secondary :loading="loading" @click="refresh">刷新</NButton>
          <NButton size="small" secondary @click="clearDone">清理完成</NButton>
        </div>
      </div>

      <NDivider class="my-4" />

      <NCard size="small" class="bg-[#0F1A2B]" :bordered="true">
        <TransferList :tasks="tasks" />
      </NCard>
    </div>
  </div>
</template>

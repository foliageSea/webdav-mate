<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Cloud, FolderOpen, Task } from '@vicons/carbon'
import { NButton, NIcon, NLayout, NLayoutContent, NLayoutHeader, NLayoutSider } from 'naive-ui'

const route = useRoute()
const router = useRouter()

const active = computed(() => {
  const p = route.path
  if (p.startsWith('/files')) return 'files'
  if (p.startsWith('/transfers')) return 'transfers'
  return 'servers'
})

const go = (key: 'servers' | 'files' | 'transfers'): void => {
  if (key === 'servers') {
    router.push('/servers')
    return
  }
  if (key === 'transfers') {
    router.push('/transfers')
    return
  }
  router.push('/files')
}
</script>

<template>
  <NLayout class="h-full" has-sider>
    <NLayoutSider bordered width="220" class="bg-[#0F1A2B]" content-class="p-3 flex flex-col gap-2">
      <div class="px-2 py-3">
        <div class="text-[14px] font-700 text-white/90 flex items-center gap-2">
          <NIcon size="16"><Cloud /></NIcon>
          <span>WebDAV-Mate</span>
        </div>
        <div class="text-[12px] text-white/55">多 WebDAV 文件管理</div>
      </div>

      <NButton
        :type="active === 'servers' ? 'primary' : 'default'"
        secondary
        @click="go('servers')"
      >
        <template #icon>
          <NIcon><Cloud /></NIcon>
        </template>
        连接管理
      </NButton>
      <NButton :type="active === 'files' ? 'primary' : 'default'" secondary @click="go('files')">
        <template #icon>
          <NIcon><FolderOpen /></NIcon>
        </template>
        文件浏览
      </NButton>
      <NButton
        :type="active === 'transfers' ? 'primary' : 'default'"
        secondary
        @click="go('transfers')"
      >
        <template #icon>
          <NIcon><Task /></NIcon>
        </template>
        传输队列
      </NButton>
    </NLayoutSider>

    <NLayout class="h-full">
      <NLayoutHeader bordered class="bg-[#0B1220]">
        <div class="h-[52px] flex items-center justify-between px-4">
          <div class="text-[13px] text-white/70">{{ route.path }}</div>
          <div class="text-[12px] text-white/45">Electron · Naive UI · UnoCSS</div>
        </div>
      </NLayoutHeader>
      <NLayoutContent class="bg-[#0B1220]">
        <div class="h-[calc(100vh-52px)] overflow-hidden">
          <RouterView />
        </div>
      </NLayoutContent>
    </NLayout>
  </NLayout>
</template>

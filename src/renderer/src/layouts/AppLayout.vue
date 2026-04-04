<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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

const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform)
const isMaximized = ref(false)

const syncMaximized = async (): Promise<void> => {
  if (isMac) return
  isMaximized.value = await window.api.windowControls.isMaximized()
}

const handleMinimize = async (): Promise<void> => {
  await window.api.windowControls.minimize()
}

const handleToggleMaximize = async (): Promise<void> => {
  isMaximized.value = await window.api.windowControls.toggleMaximize()
}

const handleClose = async (): Promise<void> => {
  await window.api.windowControls.close()
}

onMounted(() => {
  void syncMaximized()
  if (!isMac) {
    window.addEventListener('resize', () => {
      void syncMaximized()
    })
  }
})
</script>

<template>
  <NLayout class="h-full" has-sider>
    <NLayoutSider bordered width="140" class="bg-[#0F1A2B]" content-class="p-3 flex flex-col gap-2">
      <div class="px-2 py-3">
        <div class="text-[14px] font-700 text-white/90 flex items-center flex-col gap-2">
          <NIcon size="48"><Cloud /></NIcon>
          <span class="font-bold">WebDAV Mate</span>
        </div>
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
      <NLayoutHeader bordered class="app-titlebar bg-[#111A2E]">
        <div class="titlebar-drag-region">
          <div class="titlebar-left">
            <div v-if="isMac" class="mac-controls no-drag">
              <button class="mac-dot close" type="button" aria-label="close" @click="handleClose" />
              <button
                class="mac-dot minimize"
                type="button"
                aria-label="minimize"
                @click="handleMinimize"
              />
              <button
                class="mac-dot maximize"
                type="button"
                aria-label="maximize"
                @click="handleToggleMaximize"
              />
            </div>
          </div>

          <div class="title-text">WebDAV Mate</div>

          <div class="titlebar-right">
            <div v-if="!isMac" class="win-controls no-drag">
              <button class="win-btn" type="button" aria-label="minimize" @click="handleMinimize">
                -
              </button>
              <button
                class="win-btn"
                type="button"
                aria-label="maximize"
                @click="handleToggleMaximize"
              >
                {{ isMaximized ? '❐' : '□' }}
              </button>
              <button
                class="win-btn win-close"
                type="button"
                aria-label="close"
                @click="handleClose"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      </NLayoutHeader>
      <NLayoutContent class="bg-[#0B1220]">
        <div class="h-[calc(100vh-38px)] overflow-hidden">
          <RouterView />
        </div>
      </NLayoutContent>
    </NLayout>
  </NLayout>
</template>

<style scoped>
.app-titlebar {
  height: 38px;
  padding: 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  -webkit-app-region: drag;
}

.titlebar-drag-region {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  height: 38px;
  -webkit-app-region: drag;
}

.titlebar-left,
.titlebar-right {
  display: flex;
  align-items: center;
  width: 124px;
  height: 100%;
}

.titlebar-right {
  justify-content: flex-end;
}

.no-drag {
  -webkit-app-region: no-drag;
}

.title-text {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.74);
  letter-spacing: 0.02em;
  user-select: none;
  pointer-events: none;
}

.mac-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  padding-left: 14px;
}

.mac-dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.25);
  cursor: pointer;
}

.mac-dot.close {
  background: #ff5f57;
}

.mac-dot.minimize {
  background: #febc2e;
}

.mac-dot.maximize {
  background: #28c840;
}

.win-controls {
  display: flex;
  justify-content: flex-end;
  height: 100%;
}

.win-btn {
  width: 40px;
  height: 100%;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.82);
  font-size: 14px;
  cursor: pointer;
}

.win-btn:hover {
  background: rgba(255, 255, 255, 0.12);
}

.win-close:hover {
  background: #e81123;
}
</style>

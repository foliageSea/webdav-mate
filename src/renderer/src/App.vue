<script setup lang="ts">
import {
  darkTheme,
  NConfigProvider,
  NDialogProvider,
  NMessageProvider,
  NNotificationProvider
} from 'naive-ui'
import AppLayout from './layouts/AppLayout.vue'
import appBackground from './assets/IMG_5543.png'
</script>

<template>
  <div
    class="app-shell"
    :style="{
      backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.10), rgba(0, 0, 0, 0.10)), url(${appBackground})`
    }"
  >
    <NConfigProvider :theme="darkTheme">
      <NMessageProvider>
        <NDialogProvider>
          <NNotificationProvider>
            <AppLayout />
          </NNotificationProvider>
        </NDialogProvider>
      </NMessageProvider>
    </NConfigProvider>
  </div>
</template>

<style scoped>
.app-shell {
  height: 100%;
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
}
</style>

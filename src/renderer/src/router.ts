import { createRouter, createWebHashHistory } from 'vue-router'

import FilesPage from './pages/FilesPage.vue'
import ServersPage from './pages/ServersPage.vue'
import TransfersPage from './pages/TransfersPage.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/servers' },
    { path: '/servers', component: ServersPage },
    { path: '/files/:serverId?', component: FilesPage },
    { path: '/transfers', component: TransfersPage }
  ]
})

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Add, Edit, Link, TrashCan } from '@vicons/carbon'
import {
  NButton,
  NCard,
  NDivider,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NModal,
  NTable,
  useMessage
} from 'naive-ui'
import type { WebDavConnection, WebDavConnectionUpsertInput } from '@shared/ipc'

const message = useMessage()

const loading = ref(false)
const connections = ref<WebDavConnection[]>([])
const currentId = ref<string | null>(null)

const showEditor = ref(false)
const editor = ref<WebDavConnectionUpsertInput>({
  name: '',
  serverUrl: '',
  username: '',
  password: '',
  basePath: ''
})

const load = async (): Promise<void> => {
  loading.value = true
  try {
    connections.value = await window.api.connections.list()
    currentId.value = await window.api.connections.getCurrentId()
  } catch (e) {
    message.error(String(e))
  } finally {
    loading.value = false
  }
}

const openCreate = (): void => {
  editor.value = { name: '', serverUrl: '', username: '', password: '', basePath: '' }
  showEditor.value = true
}

const openEdit = async (id: string): Promise<void> => {
  try {
    const conn = await window.api.connections.getById(id)
    editor.value = {
      id: conn.id,
      name: conn.name,
      serverUrl: conn.serverUrl,
      username: conn.username,
      password: '',
      basePath: conn.basePath ?? ''
    }
    showEditor.value = true
  } catch (e) {
    message.error(String(e))
  }
}

const save = async (): Promise<void> => {
  if (loading.value) return
  const draft = editor.value
  const input: WebDavConnectionUpsertInput = {
    id: draft.id,
    name: draft.name.trim(),
    serverUrl: draft.serverUrl.trim(),
    username: draft.username.trim(),
    password: draft.password,
    basePath: draft.basePath?.trim() ?? ''
  }
  if (!input.name || !input.serverUrl || !input.username) {
    message.error('请填写名称、URL、用户名')
    return
  }
  if (!input.id && !input.password) {
    message.error('新增连接需要填写密码')
    return
  }
  loading.value = true
  try {
    await window.api.connections.upsert(input)
    showEditor.value = false
    await load()
    message.success('已保存')
  } catch (e) {
    message.error(String(e))
  } finally {
    loading.value = false
  }
}

const testConn = async (id: string): Promise<void> => {
  const ok = await window.api.connections.test(id)
  if (ok.ok) message.success('连接成功')
  else message.error(ok.message)
}

const setCurrent = async (id: string): Promise<void> => {
  await window.api.connections.setCurrentId(id)
  await load()
}

const removeConn = async (id: string): Promise<void> => {
  await window.api.connections.remove(id)
  await load()
}

onMounted(() => {
  load()
})
</script>

<template>
  <div class="h-full overflow-auto p-4">
    <div class="max-w-[1040px] mx-auto">
      <div class="flex items-center justify-between">
        <div>
          <div class="text-[16px] font-700 text-white/90">连接管理</div>
          <div class="text-[12px] text-white/55 mt-1">保存多个 WebDAV 服务并快速切换</div>
        </div>
        <NButton @click="openCreate">
          <template #icon>
            <NIcon><Add /></NIcon>
          </template>
          新增连接
        </NButton>
      </div>

      <NDivider class="my-4" />

      <NCard size="small" class="bg-[rgba(15,26,43,0.58)] backdrop-blur-[1px]" :bordered="true">
        <NTable :single-line="false" size="small">
          <thead>
            <tr>
              <th class="w-[200px]">名称</th>
              <th>URL</th>
              <th class="w-[160px]">用户名</th>
              <th class="w-[280px]">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in connections" :key="c.id">
              <td>
                <div class="flex items-center gap-2">
                  <div class="text-white/90">{{ c.name }}</div>
                  <div
                    v-if="currentId === c.id"
                    class="text-[11px] px-2 py-0.5 rounded bg-brand-500/20 text-brand-200"
                  >
                    当前
                  </div>
                </div>
              </td>
              <td class="text-white/60">{{ c.serverUrl }}</td>
              <td class="text-white/60">{{ c.username }}</td>
              <td>
                <div class="flex flex-wrap gap-2">
                  <NButton size="tiny" secondary :loading="loading" @click="setCurrent(c.id)"
                    >设为当前</NButton
                  >
                  <NButton size="tiny" secondary :loading="loading" @click="testConn(c.id)">
                    <template #icon>
                      <NIcon><Link /></NIcon>
                    </template>
                    测试</NButton
                  >
                  <NButton size="tiny" secondary :loading="loading" @click="openEdit(c.id)">
                    <template #icon>
                      <NIcon><Edit /></NIcon>
                    </template>
                    编辑</NButton
                  >
                  <NButton
                    size="tiny"
                    secondary
                    type="error"
                    :loading="loading"
                    @click="removeConn(c.id)"
                  >
                    <template #icon>
                      <NIcon><TrashCan /></NIcon>
                    </template>
                    删除
                  </NButton>
                </div>
              </td>
            </tr>
            <tr v-if="connections.length === 0">
              <td colspan="4" class="text-white/50 py-8 text-center">暂无连接，先新增一个</td>
            </tr>
          </tbody>
        </NTable>
      </NCard>
    </div>

    <NModal v-model:show="showEditor" preset="card" style="width: 560px" title="WebDAV 连接">
      <NForm :model="editor" label-placement="left" label-width="96">
        <NFormItem label="名称">
          <NInput v-model:value="editor.name" placeholder="例如：NAS" />
        </NFormItem>
        <NFormItem label="服务器 URL">
          <NInput
            v-model:value="editor.serverUrl"
            placeholder="https://example.com/remote.php/dav/files/user/"
          />
        </NFormItem>
        <NFormItem label="用户名">
          <NInput v-model:value="editor.username" placeholder="username" />
        </NFormItem>
        <NFormItem label="密码">
          <NInput
            v-model:value="editor.password"
            type="password"
            placeholder="仅新增必填；编辑时留空表示不修改"
          />
        </NFormItem>
        <NFormItem label="基础路径">
          <NInput v-model:value="editor.basePath" placeholder="可选：/ 或 /DavRoot" />
        </NFormItem>
      </NForm>

      <template #footer>
        <div class="flex justify-end gap-2">
          <NButton secondary :disabled="loading" @click="showEditor = false">取消</NButton>
          <NButton type="primary" :loading="loading" @click="save">保存</NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

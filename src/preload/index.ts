import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import * as pathPosix from 'path/posix'
import { pathToFileURL } from 'url'
import type {
  BatchRemoteActionInput,
  CreateFolderInput,
  EnqueueDownloadInput,
  EnqueueUploadInput,
  RemoteEntry,
  TransferTask,
  WebDavConnection,
  WebDavConnectionUpsertInput
} from '@shared/ipc'

type TestResult = { ok: boolean; message: string }

const cleanBasePath = (p: string | undefined): string => {
  if (!p) return ''
  const trimmed = p.trim()
  if (!trimmed || trimmed === '/') return ''
  return '/' + trimmed.replace(/^\/+/, '').replace(/\/+$/, '')
}

const cleanPath = (p: string): string => {
  const trimmed = (p || '/').trim()
  if (!trimmed || trimmed === '/') return '/'
  return '/' + trimmed.replace(/^\/+/, '').replace(/\/+$/, '')
}

const joinRemote = (basePath: string | undefined, p: string): string => {
  const rel = cleanPath(p)
  const joined = pathPosix.join(cleanBasePath(basePath) || '/', rel)
  return joined.startsWith('/') ? joined : '/' + joined
}

const buildWebDavUrl = (
  serverUrl: string,
  basePath: string | undefined,
  remotePath: string
): string => {
  const url = new URL(serverUrl)
  const serverPath = (url.pathname || '/').replace(/\/+$/, '') || '/'
  const remote = joinRemote(basePath, remotePath).replace(/^\/+/, '')
  url.pathname = pathPosix.join(serverPath, remote)
  return url.toString()
}

type RendererApi = {
  connections: {
    list(): Promise<WebDavConnection[]>
    getById(id: string): Promise<WebDavConnection>
    upsert(input: WebDavConnectionUpsertInput): Promise<WebDavConnection>
    remove(id: string): Promise<void>
    test(id: string): Promise<TestResult>
    getCurrentId(): Promise<string | null>
    setCurrentId(id: string): Promise<void>
    getLastPath(id: string): Promise<string | null>
    setLastPath(id: string, path: string): Promise<void>
  }
  files: {
    list(serverId: string, path: string): Promise<RemoteEntry[]>
    delete(serverId: string, path: string): Promise<void>
    moveInto(serverId: string, fromPath: string, targetFolderPath: string): Promise<void>
    batchMoveInto(input: BatchRemoteActionInput): Promise<void>
    batchCopyInto(input: BatchRemoteActionInput): Promise<void>
    createFolder(input: CreateFolderInput): Promise<void>
  }
  transfers: {
    list(): Promise<TransferTask[]>
    enqueueUpload(input: EnqueueUploadInput): Promise<TransferTask[]>
    enqueueDownload(input: EnqueueDownloadInput): Promise<TransferTask[]>
    pause(id: string): Promise<void>
    resume(id: string): Promise<void>
    cancel(id: string): Promise<void>
    retry(id: string): Promise<void>
    clearDone(): Promise<void>
    onChanged(handler: (task: TransferTask) => void): () => void
  }
  dialogs: {
    pickDirectory(title: string): Promise<string | null>
    pickFiles(title: string): Promise<string[]>
    pickFolder(title: string): Promise<string | null>
  }
  preview: {
    getLocalPath(serverId: string, remotePath: string): Promise<string>
    getDataUrl(serverId: string, remotePath: string): Promise<string>
    getOnlineUrl(serverId: string, remotePath: string): Promise<string>
  }
  utils: {
    filePathToUrl(p: string): string
    remotePathToUrl(serverId: string, remotePath: string): Promise<string>
    remotePathToPreviewUrl(serverId: string, remotePath: string): Promise<string>
  }
  windowControls: {
    minimize(): Promise<void>
    toggleMaximize(): Promise<boolean>
    isMaximized(): Promise<boolean>
    close(): Promise<void>
  }
}

const api: RendererApi = {
  connections: {
    list: () => ipcRenderer.invoke('connections:list'),
    getById: async (id) => {
      const v = await ipcRenderer.invoke('connections:getById', id)
      if (!v) throw new Error('连接不存在')
      return v
    },
    upsert: (input) => ipcRenderer.invoke('connections:upsert', input),
    remove: (id) => ipcRenderer.invoke('connections:remove', id),
    test: (id) => ipcRenderer.invoke('connections:test', id),
    getCurrentId: () => ipcRenderer.invoke('connections:getCurrentId'),
    setCurrentId: (id) => ipcRenderer.invoke('connections:setCurrentId', id),
    getLastPath: (id) => ipcRenderer.invoke('connections:getLastPath', id),
    setLastPath: (id, path) => ipcRenderer.invoke('connections:setLastPath', id, path)
  },
  files: {
    list: (serverId, path) => ipcRenderer.invoke('files:list', serverId, path),
    delete: (serverId, path) => ipcRenderer.invoke('files:delete', serverId, path),
    moveInto: (serverId, fromPath, targetFolderPath) =>
      ipcRenderer.invoke('files:moveInto', serverId, fromPath, targetFolderPath),
    batchMoveInto: (input) => ipcRenderer.invoke('files:batchMoveInto', input),
    batchCopyInto: (input) => ipcRenderer.invoke('files:batchCopyInto', input),
    createFolder: (input) => ipcRenderer.invoke('files:createFolder', input)
  },
  transfers: {
    list: () => ipcRenderer.invoke('transfers:list'),
    enqueueUpload: (input) => ipcRenderer.invoke('transfers:enqueueUpload', input),
    enqueueDownload: (input) => ipcRenderer.invoke('transfers:enqueueDownload', input),
    pause: (id) => ipcRenderer.invoke('transfers:pause', id),
    resume: (id) => ipcRenderer.invoke('transfers:resume', id),
    cancel: (id) => ipcRenderer.invoke('transfers:cancel', id),
    retry: (id) => ipcRenderer.invoke('transfers:retry', id),
    clearDone: () => ipcRenderer.invoke('transfers:clearDone'),
    onChanged: (handler) => {
      const listener = (_e: IpcRendererEvent, payload: { task: TransferTask }): void =>
        handler(payload.task)
      ipcRenderer.on('transfers:changed', listener)
      return () => ipcRenderer.removeListener('transfers:changed', listener)
    }
  },
  dialogs: {
    pickDirectory: (title) => ipcRenderer.invoke('dialogs:pickDirectory', title),
    pickFiles: (title) => ipcRenderer.invoke('dialogs:pickFiles', title),
    pickFolder: (title) => ipcRenderer.invoke('dialogs:pickFolder', title)
  },
  preview: {
    getLocalPath: (serverId, remotePath) =>
      ipcRenderer.invoke('preview:getLocalPath', serverId, remotePath),
    getDataUrl: (serverId, remotePath) =>
      ipcRenderer.invoke('preview:getDataUrl', serverId, remotePath),
    getOnlineUrl: (serverId, remotePath) =>
      ipcRenderer.invoke('preview:getOnlineUrl', serverId, remotePath)
  },
  utils: {
    filePathToUrl: (p) => {
      if (/^https?:\/\//i.test(p)) return p
      return pathToFileURL(p).toString()
    },
    remotePathToUrl: async (serverId, remotePath) => {
      const conn = (await ipcRenderer.invoke(
        'connections:getById',
        serverId
      )) as WebDavConnection | null
      if (!conn) throw new Error('连接不存在')
      return buildWebDavUrl(conn.serverUrl, conn.basePath, remotePath)
    },
    remotePathToPreviewUrl: async (serverId, remotePath) => {
      return ipcRenderer.invoke('preview:getOnlineUrl', serverId, remotePath)
    }
  },
  windowControls: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    close: () => ipcRenderer.invoke('window:close')
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

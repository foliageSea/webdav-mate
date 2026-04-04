import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  EnqueueDownloadInput,
  EnqueueUploadInput,
  RemoteEntry,
  TransferTask,
  WebDavConnection,
  WebDavConnectionUpsertInput
} from '@shared/ipc'

type TestResult = { ok: boolean; message: string }

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
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: RendererApi
  }
}

import { BrowserWindow, dialog, ipcMain } from 'electron'
import type {
  EnqueueDownloadInput,
  EnqueueUploadInput,
  WebDavConnectionUpsertInput
} from '@shared/ipc'
import {
  getConnection,
  getCurrentId,
  getLastPath,
  listConnections,
  removeConnection,
  setCurrentId,
  setLastPath,
  upsertConnection
} from './store'
import { deletePath, listDirectory, moveIntoFolder, testConnection } from './webdav'
import { transferQueue } from './transfers/queue'
import { getPreviewDataUrl, getPreviewLocalPath, getPreviewOnlineUrl } from './preview'

const getErrorMessage = (err: unknown): string => {
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message?: unknown }).message
    if (typeof m === 'string') return m
  }
  return String(err)
}

export const registerIpc = (win: BrowserWindow): void => {
  transferQueue.setBroadcast((event, payload) => {
    win.webContents.send(event, payload)
  })

  ipcMain.handle('connections:list', () => listConnections())
  ipcMain.handle('connections:getById', (_e, id: string) => getConnection(id))
  ipcMain.handle('connections:getCurrentId', () => getCurrentId())
  ipcMain.handle('connections:setCurrentId', (_e, id: string) => setCurrentId(id))
  ipcMain.handle('connections:getLastPath', (_e, id: string) => getLastPath(id))
  ipcMain.handle('connections:setLastPath', (_e, id: string, p: string) => setLastPath(id, p))

  ipcMain.handle('connections:upsert', (_e, input: WebDavConnectionUpsertInput) =>
    upsertConnection(input)
  )
  ipcMain.handle('connections:remove', (_e, id: string) => removeConnection(id))
  ipcMain.handle('connections:test', async (_e, id: string) => {
    try {
      await testConnection(id)
      return { ok: true, message: '' }
    } catch (err: unknown) {
      return { ok: false, message: getErrorMessage(err) }
    }
  })

  ipcMain.handle('files:list', (_e, serverId: string, p: string) => listDirectory(serverId, p))
  ipcMain.handle('files:delete', (_e, serverId: string, p: string) => deletePath(serverId, p))
  ipcMain.handle(
    'files:moveInto',
    (_e, serverId: string, fromPath: string, targetFolderPath: string) =>
      moveIntoFolder(serverId, fromPath, targetFolderPath)
  )

  ipcMain.handle('transfers:list', () => transferQueue.list())
  ipcMain.handle('transfers:clearDone', () => transferQueue.clearDone())
  ipcMain.handle('transfers:enqueueUpload', async (_e, input: EnqueueUploadInput) => {
    return transferQueue.enqueueUpload(input)
  })
  ipcMain.handle('transfers:enqueueDownload', async (_e, input: EnqueueDownloadInput) => {
    return transferQueue.enqueueDownload(input)
  })
  ipcMain.handle('transfers:pause', (_e, id: string) => transferQueue.pause(id))
  ipcMain.handle('transfers:resume', (_e, id: string) => transferQueue.resume(id))
  ipcMain.handle('transfers:cancel', (_e, id: string) => transferQueue.cancelTask(id))
  ipcMain.handle('transfers:retry', (_e, id: string) => transferQueue.retry(id))

  ipcMain.handle('dialogs:pickDirectory', async (_e, title: string) => {
    const res = await dialog.showOpenDialog(win, {
      title,
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled) return null
    return res.filePaths[0] ?? null
  })

  ipcMain.handle('dialogs:pickFiles', async (_e, title: string) => {
    const res = await dialog.showOpenDialog(win, {
      title,
      properties: ['openFile', 'multiSelections']
    })
    if (res.canceled) return []
    return res.filePaths
  })

  ipcMain.handle('dialogs:pickFolder', async (_e, title: string) => {
    const res = await dialog.showOpenDialog(win, {
      title,
      properties: ['openDirectory']
    })
    if (res.canceled) return null
    return res.filePaths[0] ?? null
  })

  ipcMain.handle('preview:getLocalPath', async (_e, serverId: string, remotePath: string) => {
    return getPreviewLocalPath(serverId, remotePath)
  })
  ipcMain.handle('preview:getDataUrl', async (_e, serverId: string, remotePath: string) => {
    return getPreviewDataUrl(serverId, remotePath)
  })
  ipcMain.handle('preview:getOnlineUrl', (_e, serverId: string, remotePath: string) => {
    return getPreviewOnlineUrl(serverId, remotePath)
  })

  ipcMain.handle('window:minimize', () => {
    win.minimize()
  })
  ipcMain.handle('window:toggleMaximize', () => {
    if (win.isMaximized()) {
      win.unmaximize()
      return false
    }
    win.maximize()
    return true
  })
  ipcMain.handle('window:isMaximized', () => win.isMaximized())
  ipcMain.handle('window:close', () => {
    win.close()
  })
}

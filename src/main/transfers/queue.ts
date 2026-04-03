import * as path from 'path'
import { nanoid } from 'nanoid'
import type { EnqueueDownloadInput, EnqueueUploadInput, TransferTask } from '@shared/ipc'
import { expandLocalFiles } from './fsWalk'
import { downloadFile, uploadFile } from '../webdav'

type Broadcast = (event: 'transfers:changed', payload: { task: TransferTask }) => void

export class TransferQueue {
  private tasks = new Map<string, TransferTask>()
  private queue: string[] = []
  private running = new Set<string>()
  private concurrency = 2
  private broadcast: Broadcast | null = null
  private cancel = new Set<string>()
  private overwrite = new Map<string, boolean>()

  setBroadcast(fn: Broadcast): void {
    this.broadcast = fn
  }

  list(): TransferTask[] {
    return [...this.tasks.values()]
  }

  clearDone(): void {
    for (const [id, t] of this.tasks.entries()) {
      if (t.status === 'done' || t.status === 'canceled') {
        this.tasks.delete(id)
        this.overwrite.delete(id)
      }
    }
  }

  async enqueueUpload(input: EnqueueUploadInput): Promise<TransferTask[]> {
    const now = new Date().toISOString()
    const files = await expandLocalFiles(input.localPaths)
    const created: TransferTask[] = []

    for (const f of files) {
      const id = nanoid()
      const remotePath = path.posix.join(input.remoteDir || '/', f.relPath)
      const task: TransferTask = {
        id,
        kind: 'upload',
        serverId: input.serverId,
        remotePath,
        localPath: f.localPath,
        totalBytes: f.size,
        transferredBytes: 0,
        status: 'queued',
        createdAt: now,
        updatedAt: now
      }
      this.tasks.set(id, task)
      this.queue.push(id)
      this.overwrite.set(id, input.overwrite ?? false)
      created.push(task)
      this.emit(task)
    }

    this.kick()
    return created
  }

  async enqueueDownload(input: EnqueueDownloadInput): Promise<TransferTask[]> {
    const now = new Date().toISOString()
    const created: TransferTask[] = []

    for (const remotePath of input.remotePaths) {
      const id = nanoid()
      const name = remotePath.split('/').filter(Boolean).pop() || 'file'
      const localPath = path.join(input.localDir, name)
      const task: TransferTask = {
        id,
        kind: 'download',
        serverId: input.serverId,
        remotePath,
        localPath,
        totalBytes: undefined,
        transferredBytes: 0,
        status: 'queued',
        createdAt: now,
        updatedAt: now
      }
      this.tasks.set(id, task)
      this.queue.push(id)
      this.overwrite.set(id, input.overwrite ?? false)
      created.push(task)
      this.emit(task)
    }

    this.kick()
    return created
  }

  pause(id: string): void {
    const t = this.tasks.get(id)
    if (!t) return
    if (t.status !== 'running' && t.status !== 'queued') return
    t.status = 'paused'
    t.updatedAt = new Date().toISOString()
    this.cancel.add(id)
    this.emit(t)
  }

  resume(id: string): void {
    const t = this.tasks.get(id)
    if (!t) return
    if (t.status !== 'paused') return
    t.status = 'queued'
    t.updatedAt = new Date().toISOString()
    this.queue.push(id)
    this.emit(t)
    this.kick()
  }

  cancelTask(id: string): void {
    const t = this.tasks.get(id)
    if (!t) return
    if (t.status === 'done' || t.status === 'canceled') return
    t.status = 'canceled'
    t.updatedAt = new Date().toISOString()
    this.cancel.add(id)
    this.overwrite.delete(id)
    this.emit(t)
  }

  retry(id: string): void {
    const t = this.tasks.get(id)
    if (!t) return
    if (t.status !== 'failed') return
    t.status = 'queued'
    t.errorMessage = undefined
    t.transferredBytes = 0
    t.updatedAt = new Date().toISOString()
    this.queue.push(id)
    this.emit(t)
    this.kick()
  }

  private emit(task: TransferTask): void {
    this.broadcast?.('transfers:changed', { task })
  }

  private kick(): void {
    while (this.running.size < this.concurrency) {
      const nextId = this.queue.shift()
      if (!nextId) break
      const task = this.tasks.get(nextId)
      if (!task) continue
      if (task.status !== 'queued') continue
      this.run(nextId).catch(() => void 0)
    }
  }

  private async run(id: string): Promise<void> {
    const task = this.tasks.get(id)
    if (!task) return
    if (task.status !== 'queued') return

    const overwrite = this.overwrite.get(id) ?? false

    this.running.add(id)
    task.status = 'running'
    task.updatedAt = new Date().toISOString()
    this.emit(task)

    try {
      if (task.kind === 'upload') {
        await uploadFile(
          task.serverId,
          task.localPath,
          task.remotePath,
          overwrite,
          (delta) => {
            task.transferredBytes += delta
            task.updatedAt = new Date().toISOString()
            this.emit(task)
          },
          () => this.cancel.has(id) || task.status === 'paused' || task.status === 'canceled'
        )
      } else {
        await downloadFile(
          task.serverId,
          task.remotePath,
          task.localPath,
          overwrite,
          (delta) => {
            task.transferredBytes += delta
            task.updatedAt = new Date().toISOString()
            this.emit(task)
          },
          () => this.cancel.has(id) || task.status === 'paused' || task.status === 'canceled'
        )
      }

      const latest = this.tasks.get(id)
      if (!latest) return
      if (latest.status === 'paused' || latest.status === 'canceled') return
      latest.status = 'done'
      latest.updatedAt = new Date().toISOString()
      this.emit(latest)
      this.overwrite.delete(id)
    } catch (e: unknown) {
      const latest = this.tasks.get(id)
      if (!latest) return
      if (latest.status === 'paused' || latest.status === 'canceled') return
      latest.status = 'failed'
      if (e && typeof e === 'object' && 'message' in e) {
        const m = (e as { message?: unknown }).message
        latest.errorMessage = typeof m === 'string' ? m : String(e)
      } else {
        latest.errorMessage = String(e)
      }
      latest.updatedAt = new Date().toISOString()
      this.emit(latest)
    } finally {
      this.running.delete(id)
      this.cancel.delete(id)
      this.kick()
    }
  }
}

export const transferQueue = new TransferQueue()

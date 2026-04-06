import { createClient } from 'webdav'
import * as path from 'path'
import * as pathPosix from 'path/posix'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import { pipeline } from 'stream/promises'
import { PassThrough, Readable } from 'stream'
import mime from 'mime-types'
import type { RemoteEntry } from '@shared/ipc'
import { getConnectionSecret } from './store'

type WebDavClientCompat = {
  getDirectoryContents(path: string, options?: { details?: boolean }): Promise<{ data: unknown }>
  exists(path: string): Promise<boolean>
  createDirectory(path: string): Promise<void>
  deleteFile(path: string): Promise<void>
  moveFile(fromPath: string, toPath: string, options?: { overwrite?: boolean }): Promise<void>
  copyFile?(fromPath: string, toPath: string, options?: { overwrite?: boolean }): Promise<void>
  putFileContents(
    path: string,
    data: NodeJS.ReadableStream,
    options?: { overwrite?: boolean }
  ): Promise<void>
  createReadStream(path: string): Promise<NodeJS.ReadableStream> | NodeJS.ReadableStream
}

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

const entryName = (full: string): string => {
  const parts = full.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

export const listDirectory = async (serverId: string, p: string): Promise<RemoteEntry[]> => {
  const conn = getConnectionSecret(serverId)
  if (!conn) throw new Error('连接不存在')

  const client = createClient(conn.serverUrl, {
    username: conn.username,
    password: conn.password
  }) as unknown as WebDavClientCompat

  const remotePath = joinRemote(conn.basePath, p)
  const response = await client.getDirectoryContents(remotePath, { details: true })
  const raw: unknown = response.data

  type DirItem = { filename: string; type: string; size?: number; lastmod?: string }
  const items = (Array.isArray(raw) ? raw : []) as DirItem[]

  return items
    .filter((it) => {
      if (!it.filename || it.filename === remotePath) return false
      const name = entryName(it.filename)
      return !name.startsWith('.')
    })
    .map((it) => {
      const kind = it.type === 'directory' ? 'folder' : 'file'
      const name = entryName(it.filename)
      const contentType = kind === 'file' ? mime.lookup(name) || undefined : undefined
      return {
        path: cleanPath(
          pathPosix.relative(cleanBasePath(conn.basePath) || '/', it.filename) || '/'
        ),
        name,
        kind,
        size: typeof it.size === 'number' ? it.size : undefined,
        lastModified: it.lastmod ? String(it.lastmod) : undefined,
        contentType: contentType ? String(contentType) : undefined
      } satisfies RemoteEntry
    })
}

export const testConnection = async (serverId: string): Promise<void> => {
  const conn = getConnectionSecret(serverId)
  if (!conn) throw new Error('连接不存在')

  const client = createClient(conn.serverUrl, {
    username: conn.username,
    password: conn.password
  }) as unknown as WebDavClientCompat

  const root = joinRemote(conn.basePath, '/')
  await client.getDirectoryContents(root)
}

export const deletePath = async (serverId: string, p: string): Promise<void> => {
  const conn = getConnectionSecret(serverId)
  if (!conn) throw new Error('连接不存在')
  const client = createClient(conn.serverUrl, {
    username: conn.username,
    password: conn.password
  }) as unknown as WebDavClientCompat
  const remote = joinRemote(conn.basePath, p)
  await client.deleteFile(remote)
}

export const moveIntoFolder = async (
  serverId: string,
  fromPath: string,
  targetFolderPath: string
): Promise<void> => {
  const conn = getConnectionSecret(serverId)
  if (!conn) throw new Error('连接不存在')
  const client = createClient(conn.serverUrl, {
    username: conn.username,
    password: conn.password
  }) as unknown as WebDavClientCompat

  const from = joinRemote(conn.basePath, fromPath)
  const name = entryName(fromPath)
  const to = joinRemote(conn.basePath, pathPosix.join(cleanPath(targetFolderPath), name))
  await client.moveFile(from, to, { overwrite: false })
}

export const batchMoveIntoFolder = async (
  serverId: string,
  fromPaths: string[],
  targetFolderPath: string
): Promise<void> => {
  const conn = getConnectionSecret(serverId)
  if (!conn) throw new Error('连接不存在')
  const client = createClient(conn.serverUrl, {
    username: conn.username,
    password: conn.password
  }) as unknown as WebDavClientCompat

  const target = cleanPath(targetFolderPath)
  for (const fromPath of fromPaths) {
    const from = joinRemote(conn.basePath, fromPath)
    const name = entryName(fromPath)
    const to = joinRemote(conn.basePath, pathPosix.join(target, name))
    await client.moveFile(from, to, { overwrite: false })
  }
}

export const batchCopyIntoFolder = async (
  serverId: string,
  fromPaths: string[],
  targetFolderPath: string
): Promise<void> => {
  const conn = getConnectionSecret(serverId)
  if (!conn) throw new Error('连接不存在')
  const client = createClient(conn.serverUrl, {
    username: conn.username,
    password: conn.password
  }) as unknown as WebDavClientCompat

  const target = cleanPath(targetFolderPath)
  for (const fromPath of fromPaths) {
    const from = joinRemote(conn.basePath, fromPath)
    const name = entryName(fromPath)
    const to = joinRemote(conn.basePath, pathPosix.join(target, name))

    if (typeof client.copyFile === 'function') {
      await client.copyFile(from, to, { overwrite: false })
      continue
    }

    const rs = (await client.createReadStream(from)) as unknown as Readable
    await client.putFileContents(to, rs, { overwrite: false })
  }
}

export const createFolder = async (
  serverId: string,
  parentPath: string,
  folderName: string
): Promise<void> => {
  const conn = getConnectionSecret(serverId)
  if (!conn) throw new Error('连接不存在')

  const name = folderName.trim()
  if (!name) throw new Error('目录名不能为空')
  if (name.includes('/')) throw new Error('目录名不能包含 /')

  const client = createClient(conn.serverUrl, {
    username: conn.username,
    password: conn.password
  }) as unknown as WebDavClientCompat

  const remote = joinRemote(conn.basePath, pathPosix.join(cleanPath(parentPath), name))
  const exists = await client.exists(remote)
  if (exists) throw new Error('目录已存在')
  await client.createDirectory(remote)
}

export const ensureRemoteDir = async (serverId: string, dir: string): Promise<void> => {
  const conn = getConnectionSecret(serverId)
  if (!conn) throw new Error('连接不存在')
  const client = createClient(conn.serverUrl, {
    username: conn.username,
    password: conn.password
  }) as unknown as WebDavClientCompat
  const remote = joinRemote(conn.basePath, dir)

  const parts = remote.split('/').filter(Boolean)
  let current = ''
  for (const part of parts) {
    current += '/' + part
    try {
      const ok = await client.exists(current)
      if (!ok) await client.createDirectory(current)
    } catch {
      await client.createDirectory(current)
    }
  }
}

export const uploadFile = async (
  serverId: string,
  localPath: string,
  remotePath: string,
  overwrite: boolean,
  onProgress: (bytes: number) => void,
  shouldCancel: () => boolean = () => false
): Promise<void> => {
  const conn = getConnectionSecret(serverId)
  if (!conn) throw new Error('连接不存在')
  const client = createClient(conn.serverUrl, {
    username: conn.username,
    password: conn.password
  }) as unknown as WebDavClientCompat

  const remote = joinRemote(conn.basePath, remotePath)
  const remoteDir = pathPosix.dirname(remote)
  await ensureRemoteDir(serverId, remoteDir)

  const src = fs.createReadStream(localPath)
  const counter = new PassThrough()
  counter.on('data', (chunk) => {
    if (shouldCancel()) {
      src.destroy(new Error('canceled'))
      return
    }
    onProgress((chunk as Buffer).length)
  })
  src.pipe(counter)

  await client.putFileContents(remote, counter, { overwrite })
}

export const downloadFile = async (
  serverId: string,
  remotePath: string,
  localPath: string,
  overwrite: boolean,
  onProgress: (bytes: number) => void,
  shouldCancel: () => boolean = () => false
): Promise<void> => {
  const conn = getConnectionSecret(serverId)
  if (!conn) throw new Error('连接不存在')
  const client = createClient(conn.serverUrl, {
    username: conn.username,
    password: conn.password
  }) as unknown as WebDavClientCompat

  if (!overwrite) {
    try {
      await fsp.access(localPath)
      throw new Error('本地已存在同名文件')
    } catch {
      void 0
    }
  }

  await fsp.mkdir(path.dirname(localPath), { recursive: true })
  const rs = (await client.createReadStream(
    joinRemote(conn.basePath, remotePath)
  )) as unknown as Readable
  const counter = new PassThrough()
  counter.on('data', (chunk) => {
    if (shouldCancel()) {
      rs.destroy(new Error('canceled'))
      return
    }
    onProgress((chunk as Buffer).length)
  })
  const ws = fs.createWriteStream(localPath)
  await pipeline(rs, counter, ws)
}

import StoreModule from 'electron-store'
import { safeStorage } from 'electron'
import { nanoid } from 'nanoid'
import type { WebDavConnection, WebDavConnectionUpsertInput } from '@shared/ipc'

type StoredConnection = WebDavConnection & {
  passwordEnc: string
}

type StoreShape = {
  connections: Record<string, StoredConnection>
  currentId?: string
  lastPathById: Record<string, string>
}

const ElectronStore = ((StoreModule as unknown as { default?: typeof StoreModule }).default ??
  StoreModule) as unknown as typeof import('electron-store').default

const store = new ElectronStore<StoreShape>({
  name: 'webdav-mate',
  defaults: {
    connections: {},
    currentId: undefined,
    lastPathById: {}
  }
})

const b64 = (buf: Buffer): string => buf.toString('base64')
const fromB64 = (s: string): Buffer => Buffer.from(s, 'base64')

const encryptPassword = (plain: string): string => {
  if (!plain) return ''
  if (safeStorage.isEncryptionAvailable()) {
    return b64(safeStorage.encryptString(plain))
  }
  return b64(Buffer.from(plain, 'utf8'))
}

const decryptPassword = (enc: string): string => {
  if (!enc) return ''
  const buf = fromB64(enc)
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(buf)
  }
  return buf.toString('utf8')
}

export const listConnections = (): WebDavConnection[] => {
  const all = store.get('connections')
  return Object.values(all).map((c) => {
    const { passwordEnc, ...rest } = c
    void passwordEnc
    return rest
  })
}

export const getConnection = (id: string): WebDavConnection | null => {
  const c = store.get('connections')[id]
  if (!c) return null
  const { passwordEnc, ...rest } = c
  void passwordEnc
  return rest
}

export const getConnectionSecret = (
  id: string
): (WebDavConnection & { password: string }) | null => {
  const c = store.get('connections')[id]
  if (!c) return null
  const { passwordEnc, ...rest } = c
  return { ...rest, password: decryptPassword(passwordEnc) }
}

export const upsertConnection = (input: WebDavConnectionUpsertInput): WebDavConnection => {
  const now = new Date().toISOString()
  const connections = store.get('connections')

  const id = input.id ?? nanoid()
  const existing = connections[id]
  const createdAt = existing?.createdAt ?? now
  const passwordEnc = input.password
    ? encryptPassword(input.password)
    : (existing?.passwordEnc ?? '')

  const record: StoredConnection = {
    id,
    name: input.name,
    serverUrl: input.serverUrl,
    username: input.username,
    basePath: input.basePath || undefined,
    passwordEnc,
    createdAt,
    updatedAt: now
  }

  connections[id] = record
  store.set('connections', connections)

  if (!store.get('currentId')) store.set('currentId', id)

  const { passwordEnc: _passwordEnc, ...rest } = record
  void _passwordEnc
  return rest
}

export const removeConnection = (id: string): void => {
  const connections = store.get('connections')
  delete connections[id]
  store.set('connections', connections)

  const last = store.get('lastPathById')
  delete last[id]
  store.set('lastPathById', last)

  const currentId = store.get('currentId')
  if (currentId === id) {
    const next = Object.keys(connections)[0]
    store.set('currentId', next)
  }
}

export const setCurrentId = (id: string): void => {
  store.set('currentId', id)
}

export const getCurrentId = (): string | null => {
  return store.get('currentId') ?? null
}

export const getLastPath = (id: string): string | null => {
  return store.get('lastPathById')[id] ?? null
}

export const setLastPath = (id: string, path: string): void => {
  const last = store.get('lastPathById')
  last[id] = path
  store.set('lastPathById', last)
}

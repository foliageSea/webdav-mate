export type WebDavConnection = {
  id: string
  name: string
  serverUrl: string
  username: string
  basePath?: string
  createdAt: string
  updatedAt: string
}

export type WebDavConnectionUpsertInput = {
  id?: string
  name: string
  serverUrl: string
  username: string
  password: string
  basePath?: string
}

export type RemoteEntry = {
  path: string
  name: string
  kind: 'file' | 'folder'
  size?: number
  contentType?: string
  lastModified?: string
}

export type TransferKind = 'upload' | 'download'
export type TransferStatus = 'queued' | 'running' | 'paused' | 'done' | 'failed' | 'canceled'

export type TransferTask = {
  id: string
  kind: TransferKind
  serverId: string
  remotePath: string
  localPath: string
  totalBytes?: number
  transferredBytes: number
  status: TransferStatus
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

export type EnqueueUploadInput = {
  serverId: string
  remoteDir: string
  localPaths: string[]
  overwrite?: boolean
}

export type EnqueueDownloadInput = {
  serverId: string
  localDir: string
  remotePaths: string[]
  overwrite?: boolean
}

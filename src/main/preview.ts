import * as path from 'path'
import * as fsp from 'fs/promises'
import { app } from 'electron'
import { createHash } from 'crypto'
import mime from 'mime-types'
import { downloadFile } from './webdav'

const hash = (s: string): string => createHash('sha1').update(s).digest('hex').slice(0, 16)

export const getPreviewLocalPath = async (
  serverId: string,
  remotePath: string
): Promise<string> => {
  const ext = mime.extension(mime.lookup(remotePath) || '')
  const suffix = ext ? '.' + ext : ''

  const base = path.join(app.getPath('userData'), 'cache', 'previews')
  await fsp.mkdir(base, { recursive: true })

  const key = hash(serverId + ':' + remotePath)
  const localPath = path.join(base, key + suffix)

  try {
    await fsp.stat(localPath)
    return localPath
  } catch {
    await downloadFile(serverId, remotePath, localPath, true, () => void 0)
    return localPath
  }
}

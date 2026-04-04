import * as path from 'path'
import * as fsp from 'fs/promises'
import { app } from 'electron'
import { createHash } from 'crypto'
import * as pathPosix from 'path/posix'
import * as http from 'http'
import { Readable } from 'stream'
import type { ReadableStream as NodeReadableStream } from 'stream/web'
import mime from 'mime-types'
import { downloadFile } from './webdav'
import { getConnectionSecret } from './store'

const hash = (s: string): string => createHash('sha1').update(s).digest('hex').slice(0, 16)
const PREVIEW_HTTP_HOST = '127.0.0.1'

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

let previewServer: http.Server | null = null
let previewServerPort: number | null = null

export const getPreviewOnlineUrl = (serverId: string, remotePath: string): string => {
  if (!previewServerPort) {
    throw new Error('预览服务尚未启动')
  }
  return `http://${PREVIEW_HTTP_HOST}:${previewServerPort}/preview/${encodeURIComponent(serverId)}?path=${encodeURIComponent(remotePath)}`
}

const buildRemoteHttpUrl = (
  serverUrl: string,
  basePath: string | undefined,
  remotePath: string
): URL => {
  const url = new URL(serverUrl)
  const serverPath = (url.pathname || '/').replace(/\/+$/, '') || '/'
  const remote = joinRemote(basePath, remotePath).replace(/^\/+/, '')
  url.pathname = pathPosix.join(serverPath, remote)
  return url
}

export const registerPreviewProtocol = async (): Promise<void> => {
  if (previewServer) return

  previewServer = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        res.writeHead(400).end('Missing request url')
        return
      }
      const requestUrl = new URL(req.url, `http://${PREVIEW_HTTP_HOST}`)
      if (requestUrl.pathname === '/healthz') {
        res.writeHead(200).end('ok')
        return
      }
      if (!requestUrl.pathname.startsWith('/preview/')) {
        res.writeHead(404).end('Not found')
        return
      }

      const serverId = decodeURIComponent(requestUrl.pathname.replace(/^\/preview\//, ''))
      const remotePath = decodeURIComponent(requestUrl.searchParams.get('path') || '/')
      if (!serverId) {
        res.writeHead(400).end('Missing serverId')
        return
      }

      const conn = getConnectionSecret(serverId)
      if (!conn) {
        res.writeHead(404).end('Connection not found')
        return
      }

      const upstreamUrl = buildRemoteHttpUrl(conn.serverUrl, conn.basePath, remotePath)
      const headers = new Headers()
      headers.set(
        'Authorization',
        `Basic ${Buffer.from(`${conn.username}:${conn.password}`).toString('base64')}`
      )
      const range = req.headers.range
      if (typeof range === 'string' && range) headers.set('Range', range)

      const upstream = await fetch(upstreamUrl.toString(), {
        method: 'GET',
        headers
      })

      const contentType =
        upstream.headers.get('content-type') ||
        String(mime.lookup(remotePath) || 'application/octet-stream')

      const responseHeaders: Record<string, string> = {
        'Content-Type': contentType,
        'Cache-Control': 'no-store'
      }
      const contentLength = upstream.headers.get('content-length')
      if (contentLength) responseHeaders['Content-Length'] = contentLength
      const contentRange = upstream.headers.get('content-range')
      if (contentRange) responseHeaders['Content-Range'] = contentRange
      const acceptRanges = upstream.headers.get('accept-ranges')
      if (acceptRanges) responseHeaders['Accept-Ranges'] = acceptRanges

      res.writeHead(upstream.status, responseHeaders)

      if (!upstream.body) {
        res.end()
        return
      }

      const upstreamStream = Readable.fromWeb(upstream.body as unknown as NodeReadableStream)
      upstreamStream.on('error', (streamErr) => {
        const message = streamErr instanceof Error ? streamErr.message : String(streamErr)
        console.error('[preview] upstream stream error', {
          requestUrl: req.url,
          serverId,
          remotePath,
          upstreamUrl: upstreamUrl.toString(),
          error: message
        })
      })
      req.on('close', () => {
        upstreamStream.destroy()
      })
      upstreamStream.pipe(res)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[preview] http proxy error', { requestUrl: req.url, error: message })
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
      }
      res.end(message)
    }
  })

  await new Promise<void>((resolve, reject) => {
    const server = previewServer
    if (!server) {
      reject(new Error('预览服务创建失败'))
      return
    }

    server.once('error', (err) => reject(err))
    server.listen(0, PREVIEW_HTTP_HOST, () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('预览服务端口获取失败'))
        return
      }
      previewServerPort = addr.port
      resolve()
    })
  })

  app.once('before-quit', () => {
    if (!previewServer) return
    previewServer.close()
    previewServer = null
    previewServerPort = null
  })
}

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

export const getPreviewDataUrl = async (serverId: string, remotePath: string): Promise<string> => {
  const localPath = await getPreviewLocalPath(serverId, remotePath)
  const contentType = String(
    mime.lookup(remotePath) || mime.lookup(localPath) || 'application/octet-stream'
  )
  const buf = await fsp.readFile(localPath)
  return `data:${contentType};base64,${buf.toString('base64')}`
}

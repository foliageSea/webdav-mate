import * as path from 'path'
import * as fsp from 'fs/promises'

export type LocalFileItem = {
  localPath: string
  relPath: string
  size: number
}

const walkDir = async (root: string, dir: string, out: LocalFileItem[]): Promise<void> => {
  const entries = await fsp.readdir(dir, { withFileTypes: true })
  for (const ent of entries) {
    const full = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      await walkDir(root, full, out)
      continue
    }
    if (ent.isFile()) {
      const st = await fsp.stat(full)
      const rel = path.relative(root, full).split(path.sep).join('/')
      out.push({ localPath: full, relPath: rel, size: st.size })
    }
  }
}

export const expandLocalFiles = async (localPaths: string[]): Promise<LocalFileItem[]> => {
  const out: LocalFileItem[] = []
  for (const p of localPaths) {
    const st = await fsp.stat(p)
    if (st.isDirectory()) {
      await walkDir(p, p, out)
    } else if (st.isFile()) {
      out.push({ localPath: p, relPath: path.basename(p), size: st.size })
    }
  }
  return out
}

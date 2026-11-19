import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

export interface AppPaths {
  dataRoot: string
  modelsDir: string
  audiosDir: string
  voicesDir: string
  logsDir: string
  tmpDir: string
  settingsFile: string
  historyFile: string
  referenceWav: string
  referenceJson: string
  runtimePath: string
  dev: boolean
  isPortable: boolean
}

let cached: AppPaths | null = null

function canWrite(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true })
    const probe = path.join(dir, `.roesch-write-${process.pid}`)
    fs.writeFileSync(probe, 'ok')
    fs.unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

export function getPaths(): AppPaths {
  if (cached) return cached

  const dev = !app.isPackaged
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR
  let dataRoot: string
  let isPortable = false

  if (process.env.ROESCH_DATA_ROOT) {
    dataRoot = path.resolve(process.env.ROESCH_DATA_ROOT)
  } else if (dev) {
    dataRoot = app.getAppPath()
  } else if (portableDir && canWrite(portableDir)) {
    dataRoot = portableDir
    isPortable = true
  } else {
    dataRoot = app.getPath('userData')
  }

  const modelsDir = path.join(dataRoot, 'models')
  const audiosDir = path.join(dataRoot, 'audios')
  const voicesDir = path.join(dataRoot, 'voices')
  const logsDir = path.join(dataRoot, 'logs')
  const tmpDir = path.join(dataRoot, 'tmp')

  for (const dir of [dataRoot, modelsDir, audiosDir, voicesDir, logsDir, tmpDir]) {
    fs.mkdirSync(dir, { recursive: true })
  }

  try {
    for (const entry of fs.readdirSync(tmpDir)) {
      const target = path.join(tmpDir, entry)
      if (fs.statSync(target).isFile()) fs.rmSync(target, { force: true })
    }
  } catch {
    // ignore stale temporary files
  }

  cached = {
    dataRoot,
    modelsDir,
    audiosDir,
    voicesDir,
    logsDir,
    tmpDir,
    settingsFile: path.join(dataRoot, 'settings.json'),
    historyFile: path.join(audiosDir, 'index.json'),
    referenceWav: path.join(voicesDir, 'reference.wav'),
    referenceJson: path.join(voicesDir, 'reference.json'),
    runtimePath: dev ? path.join(app.getAppPath(), 'runtime') : path.join(process.resourcesPath, 'runtime'),
    dev,
    isPortable
  }

  return cached
}

export function resetPathsCache(): void {
  cached = null
}

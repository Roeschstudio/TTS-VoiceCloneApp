import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import { DownloadProgress } from '@shared/types'
import { getPaths } from './paths'
import { MODEL_FILES, MODEL_TOTAL_BYTES } from './models'

interface ActiveDownload {
  child: ChildProcessWithoutNullStreams | null
  cancelled: boolean
  running: boolean
  progress: DownloadProgress | null
}

const state: ActiveDownload = {
  child: null,
  cancelled: false,
  running: false,
  progress: null
}

function broadcast(progress: DownloadProgress): void {
  state.progress = progress
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('download:progress', progress)
  }
}

function curlExecutable(): string {
  const system = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'curl.exe')
  return fs.existsSync(system) ? system : 'curl.exe'
}

function waitForExit(child: ChildProcessWithoutNullStreams): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    let stderr = ''
    const onData = (chunk: Buffer) => {
      stderr += chunk.toString()
      if (stderr.length > 16000) stderr = stderr.slice(-16000)
    }
    child.stderr.on('data', onData)
    child.on('close', (code) => resolve({ code: code ?? -1, stderr }))
    child.on('error', (error) => resolve({ code: -1, stderr: `${stderr}\n${error.message}` }))
  })
}

async function downloadOne(fileIndex: number): Promise<void> {
  const def = MODEL_FILES[fileIndex]
  const { modelsDir } = getPaths()
  const target = path.join(modelsDir, def.name)

  let present = 0
  try {
    present = fs.statSync(target).size
  } catch {
    present = 0
  }

  if (present === def.size) {
    broadcast({
      phase: 'model',
      fileName: def.name,
      fileIndex,
      fileCount: MODEL_FILES.length,
      received: def.size,
      total: def.size,
      percent: 100,
      overallPercent: ((fileIndex + 1) / MODEL_FILES.length) * 100,
      speedBps: 0,
      etaSec: 0,
      status: 'done',
      message: 'Modelo ya presente'
    })
    return
  }

  if (present > def.size) {
    fs.rmSync(target, { force: true })
    present = 0
  }

  const args = [
    '-L',
    '--fail',
    '--retry',
    '5',
    '--retry-delay',
    '2',
    '-C',
    '-',
    '-sS',
    '--connect-timeout',
    '30',
    '-o',
    target,
    def.url
  ]

  const completedBefore = MODEL_FILES.slice(0, fileIndex).reduce((acc, file) => acc + file.size, 0)

  const emit = (status: DownloadProgress['status'], message?: string) => {
    let received = present
    try {
      received = fs.statSync(target).size
    } catch {
      received = 0
    }
    const percent = Math.min(100, (received / def.size) * 100)
    const overallPercent = Math.min(100, ((completedBefore + received) / MODEL_TOTAL_BYTES) * 100)
    broadcast({
      phase: 'model',
      fileName: def.name,
      fileIndex,
      fileCount: MODEL_FILES.length,
      received,
      total: def.size,
      percent,
      overallPercent,
      speedBps: state.progress?.speedBps ?? 0,
      etaSec: state.progress?.etaSec ?? null,
      status,
      message
    })
  }

  emit('downloading')

  const child = spawn(curlExecutable(), args, { windowsHide: true })
  state.child = child
  child.stdout.resume()
  child.stderr.resume()

  let lastBytes = present
  let lastTime = Date.now()
  let smoothSpeed = 0

  const timer = setInterval(() => {
    let bytes = present
    try {
      bytes = fs.statSync(target).size
    } catch {
      bytes = 0
    }
    const now = Date.now()
    const dt = (now - lastTime) / 1000
    if (dt > 0.2) {
      const instant = Math.max(0, (bytes - lastBytes) / dt)
      smoothSpeed = smoothSpeed === 0 ? instant : smoothSpeed * 0.75 + instant * 0.25
      lastBytes = bytes
      lastTime = now
    }
    const percent = Math.min(100, (bytes / def.size) * 100)
    const overallPercent = Math.min(100, ((completedBefore + bytes) / MODEL_TOTAL_BYTES) * 100)
    const remaining = Math.max(0, def.size - bytes)
    broadcast({
      phase: 'model',
      fileName: def.name,
      fileIndex,
      fileCount: MODEL_FILES.length,
      received: bytes,
      total: def.size,
      percent,
      overallPercent,
      speedBps: smoothSpeed,
      etaSec: smoothSpeed > 1000 ? remaining / smoothSpeed : null,
      status: 'downloading'
    })
  }, 500)

  const { code, stderr } = await waitForExit(child)
  clearInterval(timer)
  state.child = null

  if (state.cancelled) {
    emit('cancelled', 'Descarga cancelada. Puedes reanudarla.')
    state.running = false
    return
  }

  if (code !== 0) {
    emit('error', `curl terminó con código ${code}. ${stderr.trim().slice(-500)}`)
    state.running = false
    return
  }

  let finalSize = 0
  try {
    finalSize = fs.statSync(target).size
  } catch {
    finalSize = 0
  }

  if (finalSize !== def.size) {
    emit('error', `Tamaño incorrecto en ${def.name}: ${finalSize} de ${def.size} bytes.`)
    state.running = false
    return
  }

  broadcast({
    phase: 'model',
    fileName: def.name,
    fileIndex,
    fileCount: MODEL_FILES.length,
    received: finalSize,
    total: def.size,
    percent: 100,
    overallPercent: Math.min(100, ((completedBefore + finalSize) / MODEL_TOTAL_BYTES) * 100),
    speedBps: 0,
    etaSec: 0,
    status: 'verifying',
    message: 'Verificando archivo…'
  })

  await new Promise((resolve) => setTimeout(resolve, 250))
}

export async function startModelDownload(): Promise<void> {
  if (state.running) return
  state.running = true
  state.cancelled = false

  for (let i = 0; i < MODEL_FILES.length; i++) {
    if (state.cancelled) break
    await downloadOne(i)
    if (state.cancelled) break
    const failed = state.progress?.status === 'error'
    if (failed) break
  }

  if (!state.cancelled && state.progress?.status !== 'error') {
    broadcast({
      phase: 'model',
      fileName: '',
      fileIndex: MODEL_FILES.length - 1,
      fileCount: MODEL_FILES.length,
      received: MODEL_TOTAL_BYTES,
      total: MODEL_TOTAL_BYTES,
      percent: 100,
      overallPercent: 100,
      speedBps: 0,
      etaSec: 0,
      status: 'done',
      message: 'Modelo listo'
    })
  }

  state.running = false
}

export function cancelDownload(): void {
  if (!state.running) return
  state.cancelled = true
  if (state.child) {
    try {
      state.child.kill()
    } catch {
      // ignore
    }
  }
}

export function getDownloadProgress(): DownloadProgress | null {
  return state.progress
}

export function isDownloadRunning(): boolean {
  return state.running
}

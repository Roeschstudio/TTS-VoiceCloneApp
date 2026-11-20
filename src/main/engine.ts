import { spawn, execFile, ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { BrowserWindow } from 'electron'
import {
  AppSettings,
  Backend,
  Calibration,
  EngineTestResult,
  GenerateRequest,
  GenerationPlan,
  GenerationProgress,
  GenerationStage,
  HardwareInfo,
  HistoryEntry,
  LanguageCode
} from '@shared/types'
import { getPaths } from './paths'
import { getSettings, updateSettings } from './settings'
import { detectHardware, resolveBackend } from './hardware'
import { MODEL_FILES, isModelReady } from './models'
import { readWavInfo } from './wav'
import { addHistory, makeGenerationFileName } from './library'

const CHARS_PER_SEC: Record<LanguageCode, number> = {
  es: 18,
  en: 17,
  de: 15,
  fr: 16.5,
  it: 17,
  pt: 17,
  ru: 14,
  ja: 6,
  ko: 8,
  zh: 5.5
}

const FRAMES_PER_SECOND = 12

interface ActiveJob {
  id: string
  child: ChildProcessWithoutNullStreams | null
  cancelled: boolean
  startedAt: number
  totalFrames: number
  frames: number
  fps: number
  lastProgressAt: number
  outputPath: string
  stderrTail: string
  lastLines: string[]
}

let active: ActiveJob | null = null
let lastLogs = ''

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
}

function runtimeExe(backend: Backend): string {
  return path.join(getPaths().runtimePath, backend, 'llama-tts.exe')
}

function estimateAudioSeconds(text: string, language: LanguageCode): number {
  const cps = CHARS_PER_SEC[language] ?? 16
  return Math.max(1.5, text.length / cps)
}

function baseLoadSeconds(): number {
  const calibration = getSettings().calibration
  return calibration?.loadSec && calibration.loadSec > 0 ? calibration.loadSec : 7
}

function baseFps(): number {
  const calibration = getSettings().calibration
  return calibration?.fps && calibration.fps > 0 ? calibration.fps : 15
}

export function planGeneration(text: string, language: LanguageCode): GenerationPlan {
  const chars = text.trim().length
  const audioSec = estimateAudioSeconds(text, language)
  const fps = baseFps()
  const totalFrames = Math.min(7000, Math.max(90, Math.ceil(audioSec * FRAMES_PER_SECOND) + 20))
  const estimatedTotalSec = baseLoadSeconds() + audioSec / (fps / FRAMES_PER_SECOND) + 1
  return {
    jobId: `plan-${Date.now()}`,
    chars,
    estimatedAudioSec: Math.round(audioSec * 10) / 10,
    estimatedTotalSec: Math.round(estimatedTotalSec),
    totalFrames
  }
}

function emitProgress(progress: GenerationProgress): void {
  broadcast('engine:progress', progress)
}

function parseFrameLine(line: string): { frames: number; fps: number } | null {
  const match = /frames generated:\s*(\d+),\s*speed:\s*([\d.]+)\s*frames\/s/.exec(line)
  if (!match) return null
  return { frames: Number(match[1]), fps: Number(match[2]) }
}

function now(): number {
  return Date.now()
}

function makeOutputPath(id: string): string {
  const { tmpDir } = getPaths()
  return path.join(tmpDir, `${id}.wav`)
}

function buildArgs(
  backend: Backend,
  request: GenerateRequest,
  outputPath: string,
  totalFrames: number,
  hardware: HardwareInfo
): string[] {
  const { modelsDir } = getPaths()
  const talker = path.join(modelsDir, MODEL_FILES[0].name)
  const mmproj = path.join(modelsDir, MODEL_FILES[1].name)
  const text = request.text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim()

  const args = [
    '-m',
    talker,
    '-mm',
    mmproj,
    '-p',
    text,
    '--tts-lang',
    request.language,
    '-o',
    outputPath,
    '-n',
    String(totalFrames),
    '-c',
    '8192'
  ]

  if (request.voiceFile) {
    args.push('--tts-speaker-file', request.voiceFile)
  }

  if (backend === 'vulkan') {
    args.push('-ngl', '99', '--device', 'Vulkan0')
  } else {
    // llama.cpp recommends one thread per physical core for CPU inference.
    const threads = Math.max(1, Math.min(32, hardware.cpuCores || hardware.cpuThreads || 4))
    args.push('-ngl', '0', '-t', String(threads))
  }

  return args
}

function stageFromLine(line: string): GenerationStage | null {
  if (/init_audio/.test(line)) return 'prompt'
  if (/timings:/.test(line)) return 'vocoding'
  return null
}

async function runJob(
  request: GenerateRequest,
  backend: Backend,
  options: { save: boolean; jobId?: string; timeoutSec?: number }
): Promise<{ entry: HistoryEntry | null; log: string; durationSec: number; fps: number; loadSec: number; outputPath: string }> {
  if (active) throw new Error('Ya hay una generación en curso')
  if (!isModelReady()) throw new Error('El modelo todavía no está descargado')

  const exe = runtimeExe(backend)
  if (!fs.existsSync(exe)) throw new Error(`No se encontró el motor (${backend})`)

  const hardware = await detectHardware()
  const id = options.jobId || `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`
  const outputPath = makeOutputPath(id)
  const plan = planGeneration(request.text, request.language)
  const audioEstimate = estimateAudioSeconds(request.text, request.language)
  const totalFrames = Math.max(90, Math.min(7000, Math.ceil(audioEstimate * FRAMES_PER_SECOND) + 20))
  const maxFrames = Math.max(90, Math.min(7000, Math.ceil(audioEstimate * FRAMES_PER_SECOND * 1.8) + 120))

  const job: ActiveJob = {
    id,
    child: null,
    cancelled: false,
    startedAt: now(),
    totalFrames,
    frames: 0,
    fps: 0,
    lastProgressAt: 0,
    outputPath,
    stderrTail: '',
    lastLines: []
  }
  active = job

  const args = buildArgs(backend, request, outputPath, maxFrames, hardware)
  const env = { ...process.env }
  if (backend === 'vulkan') {
    const index = hardware.selectedVulkanIndex
    if (index !== null) env.GGML_VK_VISIBLE_DEVICES = String(index)
  }

  const child = spawn(exe, args, {
    windowsHide: true,
    cwd: path.dirname(exe),
    env
  })
  job.child = child

  const startProgress: GenerationProgress = {
    jobId: id,
    stage: 'loading',
    frames: 0,
    totalFrames,
    fps: 0,
    percent: 2,
    etaSec: Math.max(5, plan.estimatedTotalSec),
    elapsedSec: 0,
    message: backend === 'vulkan' ? 'Cargando modelo en la GPU…' : 'Cargando modelo en CPU…'
  }
  emitProgress(startProgress)

  let partial = ''
  let stage: GenerationStage = 'loading'
  let generationSec = 0
  let promptSec = 0
  let vocoderSec = 0

  const handleLine = (rawLine: string) => {
    const line = rawLine.replace(/\r/g, '').trim()
    if (!line) return
    job.lastLines.push(line)
    if (job.lastLines.length > 600) job.lastLines.shift()

    const parsed = parseFrameLine(line)
    if (parsed) {
      stage = 'generating'
      job.frames = parsed.frames
      job.fps = parsed.fps
      if (job.frames > job.totalFrames * 0.92) {
        job.totalFrames = Math.ceil(job.frames / 0.9)
      }
    }

    const derived = stageFromLine(line)
    if (derived) stage = derived

    const timings = /prompt eval\s+([\d.]+)s\s*\+\s*generation\s+([\d.]+)s\s*\+\s*vocoder\s+([\d.]+)s\s*=\s*total\s+([\d.]+)s/.exec(line)
    if (timings) {
      promptSec = Number(timings[1])
      generationSec = Number(timings[2])
      vocoderSec = Number(timings[3])
      stage = 'vocoding'
    }

    const elapsed = (now() - job.startedAt) / 1000
    if (job.frames > 0 && job.fps > 0) {
      const remainingFrames = Math.max(0, job.totalFrames - job.frames)
      const eta = remainingFrames / job.fps + 1
      const percent = Math.min(97, Math.max(3, (job.frames / job.totalFrames) * 100))
      emitProgress({
        jobId: id,
        stage: 'generating',
        frames: job.frames,
        totalFrames: job.totalFrames,
        fps: job.fps,
        percent,
        etaSec: eta,
        elapsedSec: elapsed
      })
    } else if (stage === 'prompt') {
      emitProgress({
        jobId: id,
        stage: 'prompt',
        frames: 0,
        totalFrames: job.totalFrames,
        fps: 0,
        percent: 3,
        etaSec: Math.max(1, plan.estimatedTotalSec - elapsed),
        elapsedSec: elapsed,
        message: 'Procesando el texto…'
      })
    }
  }

  const onData = (chunk: Buffer) => {
    const text = chunk.toString('utf8')
    partial += text
    const lines = partial.split(/\r?\n/)
    partial = lines.pop() || ''
    for (const line of lines) handleLine(line)
  }

  child.stdout.on('data', onData)
  child.stderr.on('data', (chunk: Buffer) => {
    job.stderrTail += chunk.toString('utf8')
    if (job.stderrTail.length > 20000) job.stderrTail = job.stderrTail.slice(-20000)
    onData(chunk)
  })
  child.stdout.resume()

  const timeout = setTimeout(
    () => {
      if (!job.cancelled) {
        job.stderrTail += '\n[Roesch TTS] Tiempo máximo de generación excedido.'
        cancelGeneration()
      }
    },
    Math.max(180, (options.timeoutSec ?? 600)) * 1000
  )

  const exitCode = await new Promise<number>((resolve) => {
    child.on('close', (code) => resolve(code ?? -1))
    child.on('error', (error) => {
      job.stderrTail += `\n${error.message}`
      resolve(-1)
    })
  })
  clearTimeout(timeout)
  if (partial.trim()) handleLine(partial)

  const wallSec = (now() - job.startedAt) / 1000
  const log = [...job.lastLines, job.stderrTail].join('\n')
  lastLogs = log
  persistLog(log)
  active = null

  if (job.cancelled) {
    emitProgress({
      jobId: id,
      stage: 'cancelled',
      frames: job.frames,
      totalFrames: job.totalFrames,
      fps: job.fps,
      percent: 0,
      etaSec: null,
      elapsedSec: wallSec,
      message: 'Generación cancelada'
    })
    try {
      fs.rmSync(outputPath, { force: true })
    } catch {
      // ignore
    }
    throw new Error('CANCELLED')
  }

  if (exitCode !== 0) {
    const detail = job.stderrTail.trim().split('\n').slice(-4).join(' ')
    emitProgress({
      jobId: id,
      stage: 'error',
      frames: job.frames,
      totalFrames: job.totalFrames,
      fps: job.fps,
      percent: 0,
      etaSec: null,
      elapsedSec: wallSec,
      message: detail || 'El motor terminó con un error'
    })
    throw new Error(`El motor no pudo generar el audio. ${detail}`)
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error('El motor terminó pero no generó el archivo de audio')
  }

  const buffer = fs.readFileSync(outputPath)
  const info = readWavInfo(buffer)
  if (!info || info.durationSec < 0.2) {
    throw new Error('El audio generado no es válido')
  }

  const timingsTotal = promptSec + generationSec + vocoderSec
  const loadSec = Math.max(0, wallSec - (timingsTotal > 0 ? timingsTotal : wallSec))
  const measuredFps = job.fps || (job.frames / Math.max(0.1, generationSec || 1))
  updateCalibration({
    backend,
    fps: measuredFps,
    loadSec,
    charsPerSec: request.text.trim().length / Math.max(0.1, info.durationSec),
    updatedAt: new Date().toISOString()
  })

  let entry: HistoryEntry | null = null
  if (options.save) {
    const { audiosDir } = getPaths()
    const fileName = makeGenerationFileName(id)
    const finalPath = path.join(audiosDir, fileName)
    fs.renameSync(outputPath, finalPath)
    const settings = getSettings()
    entry = addHistory({
      id,
      createdAt: new Date().toISOString(),
      text: request.text.trim(),
      language: request.language,
      preset: 'original',
      rawFile: fileName,
      audioFile: fileName,
      fileName: fileName.replace(/_raw\.wav$/i, '.wav'),
      durationSec: info.durationSec,
      sampleRate: info.sampleRate,
      chars: request.text.trim().length,
      voiceName: 'Mi voz',
      backend,
      rtf: wallSec / info.durationSec
    })
    void settings
  } else {
    fs.rmSync(outputPath, { force: true })
  }

  emitProgress({
    jobId: id,
    stage: 'done',
    frames: job.frames,
    totalFrames: job.totalFrames,
    fps: measuredFps,
    percent: 100,
    etaSec: 0,
    elapsedSec: wallSec
  })

  return { entry, log, durationSec: info.durationSec, fps: measuredFps, loadSec, outputPath }
}

function updateCalibration(next: Calibration): void {
  const settings = getSettings()
  const previous = settings.calibration
  const blended: Calibration =
    previous && previous.backend === next.backend
      ? {
          backend: next.backend,
          fps: previous.fps * 0.35 + next.fps * 0.65,
          loadSec: previous.loadSec * 0.35 + next.loadSec * 0.65,
          charsPerSec: previous.charsPerSec * 0.35 + next.charsPerSec * 0.65,
          updatedAt: next.updatedAt
        }
      : next
  updateSettings({ calibration: blended })
}

function persistLog(log: string): void {
  try {
    const { logsDir } = getPaths()
    const file = path.join(logsDir, 'engine.log')
    const chunk = `\n===== ${new Date().toISOString()} =====\n${log}\n`
    fs.appendFileSync(file, chunk, 'utf8')
    const size = fs.statSync(file).size
    if (size > 2 * 1024 * 1024) {
      const content = fs.readFileSync(file, 'utf8').slice(-1024 * 1024)
      fs.writeFileSync(file, content, 'utf8')
    }
  } catch {
    // ignore
  }
}

export async function generateAudio(request: GenerateRequest): Promise<HistoryEntry> {
  if (!request.text.trim()) throw new Error('Escribe un texto para generar')
  const settings = getSettings()
  if (request.text.trim().length > settings.maxChars) {
    throw new Error(`El texto supera el máximo de ${settings.maxChars} caracteres`)
  }

  const hardware = await detectHardware()
  const backend = resolveBackend(hardware)
  const ref = request.voiceFile || null
  if (ref && !fs.existsSync(ref)) throw new Error('La voz de referencia no está disponible')

  const { entry } = await runJob({ ...request, voiceFile: ref }, backend, { save: true })
  if (!entry) throw new Error('No se pudo guardar el audio')
  return entry
}

export function cancelGeneration(): void {
  if (!active) return
  active.cancelled = true
  if (active.child?.pid) {
    try {
      execFile('taskkill', ['/PID', String(active.child.pid), '/T', '/F'], { windowsHide: true })
    } catch {
      // ignore
    }
    try {
      active.child.kill()
    } catch {
      // ignore
    }
  }
}

export function isGenerating(): boolean {
  return Boolean(active)
}

export async function testEngine(): Promise<EngineTestResult> {
  if (active) throw new Error('Espera a que termine la generación actual')
  const hardware = await detectHardware()
  const settings = getSettings()
  const preferred = resolveBackend(hardware)

  const reference = getPaths().referenceWav
  const voice = fs.existsSync(reference) ? reference : null
  const gpuName =
    hardware.vulkanDevices.find((device) => device.index === hardware.selectedVulkanIndex)?.name ??
    hardware.primaryGpuName
  const request: GenerateRequest = {
    text: 'Hola. Esta es una prueba de funcionamiento de Roesch TTS.',
    language: 'es',
    voiceFile: voice,
    preset: 'original'
  }

  const attempts: Backend[] = preferred === 'vulkan' ? ['vulkan', 'cpu'] : ['cpu']
  let lastError = ''

  for (const backend of attempts) {
    if (!fs.existsSync(runtimeExe(backend))) {
      lastError = `No se encontró el motor ${backend}`
      continue
    }
    try {
      const result = await runJob(request, backend, { save: false, timeoutSec: 240 })
      const updates: Partial<AppSettings> = {
        engineTested: true,
        knownVulkanIndex: hardware.selectedVulkanIndex
      }
      if (backend === 'cpu' && preferred === 'vulkan') {
        updates.backend = 'cpu'
      }
      updateSettings(updates)
      return {
        ok: true,
        backend,
        fps: Math.round(result.fps * 10) / 10,
        loadSec: Math.round(result.loadSec * 10) / 10,
        message:
          backend === 'vulkan'
            ? `Motor Vulkan listo en ${gpuName ?? 'la GPU'}.`
            : preferred === 'vulkan'
              ? 'Vulkan no respondió correctamente. Se activó el modo CPU.'
              : 'Motor CPU listo.',
        logs: result.log
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
  }

  return {
    ok: false,
    backend: null,
    fps: null,
    loadSec: null,
    message: lastError || 'No se pudo iniciar el motor de voz',
    logs: lastLogs
  }
}

export function getEngineLogs(): string {
  try {
    const file = path.join(getPaths().logsDir, 'engine.log')
    if (!fs.existsSync(file)) return lastLogs
    const content = fs.readFileSync(file, 'utf8')
    return content.slice(-60000)
  } catch {
    return lastLogs
  }
}

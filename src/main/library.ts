import { BrowserWindow, dialog, shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import {
  ExportRequest,
  HistoryEntry,
  PresetId,
  ReferencePayload,
  SaveProcessedRequest,
  StoredVoice,
  VoiceInfo
} from '@shared/types'
import { getPaths } from './paths'
import { readWavInfo } from './wav'

function readHistoryFile(): HistoryEntry[] {
  const { historyFile } = getPaths()
  try {
    const raw = fs.readFileSync(historyFile, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as HistoryEntry[]) : []
  } catch {
    return []
  }
}

function writeHistoryFile(entries: HistoryEntry[]): void {
  const { historyFile } = getPaths()
  const tmp = `${historyFile}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2), 'utf8')
  fs.renameSync(tmp, historyFile)
}

function safeInside(base: string, fileName: string): string {
  const resolved = path.resolve(base, path.basename(fileName))
  const normalizedBase = path.resolve(base) + path.sep
  if (!resolved.startsWith(normalizedBase)) throw new Error('Ruta no permitida')
  return resolved
}

function fileExists(file: string): boolean {
  try {
    return fs.statSync(file).isFile()
  } catch {
    return false
  }
}

function makeId(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `${stamp}-${randomBytes(2).toString('hex')}`
}

export function makeGenerationFileName(id: string): string {
  return `${id}_raw.wav`
}

export function addHistory(entry: HistoryEntry): HistoryEntry {
  const entries = readHistoryFile()
  entries.unshift(entry)
  writeHistoryFile(entries)
  return entry
}

export function listHistory(): HistoryEntry[] {
  const { audiosDir } = getPaths()
  const entries = readHistoryFile()
  const valid = entries.filter((entry) => {
    try {
      return (
        fileExists(safeInside(audiosDir, entry.rawFile)) &&
        fileExists(safeInside(audiosDir, entry.audioFile))
      )
    } catch {
      return false
    }
  })
  if (valid.length !== entries.length) writeHistoryFile(valid)
  return valid
}

export function deleteHistory(id: string): void {
  const { audiosDir } = getPaths()
  const entries = readHistoryFile()
  const entry = entries.find((item) => item.id === id)
  if (!entry) return
  const files = new Set([entry.rawFile, entry.audioFile])
  for (const file of files) {
    try {
      fs.rmSync(safeInside(audiosDir, file), { force: true })
    } catch {
      // ignore
    }
  }
  writeHistoryFile(entries.filter((item) => item.id !== id))
}

export function saveProcessed(request: SaveProcessedRequest): HistoryEntry {
  const { audiosDir } = getPaths()
  const entries = readHistoryFile()
  const index = entries.findIndex((item) => item.id === request.id)
  if (index === -1) throw new Error('Audio no encontrado')

  const entry = entries[index]
  const base = entry.rawFile.replace(/_raw\.wav$/i, '')
  const previous = entry.audioFile
  let audioFile: string
  let sampleRate = entry.sampleRate
  let durationSec = request.durationSec

  if (request.preset === 'original') {
    audioFile = entry.rawFile
  } else {
    audioFile = `${base}_${request.preset}.wav`
    const target = safeInside(audiosDir, audioFile)
    fs.writeFileSync(target, Buffer.from(request.data))
    const info = readWavInfo(fs.readFileSync(target))
    if (info) {
      sampleRate = info.sampleRate
      durationSec = info.durationSec
    }
  }

  if (previous !== audioFile && previous !== entry.rawFile) {
    try {
      fs.rmSync(safeInside(audiosDir, previous), { force: true })
    } catch {
      // ignore
    }
  }

  const updated: HistoryEntry = {
    ...entry,
    preset: request.preset as PresetId,
    audioFile,
    durationSec,
    sampleRate
  }
  entries[index] = updated
  writeHistoryFile(entries)
  return updated
}

export function getAudio(file: string): ArrayBuffer {
  const { audiosDir } = getPaths()
  const target = safeInside(audiosDir, file)
  const buffer = fs.readFileSync(target)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

export function getReference(): StoredVoice | null {
  const { referenceWav, referenceJson } = getPaths()
  if (!fileExists(referenceWav)) return null
  let info: VoiceInfo | null = null
  try {
    const raw = JSON.parse(fs.readFileSync(referenceJson, 'utf8')) as VoiceInfo
    const wav = readWavInfo(fs.readFileSync(referenceWav))
    info = { ...raw, durationSec: wav?.durationSec ?? raw.durationSec, sampleRate: wav?.sampleRate ?? raw.sampleRate }
  } catch {
    const wav = readWavInfo(fs.readFileSync(referenceWav))
    if (!wav) return null
    info = {
      fileName: 'reference.wav',
      name: 'Mi voz',
      durationSec: wav.durationSec,
      sampleRate: wav.sampleRate,
      createdAt: new Date().toISOString()
    }
  }
  if (!info) return null
  const buffer = fs.readFileSync(referenceWav)
  return {
    info,
    data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
  }
}

export function saveReference(payload: ReferencePayload): VoiceInfo {
  const { referenceWav, referenceJson } = getPaths()
  const buffer = Buffer.from(payload.data)
  const info = readWavInfo(buffer)
  if (!info) throw new Error('El audio de referencia no es un WAV válido')
  fs.writeFileSync(referenceWav, buffer)
  const voice: VoiceInfo = {
    fileName: 'reference.wav',
    name: payload.name.trim() || 'Mi voz',
    durationSec: info.durationSec,
    sampleRate: info.sampleRate,
    createdAt: new Date().toISOString()
  }
  fs.writeFileSync(referenceJson, JSON.stringify(voice, null, 2), 'utf8')
  return voice
}

export function deleteReference(): void {
  const { referenceWav, referenceJson } = getPaths()
  fs.rmSync(referenceWav, { force: true })
  fs.rmSync(referenceJson, { force: true })
}

export function getReferencePath(): string | null {
  const { referenceWav } = getPaths()
  return fileExists(referenceWav) ? referenceWav : null
}

export async function exportAudio(parent: BrowserWindow | null, request: ExportRequest): Promise<string | null> {
  const ext = request.format === 'mp3' ? 'mp3' : 'wav'
  let baseName = request.fileName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').trim()
  if (!baseName) baseName = 'Roesch TTS'
  if (!baseName.toLowerCase().endsWith(`.${ext}`)) baseName = `${baseName}.${ext}`

  const options = {
    title: 'Guardar audio',
    defaultPath: path.join(process.env.USERPROFILE || '', 'Downloads', baseName),
    filters: [
      {
        name: ext === 'mp3' ? 'Audio MP3' : 'Audio WAV',
        extensions: [ext]
      }
    ]
  }

  const result = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null
  fs.writeFileSync(result.filePath, Buffer.from(request.data))
  return result.filePath
}

export function openDataFolder(sub = ''): void {
  const paths = getPaths()
  const allowed: Record<string, string> = {
    '': paths.dataRoot,
    audios: paths.audiosDir,
    voices: paths.voicesDir,
    models: paths.modelsDir,
    logs: paths.logsDir
  }
  const target = allowed[sub] ?? paths.dataRoot
  void shell.openPath(target)
}

export function revealFile(file: string): void {
  const { dataRoot } = getPaths()
  const resolved = path.resolve(dataRoot, file)
  if (!resolved.startsWith(path.resolve(dataRoot) + path.sep)) return
  if (fileExists(resolved)) shell.showItemInFolder(resolved)
}

export function getRawPath(entry: HistoryEntry): string {
  const { audiosDir } = getPaths()
  return safeInside(audiosDir, entry.rawFile)
}

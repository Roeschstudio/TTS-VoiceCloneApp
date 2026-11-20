export type Backend = 'vulkan' | 'cpu'
export type BackendPreference = 'auto' | Backend
export type PresetId = 'original' | 'studio' | 'podcast' | 'radio'

export type LanguageCode =
  | 'es'
  | 'en'
  | 'de'
  | 'fr'
  | 'it'
  | 'pt'
  | 'ru'
  | 'ja'
  | 'ko'
  | 'zh'

export interface LanguageOption {
  code: LanguageCode
  label: string
  native: string
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'es', label: 'Español', native: 'Español' },
  { code: 'en', label: 'Inglés', native: 'English' },
  { code: 'de', label: 'Alemán', native: 'Deutsch' },
  { code: 'fr', label: 'Francés', native: 'Français' },
  { code: 'it', label: 'Italiano', native: 'Italiano' },
  { code: 'pt', label: 'Portugués', native: 'Português' },
  { code: 'ru', label: 'Ruso', native: 'Русский' },
  { code: 'ja', label: 'Japonés', native: '日本語' },
  { code: 'ko', label: 'Coreano', native: '한국어' },
  { code: 'zh', label: 'Chino', native: '中文' }
]

export type GpuVendor = 'nvidia' | 'amd' | 'intel' | 'other'

export interface GpuInfo {
  name: string
  vramMB: number
  vendor: GpuVendor
  driverVersion?: string
}

export interface VulkanDevice {
  index: number
  name: string
  vramMB: number
  freeMB: number
}

export interface HardwareInfo {
  os: string
  cpuModel: string
  cpuCores: number
  cpuThreads: number
  ramGB: number
  gpus: GpuInfo[]
  primaryGpuName: string | null
  hasVulkan: boolean
  vulkanDevices: VulkanDevice[]
  selectedVulkanIndex: number | null
  diskFreeGB: number
}

export interface Calibration {
  backend: Backend
  fps: number
  loadSec: number
  charsPerSec: number
  updatedAt: string
}

export interface AppSettings {
  backend: BackendPreference
  language: LanguageCode
  maxChars: number
  playPreset: PresetId
  engineTested: boolean
  knownVulkanIndex: number | null
  calibration: Calibration | null
}

export const DEFAULT_SETTINGS: AppSettings = {
  backend: 'auto',
  language: 'es',
  maxChars: 3000,
  playPreset: 'studio',
  engineTested: false,
  knownVulkanIndex: null,
  calibration: null
}

export interface ModelFileState {
  name: string
  expectedBytes: number
  presentBytes: number
  ready: boolean
}

export interface SetupState {
  appVersion: string
  dataRoot: string
  runtimeReady: boolean
  runtimePath: string
  modelReady: boolean
  modelBytes: number
  modelTotalBytes: number
  modelFiles: ModelFileState[]
  hardware: HardwareInfo
  settings: AppSettings
  backend: Backend | null
  canRun: boolean
}

export type DownloadPhase = 'runtime' | 'model'
export type DownloadStatus = 'preparing' | 'downloading' | 'verifying' | 'done' | 'error' | 'cancelled'

export interface DownloadProgress {
  phase: DownloadPhase
  fileName: string
  fileIndex: number
  fileCount: number
  received: number
  total: number
  percent: number
  overallPercent: number
  speedBps: number
  etaSec: number | null
  status: DownloadStatus
  message?: string
}

export type GenerationStage =
  | 'queued'
  | 'loading'
  | 'prompt'
  | 'generating'
  | 'vocoding'
  | 'done'
  | 'error'
  | 'cancelled'

export interface GenerateRequest {
  text: string
  language: LanguageCode
  voiceFile: string | null
  preset: PresetId
}

export interface GenerationPlan {
  jobId: string
  chars: number
  estimatedAudioSec: number
  estimatedTotalSec: number
  totalFrames: number
}

export interface GenerationProgress {
  jobId: string
  stage: GenerationStage
  frames: number
  totalFrames: number
  fps: number
  percent: number
  etaSec: number | null
  elapsedSec: number
  message?: string
}

export interface HistoryEntry {
  id: string
  createdAt: string
  text: string
  language: LanguageCode
  preset: PresetId
  rawFile: string
  audioFile: string
  fileName: string
  durationSec: number
  sampleRate: number
  chars: number
  voiceName: string
  backend: Backend
  rtf: number
}

export interface VoiceInfo {
  fileName: string
  name: string
  durationSec: number
  sampleRate: number
  createdAt: string
}

export interface StoredVoice {
  info: VoiceInfo
  data: ArrayBuffer
}

export interface EngineTestResult {
  ok: boolean
  backend: Backend | null
  fps: number | null
  loadSec: number | null
  message: string
  logs?: string
}

export interface AppInfo {
  version: string
  dataRoot: string
  runtimePath: string
  modelReady: boolean
}

export interface ExportRequest {
  fileName: string
  format: 'wav' | 'mp3'
  data: ArrayBuffer
}

export interface SaveProcessedRequest {
  id: string
  preset: PresetId
  data: ArrayBuffer
  durationSec: number
}

export interface ReferencePayload {
  data: ArrayBuffer
  name: string
  durationSec: number
  sampleRate: number
}

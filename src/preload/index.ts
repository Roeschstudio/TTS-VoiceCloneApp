import { contextBridge, ipcRenderer } from 'electron'
import {
  AppInfo,
  AppSettings,
  DownloadProgress,
  EngineTestResult,
  ExportRequest,
  GenerateRequest,
  GenerationProgress,
  HistoryEntry,
  ReferencePayload,
  SaveProcessedRequest,
  SetupState,
  StoredVoice,
  VoiceInfo
} from '@shared/types'

function on<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  getState: (): Promise<SetupState> => ipcRenderer.invoke('app:get-state'),
  refreshHardware: (): Promise<SetupState> => ipcRenderer.invoke('app:refresh-hardware'),
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:info'),

  startDownload: (): Promise<{ started: boolean; running: boolean }> => ipcRenderer.invoke('download:start'),
  cancelDownload: (): Promise<{ running: boolean }> => ipcRenderer.invoke('download:cancel'),
  getDownloadProgress: (): Promise<DownloadProgress | null> => ipcRenderer.invoke('download:progress'),
  resetDownload: (): Promise<SetupState> => ipcRenderer.invoke('download:reset'),
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) =>
    on<DownloadProgress>('download:progress', callback),

  testEngine: (): Promise<EngineTestResult> => ipcRenderer.invoke('engine:test'),
  generate: (request: GenerateRequest): Promise<HistoryEntry> => ipcRenderer.invoke('engine:generate', request),
  cancelGeneration: (): Promise<{ cancelled: boolean }> => ipcRenderer.invoke('engine:cancel'),
  getEngineLogs: (): Promise<string> => ipcRenderer.invoke('engine:logs'),
  onGenerationProgress: (callback: (progress: GenerationProgress) => void) =>
    on<GenerationProgress>('engine:progress', callback),

  getReference: (): Promise<StoredVoice | null> => ipcRenderer.invoke('voice:get'),
  saveReference: (payload: ReferencePayload): Promise<VoiceInfo> => ipcRenderer.invoke('voice:save', payload),
  deleteReference: (): Promise<boolean> => ipcRenderer.invoke('voice:delete'),

  listHistory: (): Promise<HistoryEntry[]> => ipcRenderer.invoke('library:list'),
  getAudio: (file: string): Promise<ArrayBuffer> => ipcRenderer.invoke('library:audio', file),
  saveProcessed: (request: SaveProcessedRequest): Promise<HistoryEntry> =>
    ipcRenderer.invoke('library:save-processed', request),
  deleteHistory: (id: string): Promise<HistoryEntry[]> => ipcRenderer.invoke('library:delete', id),
  exportAudio: (request: ExportRequest): Promise<string | null> => ipcRenderer.invoke('library:export', request),

  updateSettings: (patch: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:update', patch),
  openDataFolder: (sub = ''): Promise<boolean> => ipcRenderer.invoke('shell:open-data', sub),
  revealFile: (file: string): Promise<boolean> => ipcRenderer.invoke('shell:reveal', file)
}

contextBridge.exposeInMainWorld('roesch', api)

export type RoeschAPI = typeof api

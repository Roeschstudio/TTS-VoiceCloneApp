import { app, BrowserWindow, ipcMain, Menu, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  AppSettings,
  ExportRequest,
  GenerateRequest,
  ReferencePayload,
  SaveProcessedRequest,
  SetupState
} from '@shared/types'
import { getPaths } from './paths'
import { getSettings, updateSettings } from './settings'
import { detectHardware, resetHardwareCache, resolveBackend } from './hardware'
import { deleteModelFiles, getModelFiles, isModelReady, MODEL_FILES, MODEL_TOTAL_BYTES, runtimeExists } from './models'
import {
  cancelDownload,
  getDownloadProgress,
  isDownloadRunning,
  startModelDownload
} from './download'
import {
  cancelGeneration,
  generateAudio,
  getEngineLogs,
  isGenerating,
  testEngine
} from './engine'
import {
  deleteHistory,
  deleteReference,
  exportAudio,
  getAudio,
  getReference,
  listHistory,
  openDataFolder,
  revealFile,
  saveProcessed,
  saveReference
} from './library'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  const { width: areaWidth, height: areaHeight } = screen.getPrimaryDisplay().workAreaSize
  const width = Math.min(1320, Math.max(960, areaWidth - 48))
  const height = Math.min(900, Math.max(640, areaHeight - 48))
  const iconPath = path.join(app.getAppPath(), 'build', 'icon.png')

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: Math.min(980, areaWidth - 40),
    minHeight: Math.min(660, areaHeight - 40),
    center: true,
    show: false,
    backgroundColor: '#0d0b0a',
    autoHideMenuBar: true,
    title: 'Roesch TTS',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL()
    if (url !== current) event.preventDefault()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function buildSetupState(): Promise<SetupState> {
  const hardware = await detectHardware()
  const settings = getSettings()
  const files = getModelFiles()
  const runtimeReady = runtimeExists()
  return {
    appVersion: app.getVersion(),
    dataRoot: getPaths().dataRoot,
    runtimeReady,
    runtimePath: getPaths().runtimePath,
    modelReady: isModelReady(),
    modelBytes: files.reduce((acc, file) => acc + file.presentBytes, 0),
    modelTotalBytes: MODEL_TOTAL_BYTES,
    modelFiles: files,
    hardware,
    settings,
    backend: resolveBackend(hardware, settings.backend),
    canRun: runtimeReady && isModelReady()
  }
}

function registerIpc(): void {
  ipcMain.handle('app:get-state', async () => buildSetupState())

  ipcMain.handle('app:refresh-hardware', async () => {
    resetHardwareCache()
    return buildSetupState()
  })

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    dataRoot: getPaths().dataRoot,
    runtimePath: getPaths().runtimePath,
    modelReady: isModelReady()
  }))

  ipcMain.handle('download:start', async () => {
    if (!runtimeExists()) throw new Error('Falta el motor de voz en la instalación')
    if (isDownloadRunning()) return { started: false, running: true }
    void startModelDownload()
    return { started: true, running: true }
  })

  ipcMain.handle('download:cancel', () => {
    cancelDownload()
    return { running: isDownloadRunning() }
  })

  ipcMain.handle('download:progress', () => getDownloadProgress())

  ipcMain.handle('download:reset', () => {
    if (isDownloadRunning()) throw new Error('Cancela la descarga antes de borrar el modelo')
    deleteModelFiles()
    return buildSetupState()
  })

  ipcMain.handle('engine:test', async () => testEngine())

  ipcMain.handle('engine:generate', async (_event, request: GenerateRequest) => {
    if (isDownloadRunning()) throw new Error('Espera a que termine la descarga del modelo')
    if (isGenerating()) throw new Error('Ya hay una generación en curso')
    const text = String(request.text || '').trim()
    if (!text) throw new Error('Escribe un texto para generar')
    const reference = getReference()
    const voicePath = reference ? path.join(getPaths().referenceWav) : null
    return generateAudio({ ...request, text, voiceFile: voicePath })
  })

  ipcMain.handle('engine:cancel', () => {
    cancelGeneration()
    return { cancelled: true }
  })

  ipcMain.handle('engine:logs', () => getEngineLogs())

  ipcMain.handle('voice:get', () => getReference())

  ipcMain.handle('voice:save', (_event, payload: ReferencePayload) => {
    if (!payload?.data || payload.data.byteLength > 20 * 1024 * 1024) {
      throw new Error('Audio de referencia no válido')
    }
    return saveReference(payload)
  })

  ipcMain.handle('voice:delete', () => {
    deleteReference()
    return true
  })

  ipcMain.handle('library:list', () => listHistory())

  ipcMain.handle('library:audio', (_event, file: string) => getAudio(String(file)))

  ipcMain.handle('library:save-processed', (_event, request: SaveProcessedRequest) => {
    if (!request?.data || request.data.byteLength > 60 * 1024 * 1024) {
      throw new Error('Audio procesado no válido')
    }
    return saveProcessed({ ...request, id: String(request.id) })
  })

  ipcMain.handle('library:delete', (_event, id: string) => {
    deleteHistory(String(id))
    return listHistory()
  })

  ipcMain.handle('library:export', (_event, request: ExportRequest) => {
    if (!request?.data || request.data.byteLength > 60 * 1024 * 1024) {
      throw new Error('Audio no válido para exportar')
    }
    return exportAudio(mainWindow, request)
  })

  ipcMain.handle('settings:update', (_event, patch: Partial<AppSettings>) => {
    const allowed: Partial<AppSettings> = {}
    if (patch.backend === 'auto' || patch.backend === 'vulkan' || patch.backend === 'cpu') {
      allowed.backend = patch.backend
    }
    if (typeof patch.language === 'string') allowed.language = patch.language
    if (typeof patch.maxChars === 'number' && Number.isFinite(patch.maxChars)) {
      allowed.maxChars = Math.min(6000, Math.max(500, Math.round(patch.maxChars)))
    }
    if (patch.playPreset) allowed.playPreset = patch.playPreset
    if (typeof patch.engineTested === 'boolean') allowed.engineTested = patch.engineTested
    return updateSettings(allowed)
  })

  ipcMain.handle('shell:open-data', (_event, sub: string) => {
    openDataFolder(String(sub || ''))
    return true
  })

  ipcMain.handle('shell:reveal', (_event, file: string) => {
    revealFile(String(file))
    return true
  })
}

app.setName('Roesch TTS')
app.setAppUserModelId('com.roesch.tts')
if (!app.isPackaged) app.commandLine.appendSwitch('remote-debugging-port', '9222')
if (process.env.ROESCH_DEBUG_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.ROESCH_DEBUG_PORT)
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    getPaths()
    registerIpc()
    void detectHardware()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    cancelGeneration()
    cancelDownload()
  })
}

import { AlertTriangle, Download, History, Loader2, Settings2, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  AppSettings,
  DownloadProgress,
  EngineTestResult,
  GenerationProgress,
  HistoryEntry,
  LanguageCode,
  PresetId,
  SetupState,
  StoredVoice
} from '@shared/types'
import { decodeToMono, encodeWav, TTS_SAMPLE_RATE } from './lib/audio'
import { processPreset, PRESET_META } from './lib/dsp'
import { encodeMp3 } from './lib/mp3'
import { formatDate, friendlyError, safeFileName } from './lib/format'
import { Logo } from './components/Logo'
import { SetupScreen } from './components/SetupScreen'
import { VoicePanel } from './components/VoicePanel'
import { EditorPanel } from './components/EditorPanel'
import { ResultPanel } from './components/ResultPanel'
import { HistoryDrawer } from './components/HistoryDrawer'
import { SettingsModal } from './components/SettingsModal'
import { LogsModal } from './components/LogsModal'
import { ToastItem, ToastType, Toasts } from './components/Toasts'

const RECOMMENDED_CHARS = 1500

export default function App(): React.JSX.Element {
  const [state, setState] = useState<SetupState | null>(null)
  const [voice, setVoice] = useState<StoredVoice | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [result, setResult] = useState<HistoryEntry | null>(null)
  const [text, setText] = useState('')
  const [language, setLanguage] = useState<LanguageCode>('es')
  const [download, setDownload] = useState<DownloadProgress | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<EngineTestResult | null>(null)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState<GenerationProgress | null>(null)
  const [processingPreset, setProcessingPreset] = useState(false)
  const [downloading, setDownloading] = useState<'wav' | 'mp3' | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fatal, setFatal] = useState<string | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)
  const toastId = useRef(1)
  const autoDownload = useRef(false)
  const autoTest = useRef(false)

  const pushToast = (message: string, type: ToastType = 'info'): void => {
    const id = toastId.current++
    setToasts((current) => [...current, { id, message, type }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, type === 'error' ? 7000 : 4500)
  }

  const refreshState = async (): Promise<SetupState | null> => {
    try {
      const next = await window.roesch.getState()
      setState(next)
      setLanguage(next.settings.language)
      return next
    } catch (error) {
      console.error(error)
      return null
    }
  }

  useEffect(() => {
    const init = async (): Promise<void> => {
      try {
        const [setup, storedVoice, entries, downloadState] = await Promise.all([
          window.roesch.getState(),
          window.roesch.getReference(),
          window.roesch.listHistory(),
          window.roesch.getDownloadProgress()
        ])
        setState(setup)
        setLanguage(setup.settings.language)
        setVoice(storedVoice)
        setHistory(entries)
        setDownload(downloadState)
      } catch (error) {
        setFatal(friendlyError(error))
      } finally {
        setLoading(false)
      }
    }
    void init()
  }, [])

  useEffect(() => {
    const offDownload = window.roesch.onDownloadProgress((next) => {
      setDownload(next)
      if (next.status === 'done') {
        void refreshState()
      }
      if (next.status === 'error') {
        pushToast(next.message ?? 'La descarga del modelo falló.', 'error')
      }
    })
    const offGeneration = window.roesch.onGenerationProgress((next) => {
      setProgress(next)
      if (next.stage === 'done') {
        void refreshState()
      }
    })
    return () => {
      offDownload()
      offGeneration()
    }
  }, [])

  useEffect(() => {
    if (!state || state.modelReady || download?.status === 'downloading' || autoDownload.current) return
    autoDownload.current = true
    void window.roesch.startDownload().catch((error) => {
      pushToast(friendlyError(error), 'error')
    })
  }, [state, download?.status])

  useEffect(() => {
    if (!state || !state.modelReady || state.settings.engineTested || autoTest.current) return
    autoTest.current = true
    void runEngineTest()
  }, [state])

  useEffect(() => {
    if (!result) return
    const timer = window.setTimeout(() => {
      document.querySelector('.result-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 140)
    return () => window.clearTimeout(timer)
  }, [result?.id])

  const runEngineTest = async (): Promise<void> => {
    if (testing) return
    setTesting(true)
    setTestResult(null)
    try {
      const outcome = await window.roesch.testEngine()
      setTestResult(outcome)
      if (outcome.ok) {
        pushToast(outcome.message, 'success')
        await refreshState()
      } else {
        pushToast(outcome.message, 'error')
      }
    } catch (error) {
      const message = friendlyError(error)
      setTestResult({ ok: false, backend: null, fps: null, loadSec: null, message })
      pushToast(message, 'error')
    } finally {
      setTesting(false)
      setProgress(null)
    }
  }

  const handleStartDownload = (): void => {
    autoDownload.current = true
    void window.roesch.startDownload().catch((error) => pushToast(friendlyError(error), 'error'))
  }

  const handleCancelDownload = (): void => {
    void window.roesch.cancelDownload()
  }

  const handleSkipTest = async (): Promise<void> => {
    await window.roesch.updateSettings({ engineTested: true })
    await refreshState()
  }

  const handleGenerate = async (): Promise<void> => {
    if (!state || generating) return
    if (!voice) {
      pushToast('Añade una voz de referencia antes de generar.', 'error')
      return
    }
    const body = text.trim()
    if (!body) return
    if (body.length > state.settings.maxChars) {
      pushToast('El texto supera el límite de caracteres.', 'error')
      return
    }

    setGenerating(true)
    setLastError(null)
    setResult(null)
    setProgress({
      jobId: 'starting',
      stage: 'queued',
      frames: 0,
      totalFrames: 1,
      fps: 0,
      percent: 1,
      etaSec: null,
      elapsedSec: 0,
      message: 'Preparando la generación…'
    })

    try {
      const entry = await window.roesch.generate({
        text: body,
        language,
        voiceFile: null,
        preset: 'original'
      })
      setResult(entry)
      setHistory((current) => [entry, ...current.filter((item) => item.id !== entry.id)])
      setProgress(null)
      const targetPreset = state.settings.playPreset
      if (targetPreset !== 'original') {
        await applyPreset(entry, targetPreset)
      }
      void refreshState()
    } catch (error) {
      const message = friendlyError(error)
      if (message.includes('CANCELLED')) {
        pushToast('Generación cancelada.', 'info')
      } else {
        setLastError(message)
        pushToast(message, 'error')
      }
    } finally {
      setGenerating(false)
      setProgress(null)
    }
  }

  const applyPreset = async (entry: HistoryEntry, preset: PresetId): Promise<void> => {
    if (processingPreset) return
    setProcessingPreset(true)
    try {
      const raw = await window.roesch.getAudio(entry.rawFile)
      const samples = await decodeToMono(raw, TTS_SAMPLE_RATE)
      const processed = processPreset(samples, TTS_SAMPLE_RATE, preset)
      const wav = encodeWav(processed, TTS_SAMPLE_RATE)
      const updated = await window.roesch.saveProcessed({
        id: entry.id,
        preset,
        data: wav,
        durationSec: processed.length / TTS_SAMPLE_RATE
      })
      setResult(updated)
      setHistory((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    } catch (error) {
      pushToast(friendlyError(error), 'error')
    } finally {
      setProcessingPreset(false)
    }
  }

  const handleCancelGeneration = (): void => {
    void window.roesch.cancelGeneration()
  }

  const handleVoiceSaved = (stored: StoredVoice): void => setVoice(stored)
  const handleVoiceDeleted = (): void => setVoice(null)

  const handleSelectHistory = (entry: HistoryEntry): void => {
    setResult(entry)
    setHistoryOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDeleteHistory = async (entry: HistoryEntry): Promise<void> => {
    if (!window.confirm('¿Eliminar este audio del historial y del disco?')) return
    try {
      const entries = await window.roesch.deleteHistory(entry.id)
      setHistory(entries)
      if (result?.id === entry.id) setResult(null)
      pushToast('Audio eliminado.', 'info')
    } catch (error) {
      pushToast(friendlyError(error), 'error')
    }
  }

  const handleDownload = async (entry: HistoryEntry, format: 'wav' | 'mp3'): Promise<void> => {
    if (downloading) return
    setDownloading(format)
    try {
      const buffer = await window.roesch.getAudio(entry.audioFile)
      let data = buffer
      if (format === 'mp3') {
        const samples = await decodeToMono(buffer, TTS_SAMPLE_RATE)
        data = encodeMp3(samples, TTS_SAMPLE_RATE)
      }
      const fileName = safeFileName(`Roesch TTS ${formatDate(entry.createdAt)} ${PRESET_META[entry.preset].name}`)
      const saved = await window.roesch.exportAudio({ fileName, format, data })
      if (saved) pushToast(`Audio guardado en ${saved}`, 'success')
    } catch (error) {
      pushToast(friendlyError(error), 'error')
    } finally {
      setDownloading(null)
    }
  }

  const handleUpdateSettings = async (patch: Partial<AppSettings>): Promise<void> => {
    try {
      const next = await window.roesch.updateSettings(patch)
      setState((current) => (current ? { ...current, settings: next } : current))
      await refreshState()
    } catch (error) {
      pushToast(friendlyError(error), 'error')
    }
  }

  const handleResetModel = async (): Promise<void> => {
    try {
      const next = await window.roesch.resetDownload()
      setState(next)
      setTestResult(null)
      autoTest.current = false
      pushToast('Modelo eliminado. Descárgalo de nuevo para generar voz.', 'info')
    } catch (error) {
      pushToast(friendlyError(error), 'error')
    }
  }

  const handleOpenData = (sub = ''): void => {
    void window.roesch.openDataFolder(sub)
  }

  if (loading) {
    return (
      <div className="splash">
        <Logo size={72} />
        <div className="splash-title">Roesch TTS</div>
        <div className="splash-loader">
          <Loader2 className="spin" size={18} /> Detectando el equipo…
        </div>
      </div>
    )
  }

  if (fatal) {
    return (
      <div className="splash">
        <div className="fatal-card">
          <AlertTriangle size={28} />
          <h1>No se pudo iniciar Roesch TTS</h1>
          <p>{fatal}</p>
        </div>
      </div>
    )
  }

  if (!state) return <div className="splash" />

  const needsSetup = !state.modelReady || !state.settings.engineTested

  if (needsSetup) {
    return (
      <>
        <SetupScreen
          state={state}
          download={download}
          testing={testing}
          testResult={testResult}
          onStartDownload={handleStartDownload}
          onCancelDownload={handleCancelDownload}
          onTest={() => void runEngineTest()}
          onSkip={() => void handleSkipTest()}
          onOpenFolder={() => handleOpenData('')}
          onShowLogs={() => setLogsOpen(true)}
        />
        {logsOpen && <LogsModal open onClose={() => setLogsOpen(false)} />}
        <Toasts toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
      </>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <Logo size={38} withText />
        <div className="topbar-sep" />
        <span className="topbar-label">Estudio local</span>
        <div className="topbar-actions">
          <span className={`device-chip ${state.backend === 'vulkan' ? 'active' : ''}`}>
            <span className="dot" />
            {state.backend === 'vulkan' ? 'GPU · Vulkan' : 'CPU'}
          </span>
          <button className="button subtle" onClick={() => setHistoryOpen(true)}>
            <History size={16} /> Historial
            {history.length > 0 && <span className="count-badge">{history.length}</span>}
          </button>
          <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Ajustes">
            <Settings2 size={18} />
          </button>
        </div>
      </header>

      <main className="workspace">
        <section className="workspace-head">
          <div>
            <div className="eyebrow">
              <Sparkles size={13} /> QWEN3-TTS · 100 % LOCAL
            </div>
            <h1>
              Da vida a tus <em>palabras.</em>
            </h1>
            <p>Sube tu voz, escribe el guion y obtén una narración con acabado de estudio.</p>
          </div>
          <div className="session-info">
            <div>
              <span>Modelo</span>
              <strong>Qwen3-TTS 1.7B</strong>
            </div>
            <div>
              <span>Motor</span>
              <strong>{state.settings.calibration ? `${state.settings.calibration.fps.toFixed(1)} fps` : 'Sin calibrar'}</strong>
            </div>
            <div>
              <span>Máximo</span>
              <strong>{state.settings.maxChars.toLocaleString('es-ES')} car.</strong>
            </div>
          </div>
        </section>

        {lastError && (
          <div className="error-banner">
            <AlertTriangle size={18} />
            <div>
              <strong>No se pudo generar el audio</strong>
              <p>{lastError}</p>
            </div>
            <button className="icon-button" onClick={() => setLastError(null)} aria-label="Cerrar error">
              <X size={16} />
            </button>
          </div>
        )}

        <div className="studio-grid">
          <VoicePanel
            voice={voice}
            onVoiceSaved={handleVoiceSaved}
            onVoiceDeleted={handleVoiceDeleted}
            onToast={pushToast}
          />
          <EditorPanel
            text={text}
            onTextChange={setText}
            language={language}
            onLanguageChange={(next) => {
              setLanguage(next)
              void window.roesch.updateSettings({ language: next })
            }}
            maxChars={state.settings.maxChars}
            recommendedChars={RECOMMENDED_CHARS}
            calibration={state.settings.calibration}
            backend={state.backend ?? 'cpu'}
            voiceReady={Boolean(voice)}
            generating={generating}
            progress={progress}
            onGenerate={() => void handleGenerate()}
            onCancel={handleCancelGeneration}
          />
        </div>

        {result && (
          <ResultPanel
            entry={result}
            processing={processingPreset}
            downloading={downloading}
            onPresetChange={(preset) => void applyPreset(result, preset)}
            onDownload={(format) => void handleDownload(result, format)}
            onOpenFolder={() => handleOpenData('audios')}
            onClose={() => setResult(null)}
          />
        )}

        {!result && (
          <section className="empty-result">
            <div className="empty-result-icon">
              <Download size={20} />
            </div>
            <div>
              <strong>Tu audio aparecerá aquí</strong>
              <p>Se guardará automáticamente en la carpeta de audios, listo para descargar en WAV o MP3.</p>
            </div>
            <span className="empty-result-meta">
              <ShieldCheck size={14} /> Sin subir nada a la nube
            </span>
          </section>
        )}
      </main>

      <footer className="app-footer">
        <span>
          <span className="dot good" /> {voice ? `Voz: ${voice.info.name}` : 'Sin voz de referencia'}
        </span>
        <span>{state.dataRoot}</span>
        <span>v{state.appVersion}</span>
      </footer>

      <HistoryDrawer
        open={historyOpen}
        entries={history}
        onClose={() => setHistoryOpen(false)}
        onSelect={handleSelectHistory}
        onDelete={(entry) => void handleDeleteHistory(entry)}
        onDownload={(entry, format) => void handleDownload(entry, format)}
        onOpenFolder={() => handleOpenData('audios')}
      />

      {settingsOpen && (
        <SettingsModal
          open
          state={state}
          testing={testing}
          testResult={testResult}
          onClose={() => setSettingsOpen(false)}
          onUpdate={(patch) => void handleUpdateSettings(patch)}
          onRetest={() => void runEngineTest()}
          onResetModel={() => void handleResetModel()}
          onOpenFolder={handleOpenData}
          onShowLogs={() => setLogsOpen(true)}
        />
      )}

      {logsOpen && <LogsModal open onClose={() => setLogsOpen(false)} />}
      <Toasts toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
    </div>
  )
}

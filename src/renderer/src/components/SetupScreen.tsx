import {
  AlertTriangle,
  Check,
  Cpu,
  Download,
  FolderOpen,
  Gauge,
  HardDrive,
  Loader2,
  MemoryStick,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Zap
} from 'lucide-react'
import { DownloadProgress, EngineTestResult, SetupState } from '@shared/types'
import { formatBytes, formatEta, formatPercent, formatSpeed } from '../lib/format'
import { Logo } from './Logo'

interface SetupScreenProps {
  state: SetupState
  download: DownloadProgress | null
  testing: boolean
  testResult: EngineTestResult | null
  onStartDownload: () => void
  onCancelDownload: () => void
  onTest: () => void
  onSkip: () => void
  onOpenFolder: () => void
  onShowLogs: () => void
}

export function SetupScreen({
  state,
  download,
  testing,
  testResult,
  onStartDownload,
  onCancelDownload,
  onTest,
  onSkip,
  onOpenFolder,
  onShowLogs
}: SetupScreenProps): React.JSX.Element {
  const hw = state.hardware
  const selectedVulkan = hw.vulkanDevices.find((device) => device.index === hw.selectedVulkanIndex)
  const downloading =
    download?.status === 'downloading' || download?.status === 'preparing' || download?.status === 'verifying'
  const downloadError = download?.status === 'error'
  const modelReady = state.modelReady

  return (
    <div className="setup">
      <div className="setup-glow" aria-hidden="true" />
      <div className="setup-shell">
        <header className="setup-header">
          <Logo size={58} />
          <div>
            <div className="eyebrow">ESTUDIO DE VOZ LOCAL</div>
            <h1>
              Roesch <span>TTS</span>
            </h1>
            <p>Clonación de voz y narración con Qwen3-TTS. Sin nube, sin cuentas, sin límites.</p>
          </div>
        </header>

        <div className="steps">
          <div className="step done">
            <span>
              <Check size={13} />
            </span>
            Motor
          </div>
          <div className={`step ${modelReady ? 'done' : 'active'}`}>
            <span>{modelReady ? <Check size={13} /> : '2'}</span>
            Modelo
          </div>
          <div className={`step ${modelReady && (testing || testResult?.ok) ? 'active' : ''}`}>
            <span>{testResult?.ok ? <Check size={13} /> : '3'}</span>
            Prueba
          </div>
        </div>

        <section className="hardware-grid">
          <div className="hardware-card">
            <Cpu size={18} />
            <div>
              <span>Procesador</span>
              <strong>{hw.cpuModel}</strong>
              <em>
                {hw.cpuCores} núcleos · {hw.cpuThreads} hilos
              </em>
            </div>
          </div>
          <div className="hardware-card">
            <MemoryStick size={18} />
            <div>
              <span>Memoria</span>
              <strong>{hw.ramGB} GB RAM</strong>
              <em>{hw.diskFreeGB} GB libres en disco</em>
            </div>
          </div>
          <div className="hardware-card">
            <Monitor size={18} />
            <div>
              <span>Gráfica</span>
              <strong>{selectedVulkan?.name ?? hw.gpus.find((gpu) => !/Radeon\(TM\) Graphics/i.test(gpu.name))?.name ?? 'CPU'}</strong>
              <em>{selectedVulkan ? `${(selectedVulkan.freeMB / 1024).toFixed(1)} GB VRAM libres` : 'Se usará el procesador'}</em>
            </div>
          </div>
          <div className="hardware-card">
            <Zap size={18} />
            <div>
              <span>Aceleración</span>
              <strong>{state.backend === 'vulkan' ? 'Vulkan' : 'CPU'}</strong>
              <em>{hw.hasVulkan ? 'GPU AMD detectada' : 'Sin Vulkan disponible'}</em>
            </div>
          </div>
        </section>

        {!modelReady ? (
          <section className="setup-card">
            <div className="setup-card-head">
              <div className="setup-icon">
                <Download size={22} />
              </div>
              <div>
                <h2>Descargar el modelo de voz</h2>
                <p>
                  Qwen3-TTS 1.7B · {formatBytes(state.modelTotalBytes)} desde Hugging Face. Se guarda en la carpeta de la
                  aplicación y solo se descarga una vez.
                </p>
              </div>
              <span className="pill">Apache-2.0</span>
            </div>

            {download && (downloading || downloadError) && (
              <div className="download-panel">
                <div className="progress-head">
                  <span className="progress-label">
                    {download.status === 'verifying'
                      ? 'Verificando archivo…'
                      : download.fileName.replace('.gguf', '')}
                  </span>
                  <span className="mono">{formatPercent(download.overallPercent)}</span>
                </div>
                <div className={`progress-track ${downloadError ? 'error' : ''}`}>
                  <div className="progress-fill" style={{ width: `${download.overallPercent}%` }} />
                </div>
                <div className="download-meta">
                  <span>
                    {formatBytes(download.received)} / {formatBytes(state.modelTotalBytes)}
                  </span>
                  <span>{formatSpeed(download.speedBps)}</span>
                  <span>{download.etaSec !== null ? `Quedan ${formatEta(download.etaSec)}` : 'Preparando…'}</span>
                </div>
                {downloadError && (
                  <div className="inline-alert">
                    <AlertTriangle size={15} />
                    {download.message ?? 'La descarga falló. Revisa la conexión y reintenta.'}
                  </div>
                )}
                <div className="setup-actions">
                  {download.status === 'verifying' ? (
                    <span className="tiny">Comprobando la integridad del archivo…</span>
                  ) : downloading ? (
                    <button className="button ghost" onClick={onCancelDownload}>
                      Cancelar descarga
                    </button>
                  ) : (
                    <button className="button primary" onClick={onStartDownload}>
                      <RefreshCw size={16} /> Reanudar descarga
                    </button>
                  )}
                </div>
              </div>
            )}

            {(!download || (!downloading && !downloadError && download.status !== 'done')) && (
              <div className="setup-actions">
                <button className="button primary large" onClick={onStartDownload}>
                  <Download size={18} /> Descargar modelo ({formatBytes(state.modelTotalBytes)})
                </button>
              </div>
            )}

            <div className="setup-note">
              <ShieldCheck size={15} /> Descarga directa por HTTPS. Nada de tu voz o tus textos sale del equipo.
            </div>
          </section>
        ) : (
          <section className="setup-card">
            <div className="setup-card-head">
              <div className={`setup-icon ${testResult?.ok ? 'success' : ''}`}>
                {testing ? <Loader2 className="spin" size={22} /> : testResult?.ok ? <Gauge size={22} /> : <Zap size={22} />}
              </div>
              <div>
                <h2>{testing ? 'Probando el motor de voz' : testResult?.ok ? 'Motor preparado' : 'Prueba final del motor'}</h2>
                <p>
                  {testing
                    ? 'Generando una frase corta para comprobar el modelo y la aceleración por GPU. La primera vez puede tardar hasta un minuto.'
                    : testResult?.ok
                      ? testResult.message
                      : 'Antes de entrar, comprobamos que el modelo puede generar audio en este equipo.'}
                </p>
              </div>
              <span className={`pill ${testResult?.ok ? 'good' : ''}`}>
                {testResult?.ok ? 'Listo' : state.backend === 'vulkan' ? 'Vulkan' : 'CPU'}
              </span>
            </div>

            {testResult?.ok && (
              <div className="engine-stats">
                <div>
                  <span>Velocidad</span>
                  <strong>{testResult.fps?.toFixed(1) ?? '—'} fps</strong>
                </div>
                <div>
                  <span>Carga del modelo</span>
                  <strong>{testResult.loadSec?.toFixed(1) ?? '—'} s</strong>
                </div>
                <div>
                  <span>Modo</span>
                  <strong>{testResult.backend === 'vulkan' ? 'GPU · Vulkan' : 'CPU'}</strong>
                </div>
              </div>
            )}

            {testResult && !testResult.ok && (
              <div className="inline-alert">
                <AlertTriangle size={16} />
                <div>
                  <strong>No se pudo iniciar el motor.</strong>
                  <p>{testResult.message}</p>
                </div>
              </div>
            )}

            {!testing && (
              <div className="setup-actions">
                {!testResult?.ok && (
                  <button className="button primary" onClick={onTest}>
                    <RefreshCw size={16} /> Probar de nuevo
                  </button>
                )}
                {testResult?.ok ? (
                  <button className="button primary" onClick={onTest}>
                    <RefreshCw size={16} /> Repetir prueba
                  </button>
                ) : (
                  <button className="button ghost" onClick={onSkip}>
                    Continuar de todos modos
                  </button>
                )}
                <button className="button ghost" onClick={onShowLogs}>
                  Ver registro
                </button>
                <button className="button ghost" onClick={onOpenFolder}>
                  <FolderOpen size={16} /> Abrir carpeta
                </button>
              </div>
            )}

            <div className="setup-note">
              <HardDrive size={15} /> Modelo en {state.dataRoot}
            </div>
          </section>
        )}

        <footer className="setup-footer">
          <span>Roesch TTS v{state.appVersion}</span>
          <span>Qwen3-TTS · llama.cpp · 100 % local</span>
        </footer>
      </div>
    </div>
  )
}

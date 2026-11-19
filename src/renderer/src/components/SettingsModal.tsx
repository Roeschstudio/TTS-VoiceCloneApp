import {
  AlertTriangle,
  Check,
  Cpu,
  FolderOpen,
  Gauge,
  HardDrive,
  Loader2,
  Monitor,
  RefreshCw,
  Settings2,
  Terminal,
  Trash2,
  X,
  Zap
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { AppSettings, BackendPreference, EngineTestResult, PresetId, SetupState } from '@shared/types'
import { PRESET_META } from '../lib/dsp'
import { formatBytes, formatDate } from '../lib/format'

interface SettingsModalProps {
  open: boolean
  state: SetupState
  testing: boolean
  testResult: EngineTestResult | null
  onClose: () => void
  onUpdate: (patch: Partial<AppSettings>) => void
  onRetest: () => void
  onResetModel: () => void
  onOpenFolder: (sub?: string) => void
  onShowLogs: () => void
}

export function SettingsModal({
  open,
  state,
  testing,
  testResult,
  onClose,
  onUpdate,
  onRetest,
  onResetModel,
  onOpenFolder,
  onShowLogs
}: SettingsModalProps): React.JSX.Element {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const calibration = state.settings.calibration
  const [maxChars, setMaxChars] = useState(state.settings.maxChars)
  const clampChars = (value: number): number =>
    Math.min(6000, Math.max(500, Number.isFinite(value) ? Math.round(value) : 500))

  useEffect(() => {
    setMaxChars(state.settings.maxChars)
  }, [state.settings.maxChars])

  useEffect(() => {
    const clamped = clampChars(maxChars)
    if (clamped !== maxChars) {
      setMaxChars(clamped)
      return
    }
    if (maxChars === state.settings.maxChars) return
    const timer = window.setTimeout(() => onUpdate({ maxChars }), 600)
    return () => window.clearTimeout(timer)
  }, [maxChars, state.settings.maxChars, onUpdate])

  return (
    <>
      <div className={`modal-backdrop ${open ? 'open' : ''}`} onClick={onClose} />
      <div
        className={`modal ${open ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Ajustes"
        aria-hidden={!open}
      >
        <header className="modal-head">
          <div>
            <div className="eyebrow">PREFERENCIAS</div>
            <h2>
              <Settings2 size={19} /> Ajustes
            </h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar ajustes">
            <X size={18} />
          </button>
        </header>

        <div className="modal-body">
          <section className="settings-section">
            <h3>
              <Zap size={16} /> Motor de voz
            </h3>
            <div className="settings-row">
              <div>
                <strong>Aceleración</strong>
                <p>Automático usa Vulkan si la GPU está disponible y vuelve a CPU si falla.</p>
              </div>
              <select
                value={state.settings.backend}
                onChange={(event) => onUpdate({ backend: event.target.value as BackendPreference })}
              >
                <option value="auto">Automático</option>
                <option value="vulkan">GPU · Vulkan</option>
                <option value="cpu">CPU</option>
              </select>
            </div>

            <div className="engine-detail">
              <span>
                <Monitor size={14} /> {state.backend === 'vulkan' ? 'Vulkan' : 'CPU'}
              </span>
              <span>
                <Cpu size={14} /> {state.hardware.cpuModel.replace(/ AMD Ryzen/i, ' Ryzen')}
              </span>
              <span>
                <Gauge size={14} /> {calibration ? `${calibration.fps.toFixed(1)} fps · carga ${calibration.loadSec.toFixed(1)} s` : 'Sin calibrar'}
              </span>
            </div>

            <div className="settings-actions">
              <button className="button subtle" onClick={onRetest} disabled={testing}>
                {testing ? <Loader2 className="spin" size={15} /> : <RefreshCw size={15} />}
                {testing ? 'Probando…' : 'Probar motor'}
              </button>
              <button className="button ghost" onClick={onShowLogs}>
                <Terminal size={15} /> Ver registro
              </button>
            </div>
            {testResult && (
              <div className={`mini-result ${testResult.ok ? 'good' : 'bad'}`}>
                {testResult.ok ? <Check size={14} /> : <AlertTriangle size={14} />}
                {testResult.message}
              </div>
            )}
          </section>

          <section className="settings-section">
            <h3>
              <Settings2 size={16} /> Generación
            </h3>
            <div className="settings-row column">
              <div className="full-row">
                <div>
                  <strong>Máximo de caracteres</strong>
                  <p>El límite recomendado para este equipo es de 1.500 caracteres.</p>
                </div>
                <div className="range-wrap">
                  <input
                    type="range"
                    min={500}
                    max={6000}
                    step={100}
                    value={maxChars}
                    onChange={(event) => setMaxChars(Number(event.target.value))}
                    onPointerUp={() => onUpdate({ maxChars: clampChars(maxChars) })}
                    onKeyUp={() => onUpdate({ maxChars: clampChars(maxChars) })}
                  />
                  <input
                    className="number-input mono"
                    type="number"
                    min={500}
                    max={6000}
                    step={100}
                    value={maxChars}
                    onChange={(event) => setMaxChars(Number(event.target.value))}
                    onBlur={() => onUpdate({ maxChars: clampChars(maxChars) })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') onUpdate({ maxChars: clampChars(maxChars) })
                    }}
                  />
                </div>
              </div>
              <div className="full-row">
                <div>
                  <strong>Acabado al terminar</strong>
                  <p>Preset que se aplica automáticamente al generar un audio.</p>
                </div>
                <select
                  value={state.settings.playPreset}
                  onChange={(event) => onUpdate({ playPreset: event.target.value as PresetId })}
                >
                  {(Object.keys(PRESET_META) as PresetId[]).map((preset) => (
                    <option key={preset} value={preset}>
                      {PRESET_META[preset].name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="settings-section">
            <h3>
              <HardDrive size={16} /> Archivos y modelo
            </h3>
            <div className="path-box">
              <span>Carpeta de datos</span>
              <code>{state.dataRoot}</code>
              <button className="button ghost small" onClick={() => onOpenFolder('')}>
                <FolderOpen size={14} /> Abrir
              </button>
            </div>
            <div className="model-status">
              <span className={`dot ${state.modelReady ? 'good' : 'bad'}`} />
              <div>
                <strong>{state.modelReady ? 'Modelo instalado' : 'Modelo incompleto'}</strong>
                <p>
                  {formatBytes(state.modelBytes)} de {formatBytes(state.modelTotalBytes)} · Qwen3-TTS 1.7B Q4_K_M
                </p>
              </div>
              {state.modelReady && (
                <button
                  className="button ghost small danger-hover"
                  onClick={() => {
                    if (window.confirm('Se eliminará el modelo descargado. Tendrás que descargarlo de nuevo para generar voz. ¿Continuar?')) {
                      onResetModel()
                    }
                  }}
                >
                  <Trash2 size={14} /> Borrar
                </button>
              )}
            </div>
            <div className="settings-actions">
              <button className="button ghost" onClick={() => onOpenFolder('audios')}>
                <FolderOpen size={15} /> Carpeta de audios
              </button>
              <button className="button ghost" onClick={() => onOpenFolder('voices')}>
                <FolderOpen size={15} /> Carpeta de voces
              </button>
            </div>
            {calibration && (
              <p className="tiny">
                Calibración: {calibration.backend === 'vulkan' ? 'Vulkan' : 'CPU'} · actualizada el{' '}
                {formatDate(calibration.updatedAt)}
              </p>
            )}
          </section>

          <section className="settings-section about">
            <h3>Acerca de Roesch TTS</h3>
            <p>
              Aplicación local de clonación de voz construida con Electron, React y Qwen3-TTS. El audio no se envía a ningún
              servidor. Respeta la privacidad y utiliza únicamente voces con consentimiento.
            </p>
            <p className="tiny">
              Qwen3-TTS © Qwen Team · Apache-2.0 · llama.cpp © ggml-org · MIT · Roesch TTS v{state.appVersion}
            </p>
          </section>
        </div>
      </div>
    </>
  )
}

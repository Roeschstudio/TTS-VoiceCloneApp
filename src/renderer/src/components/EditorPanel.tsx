import { Clock, Mic2, Square, Wand2 } from 'lucide-react'
import { Calibration, GenerationProgress, LanguageCode, LANGUAGES } from '@shared/types'
import { formatDuration, formatEta } from '../lib/format'

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

interface EditorPanelProps {
  text: string
  onTextChange: (text: string) => void
  language: LanguageCode
  onLanguageChange: (language: LanguageCode) => void
  maxChars: number
  recommendedChars: number
  calibration: Calibration | null
  backend: string
  voiceReady: boolean
  generating: boolean
  progress: GenerationProgress | null
  onGenerate: () => void
  onCancel: () => void
}

export function EditorPanel({
  text,
  onTextChange,
  language,
  onLanguageChange,
  maxChars,
  recommendedChars,
  calibration,
  backend,
  voiceReady,
  generating,
  progress,
  onGenerate,
  onCancel
}: EditorPanelProps): React.JSX.Element {
  const chars = text.length
  const overLimit = chars > maxChars
  const nearLimit = chars > recommendedChars && !overLimit
  const audioSeconds = chars / (CHARS_PER_SEC[language] ?? 16)
  const fps = calibration?.fps && calibration.fps > 0 ? calibration.fps : 15
  const loadSec = calibration?.loadSec && calibration.loadSec >= 0 ? calibration.loadSec : 7
  const generationSeconds = chars > 0 ? loadSec + audioSeconds * (12 / fps) + 1 : 0
  const percentUsed = Math.min(100, (chars / maxChars) * 100)

  return (
    <section className="panel editor-panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">PASO 02</div>
          <h2>Tu guion</h2>
        </div>
        <label className="select-wrap">
          <span className="sr-only">Idioma</span>
          <select
            value={language}
            onChange={(event) => onLanguageChange(event.target.value as LanguageCode)}
            disabled={generating}
          >
            {LANGUAGES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={`textarea-shell ${overLimit ? 'over' : nearLimit ? 'near' : ''}`}>
        <textarea
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault()
              if (!generating && voiceReady && text.trim() && !overLimit) onGenerate()
            }
          }}
          placeholder="Escribe aquí lo que quieres escuchar con tu voz clonada…"
          spellCheck
          disabled={generating}
          rows={9}
        />
        <div className="counter-row">
          <div className="char-meter">
            <div className="char-meter-fill" style={{ width: `${percentUsed}%` }} />
          </div>
          <span className={`char-count mono ${overLimit ? 'bad' : nearLimit ? 'warn' : ''}`}>
            {chars.toLocaleString('es-ES')} / {maxChars.toLocaleString('es-ES')}
          </span>
        </div>
      </div>

      <div className="editor-meta">
        <span>
          <Mic2 size={14} /> {recommendedChars.toLocaleString('es-ES')} caracteres recomendados
        </span>
        <span>
          <Clock size={14} /> {chars > 0 ? `≈ ${formatDuration(audioSeconds)} de audio · ${formatEta(generationSeconds)} de generación` : 'Sin texto'}
        </span>
      </div>

      {overLimit && (
        <div className="inline-alert">
          Has superado el límite por {(chars - maxChars).toLocaleString('es-ES')} caracteres. Recorta el texto o amplía el
          límite en Ajustes.
        </div>
      )}

      {generating && progress ? (
        <ProgressPanel progress={progress} onCancel={onCancel} />
      ) : (
        <button
          className="button primary generate-button"
          onClick={onGenerate}
          disabled={!voiceReady || !text.trim() || overLimit || generating}
        >
          <Wand2 size={19} />
          {generating ? 'Generando…' : 'Generar voz'}
          <span className="shortcut">Ctrl ↵</span>
        </button>
      )}

      {!voiceReady && <p className="hint center">Añade una voz de referencia para empezar.</p>}
      {voiceReady && !text.trim() && <p className="hint center">Escribe un texto y pulsa Generar.</p>}
      <div className="engine-hint">
        <span className={`dot ${backend === 'vulkan' ? 'good' : ''}`} />
        {backend === 'vulkan' ? 'Aceleración Vulkan activa' : 'Procesando en CPU'}
      </div>
    </section>
  )
}

function ProgressPanel({ progress, onCancel }: { progress: GenerationProgress; onCancel: () => void }): React.JSX.Element {
  const stageLabel: Record<string, string> = {
    queued: 'En cola',
    loading: 'Cargando modelo',
    prompt: 'Procesando texto',
    generating: 'Generando voz',
    vocoding: 'Ensamblando audio',
    done: 'Listo',
    error: 'Error',
    cancelled: 'Cancelado'
  }
  const percent = Math.max(1, Math.min(100, progress.percent))

  return (
    <div className="generation-progress">
      <div className="progress-head">
        <span className="progress-label">
          <span className="pulse-dot" />
          {progress.message ?? stageLabel[progress.stage] ?? 'Generando'}
        </span>
        <span className="mono">{percent.toFixed(0)} %</span>
      </div>
      <div className="progress-track tall">
        <div className="progress-fill shimmer" style={{ width: `${percent}%` }} />
      </div>
      <div className="progress-meta">
        <span>
          {progress.stage === 'generating'
            ? `${progress.frames} / ${progress.totalFrames} frames · ${progress.fps.toFixed(1)} fps`
            : `${Math.floor(progress.elapsedSec)} s transcurridos`}
        </span>
        <span>{progress.stage === 'done' ? 'Completado' : `Quedan ${formatEta(progress.etaSec)}`}</span>
        <button className="button danger small" onClick={onCancel}>
          <Square size={12} fill="currentColor" /> Cancelar
        </button>
      </div>
    </div>
  )
}

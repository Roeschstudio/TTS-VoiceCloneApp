import { Check, ChevronRight, Download, FileAudio, FolderOpen, Loader2, Music2, Sparkles, X } from 'lucide-react'
import { HistoryEntry, PresetId } from '@shared/types'
import { PRESET_META } from '../lib/dsp'
import { formatDate, formatDuration, textSnippet } from '../lib/format'
import { useAudioFile } from '../hooks/useAudioFile'
import { Player } from './Player'

interface ResultPanelProps {
  entry: HistoryEntry
  processing: boolean
  downloading: 'wav' | 'mp3' | null
  onPresetChange: (preset: PresetId) => void
  onDownload: (format: 'wav' | 'mp3') => void
  onOpenFolder: () => void
  onClose: () => void
}

export function ResultPanel({
  entry,
  processing,
  downloading,
  onPresetChange,
  onDownload,
  onOpenFolder,
  onClose
}: ResultPanelProps): React.JSX.Element {
  const audio = useAudioFile(entry.audioFile)
  const presets: PresetId[] = ['original', 'studio', 'podcast', 'radio']

  return (
    <section className="panel result-panel">
      <div className="result-glow" aria-hidden="true" />
      <div className="panel-head">
        <div>
          <div className="eyebrow">RESULTADO</div>
          <h2>Audio generado</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Cerrar resultado">
          <X size={18} />
        </button>
      </div>

      <div className="result-topline">
        <span className="status-badge good">
          <Check size={13} /> Guardado
        </span>
        <span>{formatDate(entry.createdAt)}</span>
        <span>{formatDuration(entry.durationSec)}</span>
        <span>{entry.backend === 'vulkan' ? 'Vulkan' : 'CPU'}</span>
        <span className="rtf">×{entry.rtf.toFixed(2)} tiempo real</span>
      </div>

      <div className="player-shell">
        {audio.loading ? (
          <div className="player-loading">
            <Loader2 className="spin" size={20} /> Cargando audio…
          </div>
        ) : (
          <Player src={audio.url} peaks={audio.peaks} />
        )}
      </div>

      <div className="preset-block">
        <div className="preset-title">
          <span>Acabado de sonido</span>
          {processing && (
            <span className="processing-label">
              <Loader2 className="spin" size={13} /> Procesando…
            </span>
          )}
        </div>
        <div className="preset-tabs">
          {presets.map((preset) => {
            const meta = PRESET_META[preset]
            const active = entry.preset === preset
            return (
              <button
                key={preset}
                className={`preset-tab ${active ? 'active' : ''}`}
                onClick={() => onPresetChange(preset)}
                disabled={processing || active}
                title={meta.description}
              >
                <strong>{meta.name}</strong>
                <span>{meta.target ?? meta.short}</span>
                {active && <Check size={12} />}
              </button>
            )
          })}
        </div>
        <p className="preset-description">{PRESET_META[entry.preset].description}</p>
      </div>

      <div className="result-quote">
        <Sparkles size={15} />
        <p>{textSnippet(entry.text, 320)}</p>
      </div>

      <div className="result-actions">
        <button className="button primary" onClick={() => onDownload('wav')} disabled={Boolean(downloading) || processing}>
          {downloading === 'wav' ? <Loader2 className="spin" size={16} /> : <Download size={16} />}
          Descargar WAV
        </button>
        <button className="button subtle" onClick={() => onDownload('mp3')} disabled={Boolean(downloading) || processing}>
          {downloading === 'mp3' ? <Loader2 className="spin" size={16} /> : <Music2 size={16} />}
          Descargar MP3
        </button>
        <button className="button ghost" onClick={onOpenFolder}>
          <FolderOpen size={16} /> Abrir carpeta
        </button>
      </div>

      <div className="result-foot">
        <span>
          <FileAudio size={14} /> {entry.fileName}
        </span>
        <span>
          Guardado automáticamente <ChevronRight size={13} /> audios/
        </span>
      </div>
    </section>
  )
}

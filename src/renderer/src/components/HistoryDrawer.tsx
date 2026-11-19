import { AudioLines, Download, FolderOpen, History, Play, Trash2, X } from 'lucide-react'
import { useEffect } from 'react'
import { HistoryEntry } from '@shared/types'
import { PRESET_META } from '../lib/dsp'
import { formatDate, formatDuration, textSnippet } from '../lib/format'

interface HistoryDrawerProps {
  open: boolean
  entries: HistoryEntry[]
  onClose: () => void
  onSelect: (entry: HistoryEntry) => void
  onDelete: (entry: HistoryEntry) => void
  onDownload: (entry: HistoryEntry, format: 'wav' | 'mp3') => void
  onOpenFolder: () => void
}

export function HistoryDrawer({
  open,
  entries,
  onClose,
  onSelect,
  onDelete,
  onDownload,
  onOpenFolder
}: HistoryDrawerProps): React.JSX.Element {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      <div className={`drawer-backdrop ${open ? 'open' : ''}`} onClick={onClose} />
      <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
        <header className="drawer-head">
          <div>
            <div className="eyebrow">BIBLIOTECA</div>
            <h2>
              <History size={19} /> Historial
            </h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar historial">
            <X size={18} />
          </button>
        </header>

        <div className="drawer-toolbar">
          <span>{entries.length} audios guardados</span>
          <button className="button ghost small" onClick={onOpenFolder}>
            <FolderOpen size={14} /> Abrir carpeta
          </button>
        </div>

        <div className="history-list">
          {entries.length === 0 && (
            <div className="empty-state">
              <AudioLines size={30} />
              <strong>Todavía no hay audios</strong>
              <p>Los audios que generes se guardarán aquí automáticamente.</p>
            </div>
          )}
          {entries.map((entry) => (
            <article key={entry.id} className="history-item">
              <button className="history-main" onClick={() => onSelect(entry)}>
                <span className="history-play">
                  <Play size={14} fill="currentColor" />
                </span>
                <span className="history-text">
                  <strong>{textSnippet(entry.text, 86)}</strong>
                  <span>
                    {formatDate(entry.createdAt)} · {formatDuration(entry.durationSec)} · {PRESET_META[entry.preset].name}
                  </span>
                </span>
              </button>
              <div className="history-actions">
                <button
                  className="icon-button small"
                  title="Descargar WAV"
                  onClick={() => onDownload(entry, 'wav')}
                >
                  <Download size={15} />
                </button>
                <button
                  className="icon-button small danger-hover"
                  title="Eliminar"
                  onClick={() => onDelete(entry)}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </aside>
    </>
  )
}

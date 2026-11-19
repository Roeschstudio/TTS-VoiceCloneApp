import { Copy, Terminal, X } from 'lucide-react'
import { useEffect, useState } from 'react'

interface LogsModalProps {
  open: boolean
  onClose: () => void
}

export function LogsModal({ open, onClose }: LogsModalProps): React.JSX.Element {
  const [logs, setLogs] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    void window.roesch
      .getEngineLogs()
      .then((text) => setLogs(text || 'Todavía no hay registros de generación.'))
      .finally(() => setLoading(false))
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(logs)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <>
      <div className={`modal-backdrop ${open ? 'open' : ''}`} onClick={onClose} />
      <div
        className={`modal logs-modal ${open ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Registro del motor"
        aria-hidden={!open}
      >
        <header className="modal-head">
          <div>
            <div className="eyebrow">DIAGNÓSTICO</div>
            <h2>
              <Terminal size={19} /> Registro del motor
            </h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar registro">
            <X size={18} />
          </button>
        </header>
        <div className="logs-body">
          <button className="button ghost small copy-logs" onClick={() => void copy()}>
            <Copy size={14} /> {copied ? 'Copiado' : 'Copiar'}
          </button>
          <pre>{loading ? 'Cargando…' : logs}</pre>
        </div>
      </div>
    </>
  )
}

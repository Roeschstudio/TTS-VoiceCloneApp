import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  message: string
  type: ToastType
}

interface ToastsProps {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
}

export function Toasts({ toasts, onDismiss }: ToastsProps): React.JSX.Element {
  return (
    <div className="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.type}`}>
          {toast.type === 'success' ? (
            <CheckCircle2 size={17} />
          ) : toast.type === 'error' ? (
            <AlertCircle size={17} />
          ) : (
            <Info size={17} />
          )}
          <span>{toast.message}</span>
          <button className="icon-button tiny" onClick={() => onDismiss(toast.id)} aria-label="Cerrar aviso">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}

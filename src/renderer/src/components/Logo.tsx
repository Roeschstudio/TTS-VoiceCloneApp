import { AudioWaveform } from 'lucide-react'

export function Logo({ size = 42, withText = false }: { size?: number; withText?: boolean }): React.JSX.Element {
  return (
    <div className="brand">
      <div className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
        <div className="brand-bars">
          <span style={{ height: '35%' }} />
          <span style={{ height: '62%' }} />
          <span style={{ height: '100%' }} />
          <span style={{ height: '54%' }} />
          <span style={{ height: '28%' }} />
        </div>
        <AudioWaveform className="brand-glyph" size={Math.round(size * 0.34)} strokeWidth={2.4} />
      </div>
      {withText && (
        <div className="brand-text">
          <strong>ROESCH</strong>
          <span>TTS</span>
        </div>
      )}
    </div>
  )
}

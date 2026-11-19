import { useEffect, useRef } from 'react'

interface WaveformProps {
  peaks: number[]
  progress?: number
  onSeek?: (ratio: number) => void
  height?: number
  color?: string
  dimColor?: string
  className?: string
}

export function Waveform({
  peaks,
  progress = 0,
  onSeek,
  height = 72,
  color = 'var(--accent)',
  dimColor = 'rgba(255,255,255,0.14)',
  className = ''
}: WaveformProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

    const draw = () => {
      const rect = wrap.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      const width = Math.max(1, Math.floor(rect.width))
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, width, height)

      const count = peaks.length || 80
      const gap = Math.max(1.4, width / count * 0.3)
      const barWidth = Math.max(1.2, (width - gap * (count - 1)) / count)
      const mid = height / 2
      const playedX = width * Math.max(0, Math.min(1, progress))

      for (let i = 0; i < count; i++) {
        const value = peaks[i] ?? 0
        const barHeight = Math.max(2, value * (height - 10))
        const x = i * (barWidth + gap)
        ctx.fillStyle = x + barWidth / 2 <= playedX ? color : dimColor
        const radius = Math.min(barWidth / 2, 1.6)
        const y = mid - barHeight / 2
        ctx.beginPath()
        ctx.roundRect(x, y, barWidth, barHeight, radius)
        ctx.fill()
      }
    }

    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [peaks, progress, height, color, dimColor])

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return
    const rect = event.currentTarget.getBoundingClientRect()
    onSeek(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)))
  }

  return (
    <div
      ref={wrapRef}
      className={`waveform ${onSeek ? 'waveform-seekable' : ''} ${className}`}
      style={{ height }}
      onClick={handleClick}
      role={onSeek ? 'slider' : undefined}
      aria-label={onSeek ? 'Posición del audio' : undefined}
    >
      <canvas ref={canvasRef} />
    </div>
  )
}

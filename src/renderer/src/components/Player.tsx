import { Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { formatTime } from '../lib/format'
import { Waveform } from './Waveform'

interface PlayerProps {
  src: string | null
  peaks: number[]
  compact?: boolean
  autoPlay?: boolean
  className?: string
}

export function Player({ src, peaks, compact = false, autoPlay = false, className = '' }: PlayerProps): React.JSX.Element {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }, [src])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onTime = () => setCurrentTime(audio.currentTime)
    const onMeta = () => setDuration(audio.duration || 0)
    const onEnd = () => {
      setPlaying(false)
      setCurrentTime(audio.duration || 0)
    }
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('durationchange', onMeta)
    audio.addEventListener('ended', onEnd)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('durationchange', onMeta)
      audio.removeEventListener('ended', onEnd)
    }
  }, [src])

  useEffect(() => {
    if (!autoPlay || !src) return
    const audio = audioRef.current
    if (!audio) return
    const timer = window.setTimeout(() => {
      void audio.play().then(() => setPlaying(true)).catch(() => undefined)
    }, 120)
    return () => window.clearTimeout(timer)
  }, [autoPlay, src])

  const toggle = async (): Promise<void> => {
    const audio = audioRef.current
    if (!audio || !src) return
    if (audio.paused) {
      try {
        await audio.play()
        setPlaying(true)
      } catch {
        setPlaying(false)
      }
    } else {
      audio.pause()
      setPlaying(false)
    }
  }

  const seek = (ratio: number): void => {
    const audio = audioRef.current
    if (!audio || !Number.isFinite(audio.duration)) return
    audio.currentTime = ratio * audio.duration
    setCurrentTime(audio.currentTime)
  }

  const toggleMute = (): void => {
    const audio = audioRef.current
    if (!audio) return
    audio.muted = !audio.muted
    setMuted(audio.muted)
  }

  const progress = duration > 0 ? currentTime / duration : 0

  return (
    <div className={`player ${compact ? 'player-compact' : ''} ${className}`}>
      <audio ref={audioRef} src={src ?? undefined} preload="metadata" />
      <button className="play-button" onClick={() => void toggle()} disabled={!src} aria-label={playing ? 'Pausar' : 'Reproducir'}>
        {playing ? <Pause size={compact ? 16 : 20} fill="currentColor" /> : <Play size={compact ? 16 : 20} fill="currentColor" />}
      </button>
      <div className="player-body">
        <Waveform peaks={peaks} progress={progress} onSeek={seek} height={compact ? 38 : 64} />
        <div className="player-meta">
          <span className="mono">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <div className="player-actions">
            {!compact && (
              <button className="icon-button small" onClick={toggleMute} aria-label={muted ? 'Activar sonido' : 'Silenciar'}>
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            )}
            <span className="player-signal">
              <i /> <i /> <i /> <i />
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

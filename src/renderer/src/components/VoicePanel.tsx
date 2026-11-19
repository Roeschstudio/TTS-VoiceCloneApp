import { Check, Loader2, Mic, Square, Trash2, Upload, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { StoredVoice } from '@shared/types'
import { decodeToMono, getPeaks, prepareReference, TTS_SAMPLE_RATE, audioBufferToUrl } from '../lib/audio'
import { formatDuration, friendlyError } from '../lib/format'
import { Player } from './Player'

interface VoicePanelProps {
  voice: StoredVoice | null
  onVoiceSaved: (voice: StoredVoice) => void
  onVoiceDeleted: () => void
  onToast: (message: string, type?: 'success' | 'error' | 'info') => void
}

export function VoicePanel({ voice, onVoiceSaved, onVoiceDeleted, onToast }: VoicePanelProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const [busy, setBusy] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [peaks, setPeaks] = useState<number[]>([])
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!voice) {
      setPeaks([])
      setSrc(null)
      return
    }
    let url: string | null = null
    let cancelled = false
    const run = async () => {
      try {
        const samples = await decodeToMono(voice.data, TTS_SAMPLE_RATE)
        if (cancelled) return
        setPeaks(getPeaks(samples, 110))
        url = audioBufferToUrl(voice.data)
        setSrc(url)
      } catch {
        if (!cancelled) {
          setPeaks([])
          setSrc(null)
        }
      }
    }
    void run()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [voice])

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  const processFile = async (file: File): Promise<void> => {
    setBusy(true)
    try {
      if (file.size > 60 * 1024 * 1024) throw new Error('El archivo es demasiado grande (máximo 60 MB)')
      const data = await file.arrayBuffer()
      const prepared = await prepareReference(data)
      const name = file.name.replace(/\.[^.]+$/, '').trim() || 'Mi voz'
      await window.roesch.saveReference({
        data: prepared.wav,
        name: name.length > 40 ? 'Mi voz' : name,
        durationSec: prepared.durationSec,
        sampleRate: TTS_SAMPLE_RATE
      })
      const stored = await window.roesch.getReference()
      if (stored) onVoiceSaved(stored)
      const notes: string[] = []
      if (prepared.truncated) notes.push('se recortó a 30 s')
      if (prepared.trimmedSilence) notes.push('se eliminaron silencios')
      onToast(
        notes.length ? `Voz guardada (${notes.join(', ')}).` : `Voz guardada: ${formatDuration(prepared.durationSec)}.`,
        'success'
      )
    } catch (error) {
      onToast(friendlyError(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleFiles = (files: FileList | null): void => {
    const file = files?.[0]
    if (!file) return
    if (!file.type.startsWith('audio/') && !/\.(wav|mp3|m4a|ogg|webm|flac|aac)$/i.test(file.name)) {
      onToast('Selecciona un archivo de audio válido.', 'error')
      return
    }
    void processFile(file)
  }

  const startRecording = async (): Promise<void> => {
    if (recording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      })
      streamRef.current = stream
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : ''
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      recorderRef.current = recorder
      chunksRef.current = []
      setRecordSeconds(0)
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        if (timerRef.current) window.clearInterval(timerRef.current)
        timerRef.current = null
        setRecording(false)
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size < 1200) {
          onToast('La grabación es demasiado corta.', 'error')
          return
        }
        setBusy(true)
        try {
          const data = await blob.arrayBuffer()
          const prepared = await prepareReference(data)
          const stored = await window.roesch.saveReference({
            data: prepared.wav,
            name: 'Mi voz',
            durationSec: prepared.durationSec,
            sampleRate: TTS_SAMPLE_RATE
          })
          void stored
          const fresh = await window.roesch.getReference()
          if (fresh) onVoiceSaved(fresh)
          onToast(`Grabación guardada (${formatDuration(prepared.durationSec)}).`, 'success')
        } catch (error) {
          onToast(friendlyError(error), 'error')
        } finally {
          setBusy(false)
        }
      }
      recorder.start(250)
      setRecording(true)
      timerRef.current = window.setInterval(() => {
        setRecordSeconds((seconds) => {
          const next = seconds + 0.1
          if (next >= 35) {
            if (recorder.state !== 'inactive') recorder.stop()
            return 35
          }
          return next
        })
      }, 100)
    } catch {
      onToast('No se pudo acceder al micrófono. Revisa los permisos de Windows.', 'error')
    }
  }

  const stopRecording = (): void => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
  }

  const deleteVoice = async (): Promise<void> => {
    if (!window.confirm('¿Eliminar la voz de referencia guardada?')) return
    await window.roesch.deleteReference()
    onVoiceDeleted()
    onToast('Voz de referencia eliminada.', 'info')
  }

  return (
    <section className="panel voice-panel">
      <div className="panel-head">
        <div>
          <div className="eyebrow">PASO 01</div>
          <h2>Voz de referencia</h2>
        </div>
        {voice && (
          <span className="status-badge">
            <Check size={13} /> Lista
          </span>
        )}
      </div>

      {recording ? (
        <div className="recording-box">
          <div className="recording-orb">
            <span className="record-dot" />
            <Mic size={34} />
          </div>
          <strong>Grabando…</strong>
          <p>Habla con naturalidad durante 15–30 segundos.</p>
          <div className="record-timer mono">{formatDuration(recordSeconds)}</div>
          <button className="button danger" onClick={stopRecording}>
            <Square size={15} fill="currentColor" /> Detener grabación
          </button>
        </div>
      ) : voice ? (
        <div className="voice-loaded">
          <div className="voice-top">
            <div className="voice-avatar">
              <Volume2 size={20} />
            </div>
            <div className="voice-title">
              <strong>{voice.info.name}</strong>
              <span>
                {formatDuration(voice.info.durationSec)} · 24 kHz mono · {(voice.data.byteLength / 1024 / 1024).toFixed(1)} MB
              </span>
            </div>
            <button className="icon-button" onClick={() => void deleteVoice()} aria-label="Eliminar voz">
              <Trash2 size={17} />
            </button>
          </div>
          <Player src={src} peaks={peaks} compact />
          <div className="voice-actions">
            <button className="button subtle" onClick={() => inputRef.current?.click()}>
              <Upload size={15} /> Reemplazar
            </button>
            <button className="button subtle" onClick={() => void startRecording()}>
              <Mic size={15} /> Grabar de nuevo
            </button>
          </div>
          <p className="hint">Se usará como referencia en todas las generaciones.</p>
        </div>
      ) : (
        <div
          className={`dropzone ${dragging ? 'dragging' : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            handleFiles(event.dataTransfer.files)
          }}
        >
          <div className="dropzone-icon">
            <Mic size={26} />
          </div>
          <strong>Coloca tu voz de referencia</strong>
          <p>15–30 segundos, una sola persona, sin música ni ruido de fondo.</p>
          <div className="dropzone-actions">
            <button className="button primary" onClick={() => inputRef.current?.click()}>
              <Upload size={16} /> Subir audio
            </button>
            <button className="button ghost" onClick={() => void startRecording()}>
              <Mic size={16} /> Grabar
            </button>
          </div>
          <span className="tiny">WAV, MP3, M4A, OGG o WebM · máx. 30 s</span>
        </div>
      )}

      {busy && (
        <div className="panel-busy">
          <Loader2 className="spin" size={22} />
          <span>Preparando la voz…</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm,.flac,.aac"
        hidden
        onChange={(event) => {
          handleFiles(event.target.files)
          event.target.value = ''
        }}
      />

      {!voice && (
        <div className="tips">
          <span>Consejos para una mejor clonación</span>
          <ul>
            <li>Habla a un volumen constante y sin prisa.</li>
            <li>Evita reverberación, ventiladores y ruido de calle.</li>
            <li>No uses fragmentos con varias voces o música.</li>
          </ul>
        </div>
      )}
    </section>
  )
}

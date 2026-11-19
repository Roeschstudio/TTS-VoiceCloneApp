import { useEffect, useState } from 'react'
import { decodeToMono, getPeaks, TTS_SAMPLE_RATE } from '../lib/audio'

export interface AudioFileData {
  url: string | null
  peaks: number[]
  samples: Float32Array | null
  loading: boolean
  error: string | null
}

export function useAudioFile(file: string | null): AudioFileData {
  const [data, setData] = useState<AudioFileData>({
    url: null,
    peaks: [],
    samples: null,
    loading: false,
    error: null
  })

  useEffect(() => {
    if (!file) {
      setData({ url: null, peaks: [], samples: null, loading: false, error: null })
      return
    }
    let cancelled = false
    let url: string | null = null
    setData((previous) => ({ ...previous, loading: true, error: null }))

    const run = async () => {
      try {
        const buffer = await window.roesch.getAudio(file)
        if (cancelled) return
        url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }))
        let samples: Float32Array | null = null
        let peaks: number[] = []
        try {
          samples = await decodeToMono(buffer, TTS_SAMPLE_RATE)
          peaks = getPeaks(samples, 220)
        } catch {
          peaks = new Array(120).fill(0.15).map((_, index) => 0.15 + 0.1 * Math.sin(index / 2.5))
        }
        if (cancelled) return
        setData({ url, peaks, samples, loading: false, error: null })
      } catch (error) {
        if (cancelled) return
        setData({
          url: null,
          peaks: [],
          samples: null,
          loading: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    void run()
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [file])

  return data
}

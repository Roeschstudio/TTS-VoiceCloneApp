export const TTS_SAMPLE_RATE = 24000
export const MIN_REFERENCE_SECONDS = 3
export const MAX_REFERENCE_SECONDS = 30
export const RECOMMENDED_REFERENCE_SECONDS = 15

export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytesPerSample = 2
  const dataSize = samples.length * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * bytesPerSample, true)
  view.setUint16(32, bytesPerSample, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }
  return buffer
}

let decodeContext: AudioContext | null = null

function getDecodeContext(): AudioContext {
  if (!decodeContext) decodeContext = new AudioContext()
  return decodeContext
}

export async function decodeToMono(data: ArrayBuffer, targetRate = TTS_SAMPLE_RATE): Promise<Float32Array> {
  const source = data.slice(0)
  const ctx = getDecodeContext()
  const decoded = await ctx.decodeAudioData(source)
  const length = Math.max(1, Math.ceil(decoded.duration * targetRate))
  const offline = new OfflineAudioContext(1, length, targetRate)
  const mono = ctx.createBuffer(1, decoded.length, decoded.sampleRate)
  const out = mono.getChannelData(0)
  for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
    const input = decoded.getChannelData(channel)
    for (let i = 0; i < input.length; i++) out[i] += input[i] / decoded.numberOfChannels
  }
  const node = offline.createBufferSource()
  node.buffer = mono
  node.connect(offline.destination)
  node.start(0)
  const rendered = await offline.startRendering()
  return rendered.getChannelData(0).slice()
}

export function trimSilence(samples: Float32Array, sampleRate: number, threshold = 0.0045): Float32Array {
  let first = 0
  let last = samples.length - 1
  while (first < samples.length && Math.abs(samples[first]) < threshold) first++
  while (last > first && Math.abs(samples[last]) < threshold) last--
  if (first >= last) return samples
  const pad = Math.round(sampleRate * 0.12)
  const start = Math.max(0, first - pad)
  const end = Math.min(samples.length, last + pad + 1)
  return samples.slice(start, end)
}

export function normalizePeak(samples: Float32Array, target = 0.89): Float32Array {
  let peak = 0
  for (let i = 0; i < samples.length; i++) {
    const value = Math.abs(samples[i])
    if (value > peak) peak = value
  }
  if (peak < 0.00001) return samples
  const gain = target / peak
  if (Math.abs(gain - 1) < 0.001) return samples
  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain
  return out
}

export function applyFade(samples: Float32Array, sampleRate: number, ms = 8): Float32Array {
  const n = Math.min(Math.floor((sampleRate * ms) / 1000), Math.floor(samples.length / 2))
  if (n <= 0) return samples
  const out = samples.slice()
  for (let i = 0; i < n; i++) {
    const gain = i / n
    out[i] *= gain
    out[out.length - 1 - i] *= gain
  }
  return out
}

export interface ReferenceResult {
  wav: ArrayBuffer
  durationSec: number
  trimmedSilence: boolean
  truncated: boolean
  peak: number
}

export async function prepareReference(data: ArrayBuffer): Promise<ReferenceResult> {
  const original = await decodeToMono(data, TTS_SAMPLE_RATE)
  const trimmed = trimSilence(original, TTS_SAMPLE_RATE)
  const trimmedSilence = trimmed.length < original.length * 0.995

  let working = trimmed
  let truncated = false
  const maxSamples = Math.round(MAX_REFERENCE_SECONDS * TTS_SAMPLE_RATE)
  if (working.length > maxSamples) {
    working = working.slice(0, maxSamples)
    truncated = true
  }

  const durationSec = working.length / TTS_SAMPLE_RATE
  if (durationSec < MIN_REFERENCE_SECONDS) {
    throw new Error(
      `La referencia es demasiado corta (${durationSec.toFixed(1)} s). Usa al menos ${MIN_REFERENCE_SECONDS} segundos.`
    )
  }

  let peak = 0
  for (let i = 0; i < working.length; i++) peak = Math.max(peak, Math.abs(working[i]))
  if (peak < 0.002) throw new Error('La referencia parece estar en silencio. Prueba con otro audio.')

  const normalized = applyFade(normalizePeak(working, 0.89), TTS_SAMPLE_RATE, 10)
  return {
    wav: encodeWav(normalized, TTS_SAMPLE_RATE),
    durationSec: normalized.length / TTS_SAMPLE_RATE,
    trimmedSilence,
    truncated,
    peak
  }
}

export function getPeaks(samples: Float32Array, bars: number): number[] {
  if (!samples.length || bars <= 0) return new Array(bars).fill(0)
  const peaks: number[] = []
  const block = Math.max(1, Math.floor(samples.length / bars))
  let max = 0
  for (let b = 0; b < bars; b++) {
    const start = b * block
    const end = Math.min(samples.length, start + block)
    let value = 0
    for (let i = start; i < end; i++) value = Math.max(value, Math.abs(samples[i]))
    peaks.push(value)
    max = Math.max(max, value)
  }
  if (max > 0) for (let i = 0; i < peaks.length; i++) peaks[i] = Math.pow(peaks[i] / max, 0.72)
  return peaks
}

export function resampleLinear(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return samples
  const ratio = fromRate / toRate
  const length = Math.max(1, Math.round(samples.length / ratio))
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const pos = i * ratio
    const index = Math.floor(pos)
    const frac = pos - index
    const a = samples[index] ?? 0
    const b = samples[index + 1] ?? a
    out[i] = a + (b - a) * frac
  }
  return out
}

export function toInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

export function audioBufferToUrl(buffer: ArrayBuffer, type = 'audio/wav'): string {
  return URL.createObjectURL(new Blob([buffer], { type }))
}

import { PresetId } from '@shared/types'
import { resampleLinear } from './audio'

interface Biquad {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

interface CompressorSettings {
  threshold: number
  ratio: number
  attack: number
  release: number
  knee: number
}

interface DeEsserSettings {
  amount: number
  frequency: number
  threshold: number
}

interface PresetConfig {
  highpass: number
  bandpasses: Array<{ type: 'peaking' | 'highshelf' | 'lowshelf'; frequency: number; q?: number; gain: number }>
  compressor: CompressorSettings
  deEsser: DeEsserSettings
  targetLufs: number
  ceilingDb: number
}

export const PRESET_CONFIG: Record<Exclude<PresetId, 'original'>, PresetConfig> = {
  studio: {
    highpass: 75,
    bandpasses: [
      { type: 'peaking', frequency: 250, q: 1.0, gain: -2.0 },
      { type: 'peaking', frequency: 4200, q: 0.9, gain: 1.6 },
      { type: 'highshelf', frequency: 8500, gain: 1.1 }
    ],
    compressor: { threshold: -20, ratio: 2.6, attack: 12, release: 140, knee: 8 },
    deEsser: { amount: 0.45, frequency: 5600, threshold: -23 },
    targetLufs: -18,
    ceilingDb: -1.5
  },
  podcast: {
    highpass: 90,
    bandpasses: [
      { type: 'lowshelf', frequency: 190, gain: 1.2 },
      { type: 'peaking', frequency: 280, q: 1.1, gain: -1.6 },
      { type: 'peaking', frequency: 3500, q: 0.9, gain: 2.8 },
      { type: 'highshelf', frequency: 7500, gain: 1.6 }
    ],
    compressor: { threshold: -18, ratio: 3.4, attack: 8, release: 110, knee: 7 },
    deEsser: { amount: 0.55, frequency: 5500, threshold: -22 },
    targetLufs: -16,
    ceilingDb: -1.2
  },
  radio: {
    highpass: 100,
    bandpasses: [
      { type: 'lowshelf', frequency: 170, gain: 1.8 },
      { type: 'peaking', frequency: 300, q: 1.0, gain: -1.2 },
      { type: 'peaking', frequency: 2600, q: 0.8, gain: 3.0 },
      { type: 'highshelf', frequency: 6500, gain: 2.2 }
    ],
    compressor: { threshold: -22, ratio: 4.0, attack: 5, release: 80, knee: 6 },
    deEsser: { amount: 0.62, frequency: 5200, threshold: -21 },
    targetLufs: -14,
    ceilingDb: -0.8
  }
}

function applyBiquad(samples: Float32Array, coeffs: Biquad): Float32Array {
  const out = new Float32Array(samples.length)
  let x1 = 0
  let x2 = 0
  let y1 = 0
  let y2 = 0
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i]
    const y = coeffs.b0 * x + coeffs.b1 * x1 + coeffs.b2 * x2 - coeffs.a1 * y1 - coeffs.a2 * y2
    out[i] = y
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
  }
  return out
}

function highpassCoeffs(sampleRate: number, frequency: number, q = 0.7071): Biquad {
  const w = (2 * Math.PI * frequency) / sampleRate
  const cos = Math.cos(w)
  const alpha = Math.sin(w) / (2 * q)
  const a0 = 1 + alpha
  return {
    b0: (1 + cos) / 2 / a0,
    b1: -(1 + cos) / a0,
    b2: (1 + cos) / 2 / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0
  }
}

function peakingCoeffs(sampleRate: number, frequency: number, q: number, gainDb: number): Biquad {
  const w = (2 * Math.PI * frequency) / sampleRate
  const cos = Math.cos(w)
  const alpha = Math.sin(w) / (2 * q)
  const A = Math.pow(10, gainDb / 40)
  const a0 = 1 + alpha / A
  return {
    b0: (1 + alpha * A) / a0,
    b1: (-2 * cos) / a0,
    b2: (1 - alpha * A) / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha / A) / a0
  }
}

function highshelfCoeffs(sampleRate: number, frequency: number, gainDb: number, s = 1): Biquad {
  const w = (2 * Math.PI * frequency) / sampleRate
  const cos = Math.cos(w)
  const sin = Math.sin(w)
  const A = Math.pow(10, gainDb / 40)
  const alpha = (sin / 2) * Math.sqrt((A + 1 / A) * (1 / s - 1) + 2)
  const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha
  const a0 = (A + 1) - (A - 1) * cos + twoSqrtAAlpha
  return {
    b0: (A * ((A + 1) + (A - 1) * cos + twoSqrtAAlpha)) / a0,
    b1: (-2 * A * ((A - 1) + (A + 1) * cos)) / a0,
    b2: (A * ((A + 1) + (A - 1) * cos - twoSqrtAAlpha)) / a0,
    a1: (2 * ((A - 1) - (A + 1) * cos)) / a0,
    a2: ((A + 1) - (A - 1) * cos - twoSqrtAAlpha) / a0
  }
}

function lowshelfCoeffs(sampleRate: number, frequency: number, gainDb: number, s = 1): Biquad {
  const w = (2 * Math.PI * frequency) / sampleRate
  const cos = Math.cos(w)
  const sin = Math.sin(w)
  const A = Math.pow(10, gainDb / 40)
  const alpha = (sin / 2) * Math.sqrt((A + 1 / A) * (1 / s - 1) + 2)
  const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha
  const a0 = (A + 1) + (A - 1) * cos + twoSqrtAAlpha
  return {
    b0: (A * ((A + 1) - (A - 1) * cos + twoSqrtAAlpha)) / a0,
    b1: (2 * A * ((A - 1) - (A + 1) * cos)) / a0,
    b2: (A * ((A + 1) - (A - 1) * cos - twoSqrtAAlpha)) / a0,
    a1: (-2 * ((A - 1) + (A + 1) * cos)) / a0,
    a2: ((A + 1) + (A - 1) * cos - twoSqrtAAlpha) / a0
  }
}

function dbToGain(db: number): number {
  return Math.pow(10, db / 20)
}

function compress(samples: Float32Array, sampleRate: number, settings: CompressorSettings): Float32Array {
  const out = new Float32Array(samples.length)
  const attack = Math.exp(-1 / (sampleRate * (settings.attack / 1000)))
  const release = Math.exp(-1 / (sampleRate * (settings.release / 1000)))
  let envelope = 0

  for (let i = 0; i < samples.length; i++) {
    const x = samples[i]
    const level = Math.abs(x)
    envelope = level > envelope ? attack * envelope + (1 - attack) * level : release * envelope + (1 - release) * level
    const db = 20 * Math.log10(envelope + 1e-9)
    let gainDb = 0
    const over = db - settings.threshold
    if (over > 0) {
      if (settings.knee > 0 && over < settings.knee) {
        const ratioPart = 1 - 1 / settings.ratio
        gainDb = -ratioPart * ((over * over) / (2 * settings.knee))
      } else {
        gainDb = -(over - (settings.knee > 0 ? settings.knee / 2 : 0)) * (1 - 1 / settings.ratio)
      }
    }
    out[i] = x * dbToGain(gainDb)
  }
  return out
}

function deEss(samples: Float32Array, sampleRate: number, settings: DeEsserSettings): Float32Array {
  const high = applyBiquad(samples, highpassCoeffs(sampleRate, settings.frequency))
  const low = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) low[i] = samples[i] - high[i]

  const attack = Math.exp(-1 / (sampleRate * 0.001))
  const release = Math.exp(-1 / (sampleRate * 0.045))
  let envelope = 0
  const out = new Float32Array(samples.length)

  for (let i = 0; i < samples.length; i++) {
    const level = Math.abs(high[i])
    envelope = level > envelope ? attack * envelope + (1 - attack) * level : release * envelope + (1 - release) * level
    const db = 20 * Math.log10(envelope + 1e-9)
    let gain = 1
    if (db > settings.threshold) {
      const reduction = (db - settings.threshold) * settings.amount * 0.75
      gain = dbToGain(-reduction)
    }
    out[i] = low[i] + high[i] * gain
  }
  return out
}

function kWeight(samples: Float32Array, sampleRate: number): Float32Array {
  if (sampleRate !== 48000) return samples
  const shelf: Biquad = {
    b0: 1.53512485958697,
    b1: -2.69169618940638,
    b2: 1.19839281085285,
    a1: -1.69065929318241,
    a2: 0.73248077421585
  }
  const hp: Biquad = {
    b0: 1.0,
    b1: -2.0,
    b2: 1.0,
    a1: -1.99004745483398,
    a2: 0.99007225036621
  }
  return applyBiquad(applyBiquad(samples, shelf), hp)
}

export function measureLufs(samples: Float32Array, sampleRate: number): number {
  const resampled = sampleRate === 48000 ? samples : resampleLinear(samples, sampleRate, 48000)
  if (resampled.length < 48000 * 0.4) return -70
  const weighted = kWeight(resampled, 48000)
  const blockSize = Math.round(48000 * 0.4)
  const hop = Math.round(48000 * 0.1)
  const powers: number[] = []
  const loudnessValues: number[] = []

  for (let start = 0; start + blockSize <= weighted.length; start += hop) {
    let sum = 0
    for (let i = start; i < start + blockSize; i++) sum += weighted[i] * weighted[i]
    const power = sum / blockSize
    powers.push(power)
    loudnessValues.push(-0.691 + 10 * Math.log10(power + 1e-12))
  }
  if (powers.length === 0) return -70

  const absolute: number[] = []
  for (let i = 0; i < powers.length; i++) {
    if (loudnessValues[i] > -70) absolute.push(i)
  }
  if (absolute.length === 0) return -70

  const meanAbsolute = absolute.reduce((acc, i) => acc + powers[i], 0) / absolute.length
  const relativeThreshold = -0.691 + 10 * Math.log10(meanAbsolute + 1e-12) - 10
  const gated = absolute.filter((i) => loudnessValues[i] > relativeThreshold)
  const selected = gated.length > 0 ? gated : absolute
  const mean = selected.reduce((acc, i) => acc + powers[i], 0) / selected.length
  return -0.691 + 10 * Math.log10(mean + 1e-12)
}

function peakLimit(samples: Float32Array, ceilingDb: number): Float32Array {
  let peak = 0
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]))
  const ceiling = dbToGain(ceilingDb)
  if (peak <= ceiling || peak === 0) return samples
  const gain = ceiling / peak
  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i++) out[i] = Math.max(-ceiling, Math.min(ceiling, samples[i] * gain))
  return out
}

export function processPreset(input: Float32Array, sampleRate: number, preset: PresetId): Float32Array {
  if (preset === 'original') return input.slice()
  const config = PRESET_CONFIG[preset]
  let samples = applyBiquad(input, highpassCoeffs(sampleRate, config.highpass))

  for (const band of config.bandpasses) {
    if (band.type === 'peaking') {
      samples = applyBiquad(samples, peakingCoeffs(sampleRate, band.frequency, band.q ?? 1, band.gain))
    } else if (band.type === 'highshelf') {
      samples = applyBiquad(samples, highshelfCoeffs(sampleRate, band.frequency, band.gain))
    } else {
      samples = applyBiquad(samples, lowshelfCoeffs(sampleRate, band.frequency, band.gain))
    }
  }

  samples = deEss(samples, sampleRate, config.deEsser)
  samples = compress(samples, sampleRate, config.compressor)

  const lufs = measureLufs(samples, sampleRate)
  if (Number.isFinite(lufs) && lufs > -70) {
    const gain = dbToGain(config.targetLufs - lufs)
    if (Math.abs(gain - 1) > 0.01) {
      const gained = new Float32Array(samples.length)
      for (let i = 0; i < samples.length; i++) gained[i] = samples[i] * gain
      samples = gained
    }
  }

  samples = peakLimit(samples, config.ceilingDb)

  const fade = Math.min(Math.floor(sampleRate * 0.008), Math.floor(samples.length / 2))
  for (let i = 0; i < fade; i++) {
    const gain = i / fade
    samples[i] *= gain
    samples[samples.length - 1 - i] *= gain
  }

  for (let i = 0; i < samples.length; i++) {
    if (samples[i] > 1) samples[i] = 1
    if (samples[i] < -1) samples[i] = -1
  }
  return samples
}

export const PRESET_META: Record<
  PresetId,
  { name: string; short: string; description: string; target?: string }
> = {
  original: {
    name: 'Original',
    short: 'Natural',
    description: 'La salida directa del modelo, sin ningún procesado adicional.'
  },
  studio: {
    name: 'Estudio',
    short: 'Limpio',
    description: 'Limpieza suave, control de graves, presencia y compresión ligera. −18 LUFS.',
    target: '−18 LUFS'
  },
  podcast: {
    name: 'Podcast',
    short: 'Cálido',
    description: 'Voz cercana y cálida, más presencia y compresión. −16 LUFS.',
    target: '−16 LUFS'
  },
  radio: {
    name: 'Radio',
    short: 'Potente',
    description: 'Sonido denso y brillante, compresión fuerte y limitador. −14 LUFS.',
    target: '−14 LUFS'
  }
}

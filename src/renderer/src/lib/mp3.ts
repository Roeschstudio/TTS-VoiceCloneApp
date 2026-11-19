import { Mp3Encoder } from '@breezystack/lamejs'
import { resampleLinear, toInt16 } from './audio'

export function encodeMp3(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const targetRate = 44100
  const resampled = resampleLinear(samples, sampleRate, targetRate)
  const pcm = toInt16(resampled)
  const encoder = new Mp3Encoder(1, targetRate, 160)
  const chunks: Uint8Array[] = []
  const blockSize = 1152

  for (let offset = 0; offset < pcm.length; offset += blockSize) {
    const block = pcm.subarray(offset, Math.min(pcm.length, offset + blockSize))
    const encoded = encoder.encodeBuffer(block)
    if (encoded.length > 0) chunks.push(encoded)
  }

  const tail = encoder.flush()
  if (tail.length > 0) chunks.push(tail)

  const total = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
  const output = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output.buffer
}

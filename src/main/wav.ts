export interface WavInfo {
  sampleRate: number
  channels: number
  bitsPerSample: number
  durationSec: number
  dataBytes: number
  dataOffset: number
}

export function readWavInfo(buffer: Buffer): WavInfo | null {
  if (buffer.length < 44) return null
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') return null

  let offset = 12
  let sampleRate = 0
  let channels = 0
  let bitsPerSample = 0
  let dataBytes = 0
  let dataOffset = 0

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4)
    const chunkSize = buffer.readUInt32LE(offset + 4)
    const body = offset + 8
    if (chunkId === 'fmt ' && body + 16 <= buffer.length) {
      channels = buffer.readUInt16LE(body + 2)
      sampleRate = buffer.readUInt32LE(body + 4)
      bitsPerSample = buffer.readUInt16LE(body + 14)
    } else if (chunkId === 'data') {
      dataBytes = Math.min(chunkSize, buffer.length - body)
      dataOffset = body
    }
    offset = body + chunkSize + (chunkSize % 2)
  }

  if (!sampleRate || !channels || !bitsPerSample || !dataBytes) return null
  const bytesPerFrame = channels * (bitsPerSample / 8)
  return {
    sampleRate,
    channels,
    bitsPerSample,
    dataBytes,
    dataOffset,
    durationSec: dataBytes / (sampleRate * bytesPerFrame)
  }
}

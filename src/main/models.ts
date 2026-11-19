import fs from 'node:fs'
import path from 'node:path'
import { ModelFileState } from '@shared/types'
import { getPaths } from './paths'

export const MODEL_REVISION = 'ca27d74bc954b73dadab5b71ca265d87fc861a7c'

export interface ModelFileDef {
  name: string
  size: number
  url: string
}

export const MODEL_FILES: ModelFileDef[] = [
  {
    name: 'Qwen3-TTS-12Hz-1.7B-Base-Q4_K_M.gguf',
    size: 1035965280,
    url: `https://huggingface.co/ggml-org/Qwen3-TTS-12Hz-1.7B-Base-GGUF/resolve/${MODEL_REVISION}/Qwen3-TTS-12Hz-1.7B-Base-Q4_K_M.gguf?download=true`
  },
  {
    name: 'mmproj-Qwen3-TTS-12Hz-1.7B-Base-Q8_0.gguf',
    size: 446422912,
    url: `https://huggingface.co/ggml-org/Qwen3-TTS-12Hz-1.7B-Base-GGUF/resolve/${MODEL_REVISION}/mmproj-Qwen3-TTS-12Hz-1.7B-Base-Q8_0.gguf?download=true`
  }
]

export const MODEL_TOTAL_BYTES = MODEL_FILES.reduce((acc, file) => acc + file.size, 0)

export function getModelFiles(): ModelFileState[] {
  const { modelsDir } = getPaths()
  return MODEL_FILES.map((file) => {
    let presentBytes = 0
    try {
      presentBytes = fs.statSync(path.join(modelsDir, file.name)).size
    } catch {
      presentBytes = 0
    }
    return {
      name: file.name,
      expectedBytes: file.size,
      presentBytes,
      ready: presentBytes === file.size
    }
  })
}

export function isModelReady(): boolean {
  return getModelFiles().every((file) => file.ready)
}

export function deleteModelFiles(): void {
  const { modelsDir } = getPaths()
  for (const file of MODEL_FILES) {
    try {
      fs.rmSync(path.join(modelsDir, file.name), { force: true })
    } catch {
      // ignore
    }
  }
}

export function runtimeExists(): boolean {
  const { runtimePath } = getPaths()
  return (
    fs.existsSync(path.join(runtimePath, 'vulkan', 'llama-tts.exe')) ||
    fs.existsSync(path.join(runtimePath, 'cpu', 'llama-tts.exe'))
  )
}

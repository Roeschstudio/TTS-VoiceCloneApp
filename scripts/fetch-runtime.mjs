import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const version = 'b12287'
const root = process.cwd()
const downloads = path.join(root, '.dev', 'downloads')
const targets = [
  {
    name: 'vulkan',
    asset: `llama-${version}-bin-win-vulkan-x64.zip`
  },
  {
    name: 'cpu',
    asset: `llama-${version}-bin-win-cpu-x64.zip`
  }
]

fs.mkdirSync(downloads, { recursive: true })

for (const target of targets) {
  const zip = path.join(downloads, target.asset)
  const destination = path.join(root, 'runtime', target.name)
  const url = `https://github.com/ggml-org/llama.cpp/releases/download/${version}/${target.asset}`
  fs.mkdirSync(destination, { recursive: true })
  console.log(`Descargando ${target.asset}…`)
  execFileSync('curl.exe', ['-L', '--fail', '--retry', '5', '--retry-delay', '2', '-C', '-', '-o', zip, url], {
    stdio: 'inherit'
  })
  console.log(`Extrayendo en ${destination}…`)
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Path '${zip.replace(/'/g, "''")}' -DestinationPath '${destination.replace(/'/g, "''")}' -Force`
    ],
    { stdio: 'inherit' }
  )
}

console.log('Runtime listo en runtime/vulkan y runtime/cpu.')

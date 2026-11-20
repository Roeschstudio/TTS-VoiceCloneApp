import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { Backend, GpuInfo, GpuVendor, HardwareInfo, VulkanDevice } from '@shared/types'
import { getPaths } from './paths'
import { getSettings } from './settings'

const execFileAsync = promisify(execFile)

let cached: HardwareInfo | null = null

async function powershell(script: string): Promise<string> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ${script}`
    ],
    { timeout: 20000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }
  )
  return stdout.trim()
}

interface CimCpu {
  Name?: string
  NumberOfCores?: number
  NumberOfLogicalProcessors?: number
}

interface CimGpu {
  Name?: string
  AdapterRAM?: number
}

interface NvidiaGpu {
  name: string
  vramMB: number
  driverVersion: string
}

async function readCpu(): Promise<CimCpu> {
  try {
    const out = await powershell(
      'Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors | ConvertTo-Json -Compress'
    )
    if (!out) return {}
    const parsed = JSON.parse(out)
    return Array.isArray(parsed) ? parsed[0] : parsed
  } catch {
    return {}
  }
}

async function readGpus(): Promise<CimGpu[]> {
  try {
    const out = await powershell(
      'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress'
    )
    if (!out) return []
    const parsed = JSON.parse(out)
    return Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return []
  }
}

// Win32_VideoController.AdapterRAM is a 32-bit field: any GPU above 4 GB reports
// a wrapped value. nvidia-smi gives the real total, so prefer it for NVIDIA.
async function readNvidiaGpus(): Promise<NvidiaGpu[]> {
  const candidates = [
    'nvidia-smi',
    path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'nvidia-smi.exe'),
    path.join(
      process.env.ProgramFiles || 'C:\\Program Files',
      'NVIDIA Corporation',
      'NVSMI',
      'nvidia-smi.exe'
    )
  ]

  for (const exe of candidates) {
    try {
      const { stdout } = await execFileAsync(
        exe,
        ['--query-gpu=name,memory.total,driver_version', '--format=csv,noheader,nounits'],
        { timeout: 8000, windowsHide: true, maxBuffer: 1024 * 1024 }
      )
      const gpus = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, memory, driver] = line.split(',').map((part) => part.trim())
          return {
            name: name || 'NVIDIA GPU',
            vramMB: Number(memory) || 0,
            driverVersion: driver || ''
          }
        })
      if (gpus.length > 0) return gpus
    } catch {
      // try the next location
    }
  }
  return []
}

function vendorOf(name: string): GpuVendor {
  if (/NVIDIA|GeForce|RTX|Quadro|Tesla/i.test(name)) return 'nvidia'
  if (/AMD|Radeon|ATI|FirePro/i.test(name)) return 'amd'
  if (/Intel/i.test(name)) return 'intel'
  return 'other'
}

function cleanDeviceName(raw: string): string {
  return raw.replace(/\s*\([^)]*MiB[^)]*\)\s*$/i, '').replace(/\s+/g, ' ').trim()
}

async function readVulkanDevices(): Promise<VulkanDevice[]> {
  const exe = path.join(getPaths().runtimePath, 'vulkan', 'llama-tts.exe')
  if (!fs.existsSync(exe)) return []
  try {
    const { stdout, stderr } = await execFileAsync(exe, ['--list-devices'], {
      timeout: 25000,
      windowsHide: true,
      cwd: path.dirname(exe),
      maxBuffer: 2 * 1024 * 1024
    })
    const text = `${stdout}\n${stderr}`
    const devices: VulkanDevice[] = []
    const re = /Vulkan(\d+):\s*(.+?)\s*\((\d+)\s*MiB,\s*(\d+)\s*MiB free\)/g
    let match: RegExpExecArray | null
    while ((match = re.exec(text))) {
      devices.push({
        index: Number(match[1]),
        name: cleanDeviceName(match[2]),
        vramMB: Number(match[3]),
        freeMB: Number(match[4])
      })
    }
    return devices
  } catch {
    return []
  }
}

// Integrated GPUs share system RAM, so their "free VRAM" can look larger than a
// discrete card's. Match known discrete families instead of blacklisting iGPUs.
const INTEGRATED_RE =
  /Radeon\(TM\) Graphics|Radeon Graphics|Radeon \d{3}M|Radeon Vega|Vega \d+|Intel\(R\) (UHD|Iris|HD|Graphics)|Microsoft Basic|Microsoft Hyper-V|llvmpipe/i

const DISCRETE_RE =
  /NVIDIA|GeForce|RTX|Quadro|Tesla|Radeon RX|Radeon Pro|FirePro|Intel\(R\) Arc\(TM\) [AB]\d/i

function isDiscreteGpu(name: string): boolean {
  if (INTEGRATED_RE.test(name)) return false
  return DISCRETE_RE.test(name)
}

function selectVulkanDevice(devices: VulkanDevice[]): number | null {
  if (devices.length === 0) return null
  const discrete = devices.filter((device) => isDiscreteGpu(device.name))
  if (discrete.length > 0) {
    discrete.sort((a, b) => b.freeMB - a.freeMB || b.vramMB - a.vramMB)
    return discrete[0].index
  }
  const unknown = devices.filter((device) => !INTEGRATED_RE.test(device.name))
  if (unknown.length === 1) return unknown[0].index
  if (devices.length === 1) return devices[0].index
  return null
}

export async function detectHardware(force = false): Promise<HardwareInfo> {
  if (cached && !force) return cached

  const [cpu, gpus, nvidiaGpus, vulkanDevices] = await Promise.all([
    readCpu(),
    readGpus(),
    readNvidiaGpus(),
    readVulkanDevices()
  ])

  let diskFreeGB = 0
  try {
    const root = path.parse(getPaths().dataRoot).root
    const stat = fs.statfsSync(root)
    diskFreeGB = Math.round(((stat.bavail * stat.bsize) / 1024 ** 3) * 10) / 10
  } catch {
    diskFreeGB = 0
  }

  const mappedGpus: GpuInfo[] = [
    ...nvidiaGpus.map((gpu) => ({
      name: gpu.name,
      vramMB: gpu.vramMB,
      vendor: 'nvidia' as const,
      driverVersion: gpu.driverVersion || undefined
    })),
    ...gpus
      .filter((gpu) => Boolean(gpu.Name))
      .filter((gpu) => !(nvidiaGpus.length > 0 && /NVIDIA/i.test(gpu.Name as string)))
      .map((gpu) => ({
        name: gpu.Name as string,
        vramMB: Math.round((gpu.AdapterRAM || 0) / 1024 / 1024),
        vendor: vendorOf(gpu.Name as string)
      }))
  ]

  const hasVulkanLoader = fs.existsSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'vulkan-1.dll'))
  const selectedVulkanIndex = selectVulkanDevice(vulkanDevices)
  const selectedVulkan = vulkanDevices.find((device) => device.index === selectedVulkanIndex)
  const primaryGpuName =
    selectedVulkan?.name ??
    mappedGpus.find((gpu) => isDiscreteGpu(gpu.name))?.name ??
    mappedGpus[0]?.name ??
    null

  cached = {
    os: `${os.type()} ${os.release()} (${process.arch})`,
    cpuModel: (cpu.Name || os.cpus()[0]?.model || 'CPU desconocida').replace(/\s+/g, ' ').trim(),
    cpuCores: cpu.NumberOfCores || os.cpus().length,
    cpuThreads: cpu.NumberOfLogicalProcessors || os.cpus().length,
    ramGB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    gpus: mappedGpus,
    primaryGpuName,
    hasVulkan: hasVulkanLoader && vulkanDevices.length > 0,
    vulkanDevices,
    selectedVulkanIndex,
    diskFreeGB
  }

  return cached
}

export function resolveBackend(hardware: HardwareInfo, preference = getSettings().backend): Backend {
  if (preference === 'cpu') return 'cpu'
  if (preference === 'vulkan') return hardware.vulkanDevices.length > 0 ? 'vulkan' : 'cpu'
  return hardware.hasVulkan && hardware.selectedVulkanIndex !== null ? 'vulkan' : 'cpu'
}

export function resetHardwareCache(): void {
  cached = null
}

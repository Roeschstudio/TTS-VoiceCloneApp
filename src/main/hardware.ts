import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { Backend, HardwareInfo, VulkanDevice } from '@shared/types'
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

const INTEGRATED_RE = /Radeon\(TM\) Graphics|Radeon Graphics|Intel\(R\) (UHD|Iris|HD)|Microsoft Basic|Microsoft Hyper-V|llvmpipe/i

function selectVulkanDevice(devices: VulkanDevice[]): number | null {
  if (devices.length === 0) return null
  const discrete = devices.filter((d) => !INTEGRATED_RE.test(d.name))
  if (discrete.length > 0) {
    discrete.sort((a, b) => b.freeMB - a.freeMB || b.vramMB - a.vramMB)
    return discrete[0].index
  }
  if (devices.length === 1) return devices[0].index
  return null
}

export async function detectHardware(force = false): Promise<HardwareInfo> {
  if (cached && !force) return cached

  const [cpu, gpus, vulkanDevices] = await Promise.all([readCpu(), readGpus(), readVulkanDevices()])

  let diskFreeGB = 0
  try {
    const root = path.parse(getPaths().dataRoot).root
    const stat = fs.statfsSync(root)
    diskFreeGB = Math.round(((stat.bavail * stat.bsize) / 1024 ** 3) * 10) / 10
  } catch {
    diskFreeGB = 0
  }

  const mappedGpus = gpus
    .filter((g) => Boolean(g.Name))
    .map((g) => ({
      name: g.Name as string,
      vramMB: Math.round((g.AdapterRAM || 0) / 1024 / 1024)
    }))

  const hasVulkanLoader = fs.existsSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'vulkan-1.dll'))

  cached = {
    os: `${os.type()} ${os.release()} (${process.arch})`,
    cpuModel: (cpu.Name || os.cpus()[0]?.model || 'CPU desconocida').replace(/\s+/g, ' ').trim(),
    cpuCores: cpu.NumberOfCores || os.cpus().length,
    cpuThreads: cpu.NumberOfLogicalProcessors || os.cpus().length,
    ramGB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    gpus: mappedGpus,
    hasVulkan: hasVulkanLoader && vulkanDevices.length > 0,
    vulkanDevices,
    selectedVulkanIndex: selectVulkanDevice(vulkanDevices),
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

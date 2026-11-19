import fs from 'node:fs'
import { AppSettings, DEFAULT_SETTINGS } from '@shared/types'
import { getPaths } from './paths'

let cached: AppSettings | null = null

export function getSettings(): AppSettings {
  if (cached) return cached
  const { settingsFile } = getPaths()
  try {
    const raw = fs.readFileSync(settingsFile, 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    cached = { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    cached = { ...DEFAULT_SETTINGS }
  }
  return cached
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  cached = next
  const { settingsFile } = getPaths()
  fs.writeFileSync(settingsFile, JSON.stringify(next, null, 2), 'utf8')
  return next
}

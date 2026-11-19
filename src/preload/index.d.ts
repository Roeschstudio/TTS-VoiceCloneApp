import type { RoeschAPI } from './index'

declare global {
  interface Window {
    roesch: RoeschAPI
  }
}

export {}

import { ElectronAPI } from '@electron-toolkit/preload'
import type { DistilleryAPI } from '../renderer/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: DistilleryAPI
  }
}

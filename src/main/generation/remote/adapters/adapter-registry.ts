import type { ProviderAdapter } from './types'

const adapters = new Map<string, ProviderAdapter>()

export function registerProviderAdapter(name: string, adapter: ProviderAdapter): void {
  adapters.set(name, adapter)
}

export function getProviderAdapter(name?: string): ProviderAdapter | null {
  if (!name) return null
  return adapters.get(name) ?? null
}

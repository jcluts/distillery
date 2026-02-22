import type { GenerationProvider } from './types'

export class ProviderRegistry {
  private providers = new Map<string, GenerationProvider>()

  register(provider: GenerationProvider): void {
    this.providers.set(provider.providerId, provider)
  }

  get(providerId: string): GenerationProvider | null {
    return this.providers.get(providerId) ?? null
  }

  list(): GenerationProvider[] {
    return Array.from(this.providers.values())
  }
}

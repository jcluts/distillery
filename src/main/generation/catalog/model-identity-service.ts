import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'

export interface ModelIdentity {
  id: string
  name: string
  description?: string
  providerMapping: Record<string, string[]>
}

const builtInIdentityModule = import.meta.glob('../../defaults/model-identities.json', {
  eager: true,
  import: 'default'
}) as Record<string, Record<string, ModelIdentity>>

function cloneIdentity(value: ModelIdentity): ModelIdentity {
  return {
    id: value.id,
    name: value.name,
    description: value.description,
    providerMapping: Object.fromEntries(
      Object.entries(value.providerMapping ?? {}).map(([providerId, modelIds]) => [
        providerId,
        [...new Set((modelIds ?? []).map((id) => String(id).trim()).filter(Boolean))]
      ])
    )
  }
}

function mergeIdentity(base: ModelIdentity, override: ModelIdentity): ModelIdentity {
  const merged = cloneIdentity(base)
  merged.name = override.name || merged.name
  merged.description = override.description ?? merged.description

  for (const [providerId, modelIds] of Object.entries(override.providerMapping ?? {})) {
    const existing = merged.providerMapping[providerId] ?? []
    merged.providerMapping[providerId] = [...new Set([...existing, ...modelIds])]
  }

  return merged
}

function isModelIdentity(value: unknown): value is ModelIdentity {
  if (!value || typeof value !== 'object') return false
  const maybe = value as Partial<ModelIdentity>
  return (
    typeof maybe.id === 'string' &&
    typeof maybe.name === 'string' &&
    maybe.providerMapping !== null &&
    typeof maybe.providerMapping === 'object'
  )
}

function isIdentityMap(value: unknown): value is Record<string, ModelIdentity> {
  if (!value || typeof value !== 'object') return false
  return Object.values(value).every((entry) => isModelIdentity(entry))
}

export class ModelIdentityService {
  private identities = new Map<string, ModelIdentity>()

  private getDefaults(): Record<string, ModelIdentity> {
    const first = Object.values(builtInIdentityModule)[0] ?? {}
    if (!isIdentityMap(first)) return {}
    return Object.fromEntries(
      Object.entries(first).map(([id, identity]) => [id, cloneIdentity(identity)])
    )
  }

  private getRuntimePath(): string {
    return path.join(app.getPath('userData'), 'model-identities.json')
  }

  private loadOverrides(): Record<string, ModelIdentity> {
    const filePath = this.getRuntimePath()
    if (!fs.existsSync(filePath)) return {}

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
      if (!isIdentityMap(parsed)) {
        return {}
      }

      return parsed
    } catch {
      return {}
    }
  }

  loadIdentities(): Record<string, ModelIdentity> {
    const defaults = this.getDefaults()
    const overrides = this.loadOverrides()

    this.identities.clear()

    for (const [id, identity] of Object.entries(defaults)) {
      this.identities.set(id, cloneIdentity(identity))
    }

    for (const [id, identity] of Object.entries(overrides)) {
      const existing = this.identities.get(id)
      this.identities.set(id, existing ? mergeIdentity(existing, identity) : cloneIdentity(identity))
    }

    return Object.fromEntries(this.identities.entries())
  }

  findIdentityId(providerModelId: string, providerId: string): string | null {
    if (!this.identities.size) {
      this.loadIdentities()
    }

    const needle = providerModelId.trim()
    if (!needle) return null

    for (const [identityId, identity] of this.identities.entries()) {
      const mappedIds = identity.providerMapping[providerId] ?? []
      if (mappedIds.includes(needle)) {
        return identityId
      }
    }

    return null
  }

  addMapping(identityId: string, providerId: string, modelIds: string[]): void {
    if (!this.identities.size) {
      this.loadIdentities()
    }

    const existing = this.identities.get(identityId)
    if (!existing) {
      throw new Error(`Unknown model identity: ${identityId}`)
    }

    const normalized = modelIds.map((id) => id.trim()).filter(Boolean)
    if (normalized.length === 0) return

    const prior = existing.providerMapping[providerId] ?? []
    existing.providerMapping[providerId] = [...new Set([...prior, ...normalized])]
    this.identities.set(identityId, cloneIdentity(existing))
    this.persist()
  }

  createIdentity(
    id: string,
    name: string,
    description: string,
    initialMapping?: { providerId: string; modelIds: string[] }
  ): ModelIdentity {
    if (!this.identities.size) {
      this.loadIdentities()
    }

    const normalizedId = id.trim()
    const normalizedName = name.trim()

    if (!normalizedId) {
      throw new Error('Model identity id is required')
    }

    if (!normalizedName) {
      throw new Error('Model identity name is required')
    }

    if (this.identities.has(normalizedId)) {
      throw new Error(`Model identity already exists: ${normalizedId}`)
    }

    const identity: ModelIdentity = {
      id: normalizedId,
      name: normalizedName,
      description: description.trim() || undefined,
      providerMapping: {}
    }

    if (initialMapping?.providerId) {
      const mappedIds = (initialMapping.modelIds ?? []).map((value) => value.trim()).filter(Boolean)
      if (mappedIds.length > 0) {
        identity.providerMapping[initialMapping.providerId] = [...new Set(mappedIds)]
      }
    }

    this.identities.set(identity.id, identity)
    this.persist()

    return cloneIdentity(identity)
  }

  persist(): void {
    const filePath = this.getRuntimePath()
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(Object.fromEntries(this.identities), null, 2), 'utf8')
  }
}

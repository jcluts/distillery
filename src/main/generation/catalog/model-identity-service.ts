import Database from 'better-sqlite3'
import * as identityRepo from '../../db/repositories/model-identities'

export interface ModelIdentity {
  id: string
  name: string
  description?: string
  providerMapping: Record<string, string[]>
}

/**
 * DB-backed model identity service.
 *
 * Replaces the old JSON-file-based implementation. Same public API shape
 * so callers (IPC handlers, ProviderManager) need minimal changes.
 */
export class ModelIdentityService {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  /**
   * Load all identities with their provider mappings assembled.
   */
  loadIdentities(): Record<string, ModelIdentity> {
    const rows = identityRepo.getAllIdentities(this.db)
    const result: Record<string, ModelIdentity> = {}

    for (const row of rows) {
      const mappings = identityRepo.getMappingsForIdentity(this.db, row.id)
      const providerMapping: Record<string, string[]> = {}

      for (const mapping of mappings) {
        if (!providerMapping[mapping.provider_id]) {
          providerMapping[mapping.provider_id] = []
        }
        providerMapping[mapping.provider_id].push(mapping.provider_model_id)
      }

      result[row.id] = {
        id: row.id,
        name: row.name,
        description: row.description ?? undefined,
        providerMapping
      }
    }

    return result
  }

  /**
   * Find the identity ID for a given provider model.
   */
  findIdentityId(providerModelId: string, providerId: string): string | null {
    const needle = providerModelId.trim()
    if (!needle) return null
    return identityRepo.findIdentityByProviderModel(this.db, providerId, needle)
  }

  /**
   * Add provider model mapping(s) to an existing identity.
   */
  addMapping(identityId: string, providerId: string, modelIds: string[]): void {
    const identity = identityRepo.getIdentityById(this.db, identityId)
    if (!identity) {
      throw new Error(`Unknown model identity: ${identityId}`)
    }

    const normalized = modelIds.map((id) => id.trim()).filter(Boolean)
    if (normalized.length === 0) return

    this.db.transaction(() => {
      for (const modelId of normalized) {
        identityRepo.addMapping(this.db, identityId, providerId, modelId)
      }
    })()
  }

  /**
   * Create a new identity with optional initial provider mapping.
   */
  createIdentity(
    id: string,
    name: string,
    description: string,
    initialMapping?: { providerId: string; modelIds: string[] }
  ): ModelIdentity {
    const normalizedId = id.trim()
    const normalizedName = name.trim()

    if (!normalizedId) throw new Error('Model identity id is required')
    if (!normalizedName) throw new Error('Model identity name is required')

    const existing = identityRepo.getIdentityById(this.db, normalizedId)
    if (existing) throw new Error(`Model identity already exists: ${normalizedId}`)

    this.db.transaction(() => {
      identityRepo.createIdentity(
        this.db,
        normalizedId,
        normalizedName,
        description.trim() || undefined
      )

      if (initialMapping?.providerId) {
        const mappedIds = (initialMapping.modelIds ?? [])
          .map((value) => value.trim())
          .filter(Boolean)
        for (const modelId of new Set(mappedIds)) {
          identityRepo.addMapping(this.db, normalizedId, initialMapping.providerId, modelId)
        }
      }
    })()

    // Return the fully assembled identity
    const mappings = identityRepo.getMappingsForIdentity(this.db, normalizedId)
    const providerMapping: Record<string, string[]> = {}
    for (const m of mappings) {
      if (!providerMapping[m.provider_id]) providerMapping[m.provider_id] = []
      providerMapping[m.provider_id].push(m.provider_model_id)
    }

    return {
      id: normalizedId,
      name: normalizedName,
      description: description.trim() || undefined,
      providerMapping
    }
  }
}

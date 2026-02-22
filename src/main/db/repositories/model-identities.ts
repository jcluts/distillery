import Database from 'better-sqlite3'

export interface ModelIdentityRow {
  id: string
  name: string
  description: string | null
  media_type: string
  created_at: string
}

export interface ModelIdentityMappingRow {
  identity_id: string
  provider_id: string
  provider_model_id: string
  created_at: string
}

/**
 * Get all model identities.
 */
export function getAllIdentities(db: Database.Database): ModelIdentityRow[] {
  return db.prepare('SELECT * FROM model_identities ORDER BY name').all() as ModelIdentityRow[]
}

/**
 * Get a single identity by ID.
 */
export function getIdentityById(
  db: Database.Database,
  id: string
): ModelIdentityRow | null {
  return (
    (db
      .prepare('SELECT * FROM model_identities WHERE id = ?')
      .get(id) as ModelIdentityRow) ?? null
  )
}

/**
 * Create a new model identity.
 */
export function createIdentity(
  db: Database.Database,
  id: string,
  name: string,
  description?: string
): ModelIdentityRow {
  db.prepare(
    `INSERT INTO model_identities (id, name, description) VALUES (?, ?, ?)`
  ).run(id, name, description ?? null)

  return getIdentityById(db, id)!
}

/**
 * Get all mappings for a given identity.
 */
export function getMappingsForIdentity(
  db: Database.Database,
  identityId: string
): ModelIdentityMappingRow[] {
  return db
    .prepare('SELECT * FROM model_identity_mappings WHERE identity_id = ?')
    .all(identityId) as ModelIdentityMappingRow[]
}

/**
 * Find the identity ID for a given provider + provider model ID.
 */
export function findIdentityByProviderModel(
  db: Database.Database,
  providerId: string,
  providerModelId: string
): string | null {
  const row = db
    .prepare(
      'SELECT identity_id FROM model_identity_mappings WHERE provider_id = ? AND provider_model_id = ?'
    )
    .get(providerId, providerModelId) as { identity_id: string } | undefined

  return row?.identity_id ?? null
}

/**
 * Add a provider mapping to an identity. Silently ignores duplicates.
 */
export function addMapping(
  db: Database.Database,
  identityId: string,
  providerId: string,
  providerModelId: string
): void {
  db.prepare(
    `INSERT OR IGNORE INTO model_identity_mappings (identity_id, provider_id, provider_model_id)
     VALUES (?, ?, ?)`
  ).run(identityId, providerId, providerModelId)
}

/**
 * Remove a provider mapping.
 */
export function removeMapping(
  db: Database.Database,
  providerId: string,
  providerModelId: string
): void {
  db.prepare(
    'DELETE FROM model_identity_mappings WHERE provider_id = ? AND provider_model_id = ?'
  ).run(providerId, providerModelId)
}

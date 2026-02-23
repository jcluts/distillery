type AsRecord = (value: unknown) => Record<string, unknown> | null
type GetString = (value: unknown) => string | null

export interface ProviderOutputArtifact {
  providerPath: string
  mimeType?: string
}

export function getByPath(
  value: unknown,
  pathExpression: string,
  asRecord: AsRecord
): unknown {
  if (!pathExpression) return value

  const parts = pathExpression.split('.').filter(Boolean)
  let cursor: unknown = value

  for (const part of parts) {
    const record = asRecord(cursor)
    if (!record || !(part in record)) {
      return undefined
    }
    cursor = record[part]
  }

  return cursor
}

export function extractModelCandidates(value: unknown, asRecord: AsRecord): unknown[] {
  if (Array.isArray(value)) {
    return value
  }

  const root = asRecord(value)
  if (!root) return []

  if (Array.isArray(root.models)) return root.models
  if (Array.isArray(root.results)) return root.results
  if (Array.isArray(root.data)) return root.data

  return []
}

export function extractHasMore(value: unknown, asRecord: AsRecord): boolean | undefined {
  const root = asRecord(value)
  if (!root) return undefined

  const hasMore = root.has_more
  if (typeof hasMore === 'boolean') {
    return hasMore
  }

  const next = root.next
  if (typeof next === 'string') {
    return next.trim().length > 0
  }

  return undefined
}

export function normalizeOutputs(
  value: unknown,
  asRecord: AsRecord,
  getString: GetString
): ProviderOutputArtifact[] {
  if (!value) return []

  if (typeof value === 'string') {
    return [{ providerPath: value }]
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') {
          return { providerPath: entry }
        }

        const record = asRecord(entry)
        if (!record) return null

        const providerPath =
          getString(record.url) ||
          getString(record.uri) ||
          getString(record.download_url) ||
          getString(record.response_url) ||
          getString(record.path)

        if (!providerPath) return null

        return {
          providerPath,
          mimeType: getString(record.mime_type) || getString(record.mimeType) || undefined
        }
      })
      .filter((entry): entry is ProviderOutputArtifact => !!entry)
  }

  const record = asRecord(value)
  if (!record) return []

  const nested =
    record.outputs ??
    record.output ??
    record.images ??
    record.image ??
    record.videos ??
    record.video ??
    record.data ??
    record.response_url ??
    record.url ??
    record.download_url ??
    null

  return normalizeOutputs(nested, asRecord, getString)
}

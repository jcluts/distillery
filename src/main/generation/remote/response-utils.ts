type AsRecord = (value: unknown) => Record<string, unknown> | null
type GetString = (value: unknown) => string | null

export interface ProviderOutputArtifact {
  providerPath: string
  mimeType?: string
}

export function getByPath(value: unknown, pathExpression: string, asRecord: AsRecord): unknown {
  if (!pathExpression) return value

  const parts = pathExpression.split('.').filter(Boolean)
  let cursor: unknown = value

  for (const part of parts) {
    if (Array.isArray(cursor)) {
      const index = Number(part)
      if (Number.isInteger(index)) {
        cursor = cursor[index]
        continue
      }
      if (cursor.length !== 1) {
        return undefined
      }
      cursor = cursor[0]
    }

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
    return [normalizeStringOutput(value)]
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string') {
          return normalizeStringOutput(entry)
        }

        const record = asRecord(entry)
        if (!record) return null

        const providerPath =
          getString(record.url) ||
          getString(record.uri) ||
          getString(record.download_url) ||
          getString(record.response_url) ||
          getString(record.imageURL) ||
          getString(record.videoURL) ||
          getString(record.imageDataURI) ||
          getString(record.path) ||
          toDataUrl(
            getString(record.b64_json) ||
              getString(record.base64) ||
              getString(record.imageBase64Data),
            getString(record.mime_type)
          )

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
    record.resultUrls ??
    record.data ??
    record.response_url ??
    record.url ??
    record.download_url ??
    null

  return normalizeOutputs(nested, asRecord, getString)
}

function normalizeStringOutput(value: string): ProviderOutputArtifact {
  return {
    providerPath: toDataUrl(value) ?? value
  }
}

function toDataUrl(value: string | null, mimeType?: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^data:/i.test(trimmed)) return trimmed
  if (/^(https?|file):/i.test(trimmed)) return null
  if (trimmed.length < 64) return null
  if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) return null
  if (trimmed.includes('\\') || /\s/.test(trimmed)) return null
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) return null

  return `data:${mimeType || inferImageMimeType(trimmed)};base64,${trimmed}`
}

function inferImageMimeType(base64: string): string {
  if (base64.startsWith('/9j/')) return 'image/jpeg'
  if (base64.startsWith('UklGR')) return 'image/webp'
  if (base64.startsWith('iVBOR')) return 'image/png'
  return 'image/png'
}

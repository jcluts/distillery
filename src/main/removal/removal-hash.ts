export function stableHash(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function buildBaseSourceHash(filePath: string, activeUpscaleId: string | null): string {
  return stableHash(`base|${filePath}|${activeUpscaleId ?? 'original'}`)
}

export function buildOperationSourceHash(
  predecessorResultPath: string,
  predecessorSourceHash: string
): string {
  return stableHash(`op|${predecessorResultPath}|${predecessorSourceHash}`)
}

import { randomInt } from 'crypto'
import type { CanonicalGenerationParams } from '../types'

/**
 * Coerce an unknown value to a string. Returns '' for null/undefined.
 */
export function asString(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '')
}

/**
 * Coerce an unknown value to a number. Returns 0 for non-finite results.
 */
export function asNumber(value: unknown): number {
  if (typeof value === 'number') return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Coerce an unknown value to a number or null.
 */
export function asOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Parse width and height from params. Handles both separate width/height
 * fields and combined "size" strings (e.g. "2048*2048").
 */
export function extractDimensions(params: CanonicalGenerationParams): {
  width: number | null
  height: number | null
} {
  let width = asOptionalNumber(params.width)
  let height = asOptionalNumber(params.height)

  if (width == null || height == null) {
    const sizeStr = typeof params.size === 'string' ? params.size : ''
    if (sizeStr.includes('*')) {
      const [w, h] = sizeStr.split('*').map(Number)
      if (Number.isFinite(w) && Number.isFinite(h)) {
        width = w
        height = h
      }
    }
  }

  return { width, height }
}

/**
 * If seed is null/undefined/empty, generate a random seed.
 * Uses the range 0–2^31-1 for broad engine compatibility.
 */
export function resolveOrGenerateSeed(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  return randomInt(0, 2_147_483_647)
}

/**
 * Return params with a resolved seed (random if blank/missing).
 */
export function withResolvedSeed(
  params: CanonicalGenerationParams
): CanonicalGenerationParams {
  return { ...params, seed: resolveOrGenerateSeed(params.seed) }
}

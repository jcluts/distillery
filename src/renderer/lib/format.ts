export function formatApproxSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '—'
  }

  const gb = bytes / 1024 ** 3
  if (gb >= 1) {
    return `~${gb.toFixed(1)} GB`
  }

  const mb = bytes / 1024 ** 2
  return `~${Math.max(1, Math.round(mb))} MB`
}

export function toPercent(downloadedBytes: number, totalBytes: number): number {
  if (!totalBytes || totalBytes <= 0) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)))
}
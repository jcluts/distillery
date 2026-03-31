export function formatRelative(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(delta) || delta < 0) return 'Just now'
  const sec = Math.floor(delta / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return `${Math.floor(hr / 24)}d ago`
}

export function formatApproxSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'

  const gb = bytes / 1024 ** 3
  if (gb >= 1) return `~${gb.toFixed(1)} GB`

  const mb = bytes / 1024 ** 2
  return `~${Math.max(1, Math.round(mb))} MB`
}

export function toPercent(downloadedBytes: number, totalBytes: number): number {
  if (!totalBytes || totalBytes <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)))
}

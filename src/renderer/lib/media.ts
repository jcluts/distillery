export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '00:00'
  }

  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  const remainingSeconds = total % 60

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

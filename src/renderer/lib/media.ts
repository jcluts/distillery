export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return '00:00'
  }

  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  const remainingSeconds = total % 60

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

export function snapToFrame(time: number, frameRate: number): number {
  if (!Number.isFinite(time)) return 0

  const safeFrameRate = Number.isFinite(frameRate) && frameRate > 0 ? frameRate : 30
  return Math.round(time * safeFrameRate) / safeFrameRate
}

export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '00:00.000'
  }

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const formattedSeconds = (seconds % 60).toFixed(3).padStart(6, '0')

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${formattedSeconds}`
    : `${String(minutes).padStart(2, '0')}:${formattedSeconds}`
}

export function hasVideoEdits(
  edits: import('@/types').VideoEdits | null | undefined
): boolean {
  return !!edits?.trim
}

import { useMemo, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { SectionLabel } from '@/components/ui/section-label'
import { AspectIcon } from './AspectIcon'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASPECT_RATIOS = [
  { label: '1:1', w: 1, h: 1 },
  { label: '16:9', w: 16, h: 9 },
  { label: '9:16', w: 9, h: 16 },
  { label: '4:3', w: 4, h: 3 },
  { label: '3:4', w: 3, h: 4 },
  { label: '3:2', w: 3, h: 2 },
  { label: '2:3', w: 2, h: 3 }
]

type AspectRatioPreset = (typeof ASPECT_RATIOS)[number]

/**
 * Resolution presets: MP label → base 1:1 pixel size.
 * Actual pixel area = baseSize², then aspect ratio derives width/height from that area.
 */
const RESOLUTION_PRESETS: { mp: number; baseSize: number }[] = [
  { mp: 0.25, baseSize: 512 },
  { mp: 0.5, baseSize: 720 },
  { mp: 1.0, baseSize: 1024 },
  { mp: 1.5, baseSize: 1248 },
  { mp: 2.0, baseSize: 1456 }
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute width and height from a base 1:1 size and aspect ratio,
 * with both dimensions rounded to the nearest multiple of 16.
 */
function computeDimensions(
  baseSize: number,
  aspectW: number,
  aspectH: number
): { width: number; height: number } {
  const area = baseSize * baseSize
  const width = Math.round(Math.sqrt((area * aspectW) / aspectH) / 16) * 16
  const height = Math.round(Math.sqrt((area * aspectH) / aspectW) / 16) * 16
  return { width, height }
}

/** Check if dimensions fit within min/max bounds */
function fitsConstraints(w: number, h: number, min: number, max: number): boolean {
  return w >= min && w <= max && h >= min && h <= max
}

/** Find the resolution preset whose base area is closest to the given pixel area */
function inferResolution(w: number, h: number): (typeof RESOLUTION_PRESETS)[number] {
  const area = w * h
  let best = RESOLUTION_PRESETS[2] // default 1 MP
  let bestDiff = Infinity
  for (const preset of RESOLUTION_PRESETS) {
    const presetArea = preset.baseSize * preset.baseSize
    const diff = Math.abs(area - presetArea)
    if (diff < bestDiff) {
      bestDiff = diff
      best = preset
    }
  }
  return best
}

/** Find the closest matching aspect ratio preset */
function inferAspectRatio(w: number, h: number): AspectRatioPreset {
  const ratio = w / h
  let best = ASPECT_RATIOS[0]
  let bestDiff = Infinity
  for (const ar of ASPECT_RATIOS) {
    const diff = Math.abs(ratio - ar.w / ar.h)
    if (diff < bestDiff) {
      bestDiff = diff
      best = ar
    }
  }
  return best
}

/** Format MP label: "0.5" for fractional, "1" for whole numbers */
function formatMP(mp: number): string {
  return mp % 1 === 0 ? mp.toFixed(0) : mp.toFixed(1)
}

// ---------------------------------------------------------------------------
// LocalSizeSelector
// ---------------------------------------------------------------------------

interface LocalSizeSelectorProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  min?: number
  max?: number
  showComputed?: boolean
}

export function LocalSizeSelector({
  value,
  onChange,
  disabled,
  min = 256,
  max = 2048,
  showComputed = false
}: LocalSizeSelectorProps): React.JSX.Element {
  // Parse current size value → infer closest resolution and aspect ratio presets
  const { resolution, aspect } = useMemo(() => {
    const parts = (value || '1024*1024').split('*')
    const w = parseInt(parts[0], 10) || 1024
    const h = parseInt(parts[1], 10) || 1024
    return {
      resolution: inferResolution(w, h),
      aspect: inferAspectRatio(w, h)
    }
  }, [value])

  const handleResolution = useCallback(
    (preset: (typeof RESOLUTION_PRESETS)[number]) => {
      const { width, height } = computeDimensions(preset.baseSize, aspect.w, aspect.h)
      onChange(`${width}*${height}`)
    },
    [aspect, onChange]
  )

  const handleAspect = useCallback(
    (ar: AspectRatioPreset) => {
      const { width, height } = computeDimensions(resolution.baseSize, ar.w, ar.h)
      onChange(`${width}*${height}`)
    },
    [resolution, onChange]
  )

  // Only show resolution presets that produce valid dimensions for the current aspect ratio
  const availableResolutions = useMemo(
    () =>
      RESOLUTION_PRESETS.filter((preset) => {
        const { width, height } = computeDimensions(preset.baseSize, aspect.w, aspect.h)
        return fitsConstraints(width, height, min, max)
      }),
    [aspect, min, max]
  )

  // Computed dimensions for info display
  const computed = useMemo(
    () => computeDimensions(resolution.baseSize, aspect.w, aspect.h),
    [resolution, aspect]
  )

  return (
    <div className="space-y-3">
      {/* Resolution presets */}
      <div>
        <SectionLabel className="mb-1.5">Resolution</SectionLabel>
        <div className="grid grid-cols-5 gap-1">
          {availableResolutions.map((preset) => (
            <Button
              key={preset.mp}
              variant={resolution.mp === preset.mp ? 'secondary' : 'outline'}
              size="xs"
              onClick={() => handleResolution(preset)}
              disabled={disabled}
              className={
                resolution.mp === preset.mp
                  ? 'h-8 px-0 w-full border-primary/50 bg-primary/10'
                  : 'h-8 px-0 w-full'
              }
            >
              {formatMP(preset.mp)} MP
            </Button>
          ))}
        </div>
      </div>

      {/* Aspect ratio presets */}
      <div>
        <SectionLabel className="mb-1.5">Aspect Ratio</SectionLabel>
        <div className="grid grid-cols-5 gap-1">
          {ASPECT_RATIOS.map((ar) => (
            <Button
              key={ar.label}
              variant={aspect.w === ar.w && aspect.h === ar.h ? 'secondary' : 'outline'}
              size="xs"
              onClick={() => handleAspect(ar)}
              disabled={disabled}
              className={
                aspect.w === ar.w && aspect.h === ar.h
                  ? 'h-8 px-0 w-full border-primary/50 bg-primary/10'
                  : 'h-8 px-0 w-full'
              }
            >
              <AspectIcon ratio={ar.label} />
              {ar.label}
            </Button>
          ))}
        </div>
      </div>
      {showComputed ? (
        <>
          <div className="text-xs text-muted-foreground">
            {computed.width} × {computed.height} px
          </div>
        </>
      ) : null}
    </div>
  )
}

import { useState, useMemo, useRef } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { AspectIcon } from './AspectIcon'

// ---------------------------------------------------------------------------
// Preset definitions
// ---------------------------------------------------------------------------

// 1K presets (~1 megapixel, similar to 1024×1024)
const PRESETS_1K = [
  { label: '1:1', width: 1024, height: 1024 },
  { label: '16:9', width: 1280, height: 720 },
  { label: '9:16', width: 720, height: 1280 },
  { label: '4:3', width: 1152, height: 864 },
  { label: '3:4', width: 864, height: 1152 },
  { label: '3:2', width: 1216, height: 832 },
  { label: '2:3', width: 832, height: 1216 },
]

// 2K presets (~4 megapixels, similar to 2048×2048)
const PRESETS_2K = [
  { label: '1:1', width: 2048, height: 2048 },
  { label: '16:9', width: 2560, height: 1440 },
  { label: '9:16', width: 1440, height: 2560 },
  { label: '4:3', width: 2304, height: 1728 },
  { label: '3:4', width: 1728, height: 2304 },
  { label: '3:2', width: 2432, height: 1664 },
  { label: '2:3', width: 1664, height: 2432 },
]

function generatePresets(min: number, max: number) {
  const presets: { label: string; width: number; height: number }[] = []

  for (let i = 0; i < PRESETS_1K.length; i++) {
    const preset1k = PRESETS_1K[i]
    const preset2k = PRESETS_2K[i]

    // Prefer 2K if within range, otherwise fall back to 1K
    if (
      preset2k.width >= min &&
      preset2k.width <= max &&
      preset2k.height >= min &&
      preset2k.height <= max
    ) {
      presets.push(preset2k)
    } else if (
      preset1k.width >= min &&
      preset1k.width <= max &&
      preset1k.height >= min &&
      preset1k.height <= max
    ) {
      presets.push(preset1k)
    }
  }

  return presets
}

// ---------------------------------------------------------------------------
// SizeSelector
// ---------------------------------------------------------------------------

interface SizeSelectorProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  min?: number
  max?: number
}

export function SizeSelector({
  value,
  onChange,
  disabled,
  min = 256,
  max = 2048,
}: SizeSelectorProps) {
  const parseSize = (v: string) => {
    const parts = v.split('*')
    if (parts.length === 2) {
      const w = parseInt(parts[0], 10)
      const h = parseInt(parts[1], 10)
      if (!isNaN(w) && !isNaN(h)) return { w, h }
    }
    return { w: 1024, h: 1024 }
  }

  const parsed = parseSize(value || '1024*1024')
  const [widthInput, setWidthInput] = useState(String(parsed.w))
  const [heightInput, setHeightInput] = useState(String(parsed.h))

  // Sync local state when the value prop changes externally
  const prevValueRef = useRef(value)
  if (value !== prevValueRef.current) {
    prevValueRef.current = value
    const p = parseSize(value || '1024*1024')
    setWidthInput(String(p.w))
    setHeightInput(String(p.h))
  }

  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  const current = parseSize(value || '1024*1024')

  const handlePreset = (w: number, h: number) => {
    setWidthInput(String(w))
    setHeightInput(String(h))
    onChange(`${w}*${h}`)
  }

  const handleSwap = () => {
    setWidthInput(String(current.h))
    setHeightInput(String(current.w))
    onChange(`${current.h}*${current.w}`)
  }

  const commitWidth = (raw: string) => {
    const n = parseInt(raw, 10)
    const w = isNaN(n) ? min : clamp(n)
    setWidthInput(String(w))
    onChange(`${w}*${current.h}`)
  }

  const commitHeight = (raw: string) => {
    const n = parseInt(raw, 10)
    const h = isNaN(n) ? min : clamp(n)
    setHeightInput(String(h))
    onChange(`${current.w}*${h}`)
  }

  const availablePresets = useMemo(() => generatePresets(min, max), [min, max])
  const isCurrentPreset = (w: number, h: number) => current.w === w && current.h === h

  return (
    <div className="space-y-3">
      {/* Preset buttons */}
      <div className="flex flex-wrap gap-1">
        {availablePresets.map((preset) => (
          <Button
            key={`${preset.width}x${preset.height}`}
            type="button"
            variant={isCurrentPreset(preset.width, preset.height) ? 'default' : 'outline'}
            size="sm"
            onClick={() => handlePreset(preset.width, preset.height)}
            disabled={disabled}
            className="h-6 px-1.5 gap-1 text-xs"
            title={`${preset.width}×${preset.height}`}
          >
            <AspectIcon ratio={preset.label} />
            {preset.label}
          </Button>
        ))}
      </div>

      {/* Custom width/height inputs */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground">Width</Label>
          <Input
            type="number"
            value={widthInput}
            onChange={(e) => {
              setWidthInput(e.target.value)
              const n = parseInt(e.target.value, 10)
              if (!isNaN(n)) onChange(`${n}*${current.h}`)
            }}
            onBlur={() => commitWidth(widthInput)}
            min={min}
            max={max}
            step={64}
            disabled={disabled}
            className="h-8"
          />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handleSwap}
          disabled={disabled}
          className="mt-5 h-8 w-8"
          title="Swap width and height"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 3L4 7l4 4" />
            <path d="M4 7h16" />
            <path d="M16 21l4-4-4-4" />
            <path d="M20 17H4" />
          </svg>
        </Button>

        <div className="flex-1">
          <Label className="text-xs text-muted-foreground">Height</Label>
          <Input
            type="number"
            value={heightInput}
            onChange={(e) => {
              setHeightInput(e.target.value)
              const n = parseInt(e.target.value, 10)
              if (!isNaN(n)) onChange(`${current.w}*${n}`)
            }}
            onBlur={() => commitHeight(heightInput)}
            min={min}
            max={max}
            step={64}
            disabled={disabled}
            className="h-8"
          />
        </div>
      </div>

      {/* Current size and range */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {current.w} × {current.h} px
        </span>
        <span>
          Range: {min}–{max}
        </span>
      </div>
    </div>
  )
}

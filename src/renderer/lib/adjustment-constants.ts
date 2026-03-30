import type { ImageAdjustments } from '@/types'

export interface AdjustmentSliderConfig {
  key: keyof ImageAdjustments
  label: string
  min: number
  max: number
  step: number
  default: number
  format: (value: number) => string
  group: 'light' | 'color' | 'effects'
}

export const DEFAULT_IMAGE_ADJUSTMENTS: ImageAdjustments = {
  exposure: 0,
  brightness: 1,
  contrast: 1,
  highlights: 0,
  shadows: 0,
  saturation: 1,
  vibrance: 0,
  temperature: 0,
  tint: 0,
  hue: 0,
  clarity: 0
}

export function cloneAdjustments(
  adjustments: ImageAdjustments | null | undefined
): ImageAdjustments {
  return {
    ...(adjustments ?? DEFAULT_IMAGE_ADJUSTMENTS)
  }
}

export function isDefaultAdjustments(adjustments: ImageAdjustments | null | undefined): boolean {
  if (!adjustments) return true

  return (
    adjustments.exposure === DEFAULT_IMAGE_ADJUSTMENTS.exposure &&
    adjustments.brightness === DEFAULT_IMAGE_ADJUSTMENTS.brightness &&
    adjustments.contrast === DEFAULT_IMAGE_ADJUSTMENTS.contrast &&
    adjustments.highlights === DEFAULT_IMAGE_ADJUSTMENTS.highlights &&
    adjustments.shadows === DEFAULT_IMAGE_ADJUSTMENTS.shadows &&
    adjustments.saturation === DEFAULT_IMAGE_ADJUSTMENTS.saturation &&
    adjustments.vibrance === DEFAULT_IMAGE_ADJUSTMENTS.vibrance &&
    adjustments.temperature === DEFAULT_IMAGE_ADJUSTMENTS.temperature &&
    adjustments.tint === DEFAULT_IMAGE_ADJUSTMENTS.tint &&
    adjustments.hue === DEFAULT_IMAGE_ADJUSTMENTS.hue &&
    adjustments.clarity === DEFAULT_IMAGE_ADJUSTMENTS.clarity
  )
}

export function hasAdjustments(adjustments: ImageAdjustments | null | undefined): boolean {
  return !isDefaultAdjustments(adjustments)
}

export const LIGHT_ADJUSTMENT_SLIDERS: AdjustmentSliderConfig[] = [
  {
    key: 'exposure',
    label: 'Exposure',
    min: -5,
    max: 5,
    step: 0.1,
    default: 0,
    format: (value) => `${value > 0 ? '+' : ''}${value.toFixed(1)} EV`,
    group: 'light'
  },
  {
    key: 'brightness',
    label: 'Brightness',
    min: 0,
    max: 2,
    step: 0.05,
    default: 1,
    format: (value) => `${Math.round(value * 100)}%`,
    group: 'light'
  },
  {
    key: 'contrast',
    label: 'Contrast',
    min: 0,
    max: 2,
    step: 0.05,
    default: 1,
    format: (value) => `${Math.round(value * 100)}%`,
    group: 'light'
  },
  {
    key: 'highlights',
    label: 'Highlights',
    min: -100,
    max: 100,
    step: 1,
    default: 0,
    format: (value) => `${value > 0 ? '+' : ''}${value}`,
    group: 'light'
  },
  {
    key: 'shadows',
    label: 'Shadows',
    min: -100,
    max: 100,
    step: 1,
    default: 0,
    format: (value) => `${value > 0 ? '+' : ''}${value}`,
    group: 'light'
  }
]

export const COLOR_ADJUSTMENT_SLIDERS: AdjustmentSliderConfig[] = [
  {
    key: 'saturation',
    label: 'Saturation',
    min: 0,
    max: 2,
    step: 0.05,
    default: 1,
    format: (value) => `${Math.round(value * 100)}%`,
    group: 'color'
  },
  {
    key: 'vibrance',
    label: 'Vibrance',
    min: 0,
    max: 100,
    step: 1,
    default: 0,
    format: (value) => `${value}`,
    group: 'color'
  },
  {
    key: 'temperature',
    label: 'Temperature',
    min: -100,
    max: 100,
    step: 1,
    default: 0,
    format: (value) => (value === 0 ? '0' : value > 0 ? `+${value} warm` : `${value} cool`),
    group: 'color'
  },
  {
    key: 'tint',
    label: 'Tint',
    min: -100,
    max: 100,
    step: 1,
    default: 0,
    format: (value) =>
      value === 0 ? '0' : value > 0 ? `+${value} magenta` : `${value} green`,
    group: 'color'
  },
  {
    key: 'hue',
    label: 'Hue Shift',
    min: -180,
    max: 180,
    step: 1,
    default: 0,
    format: (value) => `${value}\u00b0`,
    group: 'color'
  }
]

export const EFFECTS_ADJUSTMENT_SLIDERS: AdjustmentSliderConfig[] = [
  {
    key: 'clarity',
    label: 'Clarity',
    min: 0,
    max: 100,
    step: 1,
    default: 0,
    format: (value) => `${value}`,
    group: 'effects'
  }
]

export const ADJUSTMENT_SLIDER_GROUPS = {
  light: LIGHT_ADJUSTMENT_SLIDERS,
  color: COLOR_ADJUSTMENT_SLIDERS,
  effects: EFFECTS_ADJUSTMENT_SLIDERS
} as const
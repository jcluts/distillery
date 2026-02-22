import * as React from 'react'

import { ImageIcon, ImagePlus } from 'lucide-react'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useGenerationStore } from '@/stores/generation-store'
import type { GenerationMode } from '@/types'

const IMAGE_MODES: Array<{ value: GenerationMode; label: string; icon: React.ElementType }> = [
  { value: 'text-to-image', label: 'Text to Image', icon: ImageIcon },
  { value: 'image-to-image', label: 'Image to Image', icon: ImagePlus }
]

/**
 * Top-level generation mode toggle.
 * Dictates which models/endpoints are available in the ModelSelector.
 */
export function ModeToggle(): React.JSX.Element {
  const generationMode = useGenerationStore((s) => s.generationMode)
  const setGenerationMode = useGenerationStore((s) => s.setGenerationMode)

  return (
    <ToggleGroup
      type="single"
      value={generationMode}
      onValueChange={(value) => {
        // ToggleGroup fires empty string when deselecting — ignore it
        if (value) setGenerationMode(value as GenerationMode)
      }}
      variant="outline"
      size="sm"
      className="w-full"
    >
      {IMAGE_MODES.map(({ value, label, icon: Icon }) => (
        <ToggleGroupItem
          key={value}
          value={value}
          className="flex-1 gap-1.5 text-xs"
          aria-label={label}
        >
          <Icon className="size-3.5" />
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

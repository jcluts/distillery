import * as React from 'react'

import { Film, ImageIcon, ImagePlus, Video } from 'lucide-react'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useGenerationStore } from '@/stores/generation-store'
import type { CanonicalEndpointDef, GenerationMode } from '@/types'

const MODES: Array<{
  value: GenerationMode
  label: string
  icon: React.ElementType
  outputType: 'image' | 'video'
}> = [
  { value: 'text-to-image', label: 'Text to Image', icon: ImageIcon, outputType: 'image' },
  { value: 'image-to-image', label: 'Image to Image', icon: ImagePlus, outputType: 'image' },
  { value: 'text-to-video', label: 'Text to Video', icon: Video, outputType: 'video' },
  { value: 'image-to-video', label: 'Image to Video', icon: Film, outputType: 'video' }
]

/**
 * Top-level generation mode toggle.
 * Dictates which models/endpoints are available in the ModelSelector.
 */
export function ModeToggle(): React.JSX.Element {
  const generationMode = useGenerationStore((s) => s.generationMode)
  const endpointKey = useGenerationStore((s) => s.endpointKey)
  const setGenerationMode = useGenerationStore((s) => s.setGenerationMode)

  const [endpoints, setEndpoints] = React.useState<CanonicalEndpointDef[]>([])

  React.useEffect(() => {
    window.api
      .listGenerationEndpoints()
      .then(setEndpoints)
      .catch(() => {})
  }, [])

  const selectedEndpoint = React.useMemo(
    () => endpoints.find((endpoint) => endpoint.endpointKey === endpointKey),
    [endpointKey, endpoints]
  )

  const availableModes = React.useMemo(() => {
    if (!selectedEndpoint) {
      return MODES
    }

    return MODES.filter((mode) => mode.outputType === selectedEndpoint.outputType)
  }, [selectedEndpoint])

  React.useEffect(() => {
    if (availableModes.some((mode) => mode.value === generationMode)) {
      return
    }

    if (availableModes[0]) {
      setGenerationMode(availableModes[0].value)
    }
  }, [availableModes, generationMode, setGenerationMode])

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
      {availableModes.map(({ value, label, icon: Icon }) => (
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

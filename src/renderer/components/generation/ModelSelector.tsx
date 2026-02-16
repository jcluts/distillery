import * as React from 'react'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { SectionLabel } from '@/components/ui/section-label'
import { useModelStore } from '@/stores/model-store'
import { useUIStore } from '@/stores/ui-store'

const MANAGE_MODELS_VALUE = '__manage_models__'

export function ModelSelector(): React.JSX.Element {
  const catalog = useModelStore((s) => s.catalog)
  const settings = useModelStore((s) => s.settings)
  const filesByModelId = useModelStore((s) => s.filesByModelId)
  const setActiveModel = useModelStore((s) => s.setActiveModel)

  const openModal = useUIStore((s) => s.openModal)

  const models = React.useMemo(
    () => (catalog?.models ?? []).filter((model) => model.type === 'image-generation'),
    [catalog]
  )

  const activeModelId = settings?.active_model_id ?? ''

  return (
    <div className="space-y-2">
      <SectionLabel>Model</SectionLabel>
      <Select
        value={activeModelId || undefined}
        onValueChange={(value) => {
          if (value === MANAGE_MODELS_VALUE) {
            openModal('models')
            return
          }

          const isReady = filesByModelId[value]?.isReady ?? false
          if (!isReady) {
            openModal('models')
            return
          }

          void setActiveModel(value)
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select model" />
        </SelectTrigger>
        <SelectContent>
          {models.map((model) => {
            const isReady = filesByModelId[model.id]?.isReady ?? false
            return (
              <SelectItem key={model.id} value={model.id}>
                {model.name}
                {isReady ? '' : ' (Setup Required)'}
              </SelectItem>
            )
          })}

          <SelectSeparator />
          <SelectItem value={MANAGE_MODELS_VALUE}>Manage Models…</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

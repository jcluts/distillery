import * as React from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { ModelCategoryTabs } from '@/components/models/ModelCategoryTabs'
import { ModelCard } from '@/components/models/ModelCard'
import { useModelStore } from '@/stores/model-store'

export function ModelManager(): React.JSX.Element {
  const catalog = useModelStore((s) => s.catalog)
  const settings = useModelStore((s) => s.settings)
  const filesByModelId = useModelStore((s) => s.filesByModelId)
  const downloadStatusByPath = useModelStore((s) => s.downloadStatusByPath)
  const loading = useModelStore((s) => s.loading)
  const error = useModelStore((s) => s.error)

  const setModelQuantSelection = useModelStore((s) => s.setModelQuantSelection)
  const downloadModelFile = useModelStore((s) => s.downloadModelFile)
  const cancelModelDownload = useModelStore((s) => s.cancelModelDownload)

  const [category, setCategory] = React.useState<'all' | 'image-generation'>('all')

  if (loading && !catalog) {
    return <div className="p-4 text-sm text-muted-foreground">Loading model catalog…</div>
  }

  if (!catalog || !settings) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {error ? `Unable to load model catalog: ${error}` : 'Model catalog unavailable'}
      </div>
    )
  }

  const visibleModels =
    category === 'all' ? catalog.models : catalog.models.filter((model) => model.type === category)

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <ModelCategoryTabs value={category} onValueChange={setCategory} />

      {error ? (
        <div className="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      ) : null}

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-1 items-start gap-4 pb-1 lg:grid-cols-2">
          {visibleModels.map((model) => {
            const selections = settings.model_quant_selections?.[model.id] ?? {
              diffusionQuant: '',
              textEncoderQuant: ''
            }

            const fileStatus = filesByModelId[model.id]
            const downloadedByPath = Object.fromEntries(
              (fileStatus?.files ?? []).map((entry) => [entry.relativePath, entry.exists])
            )

            return (
              <ModelCard
                key={model.id}
                model={model}
                diffusionQuantId={selections.diffusionQuant}
                textEncoderQuantId={selections.textEncoderQuant}
                isReady={fileStatus?.isReady ?? false}
                downloadedByPath={downloadedByPath}
                downloadStatusByPath={downloadStatusByPath}
                onSelectQuant={(component, quantId) => {
                  void setModelQuantSelection(model.id, component, quantId)
                }}
                onDownload={(component, quantId) => {
                  void downloadModelFile({
                    modelId: model.id,
                    component,
                    quantId
                  })
                }}
                onCancelDownload={(relativePath) => {
                  void cancelModelDownload(relativePath)
                }}
              />
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}

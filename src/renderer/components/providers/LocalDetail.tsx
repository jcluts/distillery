import * as React from 'react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { useModelStore } from '@/stores/model-store'
import { LocalModelItem } from '@/components/providers/LocalModelItem'

export function LocalDetail(): React.JSX.Element {
  const catalog = useModelStore((s) => s.catalog)
  const settings = useModelStore((s) => s.settings)
  const filesByModelId = useModelStore((s) => s.filesByModelId)
  const downloadStatusByPath = useModelStore((s) => s.downloadStatusByPath)
  const loading = useModelStore((s) => s.loading)
  const error = useModelStore((s) => s.error)

  const hydrate = useModelStore((s) => s.hydrate)
  const setModelQuantSelection = useModelStore((s) => s.setModelQuantSelection)
  const downloadModelFile = useModelStore((s) => s.downloadModelFile)
  const cancelModelDownload = useModelStore((s) => s.cancelModelDownload)
  const removeModelFile = useModelStore((s) => s.removeModelFile)

  React.useEffect(() => {
    void hydrate()
  }, [hydrate])

  if (loading && !catalog) {
    return <div className="p-4 text-sm text-muted-foreground">Loading model catalog...</div>
  }

  if (!catalog || !settings) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {error ? `Unable to load model catalog: ${error}` : 'Model catalog unavailable'}
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 pr-2">
        {error ? (
          <div className="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        ) : null}

        {catalog.models.map((model) => {
          const selections = settings.model_quant_selections?.[model.id] ?? {
            diffusionQuant: '',
            textEncoderQuant: ''
          }

          const fileStatus = filesByModelId[model.id]
          const downloadedByPath = Object.fromEntries(
            (fileStatus?.files ?? []).map((entry) => [entry.relativePath, entry.exists])
          )

          return (
            <LocalModelItem
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
              onRemoveDownload={(relativePath) => {
                void removeModelFile({ modelId: model.id, relativePath })
              }}
            />
          )
        })}
      </div>
    </ScrollArea>
  )
}
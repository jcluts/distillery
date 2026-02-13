import * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { DownloadProgressEvent, ModelDefinition } from '@/types'
import { QuantSection } from './QuantSection'
import { VaeSection } from './VaeSection'

interface ModelCardProps {
  model: ModelDefinition
  diffusionQuantId: string
  textEncoderQuantId: string
  isReady: boolean
  downloadedByPath: Record<string, boolean>
  downloadStatusByPath: Record<string, DownloadProgressEvent>
  onSelectQuant: (component: 'diffusion' | 'textEncoder', quantId: string) => void
  onDownload: (component: 'vae' | 'diffusion' | 'textEncoder', quantId?: string) => void
  onCancelDownload: (relativePath: string) => void
  onRemoveDownload: (relativePath: string) => void
}

export function ModelCard({
  model,
  diffusionQuantId,
  textEncoderQuantId,
  isReady,
  downloadedByPath,
  downloadStatusByPath,
  onSelectQuant,
  onDownload,
  onCancelDownload,
  onRemoveDownload
}: ModelCardProps): React.JSX.Element {
  const normalizeRelativePath = (relativePath: string): string => relativePath.replace(/\\+/g, '/')

  const normalizedDownloadedByPath = Object.fromEntries(
    Object.entries(downloadedByPath).map(([key, value]) => [normalizeRelativePath(key), value])
  )

  const normalizedDownloadStatusByPath = Object.fromEntries(
    Object.entries(downloadStatusByPath).map(([key, value]) => [normalizeRelativePath(key), value])
  )

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{model.name}</CardTitle>
            <CardDescription>{model.description}</CardDescription>
          </div>
          <Badge
            className={
              isReady ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
            }
            variant="outline"
          >
            {isReady ? 'Ready' : 'Setup Required'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <QuantSection
          label="Diffusion Model"
          quants={model.diffusion.quants}
          activeQuantId={diffusionQuantId}
          downloadedByPath={normalizedDownloadedByPath}
          downloadStatusByPath={normalizedDownloadStatusByPath}
          onSelectQuant={(quantId) => onSelectQuant('diffusion', quantId)}
          onDownload={(quantId) => onDownload('diffusion', quantId)}
          onCancel={onCancelDownload}
          onRemove={onRemoveDownload}
        />

        <QuantSection
          label="Text Encoder"
          quants={model.textEncoder.quants}
          activeQuantId={textEncoderQuantId}
          downloadedByPath={normalizedDownloadedByPath}
          downloadStatusByPath={normalizedDownloadStatusByPath}
          onSelectQuant={(quantId) => onSelectQuant('textEncoder', quantId)}
          onDownload={(quantId) => onDownload('textEncoder', quantId)}
          onCancel={onCancelDownload}
          onRemove={onRemoveDownload}
        />

        <VaeSection
          vae={model.vae}
          isDownloaded={!!normalizedDownloadedByPath[normalizeRelativePath(model.vae.file)]}
          downloadStatus={normalizedDownloadStatusByPath[normalizeRelativePath(model.vae.file)]}
          onDownload={() => onDownload('vae')}
          onCancel={() => onCancelDownload(model.vae.file)}
          onRemove={() => onRemoveDownload(model.vae.file)}
        />
      </CardContent>
    </Card>
  )
}

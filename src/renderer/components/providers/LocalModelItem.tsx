import * as React from 'react'

import { ChevronRight } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { QuantSection } from '@/components/models/QuantSection'
import { VaeSection } from '@/components/models/VaeSection'
import { cn } from '@/lib/utils'
import type { DownloadProgressEvent, ModelDefinition } from '@/types'

interface LocalModelItemProps {
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

function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\+/g, '/')
}

function statusDot(ready: boolean): React.JSX.Element {
  return <span className={cn('size-2 shrink-0 rounded-full', ready ? 'bg-emerald-500' : 'bg-amber-500')} />
}

export function LocalModelItem({
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
}: LocalModelItemProps): React.JSX.Element {
  const [open, setOpen] = React.useState(!isReady)

  const normalizedDownloadedByPath = React.useMemo(
    () =>
      Object.fromEntries(
        Object.entries(downloadedByPath).map(([key, value]) => [normalizeRelativePath(key), value])
      ),
    [downloadedByPath]
  )

  const normalizedDownloadStatusByPath = React.useMemo(
    () =>
      Object.fromEntries(
        Object.entries(downloadStatusByPath).map(([key, value]) => [normalizeRelativePath(key), value])
      ),
    [downloadStatusByPath]
  )

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border border-border/60">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-muted/40"
        >
          <ChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{model.name}</div>
            <div className="truncate text-xs text-muted-foreground">{model.description}</div>
          </div>

          <Badge
            className={cn(
              'gap-1 border',
              isReady
                ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
                : 'border-amber-500/25 bg-amber-500/10 text-amber-400'
            )}
            variant="outline"
          >
            {isReady ? 'Ready' : 'Setup Required'}
            {statusDot(isReady)}
          </Badge>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="space-y-3 pb-3 pl-6 pr-3 pt-1">
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
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
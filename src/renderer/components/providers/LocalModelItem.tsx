import * as React from 'react'

import { Check, ChevronRight, Clock3, Download, Trash2, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Progress } from '@/components/ui/progress'
import { SectionHeader } from '@/components/ui/section-header'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { DownloadProgressEvent, ModelDefinition, ModelFileRef, QuantVariant } from '@/types'
import { formatApproxSize, toPercent } from '@/components/models/utils'

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
        <div className="px-3 pb-3 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <QuantColumn
              title="Diffusion Model"
              quants={model.diffusion.quants}
              activeQuantId={diffusionQuantId}
              downloadedByPath={normalizedDownloadedByPath}
              downloadStatusByPath={normalizedDownloadStatusByPath}
              onSelectQuant={(quantId) => onSelectQuant('diffusion', quantId)}
              onDownload={(quantId) => onDownload('diffusion', quantId)}
              onCancel={onCancelDownload}
              onRemove={onRemoveDownload}
            />

            <QuantColumn
              title="Text Encoder"
              quants={model.textEncoder.quants}
              activeQuantId={textEncoderQuantId}
              downloadedByPath={normalizedDownloadedByPath}
              downloadStatusByPath={normalizedDownloadStatusByPath}
              onSelectQuant={(quantId) => onSelectQuant('textEncoder', quantId)}
              onDownload={(quantId) => onDownload('textEncoder', quantId)}
              onCancel={onCancelDownload}
              onRemove={onRemoveDownload}
            />
          </div>

          <VaeRow
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

interface QuantColumnProps {
  title: string
  quants: QuantVariant[]
  activeQuantId: string
  downloadedByPath: Record<string, boolean>
  downloadStatusByPath: Record<string, DownloadProgressEvent>
  onSelectQuant: (quantId: string) => void
  onDownload: (quantId: string) => void
  onCancel: (relativePath: string) => void
  onRemove: (relativePath: string) => void
}

function QuantColumn({
  title,
  quants,
  activeQuantId,
  downloadedByPath,
  downloadStatusByPath,
  onSelectQuant,
  onDownload,
  onCancel,
  onRemove
}: QuantColumnProps): React.JSX.Element {
  return (
    <div className="space-y-1">
      <SectionHeader className="px-1 text-xs text-muted-foreground">{title}</SectionHeader>
      <div className="space-y-0.5 rounded-md border border-border/40 bg-muted/15 p-1.5">
        {quants.map((quant) => (
          <QuantRow
            key={quant.id}
            quant={quant}
            isActive={quant.id === activeQuantId}
            isDownloaded={!!downloadedByPath[normalizeRelativePath(quant.file)]}
            downloadStatus={downloadStatusByPath[normalizeRelativePath(quant.file)]}
            onSelect={() => onSelectQuant(quant.id)}
            onDownload={() => onDownload(quant.id)}
            onCancel={() => onCancel(quant.file)}
            onRemove={() => onRemove(quant.file)}
          />
        ))}
      </div>
    </div>
  )
}

function QuantRow({
  quant,
  isActive,
  isDownloaded,
  downloadStatus,
  onSelect,
  onDownload,
  onCancel,
  onRemove
}: {
  quant: QuantVariant
  isActive: boolean
  isDownloaded: boolean
  downloadStatus?: DownloadProgressEvent
  onSelect: () => void
  onDownload: () => void
  onCancel: () => void
  onRemove: () => void
}): React.JSX.Element {
  const isDownloading = !isDownloaded && downloadStatus?.status === 'downloading'
  const isQueued = !isDownloaded && downloadStatus?.status === 'queued'
  const isFailed = !isDownloaded && downloadStatus?.status === 'failed'
  const isRecommended =
    quant.label.toLowerCase().includes('balanced') ||
    quant.description.toLowerCase().startsWith('balanced')
  const canSelect = isDownloaded && !isActive

  return (
    <button
      type="button"
      onClick={canSelect ? onSelect : undefined}
      className={cn(
        'flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm transition-colors',
        isActive
          ? 'bg-primary/10'
          : canSelect
            ? 'cursor-pointer hover:bg-muted/60'
            : 'cursor-default opacity-70'
      )}
    >
      <span
        className={cn(
          'size-3 shrink-0 rounded-full border',
          isActive
            ? 'border-primary bg-primary'
            : isDownloaded
              ? 'border-muted-foreground/50'
              : 'border-muted-foreground/25'
        )}
      />

      <div className="min-w-0 flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn('truncate', isActive ? 'font-medium' : 'font-normal')}>
              {quant.label}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{quant.description}</TooltipContent>
        </Tooltip>
        {isRecommended ? (
          <Badge variant="outline" className="h-4 px-1 text-[9px] leading-none text-muted-foreground">
            Rec.
          </Badge>
        ) : null}
      </div>

      <span className="flex-1" />

      <span className="shrink-0 text-[11px] text-muted-foreground">{formatApproxSize(quant.size)}</span>

      <div className="ml-1 shrink-0" onClick={(event) => event.stopPropagation()}>
        {isDownloading && downloadStatus ? (
          <div className="flex items-center gap-1">
            <Progress
              value={toPercent(downloadStatus.downloadedBytes, downloadStatus.totalBytes)}
              className="h-1.5 w-12"
            />
            <span className="w-7 text-right text-[10px] text-muted-foreground">
              {toPercent(downloadStatus.downloadedBytes, downloadStatus.totalBytes)}%
            </span>
            <Button type="button" size="icon-xs" variant="ghost" onClick={onCancel}>
              <X className="size-3" />
            </Button>
          </div>
        ) : isQueued ? (
          <div className="flex items-center gap-1">
            <Badge
              variant="outline"
              className="h-5 border-amber-500/25 bg-amber-500/10 px-1.5 text-[10px] text-amber-400"
            >
              <Clock3 className="mr-1 size-3" />
              Queued
            </Badge>
            <Button type="button" size="icon-xs" variant="ghost" onClick={onCancel}>
              <X className="size-3" />
            </Button>
          </div>
        ) : isFailed ? (
          <Button type="button" size="xs" variant="outline" onClick={onDownload}>
            Retry
          </Button>
        ) : isDownloaded && isActive ? (
          <span className="inline-flex h-6 w-6 items-center justify-center text-emerald-500">
            <Check className="size-3.5" />
          </span>
        ) : isDownloaded ? (
          <Button type="button" size="icon-xs" variant="ghost" onClick={onRemove}>
            <Trash2 className="size-3" />
          </Button>
        ) : (
          <Button type="button" size="icon-xs" variant="outline" onClick={onDownload}>
            <Download className="size-3" />
          </Button>
        )}
      </div>
    </button>
  )
}

function VaeRow({
  vae,
  isDownloaded,
  downloadStatus,
  onDownload,
  onCancel,
  onRemove
}: {
  vae: ModelFileRef
  isDownloaded: boolean
  downloadStatus?: DownloadProgressEvent
  onDownload: () => void
  onCancel: () => void
  onRemove: () => void
}): React.JSX.Element {
  const isDownloading = !isDownloaded && downloadStatus?.status === 'downloading'
  const isQueued = !isDownloaded && downloadStatus?.status === 'queued'
  const isFailed = !isDownloaded && downloadStatus?.status === 'failed'
  const fileName = vae.file.split(/[\\/]/).pop() ?? vae.file

  return (
    <div className="mt-2 flex items-center gap-2 rounded-md border border-border/40 px-2 py-1.5 text-sm">
      <SectionHeader className="shrink-0 text-xs text-muted-foreground">VAE</SectionHeader>
      <span className="truncate font-medium">{fileName}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{formatApproxSize(vae.size)}</span>
      <span className="flex-1" />

      {isDownloading && downloadStatus ? (
        <div className="flex items-center gap-1">
          <Progress
            value={toPercent(downloadStatus.downloadedBytes, downloadStatus.totalBytes)}
            className="h-1.5 w-16"
          />
          <span className="w-8 text-right text-[10px] text-muted-foreground">
            {toPercent(downloadStatus.downloadedBytes, downloadStatus.totalBytes)}%
          </span>
          <Button type="button" size="icon-xs" variant="ghost" onClick={onCancel}>
            <X className="size-3" />
          </Button>
        </div>
      ) : isQueued ? (
        <div className="flex items-center gap-1">
          <Badge
            variant="outline"
            className="h-5 border-amber-500/25 bg-amber-500/10 px-1.5 text-[10px] text-amber-400"
          >
            <Clock3 className="mr-1 size-3" />
            Queued
          </Badge>
          <Button type="button" size="icon-xs" variant="ghost" onClick={onCancel}>
            <X className="size-3" />
          </Button>
        </div>
      ) : isFailed ? (
        <Button type="button" size="xs" variant="outline" onClick={onDownload}>
          Retry
        </Button>
      ) : isDownloaded ? (
        <div className="flex items-center gap-1">
          <Badge
            variant="outline"
            className="border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
          >
            <Check className="mr-1 size-3" />
            Ready
          </Badge>
          <Button type="button" size="icon-xs" variant="ghost" onClick={onRemove}>
            <Trash2 className="size-3" />
          </Button>
        </div>
      ) : (
        <Button type="button" size="icon-xs" variant="outline" onClick={onDownload}>
          <Download className="size-3" />
        </Button>
      )}
    </div>
  )
}
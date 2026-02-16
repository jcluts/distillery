import * as React from 'react'
import { ChevronDown, Check, Clock3, Download, Trash2, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SectionHeader } from '@/components/ui/section-header'
import type { DownloadProgressEvent, QuantVariant } from '@/types'
import { formatApproxSize, toPercent } from './utils'
import { cn } from '@/lib/utils'

interface QuantSectionProps {
  label: string
  quants: QuantVariant[]
  activeQuantId: string
  downloadedByPath: Record<string, boolean>
  downloadStatusByPath: Record<string, DownloadProgressEvent>
  onSelectQuant: (quantId: string) => void
  onDownload: (quantId: string) => void
  onCancel: (relativePath: string) => void
  onRemove: (relativePath: string) => void
}

/** Returns whether a quant is the "recommended" balanced option */
function isRecommended(quant: QuantVariant): boolean {
  return quant.description.toLowerCase().startsWith('balanced')
}

export function QuantSection({
  label,
  quants,
  activeQuantId,
  downloadedByPath,
  downloadStatusByPath,
  onSelectQuant,
  onDownload,
  onCancel,
  onRemove
}: QuantSectionProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false)

  const activeQuant = quants.find((q) => q.id === activeQuantId)
  const activeDownloaded = activeQuant ? !!downloadedByPath[activeQuant.file] : false
  const anyDownloading = quants.some((q) => {
    // If the file already exists on disk, ignore stale download status
    if (downloadedByPath[q.file]) return false
    const dl = downloadStatusByPath[q.file]
    return dl?.status === 'downloading' || dl?.status === 'queued'
  })

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {/* Summary row — always visible */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <SectionHeader>
            {label.toUpperCase()}
          </SectionHeader>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs">
              {open ? 'Collapse' : 'Change'}
              <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
            </Button>
          </CollapsibleTrigger>
        </div>

        {/* Active quant summary pill */}
        <QuantSummary
          activeQuant={activeQuant}
          activeDownloaded={activeDownloaded}
          anyDownloading={anyDownloading}
          quants={quants}
          downloadedByPath={downloadedByPath}
          downloadStatusByPath={downloadStatusByPath}
        />
      </div>

      {/* Expanded quant picker */}
      <CollapsibleContent className="pt-2">
          <div className="space-y-1">
            {quants.map((quant) => (
              <QuantRow
                key={quant.id}
                quant={quant}
                isActive={quant.id === activeQuantId}
                isDownloaded={!!downloadedByPath[quant.file]}
                downloadStatus={downloadStatusByPath[quant.file]}
                onSelect={() => onSelectQuant(quant.id)}
                onDownload={() => onDownload(quant.id)}
                onCancel={() => onCancel(quant.file)}
                onRemove={() => onRemove(quant.file)}
              />
            ))}
          </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/* -------------------------------------------------------------------------- */
/*  Summary (collapsed view)                                                  */
/* -------------------------------------------------------------------------- */

function QuantSummary({
  activeQuant,
  activeDownloaded,
  anyDownloading,
  quants,
  downloadedByPath,
  downloadStatusByPath
}: {
  activeQuant: QuantVariant | undefined
  activeDownloaded: boolean
  anyDownloading: boolean
  quants: QuantVariant[]
  downloadedByPath: Record<string, boolean>
  downloadStatusByPath: Record<string, DownloadProgressEvent>
}): React.JSX.Element {
  if (anyDownloading) {
    const downloadingQuant = quants.find((q) => {
      if (downloadedByPath[q.file]) return false
      const dl = downloadStatusByPath[q.file]
      return dl?.status === 'downloading'
    })

    const downloading = downloadingQuant ? downloadStatusByPath[downloadingQuant.file] : undefined
    if (downloading) {
      const pct = toPercent(downloading.downloadedBytes, downloading.totalBytes)
      return (
        <div className="flex items-center gap-3 rounded-md border border-border/50 bg-muted/30 px-3 py-1.5">
          <span className="shrink-0 text-xs text-muted-foreground">
            Downloading {downloadingQuant?.label}… {pct}%
          </span>
          <Progress value={pct} className="h-1.5 flex-1" />
        </div>
      )
    }

    const queuedQuant = quants.find((q) => {
      if (downloadedByPath[q.file]) return false
      const dl = downloadStatusByPath[q.file]
      return dl?.status === 'queued'
    })

    if (queuedQuant) {
      return (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-400">
          <Clock3 className="size-3" />
          Queued {queuedQuant.label} — waiting for current download to finish
        </div>
      )
    }
  }

  if (!activeQuant) {
    return (
      <div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-400">
        No quant selected — expand to choose one
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-1.5">
      <span className="text-sm font-medium">{activeQuant.label}</span>
      <span className="text-xs text-muted-foreground">{formatApproxSize(activeQuant.size)}</span>
      {activeDownloaded ? (
        <Badge
          variant="outline"
          className="ml-auto border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
        >
          <Check className="mr-1 size-3" />
          Ready
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="ml-auto border-amber-500/25 bg-amber-500/10 text-amber-400"
        >
          Download needed
        </Badge>
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Single quant row (expanded view)                                          */
/* -------------------------------------------------------------------------- */

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
  const isCancelled = !isDownloaded && downloadStatus?.status === 'cancelled'
  const recommended = isRecommended(quant)
  const canSelect = isDownloaded && !isActive

  return (
    <button
      type="button"
      onClick={canSelect ? onSelect : undefined}
      className={cn(
        'group flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors',
        isActive
          ? 'border-primary/50 bg-primary/10'
          : canSelect
            ? 'cursor-pointer border-border/50 hover:border-border hover:bg-muted/50'
            : 'cursor-default border-border/30 opacity-70'
      )}
    >
      {/* Selection indicator */}
      <div
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-full border',
          isActive
            ? 'border-primary bg-primary'
            : isDownloaded
              ? 'border-muted-foreground/40'
              : 'border-muted-foreground/20'
        )}
      >
        {isActive && <Check className="size-2.5 text-primary-foreground" />}
      </div>

      {/* Label + description */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{quant.label}</span>
          <span className="text-xs text-muted-foreground">{formatApproxSize(quant.size)}</span>
          {recommended && (
            <Badge
              variant="outline"
              className="border-blue-500/25 bg-blue-500/10 px-1.5 py-0 text-[10px] text-blue-400"
            >
              Recommended
            </Badge>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="truncate text-xs text-muted-foreground">{quant.description}</div>
          </TooltipTrigger>
          <TooltipContent>{quant.description}</TooltipContent>
        </Tooltip>
      </div>

      {/* Status / actions */}
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        {isDownloading && downloadStatus ? (
          <div className="flex items-center gap-2">
            <Progress
              value={toPercent(downloadStatus.downloadedBytes, downloadStatus.totalBytes)}
              className="h-1.5 w-20"
            />
            <span className="w-8 text-right text-xs text-muted-foreground">
              {toPercent(downloadStatus.downloadedBytes, downloadStatus.totalBytes)}%
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={onCancel}
            >
              <X className="size-3" />
            </Button>
          </div>
        ) : isQueued ? (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-amber-500/25 bg-amber-500/10 text-amber-400">
              <Clock3 className="mr-1 size-3" />
              Queued
            </Badge>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={onCancel}
            >
              <X className="size-3" />
            </Button>
          </div>
        ) : isFailed ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onDownload}
          >
            Retry
          </Button>
        ) : isCancelled ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onDownload}
          >
            Resume
          </Button>
        ) : isDownloaded ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={onRemove}
          >
            <Trash2 className="size-3" />
            Remove
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={onDownload}
          >
            <Download className="mr-1 size-3" />
            Download
          </Button>
        )}
      </div>
    </button>
  )
}

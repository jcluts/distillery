import * as React from 'react'
import { Check, Clock3, Download, Trash2, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { SectionHeader } from '@/components/ui/section-header'
import type { DownloadProgressEvent, ModelFileRef } from '@/types'
import { formatApproxSize, toPercent } from './utils'

interface VaeSectionProps {
  vae: ModelFileRef
  isDownloaded: boolean
  downloadStatus?: DownloadProgressEvent
  onDownload: () => void
  onCancel: () => void
  onRemove: () => void
}

export function VaeSection({
  vae,
  isDownloaded,
  downloadStatus,
  onDownload,
  onCancel,
  onRemove
}: VaeSectionProps): React.JSX.Element {
  const isDownloading = !isDownloaded && downloadStatus?.status === 'downloading'
  const isQueued = !isDownloaded && downloadStatus?.status === 'queued'
  const isFailed = !isDownloaded && downloadStatus?.status === 'failed'
  const isCancelled = !isDownloaded && downloadStatus?.status === 'cancelled'

  return (
    <div className="space-y-1.5">
      <SectionHeader>VAE</SectionHeader>

      <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-1.5">
        <span className="text-sm font-medium">{vae.file.split('/').pop() ?? vae.file}</span>
        <span className="text-xs text-muted-foreground">{formatApproxSize(vae.size)}</span>

        <div className="ml-auto shrink-0">
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
              <Badge
                variant="outline"
                className="border-amber-500/25 bg-amber-500/10 text-amber-400"
              >
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
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
              >
                <Check className="mr-1 size-3" />
                Ready
              </Badge>
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
            </div>
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
      </div>
    </div>
  )
}

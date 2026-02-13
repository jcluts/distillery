import * as React from 'react'
import { Check, Download, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { DownloadProgressEvent, ModelFileRef } from '@/types'
import { formatApproxSize, toPercent } from './utils'

interface VaeSectionProps {
  vae: ModelFileRef
  isDownloaded: boolean
  downloadStatus?: DownloadProgressEvent
  onDownload: () => void
  onCancel: () => void
}

export function VaeSection({
  vae,
  isDownloaded,
  downloadStatus,
  onDownload,
  onCancel
}: VaeSectionProps): React.JSX.Element {
  const isDownloading =
    downloadStatus?.status === 'downloading' || downloadStatus?.status === 'queued'
  const isFailed = downloadStatus?.status === 'failed'
  const isCancelled = downloadStatus?.status === 'cancelled'

  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold tracking-wider text-muted-foreground">VAE</div>

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
            <Badge
              variant="outline"
              className="border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
            >
              <Check className="mr-1 size-3" />
              Ready
            </Badge>
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

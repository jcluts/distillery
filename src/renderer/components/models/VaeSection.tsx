import * as React from 'react'
import { Download, X } from 'lucide-react'

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
    <div className="space-y-2">
      <div className="text-xs font-semibold tracking-wider text-muted-foreground">VAE</div>

      <div className="grid grid-cols-[1fr,auto] items-center gap-3 rounded-md border px-3 py-2">
        <div className="space-y-0.5">
          <div className="text-sm font-medium">{vae.file.split('/').pop() ?? vae.file}</div>
          <div className="text-xs text-muted-foreground">{formatApproxSize(vae.size)}</div>
        </div>

        <div className="min-w-44">
          {isDownloading && downloadStatus ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{toPercent(downloadStatus.downloadedBytes, downloadStatus.totalBytes)}%</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2"
                  onClick={onCancel}
                >
                  <X className="size-3" />
                </Button>
              </div>
              <Progress
                value={toPercent(downloadStatus.downloadedBytes, downloadStatus.totalBytes)}
              />
            </div>
          ) : isFailed && downloadStatus ? (
            <div className="space-y-1">
              <Badge
                className="border border-red-500/25 bg-red-500/15 text-red-400"
                variant="outline"
              >
                Download failed
              </Badge>
              {downloadStatus.error ? (
                <div
                  className="max-w-64 truncate text-[11px] text-red-400"
                  title={downloadStatus.error}
                >
                  {downloadStatus.error}
                </div>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                onClick={onDownload}
              >
                Retry
              </Button>
            </div>
          ) : isCancelled ? (
            <div className="space-y-1">
              <Badge
                className="border border-amber-500/25 bg-amber-500/15 text-amber-400"
                variant="outline"
              >
                Cancelled
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8"
                onClick={onDownload}
              >
                Resume
              </Button>
            </div>
          ) : isDownloaded ? (
            <Badge variant="secondary">Downloaded</Badge>
          ) : (
            <Button type="button" size="sm" variant="outline" className="h-8" onClick={onDownload}>
              <Download className="mr-1 size-3.5" />
              Download
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

import * as React from 'react'
import { Download, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { DownloadProgressEvent, QuantVariant } from '@/types'
import { formatApproxSize, toPercent } from './utils'

interface QuantSectionProps {
  label: string
  quants: QuantVariant[]
  activeQuantId: string
  downloadedByPath: Record<string, boolean>
  downloadStatusByPath: Record<string, DownloadProgressEvent>
  onSelectQuant: (quantId: string) => void
  onDownload: (quantId: string) => void
  onCancel: (relativePath: string) => void
}

export function QuantSection({
  label,
  quants,
  activeQuantId,
  downloadedByPath,
  downloadStatusByPath,
  onSelectQuant,
  onDownload,
  onCancel
}: QuantSectionProps): React.JSX.Element {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold tracking-wider text-muted-foreground">
        {label.toUpperCase()}
      </div>

      <TooltipProvider delayDuration={250}>
        <RadioGroup value={activeQuantId} onValueChange={onSelectQuant} className="space-y-2">
          {quants.map((quant) => {
            const download = downloadStatusByPath[quant.file]
            const downloaded = !!downloadedByPath[quant.file]
            const isDownloading =
              download?.status === 'downloading' || download?.status === 'queued'
            const isFailed = download?.status === 'failed'
            const isCancelled = download?.status === 'cancelled'

            return (
              <div
                key={quant.id}
                className="grid grid-cols-[auto,1fr,auto] items-center gap-3 rounded-md border px-3 py-2"
              >
                <RadioGroupItem
                  value={quant.id}
                  id={`${label}-${quant.id}`}
                  disabled={!downloaded}
                />

                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <label htmlFor={`${label}-${quant.id}`} className="text-sm font-medium">
                      {quant.label}
                    </label>
                    <span className="text-xs text-muted-foreground">
                      {formatApproxSize(quant.size)}
                    </span>
                  </div>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="truncate text-xs text-muted-foreground">
                        {quant.description}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{quant.description}</TooltipContent>
                  </Tooltip>
                </div>

                <div className="min-w-44">
                  {isDownloading ? (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{toPercent(download.downloadedBytes, download.totalBytes)}%</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2"
                          onClick={() => onCancel(quant.file)}
                        >
                          <X className="size-3" />
                        </Button>
                      </div>
                      <Progress value={toPercent(download.downloadedBytes, download.totalBytes)} />
                    </div>
                  ) : isFailed ? (
                    <div className="space-y-1">
                      <Badge
                        className="border border-red-500/25 bg-red-500/15 text-red-400"
                        variant="outline"
                      >
                        Download failed
                      </Badge>
                      {download.error ? (
                        <div
                          className="max-w-64 truncate text-[11px] text-red-400"
                          title={download.error}
                        >
                          {download.error}
                        </div>
                      ) : null}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8"
                        onClick={() => onDownload(quant.id)}
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
                        onClick={() => onDownload(quant.id)}
                      >
                        Resume
                      </Button>
                    </div>
                  ) : downloaded ? (
                    <Badge variant="secondary">Downloaded</Badge>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => onDownload(quant.id)}
                    >
                      <Download className="mr-1 size-3.5" />
                      Download
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </RadioGroup>
      </TooltipProvider>
    </div>
  )
}

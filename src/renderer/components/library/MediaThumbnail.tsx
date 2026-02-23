import * as React from 'react'
import { Check, Play, Star, X } from 'lucide-react'

import type { MediaRecord } from '@/types'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/media'

type OverlaySize = 'grid' | 'filmstrip'

interface MediaThumbnailProps {
  media: MediaRecord
  fallbackLabel: string
  className?: string
  overlaySize?: OverlaySize
}

const overlayClassBySize: Record<
  OverlaySize,
  {
    statusPosition: string
    statusBadgeSize: string
    statusIconSize: string
    ratingPosition: string
    ratingStarSize: string
  }
> = {
  grid: {
    statusPosition: 'top-1.5 left-1.5',
    statusBadgeSize: 'h-5 w-5',
    statusIconSize: 'h-3 w-3',
    ratingPosition: 'top-1.5 right-1.5',
    ratingStarSize: 'h-3 w-3'
  },
  filmstrip: {
    statusPosition: 'top-1 left-1',
    statusBadgeSize: 'h-4 w-4',
    statusIconSize: 'h-2.5 w-2.5',
    ratingPosition: 'top-1 right-1',
    ratingStarSize: 'h-2.5 w-2.5'
  }
}

export const MediaThumbnail = React.memo(function MediaThumbnail({
  media,
  fallbackLabel,
  className,
  overlaySize = 'grid'
}: MediaThumbnailProps): React.JSX.Element {
  const overlayClasses = overlayClassBySize[overlaySize]
  const starCount = Math.max(0, Math.min(5, Math.floor(media.rating)))
  const isVideo = media.media_type === 'video'

  return (
    <div className={cn('relative h-full w-full overflow-hidden rounded-md border bg-muted', className)}>
      {media.thumb_path ? (
        <img
          src={media.thumb_path}
          alt={media.file_name}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
          {fallbackLabel}
        </div>
      )}

      {media.status && (
        <div
          className={cn(
            'absolute flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm',
            overlayClasses.statusPosition,
            overlayClasses.statusBadgeSize
          )}
        >
          {media.status === 'selected' ? (
            <Check className={overlayClasses.statusIconSize} strokeWidth={3} />
          ) : (
            <X className={overlayClasses.statusIconSize} strokeWidth={3} />
          )}
        </div>
      )}

      {starCount > 0 && (
        <div className={cn('absolute flex items-center gap-px drop-shadow-sm', overlayClasses.ratingPosition)}>
          {Array.from({ length: starCount }, (_, index) => (
            <Star
              key={index}
              className={cn('fill-primary text-primary', overlayClasses.ratingStarSize)}
            />
          ))}
        </div>
      )}

      {isVideo && (
        <>
          <div className="absolute bottom-1.5 left-1.5 rounded-full bg-black/65 p-1 text-white shadow-sm">
            <Play className="size-3 fill-current" />
          </div>
          {media.duration !== null && (
            <div className="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white shadow-sm">
              {formatDuration(media.duration)}
            </div>
          )}
        </>
      )}
    </div>
  )
})

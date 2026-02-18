import * as React from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DialogOverlay, DialogPortal } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

// =============================================================================
// ImagePreviewModal
// Reusable full-screen image preview dialog. Accepts a src URL and optional
// alt text. Click the image to toggle between fit-to-screen and actual size.
//
// Uses raw Radix primitives for the Content layer to avoid shadcn DialogContent's
// hardcoded max-width constraints.
// =============================================================================

interface ImagePreviewModalProps {
  /** Whether the modal is open. */
  open: boolean
  /** Image URL to display. */
  src: string | null
  /** Alt text for the image. */
  alt?: string
  /** Called when the user requests the modal to close. */
  onOpenChange: (open: boolean) => void
}

export function ImagePreviewModal({
  open,
  src,
  alt = 'Image preview',
  onOpenChange
}: ImagePreviewModalProps): React.JSX.Element {
  const [zoomed, setZoomed] = React.useState(false)

  // Reset zoom when modal closes
  React.useEffect(() => {
    if (!open) setZoomed(false)
  }, [open])

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          aria-label={alt}
          className={cn(
            'fixed z-50 outline-none',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            zoomed
              ? // Full-screen: pin to viewport edges, no border-radius
                'inset-0 flex flex-col rounded-none bg-black/95'
              : // Fit mode: centered, sized to content
                'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col rounded-xl bg-black/90 shadow-2xl'
          )}
        >
          {/* Toolbar */}
          <div className="flex shrink-0 items-center justify-end gap-1 px-3 py-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => onOpenChange(false)}
              aria-label="Close preview"
            >
              <X className="size-4" />
            </Button>
          </div>

          {/* Image area */}
          <div
            className={cn(
              'flex items-center justify-center px-4 pb-4',
              zoomed ? 'min-h-0 flex-1 cursor-zoom-out overflow-auto' : 'cursor-zoom-in'
            )}
            onClick={() => setZoomed((z) => !z)}
          >
            {src && (
              <img
                src={src}
                alt={alt}
                draggable={false}
                className={cn(
                  'rounded',
                  zoomed
                    ? 'max-h-none max-w-none'
                    : 'max-h-[calc(92dvh-3rem)] max-w-[92vw] object-contain'
                )}
              />
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  )
}

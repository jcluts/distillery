import * as React from 'react'
import { ImageIcon, Plus, X } from 'lucide-react'

import { ImagePreviewModal } from '@/components/modals/ImagePreviewModal'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useGenerationStore, type RefImage } from '@/stores/generation-store'
import { useLibraryStore } from '@/stores/library-store'

// =============================================================================
// RefImageDropzone
// Drop zone for reference images in the generation pane. Supports:
//   - Drag and drop from the library or the filesystem
//   - Clicking to open a file picker
//   - Removing individual images
//   - Reordering via drag-and-drop between thumbnails
//   - Replacing a slot by dropping a new image onto an existing thumbnail
//   - Clicking a thumbnail to open a full-screen preview
// =============================================================================

function extractDroppedFilePaths(e: React.DragEvent): string[] {
  type ElectronFile = File & { path?: string }
  return Array.from(e.dataTransfer.files ?? [])
    .map((f) => (f as ElectronFile).path)
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
}

// — Individual thumbnail ──────────────────────────────────────────────────────

interface RefThumbProps {
  src: string | null
  label: string
  isDragTarget: boolean
  isBeingDragged: boolean
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onRemove: (e: React.MouseEvent) => void
  onPreview: () => void
}

function RefThumb({
  src,
  label,
  isDragTarget,
  isBeingDragged,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onRemove,
  onPreview
}: RefThumbProps): React.JSX.Element {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'group relative aspect-square w-full cursor-pointer overflow-hidden rounded-md border bg-muted transition-all',
        isDragTarget && 'ring-2 ring-primary ring-offset-1',
        isBeingDragged && 'opacity-40'
      )}
      onClick={onPreview}
      title={label}
    >
      {src ? (
        <img
          src={src}
          alt={label}
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <ImageIcon className="size-5 text-muted-foreground/50" />
        </div>
      )}
      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
      {/* Remove button */}
      <Button
        type="button"
        size="icon"
        variant="secondary"
        className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
      >
        <X className="size-2.5" />
      </Button>
    </div>
  )
}

// — "Add more" button ─────────────────────────────────────────────────────────

function AddMoreButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="flex aspect-square w-full items-center justify-center rounded-md border border-dashed bg-transparent text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
      aria-label="Add more reference images"
      title="Add more"
    >
      <Plus className="size-4" />
    </button>
  )
}

// — Main component ─────────────────────────────────────────────────────────────

export function RefImageDropzone(): React.JSX.Element {
  const refImages = useGenerationStore((s) => s.refImages)
  const addRefImage = useGenerationStore((s) => s.addRefImage)
  const removeRefImageAt = useGenerationStore((s) => s.removeRefImageAt)
  const replaceRefImageAt = useGenerationStore((s) => s.replaceRefImageAt)
  const reorderRefImages = useGenerationStore((s) => s.reorderRefImages)

  const libraryItems = useLibraryStore((s) => s.items)

  const [isDragOver, setIsDragOver] = React.useState(false)
  const [dragOverThumbIndex, setDragOverThumbIndex] = React.useState<number | null>(null)
  const [draggingIndex, setDraggingIndex] = React.useState<number | null>(null)
  const [previewSrc, setPreviewSrc] = React.useState<string | null>(null)
  const [previewAlt, setPreviewAlt] = React.useState<string>('Reference image')

  // Tracked in a ref so drop handlers can read it synchronously
  const dragSourceIndexRef = React.useRef<number | null>(null)

  // ── helpers ──

  const resolveImage = React.useCallback(
    (img: RefImage) => {
      if (img.kind === 'id') {
        const media = libraryItems.find((m) => m.id === img.id) ?? null
        return {
          thumbSrc: media?.thumb_path ?? null,
          fileSrc: media?.file_path ?? null,
          label: media?.file_name ?? 'Reference'
        }
      }
      const fileName = img.path.split(/[\\/]/).pop() ?? 'File'
      return { thumbSrc: null, fileSrc: null, label: fileName }
    },
    [libraryItems]
  )

  const openFilePicker = React.useCallback(async () => {
    const paths = await window.api.showOpenDialog({
      title: 'Choose reference images',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'] }
      ]
    })
    if (!paths || paths.length === 0) return
    const imported = await window.api.importMedia(paths)
    for (const m of imported) addRefImage({ kind: 'id', id: m.id })
  }, [addRefImage])

  // ── zone-level handlers ──

  const handleZoneDragOver = React.useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setIsDragOver(true)
  }, [])

  const handleZoneDragLeave = React.useCallback((e: React.DragEvent) => {
    // Only clear when truly leaving the zone (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }, [])

  const handleZoneDrop = React.useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)

      // Internal reorder: dragged to zone body → move to end
      const refIdxStr = e.dataTransfer.getData('application/x-ref-image-index')
      if (refIdxStr !== '') {
        const from = dragSourceIndexRef.current
        if (from !== null && from !== refImages.length - 1) {
          reorderRefImages(from, refImages.length - 1)
        }
        dragSourceIndexRef.current = null
        setDraggingIndex(null)
        return
      }

      // Multi-media drop
      const multiIds = e.dataTransfer.getData('application/x-distillery-media-ids')
      if (multiIds) {
        try {
          const ids = JSON.parse(multiIds) as string[]
          for (const id of ids) addRefImage({ kind: 'id', id })
        } catch {
          /* ignore */
        }
        return
      }

      // Single-media drop
      const mediaId = e.dataTransfer.getData('application/x-distillery-media-id')
      if (mediaId) {
        addRefImage({ kind: 'id', id: mediaId })
        return
      }

      // File drop
      const filePaths = extractDroppedFilePaths(e)
      if (filePaths.length > 0) {
        const imported = await window.api.importMedia(filePaths)
        for (const m of imported) addRefImage({ kind: 'id', id: m.id })
      }
    },
    [addRefImage, refImages.length, reorderRefImages]
  )

  // ── thumb-level handlers ──

  const makeThumbHandlers = React.useCallback(
    (index: number) => ({
      onDragStart: (e: React.DragEvent) => {
        dragSourceIndexRef.current = index
        setDraggingIndex(index)
        e.dataTransfer.setData('application/x-ref-image-index', String(index))
        e.dataTransfer.effectAllowed = 'move'
      },
      onDragEnd: (_e: React.DragEvent) => {
        dragSourceIndexRef.current = null
        setDraggingIndex(null)
        setDragOverThumbIndex(null)
      },
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setDragOverThumbIndex(index)
      },
      onDragLeave: (e: React.DragEvent) => {
        e.stopPropagation()
        setDragOverThumbIndex((prev) => (prev === index ? null : prev))
      },
      onDrop: async (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setDragOverThumbIndex(null)
        setIsDragOver(false)

        // Internal reorder
        const refIdxStr = e.dataTransfer.getData('application/x-ref-image-index')
        if (refIdxStr !== '') {
          const from = parseInt(refIdxStr, 10)
          if (!Number.isNaN(from) && from !== index) {
            reorderRefImages(from, index)
          }
          dragSourceIndexRef.current = null
          setDraggingIndex(null)
          return
        }

        // Replace from multi-media
        const multiIds = e.dataTransfer.getData('application/x-distillery-media-ids')
        if (multiIds) {
          try {
            const ids = JSON.parse(multiIds) as string[]
            if (ids[0]) replaceRefImageAt(index, { kind: 'id', id: ids[0] })
            for (let i = 1; i < ids.length; i++) addRefImage({ kind: 'id', id: ids[i] })
          } catch {
            /* ignore */
          }
          return
        }

        // Replace from single media
        const mediaId = e.dataTransfer.getData('application/x-distillery-media-id')
        if (mediaId) {
          replaceRefImageAt(index, { kind: 'id', id: mediaId })
          return
        }

        // Replace from file
        const filePaths = extractDroppedFilePaths(e)
        if (filePaths.length > 0) {
          const imported = await window.api.importMedia(filePaths)
          if (imported[0]) replaceRefImageAt(index, { kind: 'id', id: imported[0].id })
          for (let i = 1; i < imported.length; i++) addRefImage({ kind: 'id', id: imported[i].id })
        }
      }
    }),
    [addRefImage, replaceRefImageAt, reorderRefImages]
  )

  const isEmpty = refImages.length === 0
  // Is the current drag operation coming from an external source (not an internal thumb)?
  const isExternalDrag = draggingIndex === null

  return (
    <>
      <div
        className={cn(
          'relative rounded-lg border-2 border-dashed transition-all duration-150',
          isEmpty ? 'cursor-pointer' : '',
          isDragOver && isExternalDrag
            ? 'border-primary bg-primary/5'
            : 'border-border bg-background hover:border-muted-foreground/40'
        )}
        onDragOver={handleZoneDragOver}
        onDragLeave={handleZoneDragLeave}
        onDrop={handleZoneDrop}
        onClick={isEmpty ? openFilePicker : undefined}
      >
        {isEmpty ? (
          // ── Empty state ──────────────────────────────────────────────────
          <div
            className={cn(
              'flex items-center gap-2.5 px-4 py-4 transition-colors',
              isDragOver ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <ImageIcon className="size-4 shrink-0" />
            <div>
              <p className="text-sm font-medium leading-none">
                {isDragOver ? 'Drop to add reference' : 'Add reference images'}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Drag from library, or click to browse
              </p>
            </div>
          </div>
        ) : (
          // ── Thumbnail grid ───────────────────────────────────────────────
          <div className="grid grid-cols-3 gap-2 p-3">
            {refImages.map((img, idx) => {
              const { thumbSrc, fileSrc, label } = resolveImage(img)
              const handlers = makeThumbHandlers(idx)
              return (
                <RefThumb
                  key={img.kind === 'id' ? img.id : img.path}
                  src={thumbSrc}
                  label={label}
                  isDragTarget={dragOverThumbIndex === idx}
                  isBeingDragged={draggingIndex === idx}
                  onRemove={(e) => {
                    e.stopPropagation()
                    removeRefImageAt(idx)
                  }}
                  onPreview={() => {
                    if (fileSrc) {
                      setPreviewSrc(fileSrc)
                      setPreviewAlt(label)
                    }
                  }}
                  {...handlers}
                />
              )
            })}

            <AddMoreButton onClick={openFilePicker} />
          </div>
        )}

        {/* Drag-over overlay label when images are present */}
        {!isEmpty && isDragOver && isExternalDrag && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-primary/10 ring-2 ring-inset ring-primary">
            <span className="rounded-md bg-background/90 px-2 py-1 text-xs font-medium text-primary shadow">
              Drop to add
            </span>
          </div>
        )}
      </div>

      <ImagePreviewModal
        open={previewSrc !== null}
        src={previewSrc}
        alt={previewAlt}
        onOpenChange={(open) => {
          if (!open) setPreviewSrc(null)
        }}
      />
    </>
  )
}

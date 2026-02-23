import * as React from 'react'
import { Layers3, Settings, Star } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle
} from '@/components/ui/item'
import { cn } from '@/lib/utils'
import { useCollectionStore } from '@/stores/collection-store'
import { useUIStore } from '@/stores/ui-store'
import type { CollectionRecord } from '@/types'

function hasMediaDragData(e: React.DragEvent): boolean {
  return (
    e.dataTransfer.types.includes('application/x-distillery-media-ids') ||
    e.dataTransfer.types.includes('application/x-distillery-media-id')
  )
}

function parseDroppedMediaIds(e: React.DragEvent): string[] {
  const multiIdsRaw = e.dataTransfer.getData('application/x-distillery-media-ids')
  const singleId = e.dataTransfer.getData('application/x-distillery-media-id')

  if (multiIdsRaw) {
    try {
      const parsed = JSON.parse(multiIdsRaw) as unknown
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === 'string' && id.length > 0)
      }
    } catch {
      // no-op
    }
  }

  return singleId ? [singleId] : []
}

function CollectionRow({
  collection,
  active,
  isReorderDragOver,
  isMediaDragOver,
  onSelect,
  onEdit,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop
}: {
  collection: CollectionRecord
  active: boolean
  isReorderDragOver: boolean
  isMediaDragOver: boolean
  onSelect: () => void
  onEdit: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
}): React.JSX.Element {
  const isSpecial = collection.type === 'special'
  const [isHovered, setIsHovered] = React.useState(false)

  return (
    <Item
      size="xs"
      className={cn(
        'rounded-md px-2 py-1.5 transition-colors',
        active
          ? 'border-primary/40 bg-primary/10'
          : 'border-transparent hover:border-border hover:bg-muted/50',
        isReorderDragOver && 'border-primary/50 bg-primary/5',
        isMediaDragOver && 'border-primary bg-primary/10'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      draggable={!isSpecial}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        onClick={onSelect}
      >
        <ItemMedia variant="icon" className="size-auto">
          {isSpecial ? <Star /> : <Layers3 color={collection.color} />}
        </ItemMedia>
        <ItemContent>
          <ItemTitle>{collection.name}</ItemTitle>
        </ItemContent>
      </button>

      <ItemActions>
        {!isSpecial ? (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className={cn(
              'transition-opacity bg-background',
              isHovered ? 'opacity-100' : 'pointer-events-none opacity-0'
            )}
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            aria-label={`Edit ${collection.name}`}
          >
            <Settings />
          </Button>
        ) : (
          <span className="size-6" aria-hidden="true" />
        )}
        <Badge variant="ghost" className="bg-background">
          {collection.media_count}
        </Badge>
      </ItemActions>
    </Item>
  )
}

export function CollectionsPane(): React.JSX.Element {
  const openModal = useUIStore((state) => state.openModal)

  const collections = useCollectionStore((state) => state.collections)
  const activeCollectionId = useCollectionStore((state) => state.activeCollectionId)
  const setActiveCollection = useCollectionStore((state) => state.setActiveCollection)
  const setEditingCollectionId = useCollectionStore((state) => state.setEditingCollectionId)
  const reorderCollections = useCollectionStore((state) => state.reorderCollections)
  const addMediaToCollection = useCollectionStore((state) => state.addMediaToCollection)

  const [draggingCollectionId, setDraggingCollectionId] = React.useState<string | null>(null)
  const [dragOverCollectionId, setDragOverCollectionId] = React.useState<string | null>(null)
  const [mediaDragOverId, setMediaDragOverId] = React.useState<string | null>(null)

  const specialCollections = collections.filter((collection) => collection.type === 'special')
  const manualCollections = collections.filter((collection) => collection.type !== 'special')

  const openEditModal = React.useCallback(
    (collectionId: string) => {
      setEditingCollectionId(collectionId)
      openModal('collection')
    },
    [openModal, setEditingCollectionId]
  )

  return (
    <ItemGroup className="gap-1">
      {specialCollections.map((collection) => (
        <CollectionRow
          key={collection.id}
          collection={collection}
          active={collection.id === activeCollectionId}
          isReorderDragOver={false}
          isMediaDragOver={false}
          onSelect={() => setActiveCollection(collection.id)}
          onEdit={() => {}}
          onDragStart={() => {}}
          onDragEnd={() => {
            setDraggingCollectionId(null)
            setDragOverCollectionId(null)
          }}
          onDragOver={() => {}}
          onDragLeave={() => {}}
          onDrop={() => {}}
        />
      ))}

      {manualCollections.length > 0 && specialCollections.length > 0 && <ItemSeparator />}

      {manualCollections.map((collection) => (
        <CollectionRow
          key={collection.id}
          collection={collection}
          active={collection.id === activeCollectionId}
          isReorderDragOver={dragOverCollectionId === collection.id}
          isMediaDragOver={mediaDragOverId === collection.id}
          onSelect={() => setActiveCollection(collection.id)}
          onEdit={() => openEditModal(collection.id)}
          onDragStart={(e) => {
            setDraggingCollectionId(collection.id)
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('application/x-distillery-collection-id', collection.id)
          }}
          onDragEnd={() => {
            setDraggingCollectionId(null)
            setDragOverCollectionId(null)
          }}
          onDragOver={(e) => {
            if (hasMediaDragData(e)) {
              e.preventDefault()
              setMediaDragOverId(collection.id)
              return
            }

            if (draggingCollectionId && draggingCollectionId !== collection.id) {
              e.preventDefault()
              setDragOverCollectionId(collection.id)
            }
          }}
          onDragLeave={() => {
            setDragOverCollectionId(null)
            setMediaDragOverId(null)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setMediaDragOverId(null)

            const mediaIds = parseDroppedMediaIds(e)
            if (mediaIds.length > 0) {
              void addMediaToCollection(collection.id, mediaIds)
              setDragOverCollectionId(null)
              return
            }

            const draggedCollectionId =
              e.dataTransfer.getData('application/x-distillery-collection-id') ||
              draggingCollectionId

            if (!draggedCollectionId || draggedCollectionId === collection.id) {
              setDragOverCollectionId(null)
              return
            }

            const nextOrderedIds = manualCollections.map((item) => item.id)
            const fromIndex = nextOrderedIds.indexOf(draggedCollectionId)
            const toIndex = nextOrderedIds.indexOf(collection.id)

            if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) {
              setDragOverCollectionId(null)
              return
            }

            const [moved] = nextOrderedIds.splice(fromIndex, 1)
            nextOrderedIds.splice(toIndex, 0, moved)
            reorderCollections(nextOrderedIds)

            setDraggingCollectionId(null)
            setDragOverCollectionId(null)
          }}
        />
      ))}
    </ItemGroup>
  )
}

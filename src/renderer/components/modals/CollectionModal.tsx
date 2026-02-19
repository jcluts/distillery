import * as React from 'react'
import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useCollectionStore } from '@/stores/collection-store'
import { useLibraryStore } from '@/stores/library-store'
import { useUIStore } from '@/stores/ui-store'

const DEFAULT_COLLECTION_COLOR = 'var(--foreground)'

const COLLECTION_COLORS = [
  DEFAULT_COLLECTION_COLOR,
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#f43f5e',
  '#8b5cf6',
  '#84cc16',
  '#f97316',
  '#64748b'
]

export function CollectionModal(): React.JSX.Element {
  const activeModals = useUIStore((state) => state.activeModals)
  const closeModal = useUIStore((state) => state.closeModal)

  const collections = useCollectionStore((state) => state.collections)
  const editingCollectionId = useCollectionStore((state) => state.editingCollectionId)
  const setEditingCollectionId = useCollectionStore((state) => state.setEditingCollectionId)
  const createCollection = useCollectionStore((state) => state.createCollection)
  const updateCollection = useCollectionStore((state) => state.updateCollection)
  const deleteCollection = useCollectionStore((state) => state.deleteCollection)

  const selectedIds = useLibraryStore((state) => state.selectedIds)

  const open = activeModals.includes('collection')
  const editingCollection =
    editingCollectionId ? collections.find((collection) => collection.id === editingCollectionId) : null

  const isEditing = !!editingCollection
  const selectedCount = selectedIds.size
  const showAddSelected = !isEditing && selectedCount > 0

  const [name, setName] = React.useState('')
  const [color, setColor] = React.useState(DEFAULT_COLLECTION_COLOR)
  const [addSelectedMedia, setAddSelectedMedia] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setName('')
      setColor(DEFAULT_COLLECTION_COLOR)
      setAddSelectedMedia(true)
      setSaving(false)
      setError(null)
      return
    }

    if (editingCollection) {
      setName(editingCollection.name)
      setColor(editingCollection.color)
    } else {
      setName('')
      setColor(DEFAULT_COLLECTION_COLOR)
      setAddSelectedMedia(true)
    }

    setSaving(false)
    setError(null)
  }, [editingCollection, open])

  const handleClose = React.useCallback(() => {
    closeModal('collection')
    setEditingCollectionId(null)
  }, [closeModal, setEditingCollectionId])

  const canSave = name.trim().length > 0 && name.trim().length <= 100 && !saving

  const handleSave = React.useCallback(async () => {
    const trimmedName = name.trim()
    if (!trimmedName || trimmedName.length > 100) return

    setSaving(true)
    setError(null)

    try {
      if (editingCollection) {
        await updateCollection(editingCollection.id, {
          name: trimmedName,
          color
        })
      } else {
        await createCollection({
          name: trimmedName,
          color,
          media_ids:
            showAddSelected && addSelectedMedia && selectedCount > 0 ? [...selectedIds] : undefined
        })
      }

      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [
    addSelectedMedia,
    color,
    createCollection,
    editingCollection,
    handleClose,
    name,
    selectedCount,
    selectedIds,
    showAddSelected,
    updateCollection
  ])

  const handleDelete = React.useCallback(async () => {
    if (!editingCollection) return

    setSaving(true)
    setError(null)

    try {
      await deleteCollection(editingCollection.id)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [deleteCollection, editingCollection, handleClose])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Collection' : 'New Collection'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update collection details.'
              : 'Create a collection to organize selected media.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="collection-name">Name</Label>
            <Input
              id="collection-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Collection name"
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLLECTION_COLORS.map((swatch) => {
                const selected = swatch === color
                return (
                  <button
                    key={swatch}
                    type="button"
                    className={cn(
                      'size-6 rounded-full border transition-transform hover:scale-105',
                      selected ? 'ring-2 ring-ring ring-offset-2 ring-offset-background' : 'border-border'
                    )}
                    style={{ backgroundColor: swatch }}
                    onClick={() => setColor(swatch)}
                    aria-label={`Select color ${swatch}`}
                  />
                )
              })}
            </div>
          </div>

          {showAddSelected && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="add-selected-media"
                checked={addSelectedMedia}
                onCheckedChange={(checked) => setAddSelectedMedia(checked === true)}
              />
              <Label htmlFor="add-selected-media" className="text-sm font-normal">
                Add {selectedCount} selected items
              </Label>
            </div>
          )}

          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>

        <DialogFooter>
          {isEditing && (
            <Button
              type="button"
              variant="destructive"
              className="sm:mr-auto"
              onClick={() => void handleDelete()}
              disabled={saving}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          )}
          <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={!canSave}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

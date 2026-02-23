import * as React from 'react'
import { FolderOpen, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { useCollectionStore } from '@/stores/collection-store'
import { useImportFolderStore } from '@/stores/import-folder-store'
import { useUIStore } from '@/stores/ui-store'
import type { ImportFolderMode } from '@/types'

const NONE_COLLECTION_VALUE = '__none__'

function parseKeywords(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
  ]
}

function basenameFromPath(folderPath: string): string {
  const cleaned = folderPath.replace(/[\\/]+$/, '')
  const segments = cleaned.split(/[\\/]/)
  return segments[segments.length - 1] || cleaned
}

export function ImportFolderDialog(): React.JSX.Element {
  const activeModals = useUIStore((state) => state.activeModals)
  const closeModal = useUIStore((state) => state.closeModal)

  const folders = useImportFolderStore((state) => state.folders)
  const editingFolderId = useImportFolderStore((state) => state.editingFolderId)
  const setEditingFolderId = useImportFolderStore((state) => state.setEditingFolderId)
  const startImport = useImportFolderStore((state) => state.startImport)
  const updateFolder = useImportFolderStore((state) => state.updateFolder)
  const deleteFolder = useImportFolderStore((state) => state.deleteFolder)

  const collections = useCollectionStore((state) => state.collections)

  const open = activeModals.includes('import-folder')
  const editingFolder = editingFolderId
    ? folders.find((folder) => folder.id === editingFolderId)
    : null

  const isEditing = !!editingFolder
  const manualCollections = collections.filter((collection) => collection.type === 'manual')

  const [folderPath, setFolderPath] = React.useState('')
  const [name, setName] = React.useState('')
  const [importMode, setImportMode] = React.useState<ImportFolderMode>('copy')
  const [targetCollectionId, setTargetCollectionId] = React.useState(NONE_COLLECTION_VALUE)
  const [defaultKeywords, setDefaultKeywords] = React.useState('')
  const [persist, setPersist] = React.useState(true)
  const [recursive, setRecursive] = React.useState(true)
  const [autoImport, setAutoImport] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setSaving(false)
      setError(null)
      return
    }

    if (editingFolder) {
      setFolderPath(editingFolder.path)
      setName(editingFolder.name)
      setImportMode(editingFolder.import_mode)
      setTargetCollectionId(editingFolder.target_collection_id ?? NONE_COLLECTION_VALUE)
      setDefaultKeywords((editingFolder.initial_keywords ?? []).join(', '))
      setPersist(editingFolder.persist)
      setRecursive(editingFolder.recursive)
      setAutoImport(editingFolder.auto_import)
    } else {
      setFolderPath('')
      setName('')
      setImportMode('copy')
      setTargetCollectionId(NONE_COLLECTION_VALUE)
      setDefaultKeywords('')
      setPersist(true)
      setRecursive(true)
      setAutoImport(false)
    }

    setSaving(false)
    setError(null)
  }, [editingFolder, open])

  React.useEffect(() => {
    if (!persist) {
      setAutoImport(false)
    }
  }, [persist])

  const handleClose = React.useCallback(() => {
    closeModal('import-folder')
    setEditingFolderId(null)
  }, [closeModal, setEditingFolderId])

  const browseFolder = React.useCallback(async () => {
    const selected = await window.api.showOpenDialog({
      title: 'Choose import folder',
      properties: ['openDirectory']
    })

    if (!selected || selected.length === 0) {
      return
    }

    const nextPath = selected[0]
    setFolderPath(nextPath)
    if (!name.trim()) {
      setName(basenameFromPath(nextPath))
    }
  }, [name])

  const canSave = folderPath.trim().length > 0 && name.trim().length > 0 && !saving

  const handleSave = React.useCallback(async () => {
    if (!canSave) {
      return
    }

    setSaving(true)
    setError(null)

    try {
      const keywords = parseKeywords(defaultKeywords)
      const collectionId =
        targetCollectionId === NONE_COLLECTION_VALUE ? undefined : targetCollectionId

      if (editingFolder) {
        await updateFolder({
          id: editingFolder.id,
          name: name.trim(),
          import_mode: importMode,
          recursive,
          persist,
          auto_import: persist ? autoImport : false,
          target_collection_id: collectionId,
          initial_keywords: keywords
        })
      } else {
        await startImport({
          name: name.trim(),
          path: folderPath.trim(),
          import_mode: importMode,
          recursive,
          persist,
          auto_import: persist ? autoImport : false,
          target_collection_id: collectionId,
          initial_keywords: keywords
        })
      }

      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [
    autoImport,
    canSave,
    defaultKeywords,
    editingFolder,
    folderPath,
    handleClose,
    importMode,
    name,
    persist,
    recursive,
    startImport,
    targetCollectionId,
    updateFolder
  ])

  const handleDelete = React.useCallback(async () => {
    if (!editingFolder) return

    setSaving(true)
    setError(null)

    try {
      await deleteFolder(editingFolder.id)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [deleteFolder, editingFolder, handleClose])

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Import Source' : 'Import Folder'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update saved source settings.'
              : 'Choose a folder and import mode, then start importing images.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="import-folder-path">Folder path</Label>
            <div className="flex items-center gap-2">
              <Input id="import-folder-path" value={folderPath} readOnly />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => void browseFolder()}
                disabled={saving || isEditing}
              >
                <FolderOpen className="size-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="import-folder-name">Name</Label>
            <Input
              id="import-folder-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Folder name"
              maxLength={120}
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label>Import mode</Label>
            <RadioGroup
              value={importMode}
              onValueChange={(value) => setImportMode(value as ImportFolderMode)}
              className="gap-2"
            >
              <label className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <RadioGroupItem value="reference" id="import-mode-reference" />
                <span>Reference files in place</span>
              </label>
              <label className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <RadioGroupItem value="copy" id="import-mode-copy" />
                <span>Copy files to library</span>
              </label>
              <label className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <RadioGroupItem value="move" id="import-mode-move" />
                <span>Move files to library</span>
              </label>
            </RadioGroup>
            {importMode === 'move' ? (
              <p className="text-xs text-amber-600">
                Move mode removes originals from the source folder.
              </p>
            ) : null}
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Add to collection</Label>
            <Select value={targetCollectionId} onValueChange={setTargetCollectionId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No collection" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_COLLECTION_VALUE}>No collection</SelectItem>
                {manualCollections.map((collection) => (
                  <SelectItem key={collection.id} value={collection.id}>
                    {collection.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="import-folder-keywords">Default keywords</Label>
            <Input
              id="import-folder-keywords"
              value={defaultKeywords}
              onChange={(event) => setDefaultKeywords(event.target.value)}
              placeholder="portrait, lighting, concept"
              disabled={saving}
            />
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="remember-folder" className="text-sm font-normal">
                Remember this folder
              </Label>
              <Switch
                id="remember-folder"
                checked={persist}
                onCheckedChange={setPersist}
                disabled={saving}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="include-subfolders" className="text-sm font-normal">
                Include subfolders
              </Label>
              <Switch
                id="include-subfolders"
                checked={recursive}
                onCheckedChange={setRecursive}
                disabled={saving}
              />
            </div>

            {persist ? (
              <div className="ml-4 flex items-center justify-between gap-3 border-l pl-3">
                <Label htmlFor="auto-import" className="text-sm font-normal">
                  Auto-scan on launch
                </Label>
                <Switch
                  id="auto-import"
                  checked={autoImport}
                  onCheckedChange={setAutoImport}
                  disabled={saving}
                />
              </div>
            ) : null}
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          {isEditing ? (
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
          ) : null}
          <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={!canSave}>
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Start Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

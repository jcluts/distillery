import * as React from 'react'
import { Folder, Pencil, RefreshCw, Trash2 } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SectionLabel } from '@/components/ui/section-label'
import { Separator } from '@/components/ui/separator'
import { useImportFolderStore } from '@/stores/import-folder-store'
import { useUIStore } from '@/stores/ui-store'
import type { ImportFolderRecord, ImportScanProgress } from '@/types'

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  const delta = Date.now() - t
  if (!Number.isFinite(delta) || delta < 0) return 'Just now'
  const sec = Math.floor(delta / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

function ImportFolderItem({
  folder,
  progress,
  onScan,
  onEdit,
  onDelete
}: {
  folder: ImportFolderRecord
  progress: ImportScanProgress | undefined
  onScan: (id: string) => Promise<void>
  onEdit: (id: string) => void
  onDelete: (id: string) => Promise<void>
}): React.JSX.Element {
  const isScanning = progress?.status === 'scanning' || progress?.status === 'importing'
  const progressTotal = progress ? Math.max(progress.files_found, progress.files_processed) : 0

  let detail = folder.last_scanned ? `Last scanned ${formatRelative(folder.last_scanned)}` : 'Never scanned'
  if (isScanning) {
    detail = `Importing ${progress.files_processed}/${progressTotal}...`
  } else if (progress?.status === 'error') {
    detail = progress.error ?? 'Import failed'
  }

  return (
    <div className="group rounded-md border p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Folder className="size-3.5 text-muted-foreground" />
            <span className="truncate text-sm font-medium">{folder.name}</span>
            {folder.auto_import ? (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                Auto
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground" title={folder.path}>
            {folder.path}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>

        <div className="flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => void onScan(folder.id)}
            disabled={isScanning}
            title="Scan now"
          >
            <RefreshCw className={`size-3.5 ${isScanning ? 'animate-spin' : ''}`} />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => onEdit(folder.id)}
            title="Edit source"
          >
            <Pencil className="size-3.5" />
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-destructive hover:text-destructive"
                title="Delete source"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete saved source?</AlertDialogTitle>
                <AlertDialogDescription>
                  This removes the source configuration but does not remove imported media.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => {
                    void onDelete(folder.id)
                  }}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  )
}

export function ImportPane(): React.JSX.Element {
  const [importedCount, setImportedCount] = React.useState<number>(0)

  const folders = useImportFolderStore((state) => state.folders)
  const scanProgress = useImportFolderStore((state) => state.scanProgress)
  const loadFolders = useImportFolderStore((state) => state.loadFolders)
  const scanFolder = useImportFolderStore((state) => state.scanFolder)
  const deleteFolder = useImportFolderStore((state) => state.deleteFolder)
  const setEditingFolderId = useImportFolderStore((state) => state.setEditingFolderId)

  const openModal = useUIStore((state) => state.openModal)

  React.useEffect(() => {
    void loadFolders()
  }, [loadFolders])

  const doImport = React.useCallback(async (filePaths: string[]) => {
    if (filePaths.length === 0) return
    const records = await window.api.importMedia(filePaths)
    setImportedCount((c) => c + (records?.length ?? 0))
  }, [])

  const onChooseFiles = React.useCallback(async () => {
    const paths = await window.api.showOpenDialog({
      title: 'Import images',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff'] }
      ]
    })

    if (!paths) return
    await doImport(paths)
  }, [doImport])

  const onDrop = React.useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      type ElectronLikeFile = File & { path?: string }
      const files = Array.from(e.dataTransfer.files ?? [])
      const filePaths = files
        .map((f) => (f as ElectronLikeFile).path)
        .filter((p): p is string => typeof p === 'string' && p.length > 0)

      await doImport(filePaths)
    },
    [doImport]
  )

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <SectionLabel>Quick Import</SectionLabel>
        <div
          className="rounded-md border border-dashed p-6 text-sm text-muted-foreground"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={onChooseFiles}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              void onChooseFiles()
            }
          }}
        >
          Drag files here, or click to browse
        </div>
        <Button type="button" variant="secondary" className="w-full" onClick={onChooseFiles}>
          Choose files
        </Button>
        <div className="text-xs text-muted-foreground">{importedCount} imported</div>
      </div>

      <Separator />

      <div className="space-y-2">
        <SectionLabel>Folder Import</SectionLabel>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={() => {
            setEditingFolderId(null)
            openModal('import-folder')
          }}
        >
          Import Folder...
        </Button>
      </div>

      <Separator />

      <div className="space-y-2">
        <SectionLabel>Saved Sources ({folders.length})</SectionLabel>
        {folders.length === 0 ? (
          <p className="text-xs text-muted-foreground">No saved sources yet.</p>
        ) : (
          <div className="space-y-2">
            {folders.map((folder) => (
              <ImportFolderItem
                key={folder.id}
                folder={folder}
                progress={scanProgress.get(folder.id)}
                onScan={scanFolder}
                onEdit={(id) => {
                  setEditingFolderId(id)
                  openModal('import-folder')
                }}
                onDelete={deleteFolder}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

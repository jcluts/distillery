import * as React from 'react'

import { Button } from '@/components/ui/button'

export function ImportPane(): React.JSX.Element {
  const [importedCount, setImportedCount] = React.useState<number>(0)

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
    <div className="space-y-3">
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
  )
}

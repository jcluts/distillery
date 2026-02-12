import * as React from 'react'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

function PanelHeader({ title }: { title: string }): React.JSX.Element {
  return (
    <div className="px-4 pt-4">
      <div className="text-xs font-semibold tracking-wider text-muted-foreground">
        {title.toUpperCase()}
      </div>
      <Separator className="mt-3" />
    </div>
  )
}

export function ImportPanel(): React.JSX.Element {
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
      const files = Array.from(e.dataTransfer.files ?? [])
      const filePaths = files
        .map((f) => (f as any).path as string | undefined)
        .filter((p): p is string => typeof p === 'string' && p.length > 0)

      await doImport(filePaths)
    },
    [doImport]
  )

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PanelHeader title="Import" />
      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 pb-4 pt-4">
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
    </div>
  )
}

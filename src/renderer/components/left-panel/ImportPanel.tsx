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
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PanelHeader title="Import" />
      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 pb-4 pt-4">
        <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          Drag files here, or click to browse (mock)
        </div>
        <Button type="button" variant="secondary" className="w-full">
          Choose files
        </Button>
        <div className="text-xs text-muted-foreground">0 imported</div>
      </div>
    </div>
  )
}

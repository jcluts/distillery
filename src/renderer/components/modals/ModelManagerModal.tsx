import * as React from 'react'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ModelManager } from '@/components/models/ModelManager'
import { useUIStore } from '@/stores/ui-store'

export function ModelManagerModal(): React.JSX.Element {
  const activeModals = useUIStore((s) => s.activeModals)
  const closeModal = useUIStore((s) => s.closeModal)

  const open = activeModals.includes('models')

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeModal('models')
      }}
    >
      <DialogContent className="top-[4vh] h-[82vh] w-[96vw] sm:max-w-[1100px] translate-y-0 flex flex-col overflow-hidden p-4 data-[state=closed]:slide-out-to-top-[4vh] data-[state=open]:slide-in-from-top-[4vh] sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>Model Manager</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden">
          <ModelManager />
        </div>
      </DialogContent>
    </Dialog>
  )
}

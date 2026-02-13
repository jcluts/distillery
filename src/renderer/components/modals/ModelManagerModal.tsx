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
      <DialogContent className="h-[92vh] w-[96vw] max-w-[1100px] p-4 sm:rounded-xl">
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

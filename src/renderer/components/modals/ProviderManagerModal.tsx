import * as React from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ProviderManager } from '@/components/providers/ProviderManager'
import { useUIStore } from '@/stores/ui-store'

export function ProviderManagerModal(): React.JSX.Element {
  const activeModals = useUIStore((s) => s.activeModals)
  const closeModal = useUIStore((s) => s.closeModal)

  const open = activeModals.includes('providers')

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeModal('providers')
      }}
    >
      <DialogContent className="top-[4vh] h-[82vh] w-[96vw] sm:max-w-[1100px] translate-y-0 flex flex-col overflow-hidden p-4 data-[state=closed]:slide-out-to-top-[4vh] data-[state=open]:slide-in-from-top-[4vh] sm:rounded-xl">
        <DialogHeader>
          <DialogTitle>API Providers</DialogTitle>
          <DialogDescription>
            Manage provider access, API keys, and available models
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden">
          <ProviderManager />
        </div>
      </DialogContent>
    </Dialog>
  )
}

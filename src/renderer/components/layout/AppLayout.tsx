import * as React from 'react'

import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { LeftPanel } from '@/components/left-panel/LeftPanel'
import { RightPanel } from '@/components/right-panel/RightPanel'
import { FilterBar } from '@/components/library/FilterBar'
import { GridView } from '@/components/library/GridView'
import { LoupeView } from '@/components/library/LoupeView'
import { StatusBar } from '@/components/layout/StatusBar'
import { TitleBar } from '@/components/layout/TitleBar'
import { useUIStore } from '@/stores/ui-store'

export function AppLayout(): React.JSX.Element {
  useKeyboardShortcuts()
  const viewMode = useUIStore((s) => s.viewMode)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <TitleBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <LeftPanel />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <FilterBar />
          <div className="min-h-0 flex-1 overflow-hidden">
            {viewMode === 'grid' ? <GridView /> : <LoupeView />}
          </div>
        </div>
        <RightPanel />
      </div>
      <StatusBar />
    </div>
  )
}

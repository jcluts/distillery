import * as React from 'react'

import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { LeftSidebar } from '@/components/layout/LeftSidebar'
import { RightSidebar } from '@/components/layout/RightSidebar'
import { FilterBar } from '@/components/library/FilterBar'
import { LibraryStatusBar } from '@/components/library/LibraryStatusBar'
import { GridView } from '@/components/library/GridView'
import { LoupeView } from '@/components/library/LoupeView'
import { TitleBar } from '@/components/layout/TitleBar'
import { useUIStore } from '@/stores/ui-store'

export function AppLayout(): React.JSX.Element {
  useKeyboardShortcuts()
  const viewMode = useUIStore((s) => s.viewMode)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <TitleBar />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <LeftSidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <FilterBar />
          <div className="min-h-0 flex-1 overflow-hidden">
            {viewMode === 'grid' ? <GridView /> : <LoupeView />}
          </div>
          <LibraryStatusBar />
        </div>
        <RightSidebar />
      </div>
    </div>
  )
}

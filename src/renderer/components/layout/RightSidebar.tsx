import * as React from 'react'
import { Layers3, Info, Plus, SlidersHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useUIStore, type RightPanelTab } from '@/stores/ui-store'
import { useCollectionStore } from '@/stores/collection-store'
import { AppSidebar, type SidebarTabConfig } from '@/components/layout/AppSidebar'
import { MediaInfoPane } from '@/components/panes/MediaInfoPane'
import { GenerationInfoPane } from '@/components/panes/GenerationInfoPane'
import { CollectionsPane } from '@/components/panes/CollectionsPane'

function CollectionsHeaderActions(): React.JSX.Element {
  const openModal = useUIStore((s) => s.openModal)
  const setEditingCollectionId = useCollectionStore((s) => s.setEditingCollectionId)

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon-sm"
      onClick={() => {
        setEditingCollectionId(null)
        openModal('collection')
      }}
      aria-label="Create collection"
    >
      <Plus className="size-4" />
    </Button>
  )
}

const RIGHT_TABS: SidebarTabConfig<RightPanelTab>[] = [
  {
    tab: 'collections',
    label: 'Collections',
    title: 'Collections',
    icon: Layers3,
    headerActions: <CollectionsHeaderActions />,
    content: <CollectionsPane />
  },
  {
    tab: 'info',
    label: 'Info',
    title: 'Media Info',
    icon: Info,
    content: <MediaInfoPane />
  },
  {
    tab: 'generation-info',
    label: 'Generation',
    title: 'Generation Info',
    icon: SlidersHorizontal,
    content: <GenerationInfoPane />
  }
]

export function RightSidebar(): React.JSX.Element {
  const open = useUIStore((s) => s.rightPanelOpen)
  const activeTab = useUIStore((s) => s.rightPanelTab)
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel)
  const setRightPanelOpen = useUIStore((s) => s.setRightPanelOpen)
  const width = useUIStore((s) => s.rightPanelWidth)

  return (
    <AppSidebar
      side="right"
      open={open}
      onOpenChange={setRightPanelOpen}
      activeTab={activeTab}
      onToggle={toggleRightPanel}
      width={width}
      tabs={RIGHT_TABS}
    />
  )
}

import * as React from 'react'
import { Info, SlidersHorizontal } from 'lucide-react'

import { useUIStore, type RightPanelTab } from '@/stores/ui-store'
import { AppSidebar, type SidebarTabConfig } from '@/components/layout/AppSidebar'
import { MediaInfoPane } from '@/components/panes/MediaInfoPane'
import { GenerationInfoPane } from '@/components/panes/GenerationInfoPane'

const RIGHT_TABS: SidebarTabConfig<RightPanelTab>[] = [
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

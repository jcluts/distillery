import * as React from 'react'
import { Clock, Download, Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useUIStore, type LeftPanelTab } from '@/stores/ui-store'
import { useGenerationStore } from '@/stores/generation-store'
import { AppSidebar, type SidebarTabConfig } from '@/components/layout/AppSidebar'
import { GenerationPane } from '@/components/panes/GenerationPane'
import { TimelinePane } from '@/components/panes/TimelinePane'
import { ImportPane } from '@/components/panes/ImportPane'

function TimelineHeaderActions(): React.JSX.Element {
  const generations = useGenerationStore((s) => s.generations)
  const setGenerations = useGenerationStore((s) => s.setGenerations)

  const activeCount = generations.filter((g) => g.status === 'pending').length

  const clearCompleted = React.useCallback(async () => {
    await window.api.timeline.clearCompleted()
    const { generations } = await window.api.timeline.getAll()
    setGenerations(generations)
  }, [setGenerations])

  return (
    <div className="flex items-center gap-2">
      {activeCount > 0 ? <Badge variant="secondary">{activeCount}</Badge> : null}
      <Button type="button" size="sm" variant="secondary" onClick={clearCompleted}>
        Clear completed
      </Button>
    </div>
  )
}

const LEFT_TABS: SidebarTabConfig<LeftPanelTab>[] = [
  {
    tab: 'generation',
    label: 'Generate',
    title: 'Generation',
    icon: Sparkles,
    content: <GenerationPane />
  },
  {
    tab: 'timeline',
    label: 'Timeline',
    title: 'Timeline',
    icon: Clock,
    content: <TimelinePane />,
    headerActions: <TimelineHeaderActions />
  },
  {
    tab: 'import',
    label: 'Import',
    title: 'Import',
    icon: Download,
    content: <ImportPane />
  }
]

export function LeftSidebar(): React.JSX.Element {
  const open = useUIStore((s) => s.leftPanelOpen)
  const activeTab = useUIStore((s) => s.leftPanelTab)
  const setLeftPanelOpen = useUIStore((s) => s.setLeftPanelOpen)
  const toggleLeftPanel = useUIStore((s) => s.toggleLeftPanel)
  const width = useUIStore((s) => s.leftPanelWidth)

  return (
    <AppSidebar
      side="left"
      open={open}
      onOpenChange={setLeftPanelOpen}
      activeTab={activeTab}
      onToggle={toggleLeftPanel}
      width={width}
      tabs={LEFT_TABS}
    />
  )
}

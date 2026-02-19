import * as React from 'react'
import { Clock, Download, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useUIStore, type LeftPanelTab } from '@/stores/ui-store'
import { useGenerationStore } from '@/stores/generation-store'
import { useQueueStore } from '@/stores/queue-store'
import { AppSidebar, type SidebarTabConfig } from '@/components/layout/AppSidebar'
import { GenerationPane } from '@/components/panes/GenerationPane'
import { TimelinePane } from '@/components/panes/TimelinePane'
import { ImportPane } from '@/components/panes/ImportPane'

function TimelineHeaderActions(): React.JSX.Element {
  const setGenerations = useGenerationStore((s) => s.setGenerations)

  const clearFailed = React.useCallback(async () => {
    await window.api.timeline.clearFailed()
    const { generations } = await window.api.timeline.getAll()
    setGenerations(generations)
  }, [setGenerations])

  return (
    <Button type="button" size="sm" variant="secondary" onClick={clearFailed}>
      Clear failed
    </Button>
  )
}

export function LeftSidebar(): React.JSX.Element {
  const open = useUIStore((s) => s.leftPanelOpen)
  const activeTab = useUIStore((s) => s.leftPanelTab)
  const setLeftPanelOpen = useUIStore((s) => s.setLeftPanelOpen)
  const toggleLeftPanel = useUIStore((s) => s.toggleLeftPanel)
  const width = useUIStore((s) => s.leftPanelWidth)

  const queueItems = useQueueStore((s) => s.items)
  const activeOrPendingCount = queueItems.filter(
    (q) => q.status === 'pending' || q.status === 'processing'
  ).length

  const tabs: SidebarTabConfig<LeftPanelTab>[] = [
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
      headerActions: <TimelineHeaderActions />,
      badge: activeOrPendingCount > 0 ? activeOrPendingCount : undefined
    },
    {
      tab: 'import',
      label: 'Import',
      title: 'Import',
      icon: Download,
      content: <ImportPane />
    }
  ]

  return (
    <AppSidebar
      side="left"
      open={open}
      onOpenChange={setLeftPanelOpen}
      activeTab={activeTab}
      onToggle={toggleLeftPanel}
      width={width}
      tabs={tabs}
    />
  )
}

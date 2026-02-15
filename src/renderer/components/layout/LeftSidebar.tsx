import * as React from 'react'
import { Clock, Download, Sparkles, type LucideIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider
} from '@/components/ui/sidebar'
import { useUIStore, type LeftPanelTab } from '@/stores/ui-store'
import { GenerationPane } from '@/components/panes/GenerationPane'
import { TimelinePane } from '@/components/panes/TimelinePane'
import { ImportPane } from '@/components/panes/ImportPane'
import { LeftSidebarStatusBar } from '@/components/layout/LeftSidebarStatusBar'
import { useGenerationStore } from '@/stores/generation-store'

const LEFT_PANEL_TABS: Array<{
  tab: LeftPanelTab
  label: string
  icon: LucideIcon
}> = [
  { tab: 'generation', label: 'Generate', icon: Sparkles },
  { tab: 'timeline', label: 'Timeline', icon: Clock },
  { tab: 'import', label: 'Import', icon: Download }
]

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

export function LeftSidebar(): React.JSX.Element {
  const open = useUIStore((s) => s.leftPanelOpen)
  const tab = useUIStore((s) => s.leftPanelTab)
  const setLeftPanelOpen = useUIStore((s) => s.setLeftPanelOpen)
  const activeTab = useUIStore((s) => s.leftPanelTab)
  const toggleLeftPanel = useUIStore((s) => s.toggleLeftPanel)
  const fullWidth = useUIStore((s) => s.leftPanelWidth)

  return (
    <SidebarProvider
      open={open}
      onOpenChange={setLeftPanelOpen}
      style={
        {
          '--sidebar-width': `${fullWidth}px`,
          '--sidebar-width-icon': '3.25rem'
        } as React.CSSProperties
      }
    >
      <Sidebar collapsible="icon" className="flex-row overflow-hidden border-r-0">
        <Sidebar collapsible="none" className="border-r">
          <SidebarContent>
            <SidebarGroup className="p-1.5">
              <SidebarGroupContent>
                <SidebarMenu>
                  {LEFT_PANEL_TABS.map((item) => (
                    <SidebarMenuItem key={item.tab}>
                      <SidebarMenuButton
                        tooltip={{ children: item.label, side: 'right', hidden: false }}
                        isActive={open && activeTab === item.tab}
                        className="size-9 justify-center p-0"
                        onClick={() => toggleLeftPanel(item.tab)}
                        aria-label={item.label}
                      >
                        <item.icon />
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>

        <Sidebar collapsible="none" className="min-w-0 flex-1 border-r-0">
          <SidebarHeader className="border-b px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold tracking-wider text-muted-foreground">
                {tab === 'generation' ? 'GENERATION' : tab === 'timeline' ? 'TIMELINE' : 'IMPORT'}
              </div>
              {tab === 'timeline' ? <TimelineHeaderActions /> : null}
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup className="p-0">
              <SidebarGroupContent className="px-3 py-3">
                {tab === 'generation' ? <GenerationPane /> : null}
                {tab === 'timeline' ? <TimelinePane /> : null}
                {tab === 'import' ? <ImportPane /> : null}
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t p-0">
            <LeftSidebarStatusBar />
          </SidebarFooter>
        </Sidebar>
      </Sidebar>
    </SidebarProvider>
  )
}

import * as React from 'react'
import { Info, SlidersHorizontal, type LucideIcon } from 'lucide-react'

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
import { useUIStore, type RightPanelTab } from '@/stores/ui-store'
import { MediaInfoPane } from '@/components/panes/MediaInfoPane'
import { GenerationInfoPane } from '@/components/panes/GenerationInfoPane'

const RIGHT_PANEL_TABS: Array<{
  tab: RightPanelTab
  label: string
  icon: LucideIcon
}> = [
  { tab: 'info', label: 'Info', icon: Info },
  { tab: 'generation-info', label: 'Generation', icon: SlidersHorizontal }
]

function HeaderTitle({ tab }: { tab: RightPanelTab }): React.JSX.Element {
  const title = tab === 'info' ? 'MEDIA INFO' : 'GENERATION INFO'

  return <div className="text-xs font-semibold tracking-wider text-muted-foreground">{title}</div>
}

export function RightSidebar(): React.JSX.Element {
  const open = useUIStore((s) => s.rightPanelOpen)
  const tab = useUIStore((s) => s.rightPanelTab)
  const activeTab = useUIStore((s) => s.rightPanelTab)
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel)
  const setRightPanelOpen = useUIStore((s) => s.setRightPanelOpen)
  const fullWidth = useUIStore((s) => s.rightPanelWidth)

  return (
    <SidebarProvider
      open={open}
      onOpenChange={setRightPanelOpen}
      style={
        {
          '--sidebar-width': `${fullWidth}px`,
          '--sidebar-width-icon': '3.25rem'
        } as React.CSSProperties
      }
    >
      <Sidebar
        side="right"
        collapsible="icon"
        className="flex-row-reverse overflow-hidden border-l border-r-0"
      >
        <Sidebar side="right" collapsible="none" className="border-l border-r-0">
          <SidebarContent>
            <SidebarGroup className="p-1.5">
              <SidebarGroupContent>
                <SidebarMenu>
                  {RIGHT_PANEL_TABS.map((item) => (
                    <SidebarMenuItem key={item.tab}>
                      <SidebarMenuButton
                        tooltip={{ children: item.label, side: 'left', hidden: false }}
                        isActive={open && activeTab === item.tab}
                        className="size-9 justify-center p-0"
                        onClick={() => toggleRightPanel(item.tab)}
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

        <Sidebar side="right" collapsible="none" className="min-w-0 flex-1 border-0">
          <SidebarHeader className="border-b px-3 py-2">
            <HeaderTitle tab={tab} />
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup className="p-0">
              <SidebarGroupContent className="px-3 py-3">
                {tab === 'info' ? <MediaInfoPane /> : null}
                {tab === 'generation-info' ? <GenerationInfoPane /> : null}
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t p-0" />
        </Sidebar>
      </Sidebar>
    </SidebarProvider>
  )
}

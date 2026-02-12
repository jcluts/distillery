import * as React from 'react'
import { Info, SlidersHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Sidebar } from '@/components/ui/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { PANEL_ICON_STRIP_WIDTH_PX } from '@/lib/layout'
import { cn } from '@/lib/utils'
import { useUIStore, type RightPanelTab } from '@/stores/ui-store'
import { MediaInfoPanel } from '@/components/right-panel/sections/MediaInfoPanel'
import { GenerationInfoPanel } from '@/components/right-panel/sections/GenerationInfoPanel'

function TabButton({
  tab,
  icon,
  label
}: {
  tab: RightPanelTab
  icon: React.ReactNode
  label: string
}): React.JSX.Element {
  const activeTab = useUIStore((s) => s.rightPanelTab)
  const open = useUIStore((s) => s.rightPanelOpen)
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel)
  const isActive = open && activeTab === tab

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'h-9 w-9',
            isActive && 'bg-accent text-accent-foreground'
          )}
          onClick={() => toggleRightPanel(tab)}
          aria-label={label}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  )
}

export function RightPanel(): React.JSX.Element {
  const open = useUIStore((s) => s.rightPanelOpen)
  const tab = useUIStore((s) => s.rightPanelTab)
  const fullWidth = useUIStore((s) => s.rightPanelWidth)

  return (
    <TooltipProvider delayDuration={250}>
      <Sidebar
        collapsible="icon"
        open={open}
        className="flex-row-reverse border-l border-r-0 bg-sidebar text-sidebar-foreground"
        style={
          {
            ['--sidebar-width' as any]: `${fullWidth}px`
          } as React.CSSProperties
        }
      >
        <div className="flex shrink-0 flex-col items-center gap-1 border-l px-1.5 py-1.5">
          <TabButton tab="info" icon={<Info />} label="Info" />
          <TabButton tab="generation-info" icon={<SlidersHorizontal />} label="Generation" />
        </div>

        {open ? (
          <div className="min-w-0 flex-1 overflow-hidden">
            {tab === 'info' ? <MediaInfoPanel /> : null}
            {tab === 'generation-info' ? <GenerationInfoPanel /> : null}
          </div>
        ) : null}
      </Sidebar>
    </TooltipProvider>
  )
}

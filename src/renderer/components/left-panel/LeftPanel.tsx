import * as React from 'react'
import { Clock, Download, Sparkles } from 'lucide-react'

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
import { useUIStore, type LeftPanelTab } from '@/stores/ui-store'
import { GenerationPanel } from '@/components/left-panel/GenerationPanel'
import { TimelinePanel } from '@/components/left-panel/TimelinePanel'
import { ImportPanel } from '@/components/left-panel/ImportPanel'
import { LeftPanelStatusBar } from '@/components/left-panel/LeftPanelStatusBar'

function TabButton({
  tab,
  icon,
  label
}: {
  tab: LeftPanelTab
  icon: React.ReactNode
  label: string
}): React.JSX.Element {
  const activeTab = useUIStore((s) => s.leftPanelTab)
  const open = useUIStore((s) => s.leftPanelOpen)
  const toggleLeftPanel = useUIStore((s) => s.toggleLeftPanel)
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
          onClick={() => toggleLeftPanel(tab)}
          aria-label={label}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}

export function LeftPanel(): React.JSX.Element {
  const open = useUIStore((s) => s.leftPanelOpen)
  const tab = useUIStore((s) => s.leftPanelTab)
  const fullWidth = useUIStore((s) => s.leftPanelWidth)

  return (
    <TooltipProvider delayDuration={250}>
      <Sidebar
        collapsible="icon"
        open={open}
        className="flex-row bg-sidebar text-sidebar-foreground"
        style={
          {
            // shadcn/sidebar-style widths
            ['--sidebar-width' as any]: `${fullWidth}px`,
            ['--sidebar-width-icon' as any]: `${PANEL_ICON_STRIP_WIDTH_PX}px`
          } as React.CSSProperties
        }
      >
        <div
          className="flex shrink-0 flex-col items-center gap-1 border-r px-2 py-2"
          style={{ width: PANEL_ICON_STRIP_WIDTH_PX }}
        >
          <TabButton tab="generation" icon={<Sparkles />} label="Generate" />
          <TabButton tab="timeline" icon={<Clock />} label="Timeline" />
          <TabButton tab="import" icon={<Download />} label="Import" />
        </div>

        {open ? (
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-hidden">
              {tab === 'generation' ? <GenerationPanel /> : null}
              {tab === 'timeline' ? <TimelinePanel /> : null}
              {tab === 'import' ? <ImportPanel /> : null}
            </div>
            <LeftPanelStatusBar />
          </div>
        ) : null}
      </Sidebar>
    </TooltipProvider>
  )
}

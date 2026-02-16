import * as React from 'react'
import { type LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
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
} from '@renderer/components/ui/sidebar_new'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface SidebarTabConfig<T extends string = string> {
  tab: T
  label: string
  title: string
  icon: LucideIcon
  content: React.ReactNode
  headerActions?: React.ReactNode
}

interface AppSidebarProps<T extends string = string> {
  side: 'left' | 'right'
  open: boolean
  onOpenChange: (open: boolean) => void
  activeTab: T
  onToggle: (tab: T) => void
  width: number
  tabs: SidebarTabConfig<T>[]
  footer?: React.ReactNode
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function AppSidebar<T extends string>({
  side,
  open,
  onOpenChange,
  activeTab,
  onToggle,
  width,
  tabs,
  footer
}: AppSidebarProps<T>): React.JSX.Element {
  const isLeft = side === 'left'
  const activeConfig = tabs.find((t) => t.tab === activeTab)

  return (
    <SidebarProvider
      open={open}
      onOpenChange={onOpenChange}
      style={
        {
          '--sidebar-width': `${width}px`,
          '--sidebar-width-icon': '3.25rem'
        } as React.CSSProperties
      }
    >
      <Sidebar
        side={side}
        collapsible="icon"
        className={
          isLeft ? '*:data-[sidebar=sidebar]:flex-row' : '*:data-[sidebar=sidebar]:flex-row-reverse'
        }
      >
        {/* Icon rail — always visible, never collapses */}
        <Sidebar
          side={side}
          collapsible="none"
          className={cn(
            'w-[calc(var(--sidebar-width-icon)+1px)]!',
            isLeft ? 'border-r' : 'border-l border-r-0'
          )}
        >
          <SidebarContent>
            <SidebarGroup className="p-1.5">
              <SidebarGroupContent>
                <SidebarMenu>
                  {tabs.map((item) => (
                    <SidebarMenuItem key={item.tab}>
                      <SidebarMenuButton
                        tooltip={{
                          children: item.label,
                          side: isLeft ? 'right' : 'left',
                          hidden: false
                        }}
                        isActive={open && activeTab === item.tab}
                        className="size-9 justify-center p-0"
                        onClick={() => onToggle(item.tab)}
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

        {/* Content panel — fills remaining width, hidden when collapsed */}
        <Sidebar side={side} collapsible="none" className="min-w-0 flex-1 border-0">
          <SidebarHeader className="h-10 border-b px-3">
            <div className="flex h-full items-center justify-between gap-2">
              <div className="text-xs font-semibold tracking-wider text-muted-foreground">
                {activeConfig?.title}
              </div>
              {activeConfig?.headerActions}
            </div>
          </SidebarHeader>

          <SidebarContent>
            <SidebarGroup className="p-0">
              <SidebarGroupContent className="px-3 py-3">
                {activeConfig?.content}
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="border-t p-0">{footer}</SidebarFooter>
        </Sidebar>
      </Sidebar>
    </SidebarProvider>
  )
}

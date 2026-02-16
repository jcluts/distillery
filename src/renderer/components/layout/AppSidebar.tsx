import * as React from 'react'
import { type LucideIcon } from 'lucide-react'

import { SectionHeader } from '@/components/ui/section-header'

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
  const titlebarOffset = '2.5rem'

  return (
    <SidebarProvider
      open={open}
      onOpenChange={onOpenChange}
      className="h-full min-h-0 w-auto shrink-0"
      style={
        {
          '--sidebar-width': `${width}px`,
          '--sidebar-width-icon': '3rem'
        } as React.CSSProperties
      }
    >
      <Sidebar
        side={side}
        collapsible="icon"
        style={{
          top: titlebarOffset,
          bottom: 'auto',
          height: `calc(100svh - ${titlebarOffset})`
        }}
        className={
          isLeft
            ? 'overflow-hidden *:data-[sidebar=sidebar]:flex-row border-r-0'
            : 'overflow-hidden *:data-[sidebar=sidebar]:flex-row-reverse border-l border-r-0'
        }
      >
        {/* Icon rail */}
        <Sidebar
          side={side}
          collapsible="none"
          className={
            isLeft
              ? 'w-[calc(var(--sidebar-width-icon)+1px)]! border-r'
              : 'w-[calc(var(--sidebar-width-icon)+1px)]! border-l border-r-0'
          }
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

        {/* Content panel */}
        <Sidebar side={side} collapsible="none" className="hidden min-w-0 flex-1 border-0 md:flex">
          <SidebarHeader className="h-10 border-b px-3">
            <div className="flex h-full items-center justify-between gap-2">
              <SectionHeader>{activeConfig?.title}</SectionHeader>
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

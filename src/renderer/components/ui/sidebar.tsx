import * as React from 'react'
import { PanelLeft } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type SidebarCollapsible = 'none' | 'icon'

interface SidebarContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

export function useSidebar(): SidebarContextValue {
  const ctx = React.useContext(SidebarContext)
  if (!ctx) {
    throw new Error('useSidebar must be used within <SidebarProvider>')
  }
  return ctx
}

export function SidebarProvider({
  defaultOpen = true,
  style,
  className,
  children
}: {
  defaultOpen?: boolean
  style?: React.CSSProperties
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = React.useState(defaultOpen)

  const value = React.useMemo<SidebarContextValue>(
    () => ({
      open,
      setOpen,
      toggle: () => setOpen((v) => !v)
    }),
    [open]
  )

  return (
    <SidebarContext.Provider value={value}>
      <div
        className={cn('flex h-full w-full', className)}
        style={style}
        data-sidebar-provider
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

export const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    collapsible?: SidebarCollapsible
    open?: boolean
  }
>(({ className, collapsible = 'none', open, style, ...props }, ref) => {
  const ctx = React.useContext(SidebarContext)
  const resolvedOpen = open ?? ctx?.open ?? true
  const widthStyle: React.CSSProperties = {
    ...style,
    width:
      collapsible === 'icon'
        ? resolvedOpen
          ? 'var(--sidebar-width, 20rem)'
          : 'var(--sidebar-width-icon, 3.25rem)'
        : 'var(--sidebar-width, 20rem)'
  }

  return (
    <div
      ref={ref}
      data-sidebar="sidebar"
      data-collapsible={collapsible}
      data-state={resolvedOpen ? 'expanded' : 'collapsed'}
      className={cn(
        'flex h-full shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground',
        className
      )}
      style={widthStyle}
      {...props}
    />
  )
})
Sidebar.displayName = 'Sidebar'

export const SidebarInset = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="inset"
    className={cn('flex min-w-0 flex-1 flex-col', className)}
    {...props}
  />
))
SidebarInset.displayName = 'SidebarInset'

export const SidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="header"
    className={cn('flex flex-col gap-2 p-2', className)}
    {...props}
  />
))
SidebarHeader.displayName = 'SidebarHeader'

export const SidebarContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="content"
    className={cn('min-h-0 flex-1 overflow-auto', className)}
    {...props}
  />
))
SidebarContent.displayName = 'SidebarContent'

export const SidebarFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    data-sidebar="footer"
    className={cn('flex flex-col gap-2 p-2', className)}
    {...props}
  />
))
SidebarFooter.displayName = 'SidebarFooter'

export function SidebarTrigger({
  className,
  ...props
}: React.ComponentProps<typeof Button>): React.JSX.Element {
  const { toggle } = useSidebar()
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      onClick={toggle}
      {...props}
    >
      <PanelLeft />
      <span className="sr-only">Toggle sidebar</span>
    </Button>
  )
}

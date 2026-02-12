import * as React from 'react'
import { Copy, Minus, Settings, Square, X } from 'lucide-react'

import { TITLE_BAR_HEIGHT_PX } from '@/lib/layout'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/stores/ui-store'

function WindowControls(): React.JSX.Element {
  const [isMaximized, setIsMaximized] = React.useState(false)

  React.useEffect(() => {
    void window.api.windowIsMaximized().then(setIsMaximized).catch(() => {})
    const unsub = window.api.on('app:windowMaximizedChanged', (value: unknown) => {
      setIsMaximized(Boolean(value))
    })
    return unsub
  }, [])

  const buttonClass =
    'h-8 w-11 rounded-none text-sidebar-foreground hover:bg-accent hover:text-accent-foreground'

  return (
    <div
      className="flex items-stretch"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={cn('grid place-items-center', buttonClass)}
        aria-label="Minimize"
        onClick={() => void window.api.windowMinimize()}
      >
        <Minus className="size-4" />
      </button>

      <button
        type="button"
        className={cn('grid place-items-center', buttonClass)}
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
        onClick={() => void window.api.windowToggleMaximize()}
      >
        {isMaximized ? <Copy className="size-4" /> : <Square className="size-4" />}
      </button>

      <button
        type="button"
        className={cn(
          'grid place-items-center',
          buttonClass,
          'hover:bg-destructive hover:text-destructive-foreground'
        )}
        aria-label="Close"
        onClick={() => void window.api.windowClose()}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

export function TitleBar(): React.JSX.Element {
  const openModal = useUIStore((s) => s.openModal)

  return (
    <div
      className={cn(
        'flex items-center border-b border-sidebar-border bg-sidebar pl-3 text-sidebar-foreground'
      )}
      style={
        {
          height: TITLE_BAR_HEIGHT_PX,
          WebkitAppRegion: 'drag'
        } as React.CSSProperties
      }
      onDoubleClick={() => void window.api.windowToggleMaximize()}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="text-sm font-medium text-foreground">Distillery</div>
        <div className="min-w-0 flex-1" />
      </div>

      {/* Reserved for future custom menus / actions. Marked no-drag. */}
      <div
        className="flex items-center gap-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => openModal('settings')}
          aria-label="Open settings"
        >
          <Settings />
        </Button>
      </div>

      <WindowControls />
    </div>
  )
}

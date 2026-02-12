import * as React from 'react'

import {
  TITLE_BAR_HEIGHT_PX,
  WINDOW_CONTROLS_FALLBACK_RIGHT_INSET_PX
} from '@/lib/layout'
import { cn } from '@/lib/utils'

function getWindowControlsRightInsetPx(): number {
  const wco = (navigator as any)?.windowControlsOverlay
  if (!wco?.getTitlebarAreaRect) {
    // Windows-only fallback so content won't sit under min/max/close.
    return navigator.userAgent.toLowerCase().includes('windows')
      ? WINDOW_CONTROLS_FALLBACK_RIGHT_INSET_PX
      : 0
  }

  try {
    const rect = wco.getTitlebarAreaRect()
    const rightInset = Math.max(0, window.innerWidth - (rect.x + rect.width))
    return Number.isFinite(rightInset) ? rightInset : 0
  } catch {
    return WINDOW_CONTROLS_FALLBACK_RIGHT_INSET_PX
  }
}

export function TitleBar(): React.JSX.Element {
  const [controlsRightInset, setControlsRightInset] = React.useState<number>(
    () => getWindowControlsRightInsetPx()
  )

  React.useEffect(() => {
    const update = (): void => setControlsRightInset(getWindowControlsRightInsetPx())
    update()

    const wco = (navigator as any)?.windowControlsOverlay
    if (wco && 'ongeometrychange' in wco) {
      wco.ongeometrychange = update
    }

    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
      if (wco && 'ongeometrychange' in wco) {
        wco.ongeometrychange = null
      }
    }
  }, [])

  return (
    <div
      className={cn(
        'flex items-center border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground'
      )}
      style={
        {
          height: TITLE_BAR_HEIGHT_PX,
          WebkitAppRegion: 'drag',
          paddingRight: 12 + controlsRightInset
        } as React.CSSProperties
      }
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="text-sm font-medium text-foreground">Distillery</div>
        <div className="min-w-0 flex-1" />
      </div>

      {/* Reserved for future custom menus / actions. Marked no-drag. */}
      <div
        className="flex items-center gap-2"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      />
    </div>
  )
}

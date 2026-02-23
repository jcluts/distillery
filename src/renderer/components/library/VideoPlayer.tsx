import * as React from 'react'
import { Pause, Pin, Play, Repeat, Volume2, VolumeX } from 'lucide-react'

import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/lib/media'
import type { ZoomLevel } from '@/stores/ui-store'
import type { MediaRecord } from '@/types'

interface VideoPlayerProps {
  media: MediaRecord | null
  zoom?: ZoomLevel
}

interface Pan {
  x: number
  y: number
}

function clampPan(pan: Pan, overflowX: number, overflowY: number): Pan {
  const clampedX = overflowX > 0 ? Math.max(-overflowX / 2, Math.min(overflowX / 2, pan.x)) : 0
  const clampedY = overflowY > 0 ? Math.max(-overflowY / 2, Math.min(overflowY / 2, pan.y)) : 0

  return { x: clampedX, y: clampedY }
}

export function VideoPlayer({ media, zoom = 'fit' }: VideoPlayerProps): React.JSX.Element {
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const hideTimerRef = React.useRef<number | null>(null)
  const dragStartRef = React.useRef<{ mouseX: number; mouseY: number; pan: Pan } | null>(null)

  const [containerSize, setContainerSize] = React.useState({ width: 0, height: 0 })
  const [nativeSize, setNativeSize] = React.useState({ width: 0, height: 0 })
  const [pan, setPan] = React.useState<Pan>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = React.useState(false)

  const [isPlaying, setIsPlaying] = React.useState(false)
  const [currentTime, setCurrentTime] = React.useState(0)
  const [duration, setDuration] = React.useState(media?.duration ?? 0)
  const [volume, setVolume] = React.useState(1)
  const [isMuted, setIsMuted] = React.useState(false)
  const [isLooping, setIsLooping] = React.useState(false)

  const [controlsPinned, setControlsPinned] = React.useState(false)
  const [controlsVisible, setControlsVisible] = React.useState(true)

  const sourceUrl = media?.working_file_path ?? media?.file_path ?? null

  React.useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect()
      setContainerSize({ width: rect.width, height: rect.height })
    })

    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    setPan({ x: 0, y: 0 })
  }, [zoom, sourceUrl])

  React.useEffect(() => {
    setCurrentTime(0)
    setDuration(media?.duration ?? 0)
    setNativeSize({ width: 0, height: 0 })
    setIsPlaying(false)
  }, [media?.id, media?.duration])

  const geometry = React.useMemo(() => {
    const width = containerSize.width
    const height = containerSize.height
    const videoWidth = nativeSize.width
    const videoHeight = nativeSize.height

    if (width <= 0 || height <= 0 || videoWidth <= 0 || videoHeight <= 0) {
      return {
        displayWidth: 0,
        displayHeight: 0,
        overflowX: 0,
        overflowY: 0,
        left: 0,
        top: 0,
        isPannable: false,
        clampedPan: { x: 0, y: 0 }
      }
    }

    const scale = zoom === 'actual' ? 1 : Math.min(width / videoWidth, height / videoHeight)
    const displayWidth = videoWidth * scale
    const displayHeight = videoHeight * scale
    const overflowX = Math.max(0, displayWidth - width)
    const overflowY = Math.max(0, displayHeight - height)
    const clampedPan = clampPan(pan, overflowX, overflowY)

    return {
      displayWidth,
      displayHeight,
      overflowX,
      overflowY,
      left: (width - displayWidth) / 2 + clampedPan.x,
      top: (height - displayHeight) / 2 + clampedPan.y,
      isPannable: overflowX > 0 || overflowY > 0,
      clampedPan
    }
  }, [containerSize.height, containerSize.width, nativeSize.height, nativeSize.width, pan, zoom])

  React.useEffect(() => {
    if (pan.x === geometry.clampedPan.x && pan.y === geometry.clampedPan.y) {
      return
    }

    setPan(geometry.clampedPan)
  }, [geometry.clampedPan, pan.x, pan.y])

  const clearHideTimer = React.useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  const scheduleControlsHide = React.useCallback(() => {
    clearHideTimer()
    if (controlsPinned) {
      return
    }

    hideTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false)
    }, 2000)
  }, [clearHideTimer, controlsPinned])

  const revealControls = React.useCallback(() => {
    setControlsVisible(true)
    scheduleControlsHide()
  }, [scheduleControlsHide])

  React.useEffect(() => {
    if (controlsPinned) {
      clearHideTimer()
      setControlsVisible(true)
      return
    }

    scheduleControlsHide()
  }, [clearHideTimer, controlsPinned, scheduleControlsHide])

  React.useEffect(() => {
    return () => {
      clearHideTimer()
    }
  }, [clearHideTimer])

  const handleLoadedMetadata = React.useCallback(() => {
    const video = videoRef.current
    if (!video) return

    setNativeSize({
      width: video.videoWidth || 0,
      height: video.videoHeight || 0
    })
    setDuration(Number.isFinite(video.duration) ? video.duration : (media?.duration ?? 0))
  }, [media?.duration])

  const handleTimeUpdate = React.useCallback(() => {
    const video = videoRef.current
    if (!video) return

    setCurrentTime(video.currentTime)
  }, [])

  const handlePlay = React.useCallback(() => setIsPlaying(true), [])
  const handlePause = React.useCallback(() => setIsPlaying(false), [])

  const handleVolumeChange = React.useCallback(() => {
    const video = videoRef.current
    if (!video) return

    setVolume(video.volume)
    setIsMuted(video.muted || video.volume <= 0)
  }, [])

  const togglePlayback = React.useCallback(async () => {
    const video = videoRef.current
    if (!video) return

    if (video.paused) {
      try {
        await video.play()
      } catch {
        // Ignore play interruption (for example on source swap).
      }
      return
    }

    video.pause()
  }, [])

  const handleSeekChange = React.useCallback((value: number[]) => {
    if (!value[0] && value[0] !== 0) return
    setCurrentTime(value[0])
  }, [])

  const handleSeekCommit = React.useCallback((value: number[]) => {
    const video = videoRef.current
    if (!video) return
    if (!value[0] && value[0] !== 0) return

    video.currentTime = value[0]
  }, [])

  const handleVolumeSlider = React.useCallback((value: number[]) => {
    const video = videoRef.current
    if (!video) return

    const nextVolume = Math.max(0, Math.min(1, (value[0] ?? 0) / 100))
    video.volume = nextVolume
    video.muted = nextVolume <= 0
    setVolume(nextVolume)
    setIsMuted(video.muted)
  }, [])

  const toggleMute = React.useCallback(() => {
    const video = videoRef.current
    if (!video) return

    const nextMuted = !video.muted
    video.muted = nextMuted
    setIsMuted(nextMuted)
  }, [])

  const toggleLoop = React.useCallback(() => {
    const video = videoRef.current
    if (!video) return

    const nextLoop = !video.loop
    video.loop = nextLoop
    setIsLooping(nextLoop)
  }, [])

  const onMouseDown = React.useCallback(
    (event: React.MouseEvent) => {
      if (!geometry.isPannable) return

      dragStartRef.current = {
        mouseX: event.clientX,
        mouseY: event.clientY,
        pan
      }
      setIsDragging(true)
    },
    [geometry.isPannable, pan]
  )

  const onMouseMove = React.useCallback(
    (event: React.MouseEvent) => {
      revealControls()

      if (!isDragging || !dragStartRef.current) {
        return
      }

      const deltaX = event.clientX - dragStartRef.current.mouseX
      const deltaY = event.clientY - dragStartRef.current.mouseY
      const nextPan = {
        x: dragStartRef.current.pan.x + deltaX,
        y: dragStartRef.current.pan.y + deltaY
      }

      setPan(clampPan(nextPan, geometry.overflowX, geometry.overflowY))
    },
    [geometry.overflowX, geometry.overflowY, isDragging, revealControls]
  )

  const endDrag = React.useCallback(() => {
    dragStartRef.current = null
    setIsDragging(false)
  }, [])

  const cursor = geometry.isPannable ? (isDragging ? 'grabbing' : 'grab') : 'default'

  const controlsClass = cn(
    'absolute bottom-0 left-0 right-0 z-20 bg-black/58 px-3 py-2.5 backdrop-blur-sm transition-opacity duration-200',
    controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
  )

  if (!media || !sourceUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-md bg-black/70 text-sm text-muted-foreground">
        No selection
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-md bg-black"
      onMouseMove={revealControls}
      onMouseEnter={revealControls}
      onMouseLeave={() => {
        endDrag()
        if (!controlsPinned) {
          setControlsVisible(false)
        }
      }}
    >
      <div
        className="absolute inset-0"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        style={{ cursor }}
      >
        <video
          ref={videoRef}
          src={sourceUrl}
          className="absolute"
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={handleLoadedMetadata}
          onPlay={handlePlay}
          onPause={handlePause}
          onVolumeChange={handleVolumeChange}
          style={{
            left: `${geometry.left}px`,
            top: `${geometry.top}px`,
            width: `${geometry.displayWidth}px`,
            height: `${geometry.displayHeight}px`
          }}
        />
      </div>

      <div className={controlsClass}>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void togglePlayback()}
            className="rounded-sm p-1 text-white/90 transition hover:bg-white/15"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
          </button>

          <div className="min-w-24 text-xs tabular-nums text-white/85">
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </div>

          <Slider
            value={[Math.min(currentTime, duration || 0)]}
            max={Math.max(duration, 0.001)}
            step={0.01}
            onValueChange={handleSeekChange}
            onValueCommit={handleSeekCommit}
            className="mx-1 flex-1"
            aria-label="Seek"
          />

          <button
            type="button"
            onClick={toggleMute}
            className="rounded-sm p-1 text-white/90 transition hover:bg-white/15"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>

          <Slider
            value={[Math.round((isMuted ? 0 : volume) * 100)]}
            max={100}
            step={1}
            onValueChange={handleVolumeSlider}
            className="w-20"
            aria-label="Volume"
          />

          <button
            type="button"
            onClick={toggleLoop}
            className={cn(
              'rounded-sm p-1 text-white/90 transition hover:bg-white/15',
              isLooping && 'bg-white/18'
            )}
            aria-label="Loop"
          >
            <Repeat className="size-4" />
          </button>

          <button
            type="button"
            onClick={() => setControlsPinned((current) => !current)}
            className={cn(
              'rounded-sm p-1 text-white/90 transition hover:bg-white/15',
              controlsPinned && 'bg-white/18'
            )}
            aria-label={controlsPinned ? 'Unpin controls' : 'Pin controls'}
          >
            <Pin className="size-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

import * as React from 'react'
import { useModelStore } from '@/stores/model-store'
import type { DownloadProgressEvent } from '@/types'

export function useModelDownload(): void {
  const setDownloadProgress = useModelStore((s) => s.setDownloadProgress)

  React.useEffect(() => {
    const unsubscribe = window.api.on('model:download-progress', (payload: unknown) => {
      setDownloadProgress(payload as DownloadProgressEvent)
    })

    return unsubscribe
  }, [setDownloadProgress])
}

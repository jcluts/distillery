import * as React from 'react'
import { useModelStore } from '@/stores/model-store'
import type { DownloadProgressEvent } from '@/types'

export function useModelDownload(): void {
  const setDownloadProgress = useModelStore((s) => s.setDownloadProgress)
  const reconcileDownloadStatuses = useModelStore((s) => s.reconcileDownloadStatuses)

  // Listen for real-time progress events from the main process
  React.useEffect(() => {
    const unsubscribe = window.api.on('model:download-progress', (payload: unknown) => {
      setDownloadProgress(payload as DownloadProgressEvent)
    })

    return unsubscribe
  }, [setDownloadProgress])

  // Reconcile download statuses when the window regains visibility.
  // Chromium throttles background renderers, so IPC events (especially the
  // final 'completed' event) can be delayed or effectively lost while the
  // window is unfocused. Re-fetching from the main process on visibility
  // change guarantees the UI reflects the true state.
  React.useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        void reconcileDownloadStatuses()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [reconcileDownloadStatuses])
}

import { useEffect } from 'react'
import { useEngineStore } from './stores/engine-store'
import type { EngineStatus } from './types'

function App(): React.JSX.Element {
  const setEngineStatus = useEngineStore((s) => s.setStatus)

  // Subscribe to engine status events
  useEffect(() => {
    const unsubscribe = window.api.on('engine:status', (status: unknown) => {
      setEngineStatus(status as EngineStatus)
    })
    return unsubscribe
  }, [setEngineStatus])

  // Hydrate initial state
  useEffect(() => {
    window.api.getEngineStatus().then(setEngineStatus)
  }, [setEngineStatus])

  return (
    <div></div>
  )
}

export default App

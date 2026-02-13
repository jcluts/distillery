import * as React from 'react'
import { useModelStore } from '@/stores/model-store'

export function useModelCatalog(): void {
  const hydrate = useModelStore((s) => s.hydrate)

  React.useEffect(() => {
    void hydrate()
  }, [hydrate])
}

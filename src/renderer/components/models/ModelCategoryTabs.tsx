import * as React from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface ModelCategoryTabsProps {
  value: 'all' | 'image-generation'
  onValueChange: (value: 'all' | 'image-generation') => void
}

export function ModelCategoryTabs({
  value,
  onValueChange
}: ModelCategoryTabsProps): React.JSX.Element {
  return (
    <Tabs value={value} onValueChange={(next) => onValueChange(next as 'all' | 'image-generation')}>
      <TabsList>
        <TabsTrigger value="all">All Models</TabsTrigger>
        <TabsTrigger value="image-generation">Image Generation</TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

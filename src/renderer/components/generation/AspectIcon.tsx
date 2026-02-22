/**
 * Compact visual indicator for an aspect ratio.
 * Renders a small bordered rectangle proportional to the given ratio label.
 */
export function AspectIcon({ ratio }: { ratio: string }): React.JSX.Element {
  const dimensions: Record<string, { w: number; h: number }> = {
    '1:1': { w: 10, h: 10 },
    '16:9': { w: 12, h: 7 },
    '9:16': { w: 7, h: 12 },
    '4:3': { w: 12, h: 9 },
    '3:4': { w: 9, h: 12 },
    '3:2': { w: 12, h: 8 },
    '2:3': { w: 8, h: 12 },
    '4:5': { w: 10, h: 12 },
    '5:4': { w: 12, h: 10 }
  }
  const { w, h } = dimensions[ratio] ?? { w: 10, h: 10 }
  return <div className="border border-current rounded-[1px]" style={{ width: w, height: h }} />
}

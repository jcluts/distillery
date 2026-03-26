# Loupe View & Filmstrip — Implementation Spec

## 1. Overview

The loupe view is the single-image inspection mode, toggled via `E`/`Enter` from the grid or double-clicking a thumbnail. It displays the focused image at high quality in a canvas element, with pan and zoom support. Below the main viewer sits a horizontal filmstrip — a virtualized, scrollable strip of thumbnails that mirrors the library's current item list and selection state.

**Reference implementation:** `distillery-react/src/renderer/components/library/LoupeView.tsx`, `LoupeFilmstrip.tsx`, `canvas/CanvasViewer.tsx`.

---

## 2. Goals

1. **Grid ↔ Loupe sync** — Shared `focusedId` in `useLibraryStore` is the single source of truth. Entering loupe from grid centers/shows the focused item in the filmstrip. Returning to grid scrolls to the focused item's row.
2. **Performance at scale** — The filmstrip virtualizes its items via `@tanstack/vue-virtual` (horizontal mode), identical to how `GridView.vue` virtualizes rows. Thousands of items must be handled without DOM bloat.
3. **Canvas-based rendering** — Images render into an HTML `<canvas>` element with DPR-aware sizing, enabling future WebGL/WebGPU acceleration without changing the component interface.
4. **Smooth zoom & pan** — Two zoom levels (`fit` and `actual`). In `actual` mode the image can be panned via mouse drag. Zoom resets when changing images.

---

## 3. New Files

```
src/renderer/
├── components/library/
│   ├── LoupeView.vue              # Loupe view container (canvas + filmstrip)
│   ├── LoupeFilmstrip.vue         # Virtualized horizontal thumbnail strip
│   └── canvas/
│       └── CanvasViewer.vue        # DPR-aware canvas image renderer with zoom/pan
├── composables/
│   └── useFilmstripSelection.ts   # Click/drag handlers for filmstrip items (reuses existing selection logic)
└── lib/
    └── canvas-draw.ts             # Pure draw function (no Vue dependencies)
```

---

## 4. Store Changes

### 4.1 `useUIStore` additions

| Field / Method | Type | Purpose |
|---|---|---|
| `loupeZoom` | `Ref<'fit' \| 'actual'>` | Current zoom level in loupe view |
| `setLoupeZoom(level)` | `('fit' \| 'actual') → void` | Set zoom explicitly |
| `cycleZoom()` | `() → void` | Toggle between `fit` and `actual` |
| `setViewMode(mode)` | *(existing, modify)* | Reset `loupeZoom` to `'fit'` on mode change |

**Type:** Define `ZoomLevel = 'fit' | 'actual'` at the top of the store file.

### 4.2 No library store changes

`focusedId`, `selectedIds`, `items`, `selectSingle`, `focusRelative` already exist and are sufficient. Both grid view and loupe view read from the same store — no duplication.

---

## 5. Component Specifications

### 5.1 `LoupeView.vue`

**Template structure:**
```
<div class="flex h-full flex-col overflow-hidden">
  <!-- Main viewer area -->
  <div class="min-h-0 flex-1 overflow-hidden px-4 pt-4 pb-2">
    <CanvasViewer :media="currentItem" :zoom="loupeZoom" />
  </div>

  <!-- Filmstrip -->
  <LoupeFilmstrip
    :items="items"
    :current-index="currentIndex"
    @select="onSelect"
  />
</div>
```

**Behavior:**
- Derives `currentIndex` and `currentItem` from `libraryStore.items` and `libraryStore.focusedId`.
- If `focusedId` is null and items exist, auto-selects the first item (same as React).
- Passes `uiStore.loupeZoom` to the canvas viewer.
- The `@select` handler calls `libraryStore.selectSingle(id)`.

**Props:** None — reads directly from stores.

---

### 5.2 `LoupeFilmstrip.vue`

**Layout:** Fixed-height (120px) horizontal strip with prev/next `UButton` icons flanking a virtualized scroll container.

**Constants (define in `lib/constants.ts`):**
```ts
export const FILMSTRIP_ITEM_SIZE = 86    // px, square thumbnails
export const FILMSTRIP_GAP = 8           // px between items
export const FILMSTRIP_OVERSCAN = 5      // virtual items beyond viewport
export const FILMSTRIP_HEIGHT = 120      // px total filmstrip height
```

**Props:**
```ts
interface Props {
  items: MediaRecord[]
  currentIndex: number
}
```

**Emits:**
```ts
defineEmits<{
  select: [id: string]
}>()
```

**Virtualization:**
- Use `useVirtualizer` from `@tanstack/vue-virtual` in horizontal mode.
- `estimateSize: () => FILMSTRIP_ITEM_SIZE + FILMSTRIP_GAP`
- `overscan: FILMSTRIP_OVERSCAN`
- Outer `<div ref="scrollRef">` with `overflow-x: auto; overflow-y: hidden`.
- Inner `<div>` sized to `virtualizer.getTotalSize()` width.
- Each virtual item is absolutely positioned at `left: virtualItem.start`.

**Scroll behavior:**
- On initial mount, scroll to `currentIndex` with `align: 'center'`.
- On subsequent `currentIndex` changes, scroll with `align: 'auto'` (keeps visible, minimal movement).
- Use a `isInitialScroll` ref flag to distinguish the two cases, exactly like the React implementation.
- Call `virtualizer.measure()` when `items.length` changes to invalidate cached measurements.

**Thumbnail rendering:**
- Reuse `MediaThumbnail.vue` for each filmstrip item, passing a fixed `class="size-[86px]"` and appropriate size prop.
- Apply selection ring styling: `ring-2 ring-primary` for focused, `ring-2` for selected (non-focused).

**Navigation buttons:**
- Left: `UButton` with `i-lucide-chevron-left` icon, `variant="ghost"`, `size="md"`, disabled when `currentIndex <= 0`.
- Right: `UButton` with `i-lucide-chevron-right` icon, same styling, disabled when at last item.
- Clicking emits `select` with the adjacent item's id.

---

### 5.3 `CanvasViewer.vue`

The canvas viewer renders a single image into an HTML `<canvas>` element with proper DPR scaling, fit/actual zoom, and mouse-drag panning.

**Props:**
```ts
interface Props {
  media: MediaRecord | null
  zoom?: ZoomLevel  // default: 'fit'
}
```

**Template:**
```html
<div
  ref="containerRef"
  class="h-full w-full"
  :style="{ cursor }"
  @mousedown="onMouseDown"
  @mousemove="onMouseMove"
  @mouseup="onMouseUp"
  @mouseleave="onMouseUp"
>
  <canvas ref="canvasRef" class="block h-full w-full" />
</div>
```

**Image loading:**
- Derive `imageUrl` from `props.media.working_file_path ?? props.media.file_path`.
- Load via `new Image()` + `img.decode()` in a watchEffect. Track a `cancelled` flag to prevent stale loads from drawing.
- Store the loaded `HTMLImageElement` in a local ref (`imageRef`).

**DPR-aware sizing (ResizeObserver):**
- Attach a `ResizeObserver` to `containerRef`.
- On resize: set `canvas.width = rect.width * dpr`, `canvas.height = rect.height * dpr`, then `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`. Set `canvas.style.width/height` to CSS dimensions.
- Trigger redraw after resize.

**Draw function (`canvas-draw.ts`):**

Extract the pure draw logic into a standalone function with no Vue dependencies:

```ts
interface DrawOptions {
  ctx: CanvasRenderingContext2D
  width: number           // CSS pixel width of canvas
  height: number          // CSS pixel height of canvas
  img: HTMLImageElement | null
  media: { file_name: string } | null
  zoom: 'fit' | 'actual'
  panOffset: { x: number; y: number }
}

interface DrawResult {
  imageRect: { x: number; y: number; w: number; h: number } | null
  pannable: boolean       // true when image overflows viewport
}

export function draw(options: DrawOptions): DrawResult
```

**Drawing logic (matching React reference):**
1. Clear canvas, fill transparent.
2. If no image: draw placeholder text ("No selection" or file name), return.
3. Compute scale: `fit` → `Math.min(canvasW / imgW, canvasH / imgH)`, `actual` → `1.0`.
4. Compute drawn dimensions: `dw = imgW * scale`, `dh = imgH * scale`.
5. Compute overflow: `overflowX = max(0, dw - canvasW)`, same for Y.
6. Clamp pan offset to `±overflow/2` on each axis (0 if no overflow).
7. Center image: `dx = (canvasW - dw) / 2 + clampedPanX`, same for Y.
8. Draw image with high-quality smoothing.
9. Return `{ imageRect: { x: dx, y: dy, w: dw, h: dh }, pannable: dw > canvasW || dh > canvasH }`.

**Note on transforms:** The React reference supports rotation, flip, and crop overlays. For the initial implementation, skip transform support — add it later when the transform/crop feature is built. The draw function signature should remain extensible (add an optional `transforms` parameter later).

**Pan behavior:**
- Track `panOffset`, `isDragging`, `dragStart`, `dragStartOffset` as non-reactive refs (template refs / plain objects — not Pinia state).
- `mousedown`: if pannable, record drag start position and current offset, set dragging = true.
- `mousemove`: if dragging, compute delta from start, update `panOffset`, call `redraw()`.
- `mouseup`/`mouseleave`: end drag.
- Reset `panOffset` to `{x:0, y:0}` whenever `zoom`, `imageUrl`, or `media.id` changes.

**Cursor:**
- Pannable + not dragging → `grab`
- Pannable + dragging → `grabbing`
- Not pannable → `default`

---

## 6. Integration: MainContent.vue

Update `MainContent.vue` to conditionally render grid vs. loupe:

```vue
<script setup lang="ts">
import { useUIStore } from '@/stores/ui'
import GridView from '@/components/library/GridView.vue'
import LoupeView from '@/components/library/LoupeView.vue'
import LibraryStatusBar from '@/components/library/LibraryStatusBar.vue'

const uiStore = useUIStore()
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-default">
    <div class="min-h-0 flex-1">
      <GridView v-if="uiStore.viewMode === 'grid'" />
      <LoupeView v-else />
    </div>
    <LibraryStatusBar />
  </section>
</template>
```

Use `v-if` (not `v-show`) to ensure the inactive view is fully unmounted, freeing DOM/canvas resources.

---

## 7. Grid ↔ Loupe Synchronization

The synchronization relies entirely on `focusedId` in `useLibraryStore`:

| Transition | Behavior |
|---|---|
| **Grid → Loupe** (double-click or `E`/`Enter`) | `selectSingle(id)` sets `focusedId`, then `setViewMode('loupe')`. LoupeView mounts, derives `currentIndex` from `focusedId`. Filmstrip's initial scroll centers that index. |
| **Loupe filmstrip click** | Emits `select` → `selectSingle(id)` → updates `focusedId`. CanvasViewer reactively loads the new image. Filmstrip scrolls to keep the item visible. |
| **Loupe → Grid** (`Escape` or `G`) | `setViewMode('grid')`. GridView mounts, its existing `initialScrollRestored` logic finds `focusedId` and scrolls to that row with `align: 'center'`. |
| **Arrow keys in loupe** | `focusRelative(±1)` updates `focusedId`. Both canvas and filmstrip react. |

No additional wiring is needed — the existing store actions handle everything.

---

## 8. Keyboard Shortcuts

### Existing (already implemented in `useKeyboardShortcuts.ts`)

| Key | Action | Loupe-specific? |
|---|---|---|
| `E` / `Enter` | Switch to loupe | No (works from grid) |
| `Escape` | Exit loupe → grid | Yes |
| `G` | Switch to grid | No |
| `Arrow Left/Right` | Navigate prev/next | Works in both views |

### New (add to `useKeyboardShortcuts.ts`)

| Key | Action | Condition |
|---|---|---|
| `Space` | Cycle zoom (`fit` → `actual` → `fit`) | Only in loupe view |

**Implementation:** In the `onKeyDown` handler, after the existing checks:
```ts
if (event.key === ' ' && uiStore.viewMode === 'loupe') {
  event.preventDefault()
  uiStore.cycleZoom()
  return
}
```

---

## 9. Performance Considerations

| Concern | Solution |
|---|---|
| **Filmstrip with 1000+ items** | `@tanstack/vue-virtual` horizontal mode; only ~15-20 thumbnails rendered at once. Same library already used by GridView. |
| **Filmstrip measurement invalidation** | `watch(items.length, () => virtualizer.measure())` — same pattern as GridView. |
| **Canvas redraw frequency** | Redraw only on: image load, container resize, zoom change, pan drag. No animation loops. |
| **Image decode cost** | Use `img.decode()` (off-main-thread decode) before drawing. Stale loads cancelled via flag. |
| **DPR changes** | ResizeObserver fires on DPR change (e.g., moving window between monitors); canvas re-sizes and redraws. |
| **Memory** | Only one full-resolution image in memory at a time (`imageRef`). Previous image is GC'd when the ref is overwritten. Filmstrip thumbnails use the same small `thumb_path` JPEG as the grid. |
| **DOM node count** | `v-if` on grid/loupe ensures only one view is mounted. Filmstrip virtual items stay ~20-25 DOM nodes regardless of list size. |

---

## 10. Nuxt UI Components Used

| Component | Usage |
|---|---|
| `UButton` | Filmstrip prev/next navigation buttons (`variant="ghost"`, `size="md"`) |
| `UIcon` | Rating stars, status badges inside filmstrip thumbnails (via existing `MediaThumbnail.vue`) |
| `UTooltip` | *(Optional)* Tooltip on filmstrip items showing file name on hover |

The canvas viewer and the filmstrip layout are custom — no Nuxt UI component maps to these use cases. Tailwind handles all layout and spacing.

---

## 11. Future Extensibility (Not In Scope)

These are **not** part of this implementation but the architecture should not preclude them:

- **Image transforms** (rotation, flip, crop, mask overlays) — CanvasViewer's draw function can accept an optional `transforms` parameter later. The React reference already implements this.
- **Video playback** — LoupeView can conditionally render a `VideoPlayer` component instead of CanvasViewer when `media.media_type === 'video'`.
- **WebGL/WebGPU rendering** — The canvas element is the hook point. The draw function can be swapped for a GPU-accelerated pipeline without changing the component template.
- **Zoom wheel / pinch-to-zoom** — Additional zoom levels or continuous zoom can extend the `ZoomLevel` type.

---

## 12. Implementation Order

1. **`canvas-draw.ts`** — Pure draw function, testable in isolation.
2. **`CanvasViewer.vue`** — Wire up canvas, ResizeObserver, image loading, pan/zoom.
3. **UI store additions** — `loupeZoom`, `setLoupeZoom`, `cycleZoom`, reset on mode change.
4. **`LoupeFilmstrip.vue`** — Virtualized horizontal strip with navigation.
5. **`LoupeView.vue`** — Compose CanvasViewer + Filmstrip.
6. **`MainContent.vue`** — Conditional rendering of grid vs. loupe.
7. **Keyboard shortcut** — Add `Space` → `cycleZoom()` in loupe mode.
8. **Verify grid ↔ loupe sync** — Test round-trip: grid → loupe → navigate → grid, confirm scroll position.

---

## 13. Constants Summary

Add to `src/renderer/lib/constants.ts`:

```ts
// Filmstrip
export const FILMSTRIP_ITEM_SIZE = 86
export const FILMSTRIP_GAP = 8
export const FILMSTRIP_OVERSCAN = 5
export const FILMSTRIP_HEIGHT = 120
```

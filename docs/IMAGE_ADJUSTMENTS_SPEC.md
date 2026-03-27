# Distillery — Image Adjustments Spec

## 1. Overview

Non-destructive image adjustments: brightness, contrast, exposure, highlights, shadows, saturation, vibrance, temperature, tint, hue, clarity. Adjustments are stored in the database and previewed in real-time via WebGL.

This feature ports the proven adjustment pipeline from the V1 prototype onto the Vue/Nuxt UI foundation. The V1 implementation validated the shader math and adjustment processing order; this spec defines a cleaner architecture that eliminates V1's dead code, class-based singletons, and tangled concerns.

### Scope

**In scope:**
- Global image adjustments (11 sliders in 3 groups)
- WebGL-accelerated live preview in the Loupe canvas
- Persistence via SQLite (JSON column on `media` table)
- Copy/paste adjustments between images

**Out of scope (future iteration):**
- Local adjustment brush (masked local adjustments). The architecture anticipates this — the shader already supports mask uniforms, and the `ImageAdjustments` type is reusable for local operations — but no UI, mask rendering, or brush pipeline is included.
- Grayscale toggle (trivial to add later)

---

## 2. Architecture Overview

```
┌─────────────────────────────── Renderer ──────────────────────────────┐
│                                                                       │
│  AdjustmentsPane.vue                                                  │
│    ├── Grouped USlider controls (Light / Color / Effects)             │
│    ├── Reset / Copy / Paste actions                                   │
│    └── Writes to adjustmentStore                                      │
│                                                                       │
│  adjustmentStore (Pinia)                                              │
│    ├── Per-media adjustments cache: Record<mediaId, ImageAdjustments> │
│    ├── Debounced IPC save (300ms)                                     │
│    └── Reactive getters for current focused media                     │
│                                                                       │
│  CanvasViewer.vue / canvas-draw.ts                                    │
│    ├── WebGLProcessor renders adjusted image to offscreen canvas      │
│    └── 2D canvas composites: pan, zoom, crop overlay positioning      │
│                                                                       │
└─────────────────────┬─────────────────────────────────────────────────┘
                      │ IPC (adjustments:get, adjustments:save)
┌─────────────────────┴─────────────────────────────────────────────────┐
│                                                                       │
│  Main Process                                                         │
│    ├── IPC handlers (adjustments handler module)                      │
│    ├── media repository: getAdjustments / saveAdjustments             │
│    └── adjustments_json column on media table                         │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 3. Types

### `ImageAdjustments`

Add to `src/main/types.ts` and duplicate in `src/renderer/types/index.ts` (same pattern as `ImageTransforms`).

```ts
export interface ImageAdjustments {
  // Light
  exposure: number      // -5 to 5 (EV stops), default 0
  brightness: number    // 0 to 2 (multiplier), default 1
  contrast: number      // 0 to 2 (multiplier), default 1
  highlights: number    // -100 to 100, default 0
  shadows: number       // -100 to 100, default 0

  // Color
  saturation: number    // 0 to 2 (multiplier), default 1
  vibrance: number      // 0 to 100, default 0
  temperature: number   // -100 to 100, default 0
  tint: number          // -100 to 100, default 0
  hue: number           // -180 to 180 (degrees), default 0

  // Effects
  clarity: number       // 0 to 100, default 0
}
```

All fields are required with non-undefined defaults. This avoids the V1 pattern of `field?: number` with scattered `?? defaultValue` fallbacks. The full object is always stored when any value is non-default; when all values are defaults, `adjustments_json` is `NULL`.

### `AdjustmentSliderConfig`

Defines UI metadata for each slider. Lives in a shared constants file.

```ts
export interface AdjustmentSliderConfig {
  key: keyof ImageAdjustments
  label: string
  min: number
  max: number
  step: number
  default: number
  format: (value: number) => string
  group: 'light' | 'color' | 'effects'
}
```

---

## 4. Slider Configuration

Three groups, matching Lightroom conventions:

### Light

| Key | Label | Min | Max | Step | Default | Format |
|---|---|---|---|---|---|---|
| `exposure` | Exposure | -5 | 5 | 0.1 | 0 | `+1.5 EV` |
| `brightness` | Brightness | 0 | 2 | 0.05 | 1 | `120%` |
| `contrast` | Contrast | 0 | 2 | 0.05 | 1 | `120%` |
| `highlights` | Highlights | -100 | 100 | 1 | 0 | `+50` / `-30` |
| `shadows` | Shadows | -100 | 100 | 1 | 0 | `+50` / `-30` |

### Color

| Key | Label | Min | Max | Step | Default | Format |
|---|---|---|---|---|---|---|
| `saturation` | Saturation | 0 | 2 | 0.05 | 1 | `120%` |
| `vibrance` | Vibrance | 0 | 100 | 1 | 0 | `65` |
| `temperature` | Temperature | -100 | 100 | 1 | 0 | `+40 warm` / `-20 cool` |
| `tint` | Tint | -100 | 100 | 1 | 0 | `+30 magenta` / `-10 green` |
| `hue` | Hue Shift | -180 | 180 | 1 | 0 | `45°` |

### Effects

| Key | Label | Min | Max | Step | Default | Format |
|---|---|---|---|---|---|---|
| `clarity` | Clarity | 0 | 100 | 1 | 0 | `40` |

---

## 5. Database

### Migration `017_adjustments.sql`

```sql
ALTER TABLE media ADD COLUMN adjustments_json TEXT;
```

Same pattern as `transforms_json` and `removals_json` — a JSON text column on the `media` table.

### Repository Functions

Add to `src/main/db/repositories/media.ts`:

```ts
export function getAdjustments(db: Database, mediaId: string): ImageAdjustments | null
export function saveAdjustments(db: Database, mediaId: string, adjustments: ImageAdjustments | null): void
```

Implementation follows the exact pattern of `getTransforms` / `saveTransforms`:
- `getAdjustments`: `SELECT adjustments_json FROM media WHERE id = ?` → parse JSON or return `null`
- `saveAdjustments`: `UPDATE media SET adjustments_json = ?, updated_at = ... WHERE id = ?` — pass `null` to clear, JSON string to save

### Storage Convention

- When all adjustment values equal their defaults → store `NULL` (no adjustments)
- When any value differs from default → store the full `ImageAdjustments` object as JSON
- A utility function `isDefaultAdjustments(adj: ImageAdjustments): boolean` determines this

---

## 6. IPC

### Channels

Add to `src/main/ipc/channels.ts`:

```ts
// Adjustments
ADJUSTMENTS_GET: 'adjustments:get',
ADJUSTMENTS_SAVE: 'adjustments:save',
```

### Handler Module

Create `src/main/ipc/handlers/adjustments.ts`:

```ts
// adjustments:get (mediaId: string) → ImageAdjustments | null
// adjustments:save (mediaId: string, adjustments: ImageAdjustments | null) → void
```

Follows the same thin-handler pattern as `transforms.ts` — delegates directly to repository functions.

### DistilleryAPI Extension

Add to the `DistilleryAPI` interface in `src/renderer/types/index.ts`:

```ts
getAdjustments(mediaId: string): Promise<ImageAdjustments | null>
saveAdjustments(mediaId: string, adjustments: ImageAdjustments | null): Promise<void>
```

Add to the preload bridge in `src/preload/index.ts`.

---

## 7. Pinia Store — `useAdjustmentStore`

Create `src/renderer/stores/adjustment.ts`. Setup syntax, following the `useTransformStore` pattern.

### State

```ts
// Per-media cache: mediaId → ImageAdjustments | null
const adjustments = ref<Record<string, ImageAdjustments | null>>({})
const loaded = ref<Record<string, boolean>>({})

// Clipboard for copy/paste
const clipboard = ref<ImageAdjustments | null>(null)

// Debounce save timer
const saveTimer = ref<ReturnType<typeof setTimeout> | null>(null)
```

### Key Actions

```ts
// Load adjustments for a media item (cached, idempotent)
async function load(mediaId: string): Promise<void>

// Get adjustments for a media item (returns null if none)
function getFor(mediaId: string): ImageAdjustments | null

// Set a single slider value — calls save() debounced
function setField(mediaId: string, key: keyof ImageAdjustments, value: number): void

// Reset all adjustments for a media item
async function reset(mediaId: string): Promise<void>

// Copy adjustments from a media item to clipboard
function copy(mediaId: string): void

// Paste clipboard adjustments onto a media item
async function paste(mediaId: string): Promise<void>

// Flush any pending debounced save immediately
async function flush(): Promise<void>
```

### Debounced Save

Slider changes fire frequently during drag. The store debounces persistence:

1. `setField()` updates the in-memory cache immediately (instant UI reactivity)
2. Starts/resets a 300ms debounce timer
3. On timer expiry, calls `window.api.saveAdjustments(mediaId, adjustments)`
4. Navigation away from the media item calls `flush()` to persist immediately

This matches the V1 edit store's debounce pattern but is simpler — no "dirty" flag tracking needed because the in-memory state is always authoritative.

### hasAdjustments Helper

Exposed as a store getter or standalone utility:

```ts
function hasAdjustments(adj: ImageAdjustments | null): boolean {
  if (!adj) return false
  return (
    adj.exposure !== 0 || adj.brightness !== 1 || adj.contrast !== 1 ||
    adj.highlights !== 0 || adj.shadows !== 0 || adj.saturation !== 1 ||
    adj.vibrance !== 0 || adj.temperature !== 0 || adj.tint !== 0 ||
    adj.hue !== 0 || adj.clarity !== 0
  )
}
```

---

## 8. WebGL Pipeline

### Architecture

The renderer currently uses a pure 2D Canvas pipeline (`canvas-draw.ts`). Adjustments require a WebGL shader for real-time preview. The approach: **WebGL renders the adjusted image to an offscreen canvas, then the existing 2D pipeline composites it with transforms (rotation, flip, crop, pan, zoom).**

This keeps the existing transform/crop/overlay pipeline untouched and adds WebGL as the image source when adjustments are active.

```
                           ┌────────────────────────┐
                           │  HTMLImageElement       │
                           │  (original image)       │
                           └───────────┬────────────┘
                                       │
                      ┌────────────────┼────────────────┐
                      │                │                 │
                 has adjustments?   no adjustments       │
                      │                │                 │
                      ▼                │                 │
               ┌──────────────┐        │                 │
               │ WebGLProcessor│        │                 │
               │ (offscreen)  │        │                 │
               └──────┬───────┘        │                 │
                      │                │                 │
                      ▼                ▼                 │
               ┌────────────────────────────────────────────┐
               │        canvas-draw.ts (existing)           │
               │  rotation → flip → crop → pan/zoom → draw  │
               └────────────────────────────────────────────┘
```

### WebGL Module

Create `src/renderer/webgl/` with the following files:

| File | Purpose |
|---|---|
| `index.ts` | Public API barrel export |
| `WebGLProcessor.ts` | Context lifecycle, texture load, render orchestration |
| `ShaderManager.ts` | Compile, cache, and dispose shader programs; set uniforms |
| `AdjustmentsRenderer.ts` | Adjustment shader setup and render call |
| `shaders/vertex.glsl` | Passthrough vertex shader |
| `shaders/adjustments.glsl` | Fragment shader with all 11 adjustments |

### WebGLProcessor API

```ts
class WebGLProcessor {
  constructor()                                     // Creates offscreen canvas
  initialize(): void                                // Creates GL context (throws on failure, sets up webglcontextlost listeners)
  loadImage(source: HTMLImageElement | string): Promise<TextureInfo> // Load image/URL → GPU texture
  render(adjustments?: ImageAdjustments): void      // Render to offscreen canvas
  getCanvas(): HTMLCanvasElement | OffscreenCanvas  // For 2D pipeline to use as source
  getTextureDimensions(): { width, height, originalWidth, originalHeight }
  dispose(): void                                   // Release all GPU resources
}
```

Key design decisions versus V1:
- **No texture cache.** V1 cached 10 textures for grid thumbnail rendering. The Vue app only needs WebGL for the single loupe image, so one texture at a time is sufficient. If future grid WebGL rendering is needed, add caching then.
- **No LocalAdjustmentsRenderer.** The adjustment brush is out of scope. The same fragment shader *already* has mask uniforms (`u_maskEnabled`, `u_maskTexture`, `u_maskOpacity`) — a future brush feature can reuse the same shader without a separate renderer class.
- **No WebGLImage component.** V1 had a `WebGLImage` React component that wrapped a `<canvas>`. In the Vue app, `CanvasViewer.vue` already owns the canvas. WebGL renders to an *offscreen* canvas that `canvas-draw.ts` uses as the image source.
- **Context Loss Recovery.** Like V1, `WebGLProcessor` must handle `webglcontextlost` and `webglcontextrestored` events on its backing canvas to re-initialize and avoid permanent rendering failure if the GPU process resets.
- **Image Upload:** To prevent re-downloading/re-decoding the image, `loadImage` should accept an `HTMLImageElement` directly. `CanvasViewer.vue` already has the loaded `img` reference.

### Fragment Shader

Port the V1 `adjustments.glsl` shader (220 lines). The processing chain is validated:

1. **Exposure** — multiplicative (`rgb *= pow(2.0, exposure)`)
2. **Temperature / Tint** — multiplicative channel gains
3. **Brightness** — simple multiply (`rgb *= brightness`)
4. **Saturation / Vibrance / Hue** — HSL space conversion
5. **Highlights / Shadows** — luminance-masked lift/pull
6. **Clarity** — midtone contrast enhancement
7. **Contrast** — linear (`(rgb - 0.5) * contrast + 0.5`)

The shader includes mask uniforms (`u_maskEnabled`, `u_maskTexture`, `u_maskOpacity`) that are set to disabled for global adjustments. A future adjustment brush can enable them without shader changes.

### Integration with canvas-draw.ts

Modify `DrawOptions` to accept an optional adjusted image source:

```ts
export interface DrawOptions {
  // ... existing fields ...
  adjustedSource?: HTMLCanvasElement | OffscreenCanvas | null  // WebGL output canvas
}
```

When `adjustedSource` is provided, `draw()` uses it instead of `img` as the source for the offscreen transform canvas. All rotation/flip/crop/pan/zoom logic remains unchanged.

In `CanvasViewer.vue`:
1. Watch the adjustment store for the current media's adjustments.
2. Maintain a single, reusable `WebGLProcessor` instance inside the component. Do not instantiate a new processor for every image change to avoid leaking WebGL contexts.
3. When adjustments are non-null, initialize the processor (if needed), load the image texture, and render.
4. Pass the WebGL output canvas as `adjustedSource` to `draw()`.
5. When adjustments are null/default, pass `null` (existing behavior, no WebGL overhead).
6. **Cleanup:** On component unmount, invoke `processor.dispose()` to correctly release WebGL buffers, textures, and framebuffers.

**CRITICAL PERFORMANCE OPTIMIZATION:** 
Currently, `canvas-draw.ts` creates a `transformedCanvas` via `document.createElement('canvas')` on *every single call* to `draw()`. Since `draw()` fires continuously during panning, this causes severe garbage collection thrashing and performance degradation, which will only get worse once an `adjustedSource` is introduced. 
While integrating this feature, update `canvas-draw.ts` to:
1. Skip the offscreen `transformedCanvas` entirely when `rotation === 0` and `flip_h/flip_v` are both false.
2. Accept an optional pre-allocated `transformCanvas` via `DrawOptions`, allowing `CanvasViewer.vue` to own and reuse the intermediate canvas, or cache it intelligently.

---

## 9. UI — AdjustmentsPane

### Location

New right sidebar tab. Add `'adjustments'` to the right panel tab options in `useUIStore` (alongside `info`, `collections`, `transform`, `removal`).

### Icon

`i-lucide-sliders-horizontal` — matches the Lightroom convention for adjustment panels.

### Component Structure

```
AdjustmentsPane.vue
├── PaneLayout (title="Adjustments")
│   ├── PaneSection (title="Light")
│   │   ├── AdjustmentSlider (Exposure)
│   │   ├── AdjustmentSlider (Brightness)
│   │   ├── AdjustmentSlider (Contrast)
│   │   ├── AdjustmentSlider (Highlights)
│   │   └── AdjustmentSlider (Shadows)
│   ├── PaneSection (title="Color")
│   │   ├── AdjustmentSlider (Saturation)
│   │   ├── AdjustmentSlider (Vibrance)
│   │   ├── AdjustmentSlider (Temperature)
│   │   ├── AdjustmentSlider (Tint)
│   │   └── AdjustmentSlider (Hue Shift)
│   ├── PaneSection (title="Effects")
│   │   └── AdjustmentSlider (Clarity)
│   └── PaneSection (title="Actions")
│       ├── UButton (Reset All)
│       ├── UButton (Copy)
│       └── UButton (Paste) — disabled when clipboard empty
```

### AdjustmentSlider Component

A reusable sub-component wrapping `USlider` with label and value display:

```vue
<!-- AdjustmentSlider.vue -->
<script setup lang="ts">
import type { AdjustmentSliderConfig } from '@/lib/adjustment-constants'

const props = defineProps<{
  config: AdjustmentSliderConfig
  modelValue: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: number]
  'reset': []
}>()

const isModified = computed(() => props.modelValue !== props.config.default)
</script>

<template>
  <div class="flex flex-col gap-1">
    <div class="flex items-center justify-between">
      <span class="text-xs text-muted">{{ config.label }}</span>
      <span
        class="text-xs tabular-nums"
        :class="isModified ? 'text-primary cursor-pointer' : 'text-muted'"
        @click="isModified && emit('reset')"
      >
        {{ config.format(modelValue) }}
      </span>
    </div>
    <USlider
      :model-value="modelValue"
      :min="config.min"
      :max="config.max"
      :step="config.step"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>
```

**Key UI behaviors:**
- Clicking the formatted value resets that slider to its default
- The value text highlights (primary color) when modified from default
- All sliders are disabled when no image is focused in loupe view, or when a video is selected

### Pane State

The pane reads from `useAdjustmentStore` using the currently focused media ID from `useLibraryStore`. When the focused media changes:

1. `adjustmentStore.load(mediaId)` loads persisted adjustments (cached after first load)
2. Slider values bind to the cached adjustments
3. Slider changes call `adjustmentStore.setField(mediaId, key, value)`

### Unavailable States

Use a placeholder (consistent with TransformPane and RemovalPane patterns) when:
- No image selected: "Select an image to adjust"
- Multiple images selected: "Select a single image to adjust"
- Video selected: "Adjustments are available for images only"
- No loupe view active: show sliders but they work on the focused/selected single image (adjustments don't require loupe mode unlike V1, since our WebGL renders the preview inline)

---

## 10. Integration Checklist

### New Files

| File | Purpose |
|---|---|
| `src/main/db/migrations/017_adjustments.sql` | Add `adjustments_json` column |
| `src/main/ipc/handlers/adjustments.ts` | IPC handler for get/save |
| `src/renderer/stores/adjustment.ts` | Pinia adjustment store |
| `src/renderer/lib/adjustment-constants.ts` | Slider configs, defaults, `hasAdjustments()`, `isDefaultAdjustments()` |
| `src/renderer/webgl/index.ts` | Barrel export |
| `src/renderer/webgl/WebGLProcessor.ts` | WebGL context + render orchestration |
| `src/renderer/webgl/ShaderManager.ts` | Shader compilation + uniform management |
| `src/renderer/webgl/AdjustmentsRenderer.ts` | Adjustment render pass |
| `src/renderer/webgl/shaders/vertex.glsl` | Vertex shader |
| `src/renderer/webgl/shaders/adjustments.glsl` | Fragment shader |
| `src/renderer/components/panes/AdjustmentsPane.vue` | Adjustment UI panel |
| `src/renderer/components/panes/adjustments/AdjustmentSlider.vue` | Slider sub-component |

### Modified Files

| File | Change |
|---|---|
| `src/main/types.ts` | Add `ImageAdjustments` type |
| `src/renderer/types/index.ts` | Add `ImageAdjustments` type + extend `DistilleryAPI` |
| `src/main/ipc/channels.ts` | Add `ADJUSTMENTS_GET` / `ADJUSTMENTS_SAVE` constants |
| `src/main/db/repositories/media.ts` | Add `getAdjustments()` / `saveAdjustments()` |
| `src/main/index.ts` | Register adjustments IPC handlers |
| `src/preload/index.ts` | Expose `getAdjustments` / `saveAdjustments` on `window.api` |
| `src/renderer/stores/ui.ts` | Add `'adjustments'` to right panel tab type |
| `src/renderer/components/layout/RightSidebar.vue` | Add adjustments tab icon + pane mapping |
| `src/renderer/lib/canvas-draw.ts` | Accept `adjustedSource` in `DrawOptions`, use as image source |
| `src/renderer/components/library/canvas/CanvasViewer.vue` | Create/manage `WebGLProcessor`, pass adjusted canvas to `draw()` |

### Vite Config

Add GLSL raw import support. The existing `electron.vite.config.ts` should handle `?raw` imports natively (Vite built-in), but verify `.glsl` files are not excluded by any config.

---

## 11. Implementation Order

Work in this sequence to enable incremental testing:

1. **Types + DB migration** — `ImageAdjustments` type, migration file, repository functions
2. **IPC + preload** — Channel constants, handler module, preload bridge
3. **Pinia store** — `useAdjustmentStore` with load/save/setField/reset/copy/paste
4. **UI pane** — `AdjustmentsPane.vue` + `AdjustmentSlider.vue`, wired to store. Sliders work and persist but no visual preview yet.
5. **WebGL module** — `ShaderManager`, `AdjustmentsRenderer`, `WebGLProcessor`, shaders
6. **Canvas integration** — Modify `canvas-draw.ts` and `CanvasViewer.vue` to use WebGL output as image source
7. **Right sidebar wiring** — Add tab, icon, pane routing in `RightSidebar.vue` and `useUIStore`

Steps 1–4 can be tested with just slider persistence (values save/load correctly). Steps 5–6 add live preview.

---

## 12. V1 Improvements

Specific architectural improvements over the V1 implementation:

| Area | V1 Problem | V2 Solution |
|---|---|---|
| Type safety | `ImageAdjustments` fields were all optional (`field?: number`), requiring `?? default` everywhere | All fields required with concrete defaults. Store `null` when no adjustments, full object otherwise. |
| Store complexity | `useEditStore` was a monolith handling crop, rotation, flip, AND adjustments in one Zustand store with 30+ actions | Separate `useAdjustmentStore` — single responsibility. Transforms, removal, and adjustments each have their own store. |
| Persistence | V1 used a separate `edits` table with a complex `ImageEdits` wrapper containing rotation, flip, crop, AND adjustments | Adjustments are a standalone `adjustments_json` column — orthogonal to `transforms_json`. No coupling between geometric and tonal edits. |
| WebGL architecture | `WebGLProcessor` had a 10-texture LRU cache, `LocalAdjustmentsRenderer` (separate class using the same shader), and ping-pong framebuffers for brush compositing | Single texture, no cache (loupe shows one image at a time). No separate `LocalAdjustmentsRenderer` — the shader has mask uniforms ready, but no second class needed until the brush feature ships. |
| Component coupling | `WebGLImage` was a React component that *replaced* `<img>`. The app had to choose CSS filter or WebGL per-element. | WebGL renders to an offscreen canvas that feeds into the existing 2D pipeline. The `CanvasViewer` doesn't change its rendering approach — it just gets a pre-adjusted source image. |
| Dead code | V1 had `adjustment-brush` types, DB layer, and service wired up as IPC handlers even when no brush UI existed. The brush mask rasterization used SVG-to-PNG rendering in the service layer. | No brush code ships until the brush UI is built. The shader's mask uniforms are the only forward-looking detail, and they cost nothing. |
| Class singletons | V1 used `AdjustmentBrushService.getInstance()` singleton pattern with mutable shared state. | Plain functions in repository modules. No singletons, no shared mutable state in the main process. |

---

## 13. Future: Adjustment Brush

When the time comes to add local (masked) adjustments:

1. **New type:** `AdjustmentBrushOperation { id, adjustments: ImageAdjustments, mask: AdjustmentStroke[], opacity, timestamp }`
2. **New DB column:** `adjustment_brush_json` on `media` table
3. **New store:** `useAdjustmentBrushStore`
4. **Brush UI:** Similar to existing `RemovalPane.vue` — paint/erase toggle, brush size, feather, operations list
5. **WebGL integration:** For each brush operation, rasterize strokes to a mask texture, enable `u_maskEnabled = 1`, render per-operation adjustments, composite via ping-pong framebuffers

The current architecture supports all of this without changes to the shader, the `AdjustmentsRenderer`, or the `WebGLProcessor`'s core API — just additions.

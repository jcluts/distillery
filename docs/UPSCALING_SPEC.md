# Upscaling Spec

## 1. Overview

Non-destructive image upscaling powered by cn-engine's built-in ESRGAN upscaler. Users can create multiple upscaled variants of any library image (different models, different scale factors) and seamlessly switch between the original and any variant. The original file is never modified.

**Inspired by V1**, but a clean implementation on the V2 foundation — no ONNX runtime, no API providers (yet), and minimal surface area.

---

## 2. Core Concepts

### Upscale Variant

A single upscaled version of a library image. Each variant records:

- Which model was used
- The scale factor (2×, 3×, 4×)
- Output dimensions
- Where the upscaled file lives on disk
- When it was created

A media item can have zero or many variants. At most one variant is "active" — meaning it's the version shown in loupe view. When no variant is active, the original is shown.

### Non-Destructive

The original `originals/` file is never touched. Upscaled outputs live in a separate `upscaled/` directory within the library. Deleting all variants restores the image to its original state with zero data loss.

### Working Image

The "working image" for a media item is:
- The active upscale variant's file, if one is set
- Otherwise, the original file

This concept is critical for future features (cropping, adjustment brushes, lama removal) which will all operate on the working image at its current resolution. When a user switches active variants, downstream operations may need to be re-evaluated — the architecture should store operations in resolution-agnostic normalized coordinates where possible.

---

## 3. Upscale Model Config

### Config File

A new bundled config file at `src/main/defaults/upscale-models.json` defines available models. The pattern follows the existing `loadEditableJsonConfig` approach — bundled default gets seeded to `{userData}/upscale-models.json` on first run, and the user-editable runtime copy is the source of truth thereafter.

```json
{
  "configVersion": 1,
  "models": [
    {
      "id": "realesrgan-x4plus",
      "name": "Real-ESRGAN x4+",
      "description": "General-purpose photo upscaler. Good all-round quality.",
      "file": "upscaling/RealESRGAN_x4plus.gguf",
      "nativeScale": 4,
      "supportedScales": [2, 3, 4],
      "enabled": true
    },
    {
      "id": "4x-ultrasharp",
      "name": "UltraSharp",
      "description": "Excellent detail preservation and sharpness.",
      "file": "upscaling/4xUltrasharpV10.gguf",
      "nativeScale": 4,
      "supportedScales": [2, 3, 4],
      "enabled": true
    },
    {
      "id": "4x-nomos-webphoto",
      "name": "Nomos WebPhoto",
      "description": "Optimized for web and product photography.",
      "file": "upscaling/4xNomosWebPhoto_esrgan.gguf",
      "nativeScale": 4,
      "supportedScales": [2, 3, 4],
      "enabled": true
    },
    {
      "id": "4x-nomos8k-sc",
      "name": "Nomos 8K SC",
      "description": "Cinematic and high-resolution source material.",
      "file": "upscaling/4xNomos8kSC.gguf",
      "nativeScale": 4,
      "supportedScales": [2, 3, 4],
      "enabled": true
    },
    {
      "id": "4x-nickelback-fs",
      "name": "Nickelback FS",
      "description": "Film scan restoration and upscaling.",
      "file": "upscaling/4x_NickelbackFS_72000_G.gguf",
      "nativeScale": 4,
      "supportedScales": [2, 3, 4],
      "enabled": true
    },
    {
      "id": "4x-nickelback",
      "name": "Nickelback",
      "description": "General purpose upscaler with natural texture.",
      "file": "upscaling/4x_Nickelback_70000G.gguf",
      "nativeScale": 4,
      "supportedScales": [2, 3, 4],
      "enabled": true
    },
    {
      "id": "2x-esrgan",
      "name": "ESRGAN 2×",
      "description": "Native 2× upscaler. Faster than running a 4× model at 2×.",
      "file": "upscaling/2x-ESRGAN.gguf",
      "nativeScale": 2,
      "supportedScales": [2],
      "enabled": true
    }
  ]
}
```

**Key design points:**

- `file` is relative to the app's resources root (`$RESOURCES/models/`). This matches the bundled model location at `resources/models/upscaling/`.
- `nativeScale` is the model's native output scale. When the user requests a scale lower than native (e.g. 2× from a 4× model), the upscaled output is downsampled via sharp with Lanczos3.
- `supportedScales` defines what scale factors the UI offers for this model.
- `enabled` lets users disable models they don't want to see without deleting the entry.

### Model Resolution

A simple `UpscaleModelService` (similar pattern to `AppConfigService`):

- Loads + caches the config via `loadEditableJsonConfig`
- Resolves `file` paths to absolute paths using the resources root
- Checks file existence on disk to determine availability
- Returns only enabled + available models to the renderer

---

## 4. Database Schema

### New Migration: `upscale_variants`

A dedicated table rather than a JSON blob in the `media` table. This is cleaner than V1's approach of storing a JSON string in a `media.upscale` column — it enables proper indexing, simpler queries, and avoids JSON parse/serialize overhead.

```sql
-- 00X_upscale_variants.sql

CREATE TABLE IF NOT EXISTS upscale_variants (
    id TEXT PRIMARY KEY,
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    model_id TEXT NOT NULL,
    model_name TEXT NOT NULL,
    scale_factor INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    file_size INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_upscale_variants_media_id
  ON upscale_variants(media_id);

-- Track active variant per media item (nullable = original is active)
ALTER TABLE media ADD COLUMN active_upscale_id TEXT REFERENCES upscale_variants(id) ON DELETE SET NULL;
```

**Why a separate table?**
- Clean relational model — each variant is a first-class row
- `ON DELETE CASCADE` cleans up variants when media is deleted
- `ON DELETE SET NULL` on `active_upscale_id` gracefully handles variant deletion
- Easy to query "all variants for this media" or "which media have upscales"
- No JSON serialization overhead
- Future video upscaling can share the same table (just add a `media_type` column if needed)

### Repository

New `src/main/db/repositories/upscale-variants.ts` with plain functions:

```typescript
// Core operations
getVariantsForMedia(db, mediaId) → UpscaleVariant[]
getVariant(db, variantId) → UpscaleVariant | null
insertVariant(db, variant) → void
deleteVariant(db, variantId) → void
deleteAllVariantsForMedia(db, mediaId) → void

// Active variant management
setActiveVariant(db, mediaId, variantId | null) → void
getActiveVariant(db, mediaId) → UpscaleVariant | null

// Queries
getMediaIdsWithUpscales(db, mediaIds) → Set<string>
```

---

## 5. File Layout

```
{library_root}/
├── originals/YYYY/MM/     # Unchanged — never modified by upscaling
├── thumbnails/             # Unchanged
├── upscaled/               # NEW — all upscale output files
│   └── {uuid}.png          # Each variant gets a UUID filename
└── ...
```

- `upscaled/` is a flat directory with UUID filenames — no date hierarchy needed since these are derivatives, not primary imports
- `FileManager` gets a new `getUpscaledDir()` method, and `ensureDirectories()` creates it on startup
- The `file_path` stored in `upscale_variants` is a relative path (e.g. `upscaled/abc123.png`) — same convention as `media.file_path`
- Served via the existing `distillery://library/` protocol — no changes needed

---

## 6. Types

### Shared Types (`src/main/types.ts`)

```typescript
// Upscale model definition (from config)
export interface UpscaleModelConfig {
  id: string
  name: string
  description: string
  file: string          // relative to resources/models/
  nativeScale: number
  supportedScales: number[]
  enabled: boolean
}

// Runtime model info sent to renderer (adds availability)
export interface UpscaleModelInfo {
  id: string
  name: string
  description: string
  supportedScales: number[]
  available: boolean    // model file exists on disk
}

// Upscale variant record (matches DB row)
export interface UpscaleVariant {
  id: string
  media_id: string
  file_path: string     // relative path within library
  model_id: string
  model_name: string
  scale_factor: number
  width: number
  height: number
  file_size: number | null
  created_at: string
}

// Upscale request from renderer
export interface UpscaleRequest {
  mediaId: string
  modelId: string
  scaleFactor: number
}

// Upscale progress event (main → renderer)
export interface UpscaleProgressEvent {
  mediaId: string
  phase: 'preparing' | 'upscaling' | 'saving' | 'complete' | 'error'
  message?: string
}

// Upscale result event (main → renderer)  
export interface UpscaleResultEvent {
  mediaId: string
  success: boolean
  variant?: UpscaleVariant
  error?: string
}

// Media data sent to renderer extended with upscale info
// (added to existing MediaRecord)
export interface MediaRecord {
  // ... existing fields ...
  active_upscale_id: string | null   // NEW
}
```

### Renderer Types (`src/renderer/types/index.ts`)

Mirror the above types. The `DistilleryAPI` interface gets new methods (see IPC section).

---

## 7. Main Process Architecture

### `src/main/upscale/` — New Module

```
src/main/upscale/
├── upscale-model-service.ts    # Config loading, model resolution, availability
├── upscale-service.ts          # Orchestrates upscaling via engine
└── upscale-task-handler.ts     # Work queue task handler
```

#### `UpscaleModelService`

- Loads `upscale-models.json` config via `loadEditableJsonConfig`
- Resolves model file paths: `path.join(resourcesRoot, 'models', model.file)`
- Checks file existence for `available` flag
- Returns `UpscaleModelInfo[]` to renderer (filtered to enabled models)

#### `UpscaleService`

Central orchestration. Depends on: `EngineManager`, `FileManager`, `Database`, `UpscaleModelService`.

```typescript
class UpscaleService {
  // Submit an upscale request → enqueues a work item
  async submit(request: UpscaleRequest): Promise<string>  // returns work item ID
  
  // Cancel an in-progress upscale
  async cancel(mediaId: string): Promise<void>
  
  // Set active variant (or null for original)
  setActiveVariant(mediaId: string, variantId: string | null): void
  
  // Delete a specific variant (file + DB row)
  deleteVariant(variantId: string): void
  
  // Delete all variants for a media item
  deleteAllVariants(mediaId: string): void
  
  // Get upscale data for a media item
  getUpscaleData(mediaId: string): { variants: UpscaleVariant[], activeVariantId: string | null }
  
  // Get available models
  getModels(): UpscaleModelInfo[]
  
  // Event emitters for IPC push
  emitProgress(event: UpscaleProgressEvent): void
  emitResult(event: UpscaleResultEvent): void
}
```

#### `UpscaleTaskHandler`

Implements `WorkTaskHandler`. Registered with `WorkHandlerRegistry` under task type `upscale.image`.

Execution flow:
1. Parse payload: `{ mediaId, modelId, scaleFactor }`
2. Resolve the media's original file path from DB
3. Resolve the upscale model's absolute path from `UpscaleModelService`
4. Generate output path: `{library}/upscaled/{uuid}.png`
5. Send `upscale` command to cn-engine via `EngineManager` (see below)
6. On success: read output dimensions via sharp, insert `UpscaleVariant` row, set as active variant
7. Create/update thumbnail (optional — the original thumbnail still works for grid view)
8. Emit result + library:updated events

**Engine interaction:**

cn-engine supports standalone upscaling via the `upscale` command. This does NOT require a diffusion model to be loaded — only the upscaler model. The `upscale` command accepts `upscale_model` per-request, so we can pass the model path directly without needing to `load` it first.

However, if a diffusion model IS loaded and has an upscaler loaded alongside it, we can omit `upscale_model` and use the already-loaded upscaler. For simplicity in V2, we'll always pass `upscale_model` per-request to the `upscale` command — this avoids coupling upscaling to the generation model lifecycle.

**EngineManager addition:**

A new `upscale()` method on `EngineManager`:

```typescript
async upscale(params: {
  id: string
  input: string
  output: string
  upscale_model: string
  upscale_repeats?: number
  upscale_factor?: number
}): Promise<UpscaleEngineResult>
```

This sends the `upscale` command to cn-engine. Unlike `generate()`, it does NOT require `state === 'ready'` — it works in `idle` state too (no diffusion model needed). The only requirement is that the engine process is running (`state !== 'stopped'`).

**Scale factor handling:**

- If `requestedScale === nativeScale`: upscale once, done
- If `requestedScale < nativeScale` (e.g. user wants 2× from a 4× model): upscale at native 4×, then downsample to 2× target via sharp Lanczos3
- `upscale_repeats` is always 1 for initial implementation

### Work Queue Integration

New task type constant:

```typescript
export const WORK_TASK_TYPES = {
  GENERATION: 'generation.image',
  UPSCALE: 'upscale.image'        // NEW
} as const
```

The upscale task handler is registered in `index.ts` alongside the generation handler.

**Queue behavior:** Upscale tasks go through the same single-threaded work queue as generation tasks. This is correct — both compete for GPU resources. A user can queue multiple upscales and they'll process serially.

---

## 8. IPC Surface

### New Channels

```typescript
// In IPC_CHANNELS:
UPSCALE_GET_MODELS: 'upscale:getModels',
UPSCALE_SUBMIT: 'upscale:submit',
UPSCALE_CANCEL: 'upscale:cancel',
UPSCALE_GET_DATA: 'upscale:getData',
UPSCALE_SET_ACTIVE: 'upscale:setActive',
UPSCALE_DELETE_VARIANT: 'upscale:deleteVariant',
UPSCALE_DELETE_ALL: 'upscale:deleteAll',

// Events (main → renderer):
UPSCALE_PROGRESS: 'upscale:progress',
UPSCALE_RESULT: 'upscale:result',
```

### New IPC Handler

`src/main/ipc/handlers/upscale.ts` — registers invoke handlers for the above channels.

### DistilleryAPI Additions

```typescript
interface DistilleryAPI {
  // ... existing ...
  
  upscale: {
    getModels(): Promise<UpscaleModelInfo[]>
    submit(request: UpscaleRequest): Promise<string>
    cancel(mediaId: string): Promise<void>
    getData(mediaId: string): Promise<{ variants: UpscaleVariant[], activeVariantId: string | null }>
    setActive(mediaId: string, variantId: string | null): Promise<void>
    deleteVariant(variantId: string): Promise<void>
    deleteAll(mediaId: string): Promise<void>
  }

  on(channel: 'upscale:progress', callback: (event: UpscaleProgressEvent) => void): () => void
  on(channel: 'upscale:result', callback: (event: UpscaleResultEvent) => void): () => void
}
```

---

## 9. Renderer Architecture

### Upscale Store

New `src/renderer/stores/upscale-store.ts`:

```typescript
interface UpscaleState {
  // Available models (hydrated on mount)
  models: UpscaleModelInfo[]
  
  // Per-media upscale data (cached for focused item)
  variants: UpscaleVariant[]
  activeVariantId: string | null
  
  // Form state
  selectedModelId: string | null
  selectedScale: number
  
  // Progress
  isUpscaling: boolean
  progressPhase: string | null
  progressMessage: string | null
  
  // Actions
  loadModels: () => Promise<void>
  loadUpscaleData: (mediaId: string) => Promise<void>
  clearUpscaleData: () => void
  submit: (mediaId: string) => Promise<void>
  setActive: (mediaId: string, variantId: string | null) => Promise<void>
  deleteVariant: (variantId: string, mediaId: string) => Promise<void>
  deleteAll: (mediaId: string) => Promise<void>
  setSelectedModelId: (id: string) => void
  setSelectedScale: (scale: number) => void
}
```

### Upscale Pane

New `src/renderer/components/panes/UpscalePane.tsx` — added to the right sidebar.

#### Layout (top to bottom):

1. **Model selector** — `Select` (shadcn) dropdown of available models. Each option shows model name; the description can be shown as a tooltip or in a subtle subtitle.

2. **Scale factor** — `ToggleGroup` (shadcn) with the supported scales for the selected model (e.g. `2×`, `3×`, `4×`). Defaults to 4×.

3. **Upscale button** — Primary action button. Disabled when no media is selected, or when upscaling is in progress. Shows a spinner during upscale.

4. **Variants list** — Displays all upscale variants for the focused media item. Each variant is a shadcn `Item` with:
   - **Variant `outline`** style
   - **Active state**: `border-primary/40 bg-primary/10`
   - **Inactive state**: `hover:border-border hover:bg-muted/50`
   - Content shows: model name, scale factor, dimensions, timestamp
   - Click to activate (switch to this variant)
   - "Original" entry always present at top — clicking it sets `activeVariantId = null`
   - Delete button (trash icon) on each variant (not on "Original")

5. **Progress indicator** — When upscaling is in progress, show phase and a subtle progress message below the button.

#### V1 Screenshot Reference

The V1 upscale panel (see `v1_upscaling.png`) shows:
- Model selector at top
- Scale factor selector
- Upscale button
- List of existing variants with active indicator
- Each variant shows model name, dimensions, and can be clicked to activate

The V2 implementation follows this same flow but uses shadcn components throughout.

### Right Sidebar Integration

Add `'upscale'` to `RightPanelTab` union type in `ui-store.ts`:

```typescript
export type RightPanelTab = 'info' | 'generation-info' | 'collections' | 'upscale'
```

Add the upscale tab to `RIGHT_TABS` in `RightSidebar.tsx`:

```typescript
{
  tab: 'upscale',
  label: 'Upscale',
  title: 'Upscale',
  icon: Maximize2, // or ArrowUpFromLine from lucide-react
  content: <UpscalePane />
}
```

### CanvasViewer / Loupe View — Working Image

The `CanvasViewer` currently loads `media.file_path` directly. After upscaling, we need it to load the **working image** — the active variant's file if one is set, otherwise the original.

**Approach:** The main process already rewrites `file_path` from relative DB paths to `distillery://library/` protocol URLs before sending to the renderer. We extend this:

- A new field on the MediaRecord sent to renderer: `working_file_path`
- When `active_upscale_id` is set, `working_file_path` resolves to the variant's file path (via the `distillery://` protocol)
- When null, `working_file_path === file_path` (the original)
- `CanvasViewer` in loupe view uses `working_file_path` instead of `file_path`
- Grid thumbnails continue to use `thumb_path` — they always show the original thumbnail (consistent with V1 behavior; upscaled thumbnails aren't needed since upscaling doesn't change content, only resolution)

**Zoom behavior:**

The `CanvasViewer` already uses `img.naturalWidth` / `img.naturalHeight` from the loaded image to compute fit/actual zoom scales. When the active variant changes:
- The image source URL changes → triggers a reload
- The new image has different natural dimensions
- `fit` zoom continues to fit within viewport (correct automatically)
- `actual` zoom shows 1:1 pixels of the upscaled image (correct automatically)
- Pan offset resets on image change (already implemented via the `media?.file_path` dependency)

Since the `working_file_path` changes when variants are switched, the existing reset-on-path-change logic handles this cleanly. **No CanvasViewer code changes needed** beyond using `working_file_path` as the image source.

### IPC Subscriptions

In `App.tsx`, subscribe to upscale events:

```typescript
// In the useEffect that sets up IPC subscriptions:
const unsubProgress = window.api.on('upscale:progress', (event) => {
  useUpscaleStore.getState().handleProgress(event)
})

const unsubResult = window.api.on('upscale:result', (event) => {
  useUpscaleStore.getState().handleResult(event)
  // Refresh library to pick up the new working_file_path
})
```

---

## 10. Working Image Resolution for Future Features

The `working_file_path` / `active_upscale_id` pattern naturally extends to future non-destructive operations:

- **Cropping, adjustment brushes, lama removal** — When these features are added, they should store their operations in **normalized coordinates** (0.0–1.0 relative to image dimensions), not pixel coordinates. This makes operations resolution-agnostic and valid regardless of which upscale variant is active.
- **Compositing pipeline** — If multiple non-destructive operations stack (upscale + crop + adjustment), a compositing pipeline would apply operations in order to compute the final working image. The upscale variant becomes the base layer.
- **Video upscaling** — The same `upscale_variants` table can accommodate video by reusing the `media_id` foreign key (since videos are also `media` records). A `media_type` discriminator could be added to the variants table if needed.
- **API-based upscaling** — The `UpscaleService.submit()` → work queue → task handler pattern abstracts the execution backend. An `ApiUpscaleTaskHandler` could be added alongside the local handler, dispatching based on a `provider` field in the request. The variant storage and UI remain identical.

---

## 11. Implementation Sequence

### Phase 1: Foundation
1. Create `upscale-models.json` default config with all 7 bundled models
2. Add `UpscaleModelService` — config loading, path resolution, availability check
3. Add DB migration for `upscale_variants` table + `media.active_upscale_id` column
4. Add `upscale-variants` repository
5. Add types to `src/main/types.ts` and mirror in renderer types
6. Add `getUpscaledDir()` to `FileManager`

### Phase 2: Engine + Service
7. Add `upscale()` method to `EngineManager`
8. Add `UpscaleService` orchestration
9. Add `UpscaleTaskHandler` + register with work queue
10. Add `UPSCALE` to `WORK_TASK_TYPES`

### Phase 3: IPC
11. Add upscale IPC channels
12. Add upscale IPC handler
13. Add preload bridge methods
14. Add `DistilleryAPI` type extensions

### Phase 4: Renderer
15. Extend `MediaRecord` with `active_upscale_id` and `working_file_path`
16. Update `CanvasViewer` to use `working_file_path` in loupe mode
17. Add `upscale-store.ts`
18. Build `UpscalePane` component
19. Add upscale tab to `RightSidebar`
20. Add IPC subscriptions in `App.tsx`

### Phase 5: Polish
21. Handle edge cases: media deletion cascading to variant files, cancel in-progress upscale
22. Ensure grid view thumbnail is unaffected by active variant
23. Test zoom/pan behavior with upscaled images
24. Test serial queue behavior (generation + upscale interleaved)

---

## 12. Files Changed / Created

### New Files
| File | Purpose |
|------|---------|
| `src/main/defaults/upscale-models.json` | Bundled model catalog |
| `src/main/upscale/upscale-model-service.ts` | Config + model resolution |
| `src/main/upscale/upscale-service.ts` | Orchestration |
| `src/main/upscale/upscale-task-handler.ts` | Work queue handler |
| `src/main/db/repositories/upscale-variants.ts` | DB operations |
| `src/main/db/migrations/00X_upscale_variants.sql` | Schema migration |
| `src/main/ipc/handlers/upscale.ts` | IPC handler |
| `src/renderer/stores/upscale-store.ts` | Renderer state |
| `src/renderer/components/panes/UpscalePane.tsx` | UI panel |

### Modified Files
| File | Change |
|------|--------|
| `src/main/types.ts` | Add upscale types |
| `src/main/engine/engine-manager.ts` | Add `upscale()` method |
| `src/main/files/file-manager.ts` | Add `getUpscaledDir()` |
| `src/main/queue/work-task-types.ts` | Add `UPSCALE` task type |
| `src/main/index.ts` | Wire up upscale service + register handler |
| `src/main/ipc/channels.ts` | Add upscale channels |
| `src/preload/index.ts` | Add upscale bridge |
| `src/preload/index.d.ts` | Add upscale types |
| `src/renderer/types/index.ts` | Mirror types + API surface |
| `src/renderer/stores/ui-store.ts` | Add `'upscale'` to `RightPanelTab` |
| `src/renderer/components/layout/RightSidebar.tsx` | Add upscale tab |
| `src/renderer/components/library/canvas/CanvasViewer.tsx` | Use `working_file_path` |
| `src/renderer/App.tsx` | Subscribe to upscale events |
| `src/main/db/repositories/media.ts` | Include `active_upscale_id` in queries, compute `working_file_path` |

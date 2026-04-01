# Video Editing — Spec & Implementation Plan

## 1. Overview

Port non-destructive video editing from V1 (simple-ai-client) to Distillery's Vue renderer. Scope: **video trim** and **video info display**. Video crop is deferred — it requires ffmpeg export infrastructure that doesn't exist yet. The architecture follows the proven patterns established by the `transforms`, `adjustments`, and `removal` features.

**Design principles:**
- Trim controls integrate seamlessly into the existing `VideoPlayer.vue` — no separate mode or modal.
- The sidebar pane shows trim state and video metadata; the player owns the interactive trim timeline.
- Non-destructive: trim data is stored as JSON metadata in the existing `video_edits_json` column and applied at playback time.
- Frame-accurate: all trim operations snap to nearest frame boundary.

---

## 2. What Exists Today

| Layer | Current state |
|---|---|
| **Database** | `video_edits_json TEXT` column on `media` table (migration 018) — added but unused |
| **Types** | `MediaRecord` has `duration: number \| null` and `media_type: 'video'`. No `VideoEdits` type defined |
| **Repository** | No `getVideoEdits()` / `saveVideoEdits()` functions |
| **IPC** | No video-edit channels in `IPC_CHANNELS` |
| **Renderer types** | No `VideoEdits` in `DistilleryAPI` |
| **Store** | No video edit store |
| **VideoPlayer.vue** | Full playback with custom controls (play, seek, volume, mute, loop, pin). No trim awareness |
| **TransformPane.vue** | Image-only transforms. Shows "images only" gate for videos |
| **LoupeView.vue** | Renders `VideoPlayer` for videos, `CanvasViewer` + overlays for images |

---

## 3. Architecture

### 3.1 Type Definitions

Add to `src/main/types.ts` (canonical) and mirror in `src/renderer/types/index.ts`:

```typescript
// ---------------------------------------------------------------------------
// Video Edits (non-destructive)
// ---------------------------------------------------------------------------

export interface VideoTrim {
  /** Start time in seconds from original video start */
  startTime: number
  /** End time in seconds from original video start */
  endTime: number
}

export interface VideoEdits {
  version: 1
  trim?: VideoTrim
  /** ISO timestamp of last edit */
  timestamp?: string
}

export interface VideoMetadata {
  duration: number
  width: number
  height: number
  frameRate: number
}
```

**Design notes:**
- `VideoEdits.crop` is intentionally omitted — crop requires ffmpeg export and is out of scope.
- `VideoMetadata` is extracted client-side from the HTML5 `<video>` element. It is *not* persisted — it's ephemeral state in the store, populated on each playback session. The `duration` field on `MediaRecord` is the persisted source of truth for duration.
- `VideoMetadata.frameRate` defaults to `30` when not determinable from HTML5 video API (which doesn't expose it reliably). This is sufficient for frame-snapping.

### 3.2 Utility Functions

Add to `src/renderer/lib/media.ts`:

```typescript
/** Snap a time to the nearest frame boundary. */
export function snapToFrame(time: number, frameRate: number): number {
  return Math.round(time * frameRate) / frameRate
}

/** Format time with millisecond precision: MM:SS.mmm or HH:MM:SS.mmm */
export function formatTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = (seconds % 60).toFixed(3).padStart(6, '0')
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${s}`
    : `${String(m).padStart(2, '0')}:${s}`
}

/** Check if VideoEdits has any actual edits applied. */
export function hasVideoEdits(edits: VideoEdits | null | undefined): boolean {
  return !!edits?.trim
}
```

### 3.3 Database Repository

Add to `src/main/db/repositories/media.ts`, following the exact pattern of `getTransforms()` / `saveTransforms()`:

```typescript
interface VideoEditsRow { video_edits_json: string | null }

export function getVideoEdits(db: Database.Database, mediaId: string): VideoEdits | null {
  const row = db
    .prepare('SELECT video_edits_json FROM media WHERE id = ?')
    .get(mediaId) as VideoEditsRow | undefined

  if (!row?.video_edits_json) return null
  try { return JSON.parse(row.video_edits_json) as VideoEdits }
  catch { return null }
}

export function saveVideoEdits(
  db: Database.Database,
  mediaId: string,
  edits: VideoEdits | null
): void {
  db.prepare(
    "UPDATE media SET video_edits_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
  ).run(edits ? JSON.stringify(edits) : null, mediaId)
}
```

### 3.4 IPC Channels

Add to `src/main/ipc/channels.ts`:

```typescript
// Video Edits
VIDEO_EDITS_GET: 'videoEdits:get',
VIDEO_EDITS_SAVE: 'videoEdits:save',
```

### 3.5 IPC Handler

Create `src/main/ipc/handlers/video-edits.ts`, following the `transforms.ts` pattern:

```typescript
export function registerVideoEditsHandlers(): void {
  const db = getDatabase()

  ipcMain.handle(IPC_CHANNELS.VIDEO_EDITS_GET, (_event, mediaId: string) => {
    return mediaRepo.getVideoEdits(db, mediaId)
  })

  ipcMain.handle(
    IPC_CHANNELS.VIDEO_EDITS_SAVE,
    (_event, mediaId: string, edits: VideoEdits | null) => {
      mediaRepo.saveVideoEdits(db, mediaId, edits)
    }
  )
}
```

Register in `src/main/index.ts` alongside other handler registrations.

### 3.6 Preload / DistilleryAPI

Add to the `DistilleryAPI` interface:

```typescript
videoEdits: {
  get(mediaId: string): Promise<VideoEdits | null>
  save(mediaId: string, edits: VideoEdits | null): Promise<void>
}
```

Wire in `src/preload/index.ts`:

```typescript
videoEdits: {
  get: (mediaId: string) => ipcRenderer.invoke(IPC_CHANNELS.VIDEO_EDITS_GET, mediaId),
  save: (mediaId: string, edits: VideoEdits | null) =>
    ipcRenderer.invoke(IPC_CHANNELS.VIDEO_EDITS_SAVE, mediaId, edits),
},
```

---

## 4. Renderer Store

### 4.1 `useVideoEditStore` (Pinia, setup syntax)

File: `src/renderer/stores/video-edits.ts`

Follows the proven pattern of `useTransformStore` — per-media cache, load-on-demand, optimistic local updates, IPC for persistence.

**State:**

```typescript
// Per-media edits cache (keyed by mediaId)
const editsCache = ref<Record<string, VideoEdits | null>>({})
const loaded = ref<Record<string, boolean>>({})

// Active editing session
const activeMediaId = ref<string | null>(null)

// Trim UI state (ephemeral — not persisted)
const trimMode = ref(false)           // Is the trim timeline visible?
const trimStart = ref<number | null>(null)   // Staged IN point (null = not set)
const trimEnd = ref<number | null>(null)     // Staged OUT point (null = not set)

// Video metadata (populated by VideoPlayer on loadedmetadata)
const metadata = ref<VideoMetadata | null>(null)

// Playback state mirrored from VideoPlayer
const currentTime = ref(0)
const isPlaying = ref(false)
```

**Key actions:**

| Action | Behavior |
|---|---|
| `loadEdits(mediaId)` | Fetch from IPC if not cached, populate `trimStart`/`trimEnd` from persisted trim |
| `saveEdits(mediaId)` | Build `VideoEdits` from `trimStart`/`trimEnd`, persist via IPC, update cache |
| `enterTrimMode(mediaId)` | Set `trimMode = true`, `activeMediaId`, load existing trim points into `trimStart`/`trimEnd` |
| `exitTrimMode()` | Set `trimMode = false`, clear staged state |
| `setTrimStart(time)` | Frame-snap, clamp to `< (trimEnd - 0.1)`, auto-save |
| `setTrimEnd(time)` | Frame-snap, clamp to `> (trimStart + 0.1)`, auto-save |
| `clearTrim(mediaId)` | Null out trim, save `null` or edits without trim |
| `setMetadata(meta)` | Store metadata from VideoPlayer |
| `setCurrentTime(time)` | Mirror playhead position |
| `setIsPlaying(playing)` | Mirror playback state |

**Computed getters:**

| Getter | Returns |
|---|---|
| `currentEdits` | `editsCache[activeMediaId]` |
| `hasTrim` | `trimStart !== null \|\| trimEnd !== null` |
| `trimmedDuration` | Computed from `trimStart`, `trimEnd`, `metadata.duration` |
| `frameRate` | `metadata?.frameRate ?? 30` |

**Auto-save behavior:** `setTrimStart` and `setTrimEnd` call `saveEdits()` immediately (no debounce needed — these are infrequent, intentional user actions).

---

## 5. UI Components

### 5.1 VideoPlayer.vue — Trim Integration

The existing `VideoPlayer.vue` gains trim awareness. This is where the trim timeline and transport controls live — they are part of the player, not the sidebar.

**New props: none.** The player reads from `useVideoEditStore` directly (same pattern as V1's `useVideoEditStore` integration).

**Changes:**

1. **Import the video edit store** and read `trimMode`, `trimStart`, `trimEnd`, `activeMediaId`.

2. **Playhead clamping** — When trim is applied (persisted trim, not just staged), constrain playback to the trimmed range:
   - On `timeupdate`: if `currentTime >= effectiveEnd`, pause or loop to `effectiveStart`.
   - `effectiveStart` / `effectiveEnd` are computed:
     - In trim mode: full video range (user needs to see everything to set points).
     - Otherwise: `currentEdits?.trim?.startTime ?? 0` / `currentEdits?.trim?.endTime ?? duration`.

3. **Keyboard shortcuts** — Active when video player area has focus and no text input is focused:

   | Key | Action |
   |---|---|
   | `Space` / `K` | Play/pause |
   | `J` | Step back 1 frame |
   | `L` | Step forward 1 frame |
   | `I` | Set IN point at playhead, save |
   | `O` | Set OUT point at playhead, save |

   `I`/`O` shortcuts only function when `trimMode` is active.

4. **Trim timeline** — Rendered below the playback controls bar when `trimMode === true`:

   ```
   ┌────────────────────────────────────────────────┐
   │  ▶ 00:12.345 / 01:45.678   ━━━━━━━━━━  🔊 🔁 📌 │  ← existing controls
   ├────────────────────────────────────────────────┤
   │  ⏮ ⏪ ▶ ⏩ ⏭  │ [Set In] [Set Out] [Clear]    │  ← transport + trim points
   ├────────────────────────────────────────────────┤
   │  [ |◄─────────trimmed region───────────►| ]    │  ← interactive timeline
   │  00:04.567          ▼ playhead     01:32.100   │  ← time labels
   └────────────────────────────────────────────────┘
   ```

5. **Sync to store** — On `timeupdate`, call `videoEditStore.setCurrentTime()`. On `loadedmetadata`, call `videoEditStore.setMetadata()`.

### 5.2 TrimTimeline (inline in VideoPlayer or extracted component)

An interactive timeline track rendered inside the VideoPlayer when trim mode is active. Implemented as a child component `TrimTimeline.vue` in `src/renderer/components/library/`.

**Visual elements:**
- **Track background** — full-width bar representing the video's full duration.
- **Dimmed regions** — areas outside the trim range are darkened (semi-transparent overlay).
- **Trim handles** — draggable `[` and `]` bracket markers at the IN/OUT points. Wide enough hit target (16px) for comfortable dragging.
- **Trimmed region** — the area between handles, slightly highlighted. The region itself is draggable (moves both handles, maintaining span width).
- **Playhead** — vertical line with a dot top, showing current position. Clicking anywhere on the track seeks the playhead.
- **Time labels** — current time, duration, and trimmed duration displayed below the track in monospace.
- **Hover tooltip** — shows time at cursor position when hovering over the track.

**Interaction model:**

| Gesture | Effect |
|---|---|
| Click track | Seek playhead to clicked time |
| Drag IN handle | Move start point (frame-snapped, auto-saves on release) |
| Drag OUT handle | Move end point (frame-snapped, auto-saves on release) |
| Drag trimmed region | Move both handles together (maintains span, clamps to [0, duration]) |
| Double-click handle | Clear that trim point |

**Drag state machine:** `idle → dragging(in | out | region | playhead) → idle`. On mouseup, if drag was a handle or region, call `saveEdits()`.

### 5.3 TrimTransport (inline in VideoPlayer)

Transport-style buttons rendered above the trim timeline:

```
⏮  ⏪  ▶  ⏩  ⏭   │   [Set In]  [Set Out]  [✕ Clear]
```

| Button | Action |
|---|---|
| ⏮ Jump Start | Seek to `trimStart ?? 0` |
| ⏪ Step Back | Seek back 1 frame (`currentTime - 1/frameRate`) |
| ▶ Play/Pause | Toggle playback |
| ⏩ Step Forward | Seek forward 1 frame |
| ⏭ Jump End | Seek to `trimEnd ?? duration` |
| Set In | Set IN point at current playhead time, save |
| Set Out | Set OUT point at current playhead time, save |
| Clear | Clear all trim points, save |

Use PrimeVue `Button` components with `severity="secondary"`, `text` variant for transport buttons. Icon-only buttons use `icon` and `aria-label` props.

### 5.4 VideoEditPane.vue (Right Sidebar)

File: `src/renderer/components/panes/VideoEditPane.vue`

A new right-sidebar pane for video-specific editing controls and info display. Activated via a new `'videoEdit'` tab in the right sidebar icon rail.

**Structure:**

```
PaneLayout title="Video"
├── PaneGate (no selection)
├── PaneGate (not a video)
├── PaneGate (not in loupe view)
└── PaneBody
    ├── PaneSection title="Info"
    │   ├── Duration: 01:45
    │   ├── Resolution: 1920 × 1080
    │   └── File size: 24.5 MB
    │
    ├── PaneSection title="Trim"
    │   ├── Button: "Enable Trim" / "Disable Trim" (toggles trim mode)
    │   └── (when trim active)
    │       ├── IN:  00:04.567  (accent color)
    │       ├── OUT: 01:32.100  (accent color)
    │       ├── Duration: 01:27.533 (87%)
    │       └── Hint: "Use I and O keys to set trim points"
    │       └── Button: "Clear Trim" (secondary, only shown if trim exists)
    │
    └── PaneSection title="Reset" (only if has edits)
        └── PaneActions stack
            └── Button: "Reset All Edits" (severity="danger", outlined)
```

**Data sources:**
- Video metadata: `videoEditStore.metadata` (from VideoPlayer's `loadedmetadata`).
- Duration: `focusedItem.duration` from library store (persisted) — used when metadata hasn't loaded.
- File size: `focusedItem.file_size` from library store.
- Resolution: `focusedItem.width × focusedItem.height` from library store (or metadata if available).
- Trim state: `videoEditStore.trimStart`, `videoEditStore.trimEnd`, `videoEditStore.hasTrim`.

**Behavior:**
- "Enable Trim" button calls `videoEditStore.enterTrimMode(mediaId)` which triggers the trim timeline to appear in the VideoPlayer.
- "Disable Trim" calls `videoEditStore.exitTrimMode()`.
- Trim info (IN/OUT/Duration) updates reactively as the user drags handles or presses I/O keys.
- "Clear Trim" calls `videoEditStore.clearTrim(mediaId)`.
- "Reset All Edits" calls `videoEditStore.clearTrim(mediaId)` and saves null edits.

---

## 6. Integration Points

### 6.1 UI Store Updates

Add `'videoEdit'` to `RightPanelTab`:

```typescript
export type RightPanelTab =
  | 'info' | 'generation' | 'collections'
  | 'transform' | 'adjustments' | 'removal' | 'upscale'
  | 'videoEdit'   // ← new
```

Add to `RIGHT_PANEL_TABS` array and `isRightPanelTab()` guard.

### 6.2 Right Sidebar

In `RightSidebar.vue`:

- Add tab to `tabs` array:
  ```typescript
  { id: 'videoEdit', icon: 'lucide:scissors', label: 'Video' }
  ```
- Add case to `activePaneComponent`:
  ```typescript
  case 'videoEdit': return VideoEditPane
  ```

### 6.3 LoupeView Integration

No changes needed. `VideoPlayer.vue` already receives the `media` prop and will self-manage trim state via the store when trim mode is active.

**Exit trim mode on navigation:** Add a watcher in `LoupeView.vue` (following patterns for crop/paint cancellation):
```typescript
watch(
  () => currentItem.value,
  (current) => {
    if (!videoEditStore.trimMode) return
    if (!current || current.id !== videoEditStore.activeMediaId || current.media_type !== 'video') {
      videoEditStore.exitTrimMode()
    }
  }
)
```

### 6.4 TransformPane Gate Update

Update the gate message for video items from "Transforms are available for images only" to something that directs users to the Video pane:

```vue
<PaneGate v-else-if="notImage" message="Use the Video pane for video editing" />
```

### 6.5 Keyboard Shortcuts

The `I`, `O`, `J`, `L` shortcuts are scoped to the VideoPlayer component (not global `useKeyboardShortcuts`). They are only active when:
- The video player area (or its children) has focus, OR
- Trim mode is active and no text input is focused.

The existing `Space` handling in `useKeyboardShortcuts.ts` should be extended to toggle video playback when a video is focused in loupe view. `J`/`L` frame stepping could also be added there, but only when `viewMode === 'loupe'` and the focused item is a video.

---

## 7. Implementation Order

Build bottom-up so each layer is testable before the next:

### Phase 1: Backend (types, DB, IPC)

1. **Types** — Add `VideoEdits`, `VideoTrim`, `VideoMetadata` to `src/main/types.ts` and `src/renderer/types/index.ts`.
2. **Utilities** — Add `snapToFrame()`, `formatTimecode()`, `hasVideoEdits()` to `src/renderer/lib/media.ts`.
3. **Repository** — Add `getVideoEdits()`, `saveVideoEdits()` to `src/main/db/repositories/media.ts`.
4. **IPC channels** — Add `VIDEO_EDITS_GET`, `VIDEO_EDITS_SAVE` to `src/main/ipc/channels.ts`.
5. **IPC handler** — Create `src/main/ipc/handlers/video-edits.ts`, register in `src/main/index.ts`.
6. **Preload** — Wire `videoEdits.get()` / `videoEdits.save()` in preload and `DistilleryAPI`.

### Phase 2: Store

7. **Video edit store** — Create `src/renderer/stores/video-edits.ts` with full trim state management.

### Phase 3: Sidebar Pane

8. **VideoEditPane.vue** — Create the right-sidebar pane with info + trim sections.
9. **UI store + RightSidebar** — Add `'videoEdit'` tab, wire pane component.

### Phase 4: Player Integration

10. **TrimTimeline.vue** — Interactive trim timeline component.
11. **VideoPlayer.vue updates** — Trim timeline rendering, playhead clamping, keyboard shortcuts, store sync.
12. **LoupeView.vue** — Add trim mode exit watcher.

### Phase 5: Polish

13. **TransformPane gate** — Update video gate message.
14. **Keyboard shortcut integration** — Ensure `I`/`O`/`J`/`L`/`Space` work correctly in video context.
15. **Edge cases** — Handle very short videos (< 1s), videos with unknown duration, navigating away during trim.

---

## 8. File Changes Summary

| File | Change |
|---|---|
| `src/main/types.ts` | Add `VideoEdits`, `VideoTrim`, `VideoMetadata` |
| `src/renderer/types/index.ts` | Mirror types + extend `DistilleryAPI` with `videoEdits` namespace |
| `src/renderer/lib/media.ts` | Add `snapToFrame()`, `formatTimecode()`, `hasVideoEdits()` |
| `src/main/db/repositories/media.ts` | Add `getVideoEdits()`, `saveVideoEdits()` |
| `src/main/ipc/channels.ts` | Add `VIDEO_EDITS_GET`, `VIDEO_EDITS_SAVE` |
| `src/main/ipc/handlers/video-edits.ts` | **New file** — IPC handlers |
| `src/main/index.ts` | Register video-edits handlers |
| `src/preload/index.ts` | Wire `videoEdits` namespace |
| `src/renderer/stores/video-edits.ts` | **New file** — Pinia store (setup syntax) |
| `src/renderer/stores/ui.ts` | Add `'videoEdit'` to `RightPanelTab` |
| `src/renderer/components/panes/VideoEditPane.vue` | **New file** — Right sidebar pane |
| `src/renderer/components/library/TrimTimeline.vue` | **New file** — Interactive trim timeline |
| `src/renderer/components/library/VideoPlayer.vue` | Add trim mode, playhead clamping, keyboard shortcuts, store sync |
| `src/renderer/components/layout/RightSidebar.vue` | Add videoEdit tab + pane component |
| `src/renderer/components/library/LoupeView.vue` | Add trim-mode exit watcher |
| `src/renderer/components/panes/TransformPane.vue` | Update video gate message |

---

## 9. What's NOT in Scope

- **Video crop** — Requires ffmpeg export pipeline. The `VideoEdits` type intentionally omits `crop` for now.
- **Video export** — No destructive export (rendered/transcoded output). Trimming is playback-only and metadata-only.
- **Thumbnail strip in trim timeline** — V1 generated thumbnail strips via IPC. This is a nice-to-have that can be added later; the initial implementation uses a plain track bar.
- **Ping-pong / reverse loop modes** — V1 had these in the compact player. Out of scope for initial trim implementation.
- **Video upscaling** — Separate feature, already partially in the upscale pane.

---

## 10. V1 Reference Mapping

| V1 component | Distillery equivalent |
|---|---|
| `videoEditStore.ts` (Zustand) | `stores/video-edits.ts` (Pinia, setup syntax) |
| `video-edit-service.ts` + `video-edit-db.ts` + `video-edit-handlers.ts` | `repositories/media.ts` + `handlers/video-edits.ts` (simple — no service layer needed) |
| `TrimTimeline.tsx` | `components/library/TrimTimeline.vue` |
| `TrimControls.tsx` | Integrated into `VideoPlayer.vue` (trim transport section) |
| `TrimSection.tsx` + `VideoInfoSection.tsx` | `components/panes/VideoEditPane.vue` (single pane with sections) |
| `VideoTransformPanel → VideoTransformPanel` | `VideoEditPane.vue` (standalone pane, not nested in TransformPane) |
| `video-edits.ts` (types) | `types.ts` (shared types file) |

**Key simplifications vs V1:**
- V1 had a separate service layer (`video-edit-service.ts`) wrapping a DB layer (`video-edit-db.ts`). Distillery uses the established pattern: repository functions called directly from IPC handlers. No service layer needed.
- V1 had path-based AND id-based lookups with path→relative conversion. Distillery uses id-based only (consistent with transforms/adjustments).
- V1's video crop/export features are omitted (out of scope).
- V1's thumbnail strip in the trim timeline is deferred (can be added later).

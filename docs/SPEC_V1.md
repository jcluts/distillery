# Distillery MVP Specification

## 1. Overview

Distillery is a desktop application for local AI image generation and media management, built on top of [condenser.cpp](https://github.com/jcluts/condenser.cpp). It targets creative professionals -- creative directors, graphic designers, product owners, production artists -- who need generative AI tools but are underserved by existing web-based offerings.

**Core ethos:** "It just works." Media-forward, not tech-forward. The library is the product; generation is one way media enters it.

**MVP scope:** Local image generation via FLUX.2 Klein, a performant media library with culling and browsing workflows, and import support. The architecture anticipates future features (video, API providers, non-destructive editing, upscaling) without implementing them.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Shell | Electron (Windows, macOS, Linux) |
| Bundler | electron-vite |
| Renderer | React 19, TypeScript |
| Styling | Tailwind CSS 4, shadcn/ui (Radix Nova, neutral base, cyan theme, Inter font, small radius) |
| Database | SQLite via better-sqlite3 (main process) |
| Inference | cn-engine (condenser.cpp) -- child process, NDJSON-over-stdio |
| Image Display | HTML Canvas (future: WebGL for adjustments) |

### shadcn/ui Configuration

```json
{
  "style": "radix-nova",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "css": "src/renderer/src/assets/main.css",
    "baseColor": "neutral",
    "cssVariables": true
  },
  "iconLibrary": "lucide",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  }
}
```

### Theme

Dark mode only for MVP. The cyan accent provides a professional, photography-tool aesthetic that differentiates from the warm/orange tones of most creative tools and the blue tones of developer tools.

---

## 3. Architecture

### 3.1 Process Model

```
+-----------------------------------------------------------+
|  Electron Main Process                                     |
|                                                            |
|  +------------------+  +-----------------------------+     |
|  |  SQLite (DB)     |  |  Engine Manager             |     |
|  |  (better-sqlite3)|  |  (spawns/manages cn-engine) |     |
|  +------------------+  +-----------------------------+     |
|                                                            |
|  +------------------+  +-----------------------------+     |
|  |  File Manager    |  |  Queue Manager              |     |
|  |  (media on disk) |  |  (GPU/CPU job scheduling)   |     |
|  +------------------+  +-----------------------------+     |
|                                                            |
|  +------------------------------------------------+       |
|  |  IPC Layer (contextBridge / ipcMain+ipcRenderer)|       |
|  +------------------------------------------------+       |
+-----------------------------------------------------------+
        |                          |
        v                          v
+-------------------+    +-------------------+
|  Preload Script   |    |  cn-engine        |
|  (contextBridge)  |    |  (child process)  |
+-------------------+    |  NDJSON stdio     |
        |                +-------------------+
        v
+-----------------------------------------------------------+
|  Electron Renderer Process                                 |
|                                                            |
|  +---------------------+  +--------------------------+    |
|  |  Library View        |  |  Generation Panel        |    |
|  |  (Grid / Loupe)      |  |  (Prompt, Settings,      |    |
|  |                      |  |   Queue Status)           |    |
|  +---------------------+  +--------------------------+    |
|                                                            |
|  +---------------------+  +--------------------------+    |
|  |  Canvas Viewer       |  |  Info Panel              |    |
|  |  (full-size media)   |  |  (metadata, gen params)  |    |
|  +---------------------+  +--------------------------+    |
+-----------------------------------------------------------+
```

### 3.2 Directory Structure

```
distillery/
  src/
    main/                        # Electron main process
      index.ts                   # App entry, window creation
      db/
        connection.ts            # SQLite connection (better-sqlite3)
        migrations/              # Versioned SQL migration files
        repositories/            # Data access layer per table
          media.ts
          generations.ts
          queue.ts
          models.ts
      engine/
        engine-manager.ts        # Spawn, lifecycle, reconnect of cn-engine
        engine-protocol.ts       # NDJSON encode/decode, typed message handling
      queue/
        queue-manager.ts         # Job scheduling, serial GPU execution
      files/
        file-manager.ts          # Media storage, thumbnails, path resolution
        thumbnail-generator.ts   # sharp-based thumbnail creation
      ipc/
        handlers.ts              # ipcMain handlers organized by domain
    preload/
      index.ts                   # contextBridge API exposure
    renderer/
      src/
        main.tsx                 # React entry
        App.tsx                  # Root layout, routing
        assets/
          main.css               # @import "tailwindcss"; theme tokens
        components/
          ui/                    # shadcn/ui components (auto-generated)
          library/               # Library-specific components
            Grid.tsx             # Thumbnail grid (virtualized)
            Loupe.tsx            # Full-size loupe browser
            FilmStrip.tsx        # Horizontal thumbnail strip
            MediaCard.tsx        # Single grid thumbnail
            FilterBar.tsx        # Rating, status, type filters
          generation/            # Generation panel components
            GenerationPanel.tsx  # Main generation sidebar
            PromptInput.tsx      # Prompt textarea
            RefImageDrop.tsx     # Reference image drop zone
            ResolutionPicker.tsx # Resolution/aspect ratio selector
            QueueStatus.tsx      # Queue and progress display
          viewer/                # Canvas-based image viewer
            CanvasViewer.tsx     # Canvas rendering of full-size images
          info/                  # Info/metadata panel
            InfoPanel.tsx        # File info + generation parameters
          layout/                # Application shell
            AppLayout.tsx        # Main layout scaffold
            TitleBar.tsx         # Custom title bar (frameless window)
            StatusBar.tsx        # Bottom bar: engine status, queue count
        hooks/                   # Custom React hooks
          useLibrary.ts          # Library data fetching, filtering, pagination
          useGeneration.ts       # Generation dispatch, progress subscription
          useEngine.ts           # Engine status subscription
          useQueue.ts            # Queue state subscription
          useMediaViewer.ts      # Loupe navigation, zoom, canvas control
        lib/
          utils.ts               # shadcn utility (cn function)
          ipc.ts                 # Typed wrapper around preload API
          constants.ts           # Resolution presets, aspect ratios, defaults
        stores/                  # State management (Zustand)
          library-store.ts       # Current filter, sort, selection state
          generation-store.ts    # Current generation form state
          engine-store.ts        # Engine/model load status
          queue-store.ts         # Active queue items
  resources/                     # Electron static assets, icons
  electron.vite.config.ts        # electron-vite configuration
  components.json                # shadcn/ui configuration
  package.json
  tsconfig.json
  tsconfig.app.json
```

### 3.3 Key Architectural Decisions

**State management: Zustand.** Lightweight, no boilerplate, works naturally with React 19. Stores live in the renderer; the main process is the source of truth via IPC. Renderer stores are hydrated on app start and updated via IPC event subscriptions.

**Database in main process only.** The renderer never touches SQLite directly. All data access goes through IPC calls to main-process repository functions. This enforces a clean boundary, avoids native module issues in the renderer, and makes the data layer easy to test independently.

**Canvas for image display.** Full-size images in loupe view render to an HTML `<canvas>` element. This is a deliberate architectural investment: when non-destructive WebGL adjustments are added later, the canvas is already the rendering surface. For the MVP, canvas simply draws the decoded image.

**Virtualized grid.** The thumbnail grid must handle thousands of items. Use a virtualization library (e.g., `@tanstack/react-virtual`) to render only visible rows. Thumbnails are pre-generated at a fixed size and stored on disk alongside originals.

**Serial GPU queue.** cn-engine processes one generation at a time. The queue manager in the main process accepts generation requests, persists them to the queue table, and feeds them to the engine one by one. This also anticipates future API-based generation which can run concurrently alongside local jobs.

**Engine as managed child process.** `EngineManager` spawns cn-engine, handles its lifecycle (start, health check, crash recovery), and owns the stdin/stdout communication. The engine stays alive for the duration of the application. Models remain loaded in VRAM between generations.

**File-based media storage.** All media files live under a configurable root directory (`library_root`). The database stores relative paths. Thumbnails are stored in a parallel `thumbnails/` directory. This makes the library portable and backup-friendly.

**Model identity system.** A `base_models` table maps canonical model identities (e.g., "FLUX.2 Klein 9B") to an ID. All generation records reference this canonical ID regardless of what a provider calls the model. This enables correct filtering/grouping even when the same model is accessed via different providers or filenames in the future.

---

## 4. UI/UX Specification

### 4.1 Application Layout

The application uses a single-window layout with three main zones:

```
+--------------------------------------------------------------+
|  Title Bar (custom, frameless)                                |
+--------------------------------------------------------------+
|                    |                                          |
|                    |                                          |
|   Generation       |          Library View                   |
|   Panel            |          (Grid or Loupe)                |
|   (left sidebar)   |                                          |
|                    |                                          |
|   ~320px fixed     |          Flexible                       |
|   Collapsible      |                                          |
|                    |                                          |
|                    +------------------------------------------+
|                    |          Info Panel (right sidebar)      |
|                    |          ~300px, collapsible             |
+--------------------+------------------------------------------+
|  Status Bar                                                   |
+--------------------------------------------------------------+
```

**Title Bar:** Custom frameless window title bar with window controls (minimize, maximize, close). Displays app name. Drag region for window movement.

**Generation Panel (left):** Fixed-width collapsible sidebar (~320px). Contains all generation controls. Collapses to a thin icon strip or hides completely. Toggle via keyboard shortcut or button.

**Library View (center):** The dominant area. Switches between grid view and loupe view. Takes all remaining horizontal space.

**Info Panel (right):** Collapsible sidebar (~300px). Shows metadata for the selected/viewed media item. Toggle via keyboard shortcut or button.

**Status Bar (bottom):** Thin persistent bar showing engine status (model loaded/unloaded, loading), active generation progress, and queue depth.

### 4.2 Generation Panel

The generation panel is the primary interface for creating new images.

#### Layout (top to bottom)

1. **Prompt Input**
   - shadcn `Textarea` -- multi-line, resizable vertically.
   - Placeholder text: "Describe what you want to see..."
   - No character limit enforced in UI (cn-engine handles truncation).

2. **Reference Images Area**
   - Drop zone that accepts:
     - Drag and drop from the library grid/loupe.
     - Drag and drop from OS file explorer.
     - Click to open file picker.
   - Displays thumbnails of added reference images in a horizontal row.
   - Each reference image has a remove button (X).
   - When reference images are present, mode is implicitly "image to image."
   - When empty, mode is implicitly "text to image."
   - Images are automatically downscaled to 1MP before being sent to cn-engine. Originals are untouched. Downscaled copies are temporary files.

3. **Resolution & Aspect Ratio**
   - **Resolution:** shadcn `Select` dropdown with presets: 512px, 1024px. The value represents the long edge.
   - **Aspect Ratio:** shadcn `ToggleGroup` with common presets:
     - 1:1 (square)
     - 3:2 (landscape photo)
     - 2:3 (portrait photo)
     - 16:9 (widescreen)
     - 9:16 (vertical video)
     - 4:5 (social portrait)
   - Actual pixel dimensions are computed from long-edge resolution + aspect ratio and displayed as a subtle label (e.g., "1024 x 682").

4. **Generate Button**
   - Full-width primary button. "Generate" label.
   - Disabled when: no prompt text, or engine not ready.
   - On click: dispatches generation request to queue.

5. **Queue / Progress Area**
   - Appears below the generate button when items are queued or generating.
   - Active generation shows:
     - Phase label (Loading model, Conditioning, Sampling, Saving).
     - Step progress bar (e.g., step 2/4) during sampling phase.
     - Elapsed time.
   - Queue count badge when items are waiting.
   - Queued items listed with prompt snippet and cancel button.

#### shadcn Components Used

| Element | Component |
|---------|-----------|
| Prompt input | `Textarea` |
| Resolution select | `Select` |
| Aspect ratio | `ToggleGroup` + `Toggle` |
| Generate button | `Button` |
| Progress | `Progress` |
| Queue items | `Card`, `Badge` |
| Reference image remove | `Button` (icon, ghost variant) |
| Tooltips on controls | `Tooltip` |

### 4.3 Library View -- Grid Mode

The default view. A responsive grid of image thumbnails.

#### Behavior

- Thumbnails are square-cropped for uniform grid appearance.
- Grid columns adjust based on available width. User can adjust thumbnail size via a slider in the filter bar (zoom control).
- Virtualized rendering: only thumbnails in/near the viewport are rendered.
- Click a thumbnail to select it (shows info in the Info Panel).
- Double-click a thumbnail to enter loupe view.
- Keyboard: arrow keys navigate selection, Enter opens loupe, number keys 1-5 set rating, P selects, X rejects, U clears status.
- Drag a thumbnail to the generation panel's reference image area to use it as img2img input.
- Newly generated images appear at the top of the grid (sorted by creation date, newest first by default).

#### Filter Bar

Horizontal bar above the grid.

| Filter | Component | Values |
|--------|-----------|--------|
| Rating | `ToggleGroup` (star icons) | 1-5 stars, "and above" logic |
| Status | `ToggleGroup` | Selected, Rejected, None, All |
| Media Type | `ToggleGroup` | Images (MVP: only option) |
| Sort | `Select` | Date created (desc/asc), Rating (desc/asc) |
| Thumbnail size | `Slider` | Controls grid column count / thumbnail size |

Also includes:
- Import button: opens file picker to import images.
- Count label: "342 images" (filtered count / total count).

#### shadcn Components Used

| Element | Component |
|---------|-----------|
| Filter controls | `ToggleGroup`, `Toggle`, `Select`, `Slider` |
| Thumbnail container | Custom (virtualized grid) |
| Context menu on thumbnail | `ContextMenu` |
| Import button | `Button` |
| Empty state | `Empty` |

### 4.4 Library View -- Loupe Mode

Full-size image viewing for browsing and culling.

#### Layout

```
+--------------------------------------------------------------+
|                                                               |
|                                                               |
|                    Canvas Viewer                              |
|                    (full-size image)                          |
|                                                               |
|                                                               |
+--------------------------------------------------------------+
|  [ < ] [thumb] [thumb] [thumb] [thumb] [thumb] [thumb] [ > ] |
+--------------------------------------------------------------+
```

#### Behavior

- **Canvas Viewer:** Renders the selected image on an HTML `<canvas>` element at full resolution, fit-to-view by default.
- **Film Strip:** Horizontal scrollable row of thumbnails at the bottom. The current image is highlighted. Click a thumbnail to navigate to it. Scroll to navigate. Respects the current filter state -- only filtered images appear in the strip.
- **Navigation:**
  - Left/Right arrow keys move to previous/next image.
  - Film strip click navigates directly.
  - Escape returns to grid view.
- **Culling shortcuts (same as grid):**
  - 1-5: Set star rating.
  - P: Set status to "Selected."
  - X: Set status to "Rejected."
  - U: Clear status.
  - These update immediately and the canvas shows a brief overlay confirmation (e.g., a momentary star icon flash).
- **Zoom:** Scroll wheel zooms in/out on the canvas. Click-drag pans when zoomed. Double-click resets to fit-to-view. Zoom level displayed subtly.
- The Info Panel (right sidebar) stays visible and updates in real time as the user navigates.

#### shadcn Components Used

| Element | Component |
|---------|-----------|
| Film strip thumbnails | `ScrollArea` (horizontal) |
| Navigation arrows | `Button` (icon, ghost) |
| Rating overlay | `Badge` (momentary) |
| Zoom indicator | `Badge` |

### 4.5 Info Panel

Displays metadata for the currently selected or viewed media item.

#### Sections

1. **File Info**
   - Filename, dimensions, file size, creation date.
   - Origin badge: "Generated" or "Imported."

2. **Rating & Status**
   - Interactive star rating (click to set).
   - Status toggle: Selected / Rejected / Clear.

3. **Generation Parameters** (only for generated media)
   - Prompt (full text, scrollable).
   - Model name (canonical).
   - Resolution, seed, steps, guidance, sampling method.
   - Reference images (clickable thumbnails -- navigates to that media if it exists in library; shows thumbnail even if source was deleted).
   - Generation time.

#### shadcn Components Used

| Element | Component |
|---------|-----------|
| Section headers | Typography / `Separator` |
| Metadata rows | Custom key-value pairs |
| Star rating | Custom (5 star icons, interactive) |
| Status toggle | `ToggleGroup` |
| Prompt display | `ScrollArea` |
| Reference image thumbnails | `Avatar` or thumbnail component |
| Collapsible sections | `Collapsible` |

### 4.6 Status Bar

Persistent thin bar at the bottom of the window.

**Left side:**
- Engine status indicator: colored dot + label.
  - Green: "Model loaded" (with model name).
  - Yellow: "Loading model..."
  - Gray: "Engine idle" (running but no model loaded).
  - Red: "Engine error" (crashed or failed to start).

**Center:**
- Active generation: phase label + mini progress bar + elapsed time.
- Shown only when a generation is in progress.

**Right side:**
- Queue depth badge: "3 in queue" (hidden when empty).

#### shadcn Components Used

| Element | Component |
|---------|-----------|
| Status dot | Custom (tiny colored circle) |
| Progress | `Progress` (slim variant) |
| Queue badge | `Badge` |

### 4.7 Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Toggle generation panel | `Ctrl/Cmd + G` |
| Toggle info panel | `Ctrl/Cmd + I` |
| Switch to grid view | `Ctrl/Cmd + 1` or `G` (when not in text input) |
| Switch to loupe view | `Enter` or `Ctrl/Cmd + 2` |
| Return to grid from loupe | `Escape` |
| Previous image (loupe) | `Left Arrow` |
| Next image (loupe) | `Right Arrow` |
| Rate 1-5 stars | `1` - `5` |
| Set status: Selected | `P` |
| Set status: Rejected | `X` |
| Clear status | `U` |
| Import images | `Ctrl/Cmd + Shift + I` |
| Focus prompt input | `Ctrl/Cmd + K` |
| Generate | `Ctrl/Cmd + Enter` (when prompt focused) |
| Delete selected media | `Delete` (with confirmation dialog) |

### 4.8 Drag and Drop

| Source | Target | Action |
|--------|--------|--------|
| Library grid thumbnail | Generation panel ref image area | Add as reference image for img2img |
| Library loupe current image | Generation panel ref image area | Add as reference image for img2img |
| OS file explorer (images) | Library grid area | Import images to library |
| OS file explorer (images) | Generation panel ref image area | Add as reference image (also imports to library) |

### 4.9 Responsive Behavior

The application has minimum window dimensions (e.g., 960x600). Within that:

- Generation panel: fixed width when open, fully collapsible.
- Info panel: fixed width when open, fully collapsible.
- Library grid: fluid, adjusts columns.
- Loupe: fluid, image scales to fit.
- Panels remember their open/closed state across sessions (persisted to user config).

---

## 5. Main Process Modules

### 5.1 Database Layer

#### Technology

**better-sqlite3** -- synchronous SQLite access in the main process. Synchronous access is appropriate here because:
- All DB operations are fast (indexed lookups, small writes).
- Main process DB calls are invoked by IPC handlers which are already async from the renderer's perspective.
- Simpler code, no callback/promise overhead for trivial queries.

#### Migrations

SQL migration files in `src/main/db/migrations/`, named with sequential numbering:
```
001_initial.sql
002_add_xxx.sql
```

On app startup, the migration runner applies any unapplied migrations. Migration state tracked in a `_migrations` table.

#### Repositories

Each domain entity gets a repository module that encapsulates all SQL for that entity. Repositories export plain functions (not classes) that accept the database instance.

### 5.2 Engine Manager

Manages the cn-engine child process lifecycle.

#### Responsibilities

- **Spawn** cn-engine on app startup. Locate the binary relative to the app's resources directory (packaged) or a configured path (development).
- **Health check** via `ping` command after spawn.
- **Model loading** via `load` command. Tracks loaded model state.
- **Generation dispatch** via `generate` command. Streams progress events back to the renderer via IPC.
- **Crash recovery:** If the engine process exits unexpectedly, attempt to restart it. Emit error state to renderer. Re-load the previously loaded model if possible.
- **Graceful shutdown** via `quit` command on app exit. Kill the process if it doesn't exit within a timeout.

#### NDJSON Protocol Handling

The `EngineProtocol` module handles:
- Writing JSON commands to stdin (newline-terminated).
- Reading and parsing NDJSON responses from stdout line-by-line.
- Routing responses by `id` to the corresponding request's callback/promise.
- Routing `progress` messages by `id` to the correct generation's event stream.
- All stderr output is logged (captured for debugging but not parsed as protocol).

#### IPC Events (Engine -> Renderer)

| Channel | Payload | Description |
|---------|---------|-------------|
| `engine:status` | `{ state, modelName?, error? }` | Engine state changes |
| `engine:progress` | `{ jobId, phase, step?, totalSteps?, message? }` | Generation progress |
| `engine:result` | `{ jobId, success, outputPath?, error? }` | Generation complete |

### 5.3 Queue Manager

Manages a persistent queue of generation jobs.

#### Behavior

1. Renderer submits a generation request via IPC.
2. Queue manager creates a `queue` record (status: `pending`) and a `generation` record.
3. Queue manager checks if the engine is idle. If so, dequeues the next pending job and sends `generate` to the engine.
4. On generation complete/error, updates the queue record status, creates/updates the `media` record (on success), and dequeues the next job.
5. Queue state changes are broadcast to the renderer via IPC.

Jobs are processed serially for local generation (one GPU job at a time). The architecture supports adding concurrent API-based jobs later by checking the job's provider type.

#### Queue Record Lifecycle

```
pending -> processing -> completed
                     -> failed
pending -> cancelled
```

### 5.4 File Manager

Manages the media file system.

#### Library Root

A configurable root directory (default: `~/Distillery/Library/`). All media paths in the database are relative to this root.

```
~/Distillery/
  Library/
    originals/           # Full-size generated/imported images
      2025/
        01/
          <uuid>.png
    thumbnails/          # Pre-generated square-crop thumbnails
      <uuid>_thumb.jpg
    ref_cache/           # Downsized reference images for cn-engine
      <hash>.png
```

#### File Operations

- **Store generated image:** cn-engine writes output to a temp path. File manager moves it to `originals/YYYY/MM/<uuid>.png`.
- **Generate thumbnail:** Uses `sharp` (native Node module) to create a square-cropped JPEG thumbnail at a standard size (e.g., 400x400). Stored in `thumbnails/`.
- **Import images:** Copies source file to `originals/`, generates thumbnail, creates `media` record.
- **Prepare reference image:** Downscale to 1MP, write to `ref_cache/`, return path for cn-engine.
- **Reference thumbnail persistence:** When a generation uses reference images, copy their current thumbnails to a `ref_thumbnails/` area keyed by generation ID. These persist even if the source media is deleted.

---

## 6. Renderer Architecture

### 6.1 State Management

**Zustand** stores in the renderer, organized by domain:

| Store | State | Sources |
|-------|-------|---------|
| `library-store` | filter/sort settings, selected media ID, view mode (grid/loupe), thumbnail size, media list (paginated) | IPC queries to main process |
| `generation-store` | prompt text, reference images, resolution, aspect ratio | Local (renderer-only until generate is clicked) |
| `engine-store` | engine state, loaded model name, error info | IPC events from main process |
| `queue-store` | queue items, active job progress | IPC events from main process |

Stores subscribe to IPC events for real-time updates (engine status, generation progress, queue changes). When the user modifies library data (rating, status), the store calls an IPC mutation and optimistically updates local state.

### 6.2 IPC Communication

All renderer-to-main communication goes through a typed API exposed via `contextBridge` in the preload script.

```typescript
// Preload exposes this on window.api
interface DistilleryAPI {
  // Library
  getMedia(params: MediaQuery): Promise<MediaPage>;
  getMediaById(id: string): Promise<MediaRecord | null>;
  updateMedia(id: string, updates: MediaUpdate): Promise<void>;
  deleteMedia(ids: string[]): Promise<void>;
  importMedia(filePaths: string[]): Promise<MediaRecord[]>;

  // Generation
  submitGeneration(params: GenerationParams): Promise<string>; // returns job ID
  cancelGeneration(jobId: string): Promise<void>;

  // Engine
  getEngineStatus(): Promise<EngineStatus>;
  loadModel(params: ModelLoadParams): Promise<void>;
  unloadModel(): Promise<void>;

  // Queue
  getQueue(): Promise<QueueItem[]>;

  // Events (renderer subscribes)
  on(channel: string, callback: Function): () => void; // returns unsubscribe
}
```

### 6.3 Library Data Flow

```
User applies filter
  -> library-store updates filter state
  -> calls window.api.getMedia({ filters, sort, page })
  -> main process queries SQLite
  -> returns MediaPage { items, total, page }
  -> library-store updates media list
  -> Grid/Loupe re-renders

User rates an image
  -> calls window.api.updateMedia(id, { rating: 4 })
  -> library-store optimistically updates local item
  -> main process updates SQLite
  -> if in filtered view and item no longer matches, it's removed on next query
```

### 6.4 Generation Data Flow

```
User fills prompt, drops reference images, picks resolution
  -> generation-store holds form state locally

User clicks Generate
  -> renderer calls window.api.submitGeneration({
       prompt, refImageIds, resolution, aspectRatio
     })
  -> main process:
       1. Downsizes reference images to ref_cache/ if needed
       2. Creates generation record in DB
       3. Creates queue record in DB
       4. Broadcasts queue:updated event
       5. If engine idle, dequeues and sends to cn-engine
  -> renderer receives queue:updated, updates queue-store

Engine streams progress
  -> main process receives NDJSON progress lines
  -> broadcasts engine:progress events via IPC
  -> renderer queue-store updates active job progress
  -> GenerationPanel re-renders progress bar

Engine completes
  -> main process receives NDJSON result
  -> moves output file to library originals/
  -> generates thumbnail
  -> creates media record in DB (linked to generation)
  -> updates queue record status
  -> broadcasts engine:result + queue:updated + library:updated
  -> renderer library-store prepends new image to grid
  -> renderer queue-store removes completed job
  -> next queued job (if any) is dequeued automatically
```

---

## 7. Database Schema

### Tables

#### `media`

The core table. One row per media file in the library.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `file_path` | TEXT NOT NULL | Relative path from library root (e.g., `originals/2025/01/abc.png`) |
| `thumb_path` | TEXT | Relative path to thumbnail |
| `file_name` | TEXT NOT NULL | Display name |
| `media_type` | TEXT NOT NULL | `image` (future: `video`, etc.) |
| `origin` | TEXT NOT NULL | `generation`, `import` (future: `duplicate`, `sketch`) |
| `width` | INTEGER | Pixel width |
| `height` | INTEGER | Pixel height |
| `file_size` | INTEGER | Bytes |
| `rating` | INTEGER | 0-5 (0 = unrated) |
| `status` | TEXT | `selected`, `rejected`, or NULL |
| `generation_id` | TEXT FK | Links to the generation that created this media (NULL for imports) |
| `created_at` | TEXT NOT NULL | ISO 8601 timestamp |
| `updated_at` | TEXT NOT NULL | ISO 8601 timestamp |

Indexes: `origin`, `rating`, `status`, `media_type`, `created_at`, `generation_id`.

#### `generations`

One row per generation job that completed (successfully or not).

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `base_model_id` | TEXT FK | References `base_models.id` |
| `provider` | TEXT NOT NULL | `local` (future: API provider name) |
| `model_file` | TEXT | Filename of the model used (for local) |
| `prompt` | TEXT | Full prompt text |
| `width` | INTEGER | Output width in pixels |
| `height` | INTEGER | Output height in pixels |
| `seed` | INTEGER | Seed used (random if not specified) |
| `steps` | INTEGER | Inference steps |
| `guidance` | REAL | Guidance scale |
| `sampling_method` | TEXT | e.g., `euler` |
| `params_json` | TEXT | JSON blob for all other/future parameters |
| `status` | TEXT NOT NULL | `completed`, `failed` |
| `total_time_ms` | INTEGER | Total generation time |
| `prompt_cache_hit` | INTEGER | 0 or 1 |
| `ref_latent_cache_hit` | INTEGER | 0 or 1 |
| `created_at` | TEXT NOT NULL | ISO 8601 |

#### `generation_inputs`

Links generations to their input reference images. Persists thumbnails for deleted source media.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `generation_id` | TEXT FK NOT NULL | References `generations.id` |
| `media_id` | TEXT FK | References `media.id` (NULL if source deleted) |
| `position` | INTEGER NOT NULL | Order of the input image (0-indexed) |
| `thumb_path` | TEXT NOT NULL | Persisted thumbnail path (survives source deletion) |
| `created_at` | TEXT NOT NULL | ISO 8601 |

#### `base_models`

Canonical model identities. Decouples model naming from providers.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL UNIQUE | Canonical name, e.g., "FLUX.2 Klein 4B", "FLUX.2 Klein 9B" |
| `family` | TEXT NOT NULL | Model family, e.g., "FLUX.2 Klein" |
| `media_type` | TEXT NOT NULL | `image` (future: `video`) |
| `created_at` | TEXT NOT NULL | ISO 8601 |

Seeded with initial data for FLUX.2 Klein 4B and 9B on first migration.

#### `queue`

Persistent job queue for generation tasks.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `generation_id` | TEXT FK NOT NULL | References `generations.id` |
| `status` | TEXT NOT NULL | `pending`, `processing`, `completed`, `failed`, `cancelled` |
| `priority` | INTEGER NOT NULL DEFAULT 0 | Higher = sooner (for future use) |
| `error_message` | TEXT | Error details if failed |
| `created_at` | TEXT NOT NULL | ISO 8601 |
| `started_at` | TEXT | When processing began |
| `completed_at` | TEXT | When processing finished |

Index: `status`, `priority`, `created_at`.

#### `app_settings`

Key-value store for application settings.

| Column | Type | Description |
|--------|------|-------------|
| `key` | TEXT PK | Setting name |
| `value` | TEXT | JSON-encoded value |

Used for: library root path, last loaded model path, panel visibility states, thumbnail size preference, window dimensions, etc.

### ER Diagram (MVP)

```
base_models
    |
    | 1:N
    v
generations -----> media (output, via media.generation_id)
    |
    | 1:N
    v
generation_inputs -----> media (input reference, nullable FK)

queue -----> generations (1:1)
```

### Future Schema Considerations

The schema is designed to accommodate these additions without breaking changes:

- **Collections:** New `collections` and `collection_media` (junction) tables. No changes to `media`.
- **Keywords:** New `keywords` and `media_keywords` (junction) tables.
- **Lineage:** Already partially supported via `generation_inputs` linking to `media`. Full lineage traversal walks the chain: media -> generation_id -> generation_inputs -> media_id -> that media's generation_id -> etc.
- **Non-destructive edits:** New `adjustments` table linked to `media.id`. Edit state stored as JSON.
- **Upscaling:** New `upscale_versions` table linked to `media.id`. Multiple versions per media item.
- **Video:** `media_type` column already supports it. Video-specific metadata goes in a `video_meta` table.
- **API providers:** New `providers` table. `generations.provider` already stores the provider name. `base_models` already decouples model identity from provider naming.

---

## 8. cn-engine Integration

### 8.1 Binary Location

- **Development:** Configured path via environment variable or `app_settings` (e.g., `C:\Users\jason\condenser.cpp\build\bin\cn-engine.exe`).
- **Production (packaged):** Bundled in Electron's `resources/` directory, platform-specific binary. Path resolved via `app.getPath('appPath')`.

### 8.2 Model Files Location

- **Development:** Configured path via `app_settings`.
- **Production:** A models directory, e.g., `~/Distillery/Models/`. The app needs paths to three files:
  - Diffusion model GGUF (e.g., `flux2-klein-Q5_K.gguf`)
  - VAE safetensors (e.g., `ae.safetensors`)
  - LLM GGUF (e.g., `qwen3-4b-q8_0.gguf`)

For MVP, the user configures these paths in a settings dialog, or they're auto-detected from a known directory.

### 8.3 Command Flow

#### App Startup
```
1. EngineManager spawns cn-engine
2. EngineManager sends: {"cmd":"ping","id":"health-1"}
3. Engine responds: {"id":"health-1","type":"ok","data":{"status":"pong"}}
4. EngineManager sends load command with configured model paths:
   {"cmd":"load","id":"load-1","params":{
     "diffusion_model": "/path/to/model.gguf",
     "vae": "/path/to/ae.safetensors",
     "llm": "/path/to/qwen.gguf",
     "offload_to_cpu": true,
     "flash_attn": true
   }}
5. Engine responds with load confirmation + load_time_ms
6. EngineManager broadcasts engine:status { state: "ready", modelName: "..." }
```

#### Generation
```
1. QueueManager dequeues job, sends to EngineManager
2. EngineManager sends:
   {"cmd":"generate","id":"gen-<uuid>","params":{
     "prompt": "a sunset over mountains",
     "width": 1024, "height": 1024,
     "seed": -1,
     "steps": 4,
     "guidance": 3.5,
     "sampling_method": "euler",
     "ref_images": ["/path/to/ref_cache/abc.png"],
     "output": "/tmp/distillery/gen-<uuid>.png",
     "use_prompt_cache": true,
     "use_ref_latent_cache": true
   }}
3. Engine streams progress (conditioning, encoding, sampling steps, saving)
4. Engine sends result with output path, timing, cache hit info
5. EngineManager notifies QueueManager of completion
6. QueueManager triggers FileManager to move output, generate thumbnail, create media record
```

#### App Shutdown
```
1. EngineManager sends: {"cmd":"quit","id":"quit-1"}
2. Engine responds and exits
3. If engine doesn't exit within 5s, EngineManager kills the process
```

### 8.4 Seed Handling

For MVP, seeds are always random. The renderer sends `seed: -1` (or omits the field), and cn-engine generates a random seed. The actual seed used is returned in the result and stored in the `generations` table for reproducibility.

### 8.5 Default Generation Parameters

| Parameter | Default | Notes |
|-----------|---------|-------|
| `steps` | 4 | FLUX.2 Klein is optimized for 4 steps |
| `guidance` | 3.5 | Default guidance scale |
| `sampling_method` | `euler` | Standard for Klein |
| `use_prompt_cache` | true | Always on |
| `use_ref_latent_cache` | true | Always on |
| `offload_to_cpu` | true | Safe default for most GPUs |
| `flash_attn` | true | Enable where supported |

These defaults are stored in `constants.ts` and can be overridden in settings (future: exposed in advanced controls).

---

## 9. Performance Considerations

### 9.1 Thumbnail Grid

- **Virtualization:** Only render thumbnails visible in the viewport plus a buffer zone. Use `@tanstack/react-virtual` for row virtualization.
- **Thumbnail size:** Pre-generate at 400x400 JPEG. This balances quality at maximum zoom with file size (~20-40KB each). 10,000 thumbnails = ~200-400MB on disk.
- **Image loading:** Use `<img>` elements with `loading="lazy"` within the virtual grid. Thumbnails load from local disk (file:// protocol or Electron's custom protocol), which is effectively instant.
- **Database pagination:** Library queries use cursor-based pagination. Initial load fetches the first page (e.g., 200 items). Scrolling triggers fetching additional pages.

### 9.2 Loupe View

- **Canvas rendering:** Decode the full image using `createImageBitmap()` and draw to canvas. This is GPU-accelerated in Chromium.
- **Pre-loading:** When navigating in loupe view, pre-load the next and previous images in the background to eliminate visible loading lag.
- **Memory:** Keep at most 3 full-size images decoded in memory (current, next, previous). Release others.

### 9.3 Engine Communication

- **Unbuffered stdout:** cn-engine already uses `setvbuf(stdout, NULL, _IONBF, 0)`. Progress lines arrive immediately.
- **Line buffering in Node:** Read stdout with a line-based transform stream to correctly split NDJSON messages.

---

## 10. Packaging and Distribution

### 10.1 Electron Builder / Electron Forge

Use electron-builder for packaging. Platform-specific builds:

| Platform | Format | cn-engine binary |
|----------|--------|-----------------|
| Windows | NSIS installer (.exe) | `cn-engine.exe` (Vulkan or CUDA build) |
| macOS | DMG | `cn-engine` (Metal build) |
| Linux | AppImage / .deb | `cn-engine` (Vulkan build) |

The cn-engine binary is placed in the app's `resources/bin/` directory and code-signed with the rest of the app.

### 10.2 Model Distribution

Models are NOT bundled with the app (they're 4-9GB). For MVP, the user downloads models separately and points the app at them. The settings dialog allows configuring model file paths.

---

## 11. Development Phases

### Phase 1: Spec (current)
Finalize this document.

### Phase 2: Scaffolding
- Initialize electron-vite project with React 19 + TypeScript.
- Configure Tailwind 4, shadcn/ui (Nova style, cyan theme, dark mode).
- Set up SQLite with better-sqlite3, migration runner, initial schema.
- Implement EngineManager (spawn, ping, load, quit lifecycle).
- Implement basic IPC layer with typed API.
- Establish directory structure and module boundaries.

### Phase 3: UI Prototype
- Build AppLayout with generation panel, library area, info panel, status bar.
- Build Grid view with mock data (no real images yet).
- Build Loupe view with canvas rendering and film strip navigation.
- Build Generation panel UI (prompt, reference images, resolution, generate button).
- Build Filter bar.
- Build Info panel.
- Validate layout, navigation flow, and keyboard shortcuts.
- All UI is non-functional (no real data, no generation).

### Phase 4: Wire Up
- Connect generation panel to EngineManager via IPC. User can generate an image.
- Connect queue system. Progress displays in real time.
- Generated images appear in library automatically.
- Import functionality works.
- Filtering, rating, and status changes work.
- Drag-and-drop from library to generation panel works.
- Loupe navigation works with real data.
- Info panel shows real metadata.

### Phase 5: Polish
- Error handling and edge cases (engine crash recovery, disk full, invalid images).
- Loading states and skeletons.
- Settings dialog (model paths, library root).
- Keyboard shortcut refinement.
- Window state persistence (size, position, panel visibility).
- Performance profiling and optimization.
- Platform testing (Windows, macOS, Linux).

---

## 12. shadcn/ui Component Inventory

Components from the shadcn/ui library used in Distillery MVP:

| Component | Usage |
|-----------|-------|
| `Badge` | Status labels, queue count, zoom level |
| `Button` | Generate, import, navigation, actions |
| `Card` | Queue items, reference image containers |
| `Collapsible` | Info panel sections |
| `ContextMenu` | Right-click on grid thumbnails |
| `Dialog` | Delete confirmation, settings |
| `Empty` | Empty library state |
| `Progress` | Generation progress bar |
| `ScrollArea` | Film strip, info panel, prompt display |
| `Select` | Resolution picker, sort order |
| `Separator` | Section dividers |
| `Slider` | Thumbnail size control |
| `Textarea` | Prompt input |
| `Toggle` | Individual filter options |
| `ToggleGroup` | Aspect ratio, status filter, rating filter |
| `Tooltip` | Control descriptions, keyboard shortcut hints |

---

## 13. Open Questions / Decisions for Phase 2

1. **Zustand vs. alternative:** Zustand is proposed for simplicity. Confirm or substitute. (Jotai and Valtio are alternatives in the same weight class.)
2. **sharp for thumbnails:** sharp is the standard choice for Node.js image processing but requires native compilation. Confirm it's acceptable for all target platforms, or consider Electron's built-in `nativeImage` for simpler operations.
3. **First-run model setup:** For MVP, how should the user specify model paths on first run? A setup wizard, a settings dialog, or auto-detection from a known directory?
4. **Custom title bar:** Frameless window with custom title bar gives the most polished look but requires manual implementation of drag regions, window controls per platform. Confirm this is desired vs. native title bar.
5. **Electron protocol for thumbnails:** Use a custom Electron protocol (e.g., `media://`) to serve local files to the renderer securely, or use `file://` with appropriate CSP settings?

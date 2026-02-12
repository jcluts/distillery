# Distillery MVP Specification

## 1. Overview

Distillery is a desktop application for local AI image generation and media management, built on top of [condenser.cpp](https://github.com/jcluts/condenser.cpp). It targets creative professionals -- creative directors, graphic designers, product owners, production artists -- who need generative AI tools but are underserved by existing web-based offerings.

**Core ethos:** "It just works." Media-forward, not tech-forward. The library is the product; generation is one way media enters it.

**MVP scope:** Local image generation via FLUX.2 Klein, a performant media library with culling and browsing workflows, generation timeline/history, and import support. The architecture anticipates future features (video, API providers, non-destructive editing, upscaling, collections) without implementing them.

**Context:** This is a ground-up rewrite of an existing prototype (simple-ai-client). The V1 validated the UI/UX patterns and architecture but suffers from accumulated tech debt (vanilla JS origins, no CSS framework, 328 files of organically grown code). This rewrite ports the proven design decisions onto a clean foundation with shadcn/ui for consistent component styling.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Shell | Electron (Windows, macOS, Linux) |
| Bundler | electron-vite |
| Renderer | React 19, TypeScript |
| Styling | Tailwind CSS 4, shadcn/ui (Radix Nova, neutral base, cyan theme, Inter font, small radius) |
| State | Zustand |
| Virtualization | @tanstack/react-virtual |
| Database | SQLite via better-sqlite3 (main process) |
| Inference | cn-engine (condenser.cpp) -- child process, NDJSON-over-stdio |
| Image Processing | sharp (thumbnails, reference image downscaling) |
| Image Display | HTML Canvas (future: WebGL for adjustments) |
| Icons | Lucide React |

**shadcn/ui source of truth:** https://ui.shadcn.com/docs

Distillery treats shadcn/ui as **source-in** components (generated into the repo). When in doubt, prefer the patterns and component APIs from the docs above over older blog posts or third-party snippets.

### shadcn/ui Configuration

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "radix-nova",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/renderer/assets/main.css",
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

Dark mode only for MVP. The cyan theme accent provides a professional, photography-tool aesthetic that differentiates from the warm/orange tones of most creative tools and the blue tones of developer tools.

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
|  +------------------+                                      |
|  |  Timeline Service|                                      |
|  |  (gen history)   |                                      |
|  +------------------+                                      |
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
|  |  Left Panel          |  |  Library View            |    |
|  |  (tabbed: Generate,  |  |  (Grid / Loupe)          |    |
|  |   Timeline, Import)  |  |                          |    |
|  +---------------------+  +--------------------------+    |
|                            |                              |
|                            |  +--------------------------+|
|                            |  |  Right Panel (tabbed:    ||
|                            |  |   Info, Generation)      ||
|                            |  +--------------------------+|
|  +----------------------------------------------------+  |
|  |  Status Bar (engine status, progress, queue)        |  |
|  +----------------------------------------------------+  |
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
          001_initial.sql
        repositories/            # Data access layer per table
          media.ts
          generations.ts
          generation-inputs.ts
          queue.ts
          models.ts
          settings.ts
      engine/
        engine-manager.ts        # Spawn, lifecycle, reconnect of cn-engine
        engine-protocol.ts       # NDJSON encode/decode, typed message handling
      queue/
        queue-manager.ts         # Job scheduling, serial GPU execution
      files/
        file-manager.ts          # Media storage, path resolution
        thumbnail-service.ts     # sharp-based thumbnail creation
      timeline/
        timeline-service.ts      # Generation history queries, thumbnail mgmt
      ipc/
        handlers/                # ipcMain handlers organized by domain
          library.ts
          generation.ts
          engine.ts
          queue.ts
          timeline.ts
          settings.ts
        channels.ts              # Channel name constants (single source of truth)
    preload/
      index.ts                   # contextBridge API exposure
    renderer/
      main.tsx                 # React entry
      App.tsx                  # Root layout, modal management
      assets/
        main.css               # @import "tailwindcss"; theme overrides
      components/
        ui/                    # shadcn/ui components (auto-generated)
        layout/                # Application shell
          AppLayout.tsx        # Three-panel layout with fixed-width side panels
          StatusBar.tsx        # Bottom bar: engine status, queue count
        left-panel/            # Left sidebar (tabbed)
          LeftPanel.tsx        # Icon tab bar + panel content switcher
          GenerationPanel.tsx  # Generation controls
          TimelinePanel.tsx    # Generation history list
          ImportPanel.tsx      # File import controls
          TimelineCard.tsx     # Single generation history entry
          PromptInput.tsx      # Prompt textarea
          RefImageDrop.tsx     # Reference image drop zone
          ResolutionPicker.tsx # Resolution/aspect ratio selector
          QueueStatus.tsx      # Queue and progress display
        library/               # Library-specific components
          Grid.tsx             # Thumbnail grid (virtualized)
          Loupe.tsx            # Full-size loupe browser
          FilmStrip.tsx        # Horizontal thumbnail strip
          MediaCard.tsx        # Single grid thumbnail
          FilterBar.tsx        # Rating, status, type filters
          CanvasViewer.tsx     # Canvas rendering of full-size images
        right-panel/           # Right sidebar (tabbed)
          RightPanel.tsx       # Icon tab bar + panel content switcher
          MediaInfoSection.tsx # File metadata display
          GenerationInfoSection.tsx # Generation params + lineage
          RatingSection.tsx    # Star rating + status controls
      hooks/                   # Custom React hooks
        useLibrary.ts          # Library data fetching, filtering, pagination
        useGeneration.ts       # Generation dispatch, progress subscription
        useEngine.ts           # Engine status subscription
        useQueue.ts            # Queue state subscription
        useTimeline.ts         # Timeline data + IPC events
        useMediaViewer.ts      # Loupe navigation, zoom, canvas control
        useKeyboardShortcuts.ts # Global keyboard shortcut handler
        useFocusRecovery.ts    # Prevent input focus trapping
      lib/
        utils.ts               # shadcn utility (cn function)
        constants.ts           # Resolution presets, aspect ratios, defaults
      stores/                  # State management (Zustand)
        ui-store.ts            # Panel visibility, active tabs, modals, view mode
        library-store.ts       # Filter/sort state, selected media, media list
        generation-store.ts    # Generation form state + timeline history
        engine-store.ts        # Engine/model load status
        queue-store.ts         # Active queue items + progress
      types/
        index.ts               # Shared type definitions
  resources/                     # Electron static assets, icons
  electron.vite.config.ts        # electron-vite configuration
  components.json                # shadcn/ui configuration
  package.json
  tsconfig.json
  tsconfig.node.json
  tsconfig.web.json
```

### 3.3 Key Architectural Decisions

**State management: Zustand.** Proven in V1 with 20 stores. Lightweight, no boilerplate, works naturally with React 19. Stores live in the renderer; the main process is the source of truth via IPC. Renderer stores are hydrated on app start and updated via IPC event subscriptions.

**Database in main process only.** The renderer never touches SQLite directly. All data access goes through IPC calls to main-process repository functions. This enforces a clean boundary, avoids native module issues in the renderer, and makes the data layer easy to test independently.

**Profiles are isolated by userData.** Distillery supports multiple profiles. On startup, the main process reads a root-level `profiles.json` file and then sets Electron's `userData` path to `.../profiles/<activeProfile>/` before initializing the database or settings. This keeps each profile's SQLite DB and app settings isolated.

**Canvas for image display.** Full-size images in loupe view render to an HTML `<canvas>` element. This is a deliberate architectural investment: when non-destructive WebGL adjustments are added later, the canvas is already the rendering surface. For the MVP, canvas simply draws the decoded image.

**Virtualized grid.** The thumbnail grid must handle thousands of items. Use `@tanstack/react-virtual` for row virtualization. Thumbnails are pre-generated at a fixed size and stored on disk alongside originals.

**Serial GPU queue.** cn-engine processes one generation at a time. The queue manager in the main process accepts generation requests, persists them to the queue table, and feeds them to the engine one by one. The architecture supports adding concurrent API-based jobs later by checking the job's provider type.

**Engine as managed child process.** `EngineManager` spawns cn-engine, handles its lifecycle (start, health check, crash recovery), and owns the stdin/stdout communication. The engine stays alive for the duration of the application. Models remain loaded in VRAM between generations.

**File-based media storage.** All media files live under a configurable root directory (`library_root`). The database stores relative paths. Thumbnails are stored in a parallel `thumbnails/` directory. This makes the library portable and backup-friendly.

**Model identity system.** A `base_models` table maps canonical model identities (e.g., "FLUX.2 Klein 9B") to an ID. All generation records reference this canonical ID regardless of what a provider calls the model. This enables correct filtering/grouping when the same model is accessed via different providers or filenames in the future.

**Modal-driven navigation (no router).** V1 proved that a single-window app with modal-driven navigation (via `useUIStore.openModal/closeModal`) works better than client-side routing for a desktop app. There's one persistent view (Library) with overlaid modals for settings and generation details.

**Tabbed sidebars.** Both left and right panels use an icon tab bar pattern (proven in V1). Clicking an already-active tab collapses the panel. Clicking a different tab switches content. This gives users control over screen real estate without a complex layout manager.

---

## 4. UI/UX Specification

### 4.1 Application Layout

The application uses a single-window layout based on patterns proven in V1. Three zones with persistent icon tab bars on each edge. **Panel widths are fixed (not user-resizable)** to simplify implementation/testing and to allow forms designed to a known width.

```
+--------------------------------------------------------------+
|  Title Bar (custom, frameless)                                |
+--+---+---+---+-----------+-----------------------------------+
|  |   |       |           |                                |  |
|  | G |       |           |                                | i|
|  | T | Panel |           |                                | G|
|  | I | Content           |      Library View              |  |
|  | S |       |           |      (Grid or Loupe)           |  |
|  |   |       |           |                                |  |
|  |   |       |           |                           Panel |  |
|  |   |       |           |                          Content|  |
+--+---+-------+-----------+----------------------------+---+--+
|  Status Bar                                                   |
+--------------------------------------------------------------+

G = Generation tab    i = Info tab
T = Timeline tab      G = Generation info tab
I = Import tab
S = (future: Sketch)
```

**Layout implementation:** A simple fixed-width layout (CSS grid or flex) with two constants controlling the expanded sidebar widths.

**Panel width constants (single source of truth):**
- `LEFT_PANEL_WIDTH_PX = 340`
- `RIGHT_PANEL_WIDTH_PX = 280`

These constants should be defined in one place (e.g., a layout constants module) and used by the layout + sidebars so adjusting widths is a one-line change.

**Title Bar:** Custom frameless window title bar with platform-appropriate window controls (minimize, maximize, close). Drag region for window movement.

**Left Panel (340px, collapsible):** Fixed width when expanded. Icon tab bar on the left edge is always visible (~48px) and included in the 340px width. Panel content area shows the active tab. Tabs: Generation, Timeline, Import. Collapsing hides the content area but keeps the icon strip.

**Library View (center, flexible):** The dominant area. Switches between grid view and loupe view. Takes all remaining horizontal space. Filter bar sits at the top.

**Right Panel (280px, collapsible):** Fixed width when expanded. Icon tab bar on the right edge is always visible (~48px) and included in the 280px width. Panel content shows the active tab. MVP tabs: Media Info, Generation Info. Future tabs appear here as features are added (Adjust, Brush, Remove, Transform, Collections).

**Status Bar (bottom, ~28px):** Thin persistent bar showing engine status, active generation progress, and queue depth.

### 4.2 Left Panel

The left and right panel use the Shadcn Sidebar component, following the "collapsible nested sidebar" block/example for Shadcn's SideBar component.

- Demo/block:
https://ui.shadcn.com/blocks/sidebar#sidebar-09
- That demo code has been copied here:
C:\Users\jason\distillery\docs\collapsible_nested_sidebar

- Docs: 
* https://ui.shadcn.com/docs/components/radix/sidebar
* https://ui.shadcn.com/docs/components/radix/sidebar.md



#### Tab: Generation Panel

The primary interface for creating new images.

**Layout (top to bottom):**

1. **Panel Header**
   - "GENERATION" label, uppercase, small, muted.

2. **Prompt Input**
   - shadcn `Textarea` -- multi-line, resizable vertically.
   - Placeholder text: "Describe what you want to see..."
   - No character limit enforced in UI (cn-engine handles truncation).

3. **Reference Images Area**
   - Drop zone that accepts:
     - Drag and drop from the library grid/loupe.
     - Drag and drop from OS file explorer.
     - Click to open file picker.
   - Displays thumbnails of added reference images in a horizontal row.
   - Each reference image has a remove button (X).
   - When reference images are present, mode is implicitly "image to image."
   - When empty, mode is implicitly "text to image."
   - Images are automatically downscaled to 1MP before being sent to cn-engine. Originals are untouched. Downscaled copies are temporary files.

4. **Resolution & Aspect Ratio**
   - **Resolution:** shadcn `Select` dropdown with presets: 512px, 1024px. The value represents the long edge.
   - **Aspect Ratio:** shadcn `ToggleGroup` with common presets:
     - 1:1 (square)
     - 3:2 / 2:3 (photo landscape/portrait)
     - 16:9 / 9:16 (widescreen/vertical)
     - 4:5 (social portrait)
   - Actual pixel dimensions computed and displayed as subtle label (e.g., "1024 x 682").

5. **Generate Button**
   - Full-width primary `Button`. "Generate" label.
   - Disabled when: no prompt text, or engine not ready.
   - On click: dispatches generation request to queue.

6. **Queue / Progress Area**
   - Appears below the generate button when items are queued or generating.
   - Active generation shows: phase label, step progress bar (e.g., 2/4), elapsed time.
   - Queue count badge when items are waiting.
   - Queued items listed with prompt snippet and cancel button.

#### Tab: Timeline Panel

A scrollable, reverse-chronological list of all generation jobs. This is a key differentiator -- it gives the user a persistent record of every generation, making the creative process feel tangible.

**Layout:**

1. **Panel Header**
   - "TIMELINE" label + active generation count badge.

2. **Timeline Card List** (scrollable)
   - Each card (`TimelineCard`) shows:
     - **Status badge:** Completed (green), Failed (red), Pending/Processing (yellow/animated).
     - **Generation number:** Sequential counter (#47, #48...).
     - **Prompt snippet:** First ~80 characters, truncated.
     - **Model name** (canonical).
     - **Timestamp** (relative: "2 min ago", "Yesterday").
     - **Duration** (e.g., "3.4s").
     - **Output thumbnail(s):** Small preview(s) of generated image(s).
     - **Input thumbnail(s):** Small preview(s) of reference images used.
   - Click a card to open the Generation Detail Modal (see 4.8).
   - Right-click context menu: "Reload settings", "Remove from timeline".
   - Cards for failed generations show error message snippet.

3. **Actions**
   - "Clear completed" button at top or bottom.

**Data source:** The `generations` table, loaded into `generation-store` on app startup. Updated in real-time as new generations complete.

#### Tab: Import Panel

Simple interface for importing images from disk.

1. **Panel Header** - "IMPORT" label.
2. **Drop zone / file picker** - Drag files or click to browse.
3. **Import status** - Count of imported files, any errors.

#### shadcn Components Used (Left Panel)

| Element | Component |
|---------|-----------|
| Panel | `Sidebar` |
| Prompt input | `Textarea` |
| Resolution select | `Select` |
| Aspect ratio | `ToggleGroup` + `Toggle` |
| Generate button | `Button` |
| Progress | `Progress` |
| Queue items | `Card`, `Badge` |
| Reference image remove | `Button` (icon, ghost variant) |
| Timeline cards | `Card` + `Badge` + `Separator` |
| Timeline card context menu | `ContextMenu` |
| Timeline scroll | `ScrollArea` |
| Tooltips | `Tooltip` |
| Active gen count on tab | `Badge` |

### 4.3 Library View -- Grid Mode

The default view. A responsive grid of image thumbnails.

#### Behavior

- Thumbnails are square-cropped for uniform grid appearance.
- Grid columns adjust based on available width. User can adjust thumbnail size via a slider in the status bar or filter bar (zoom control).
- Virtualized rendering: only thumbnails in/near the viewport are rendered via `@tanstack/react-virtual`.
- Click a thumbnail to select it (shows info in right panel).
- Double-click or press `E` to enter loupe view at that image.
- Keyboard: arrow keys navigate selection, `E`/`Enter` opens loupe, `1`-`5` for rating, `P` selects, `X` rejects, `U` clears status.
- Drag a thumbnail to the generation panel's reference image area to use it as img2img input.
- Newly generated images appear at the top of the grid (sorted by creation date, newest first by default).

#### Filter Bar

Horizontal bar above the grid. Uses shadcn `Select` and `ToggleGroup` components for a consistent look.

| Filter | Component | Values |
|--------|-----------|--------|
| Rating | `Select` or `ToggleGroup` | Unrated, 1+ stars, 2+, 3+, 4+, 5 |
| Status | `ToggleGroup` | All, Selected, Rejected, Unmarked |
| Media Type | `ToggleGroup` | Images (MVP: only option, but present for future video) |
| Sort | `Select` | Date (newest/oldest), Rating (high/low), Name (A-Z/Z-A) |

Also includes:
- Search input for filename/keyword search.
- Count label: "342 images" (filtered count / total count).

#### shadcn Components Used

| Element | Component |
|---------|-----------|
| Filter controls | `ToggleGroup`, `Toggle`, `Select` |
| Search | `Input` |
| Thumbnail container | Custom (virtualized grid) |
| Context menu on thumbnail | `ContextMenu` |
| Empty state | Custom empty state (simple text + `Button` where appropriate) |

### 4.4 Library View -- Loupe Mode

Full-size image viewing for browsing and culling. Lightroom-inspired workflow.

#### Layout

```
+--------------------------------------------------------------+
|  Filter Bar (same as grid, enables switching filters          |
|  while in loupe)                                              |
+--------------------------------------------------------------+
|                                                               |
|                                                               |
|                    Canvas Viewer                              |
|                    (full-size image, fit-to-view)             |
|                                                               |
|                                                               |
+--------------------------------------------------------------+
|  [<] [thumb] [thumb] [ACTIVE] [thumb] [thumb] [thumb] [>]    |
+--------------------------------------------------------------+
```

#### Behavior

- **Canvas Viewer:** Renders the selected image on an HTML `<canvas>` element at full resolution, fit-to-view by default.
- **Film Strip:** Horizontal scrollable row of thumbnails at the bottom (~110px). Current image highlighted with accent border. Click to navigate. Scroll to pan the strip. Respects filter state -- only filtered images appear.
- **Navigation:**
  - Left/Right arrow keys move to previous/next image.
  - Film strip click navigates directly.
  - `G` or `Escape` returns to grid view.
  - Edge navigation zones (invisible hover areas on left/right edges).
- **Culling shortcuts (same as grid):**
  - `1`-`5`: Set star rating.
  - `P`: Set status to "Selected."
  - `X`: Set status to "Rejected."
  - `U`: Clear status.
  - These update immediately with a brief overlay confirmation.
- **Zoom:** Scroll wheel zooms in/out. Click-drag pans when zoomed. Double-click toggles between fit-to-view and 100%. Zoom level displayed subtly.
- The right panel stays visible and updates in real time as the user navigates.

#### shadcn Components Used

| Element | Component |
|---------|-----------|
| Film strip container | `ScrollArea` (horizontal) |
| Film strip nav arrows | `Button` (icon, ghost) |
| Zoom indicator | `Badge` |

### 4.5 Right Panel

The right panel mirrors the left panel's tab pattern: a vertical icon tab bar on the right edge, with the panel content expanding to the left when a tab is active.

The left and right panel use the Shadcn Sidebar component, following the "collapsible nested sidebar" block/example for Shadcn's SideBar component.

- Demo/block:
https://ui.shadcn.com/blocks/sidebar#sidebar-09
- That demo code has been copied here:
C:\Users\jason\distillery\docs\collapsible_nested_sidebar

- Docs: 
* https://ui.shadcn.com/docs/components/radix/sidebar
* https://ui.shadcn.com/docs/components/radix/sidebar.md


#### Tab: Media Info

Displays file-level metadata for the currently selected or viewed media item.

**Sections:**

1. **Rating & Status** (always at top for quick culling)
   - Interactive star rating (click to set, `1`-`5` keys).
   - Status toggle: Selected / Rejected / Clear (shadcn `ToggleGroup`).

2. **File Info**
   - Filename, dimensions (W x H), file size, creation date.
   - Origin badge: "Generated" or "Imported."

3. **Keywords** (future-ready, not editable in MVP)
   - Display-only for MVP. The column exists in the schema.

#### Tab: Generation Info

Displays generation parameters and lineage for generated media. Only populated for items with `origin = 'generation'`.

**Sections:**

1. **Prompt** (full text in a `ScrollArea`)
2. **Parameters**
   - Model name (canonical), provider.
   - Resolution, seed, steps, guidance, sampling method.
   - Generation time, cache hit info.
3. **Reference Images**
   - Thumbnail row of input images.
   - Click to navigate to that media in the library (if it still exists).
   - Thumbnails persist even if source media is deleted (via `generation_inputs.thumb_path`).
4. **Actions**
   - "View Full Details" button opens the Generation Detail Modal.
   - "Reload Settings" button populates the generation panel with these settings.

#### Future Right Panel Tabs

These tabs are NOT implemented in MVP but the architecture supports them. They will appear as new icon buttons in the right panel tab bar:

| Future Tab | Purpose | Loupe Only? |
|------------|---------|-------------|
| Collections | Browse/assign collections | No (grid + loupe) |
| Adjust | Global image adjustments (brightness, contrast, etc.) | Yes |
| Brush | Selective local adjustments | Yes |
| Remove | Content-aware inpainting removals | Yes |
| Transform | Crop, rotate, flip, upscale | Yes |
| Describe | LLM-powered image description | Yes |

This is the proven V1 pattern: the right panel is where all "inspection and manipulation" lives, and new editing tools simply add tabs.

#### shadcn Components Used (Right Panel)

| Element | Component |
|---------|-----------|
| Panel | `Sidebar` |
| Section headers | Styled label + `Separator` |
| Star rating | Custom (5 clickable star icons) |
| Status toggle | `ToggleGroup` |
| Metadata rows | Custom key-value layout |
| Prompt display | `ScrollArea` |
| Reference image thumbnails | Small img elements |
| Collapsible sections | `Collapsible` |
| Action buttons | `Button` (secondary/ghost variants) |

### 4.6 Status Bar

Persistent thin bar at the bottom of the window (~28px).

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
- Thumbnail size `Slider` (controls grid column count).
- View mode toggle: Grid / Loupe icons.
- Image count: "342 images".
- Queue depth badge: "3 in queue" (hidden when empty).

#### shadcn Components Used

| Element | Component |
|---------|-----------|
| Status dot | Custom (tiny colored circle via Tailwind) |
| Progress | `Progress` (slim variant) |
| Queue badge | `Badge` |
| Thumbnail slider | `Slider` |
| View mode toggle | `ToggleGroup` (icon) |

### 4.7 Modals

Modals use shadcn `Dialog` component. They overlay the main layout. Escape key closes the topmost modal. Managed via `ui-store` (`openModal`/`closeModal` pattern from V1).

#### Settings Dialog

- Model file paths (diffusion, VAE, LLM).
- cn-engine binary path (dev only, hidden in production).
- Library root directory.
- Engine runtime flags (offload to CPU, flash attention, VAE on CPU).
- Future: theme selection, keyboard shortcut customization.

#### Generation Detail Modal

Opened when clicking a timeline card or "View Full Details" in the right panel Generation Info tab.

- Full generation parameters.
- Full prompt text (copyable).
- Output image(s) at larger size (clickable for full-screen).
- Input reference image(s) with thumbnails.
- Timing breakdown.
- Actions: "Reload Settings" (populate generation panel), "Save Prompt" (future: to prompt library), "Remove from Timeline", "Delete Output Media".

#### Delete Confirmation

- shadcn `AlertDialog` for destructive actions (delete media, clear timeline).

### 4.8 Keyboard Shortcuts

Lightroom-inspired shortcuts, proven in V1:

| Action | Shortcut |
|--------|----------|
| Switch to grid view | `G` |
| Switch to loupe view | `E` (from grid, opens at selected image) |
| Return to grid from loupe | `Escape` or `G` |
| Previous image (loupe) | `Left Arrow` |
| Next image (loupe) | `Right Arrow` |
| Rate 1-5 stars | `1` - `5` |
| Set status: Selected | `P` |
| Set status: Rejected | `X` |
| Clear status | `U` |
| Toggle left panel | `Tab` |
| Toggle right panel | `Ctrl/Cmd + I` |
| Focus prompt input | `Ctrl/Cmd + K` |
| Generate | `Ctrl/Cmd + Enter` (when prompt focused) |
| Import images | `Ctrl/Cmd + Shift + I` |
| Delete selected media | `Delete` (with confirmation) |

Shortcuts are disabled when a text input has focus (except modifier-key combos).

### 4.9 Drag and Drop

| Source | Target | Action |
|--------|--------|--------|
| Library grid thumbnail | Generation panel ref image area | Add as reference image for img2img |
| Library loupe current image | Generation panel ref image area | Add as reference image for img2img |
| OS file explorer (images) | Library grid area | Import images to library |
| OS file explorer (images) | Generation panel ref image area | Add as reference image (also imports to library) |

### 4.10 Responsive Behavior

Minimum window dimensions: 960x600.

- Left panel: collapsible via icon tab click or `Tab` key. Remembers state.
- Right panel: collapsible via icon tab click or `Ctrl/Cmd + I`. Remembers state.
- Library grid: fluid, columns adjust automatically.
- Loupe: fluid, image scales to fit available space.
- Panel states (open/closed, active tab) persisted to `app_settings` and restored on launch.

### 4.11 Where Future Features Live in the UI

This map ensures every planned feature has a clear home, preventing future layout rethinks:

```
LEFT PANEL TABS (input modes -- "how media enters the library")
├── Generation          ← MVP
├── Timeline            ← MVP
├── Import              ← MVP
├── Sketch              ← Future (sketch-to-image canvas)
└── Prompt Library      ← Future (saved prompts + collections)

RIGHT PANEL TABS (inspection + manipulation -- "what you do with media")
├── Media Info          ← MVP
├── Generation Info     ← MVP
├── Collections         ← Future (browse/assign to collections)
├── Describe            ← Future (LLM-powered description)
├── Adjust              ← Future (global brightness/contrast/etc, loupe only)
├── Brush               ← Future (selective local adjustments, loupe only)
├── Remove              ← Future (content-aware removal, loupe only)
└── Transform           ← Future (crop/rotate/flip/upscale, loupe only)

MODALS (configuration -- infrequent access)
├── Settings            ← MVP (model paths, library root, engine flags)
├── Generation Detail   ← MVP (full gen info popup from timeline/info panel)
├── Dependency Manager  ← Future (model downloads, hardware tailoring)
├── Provider Manager    ← Future (API keys, enable/disable providers)
├── Prompt Editor       ← Future (rich prompt editing modal)
└── Export Dialog       ← Future (export with adjustments baked in)

STATUS BAR (persistent ambient state)
├── Engine status       ← MVP
├── Generation progress ← MVP
├── Queue depth         ← MVP
├── Thumbnail size      ← MVP
├── View mode toggle    ← MVP
└── Image count         ← MVP
```

**The pattern:** Left = inputs, Right = inspection/manipulation, Modals = infrequent config.
New features slot into existing containers. No layout rethinks needed.

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
    ref_thumbs/          # Persisted reference image thumbnails (survive source deletion)
      <generation-id>/
        0.jpg
        1.jpg
```

#### File Operations

- **Store generated image:** cn-engine writes output to a temp path. File manager moves it to `originals/YYYY/MM/<uuid>.png`.
- **Generate thumbnail:** Uses `sharp` to create a square-cropped JPEG thumbnail at a standard size (e.g., 400x400). Stored in `thumbnails/`.
- **Import images:** Copies source file to `originals/`, generates thumbnail, creates `media` record.
- **Prepare reference image:** Downscale to 1MP, write to `ref_cache/`, return path for cn-engine.
- **Reference thumbnail persistence:** When a generation uses reference images, copy their current thumbnails to `ref_thumbs/<generation-id>/`. These persist even if the source media is deleted.

### 5.5 Timeline Service

Manages generation history queries and thumbnail generation for the timeline panel.

#### Responsibilities

- Query generations with their inputs/outputs for timeline display.
- Generate and cache thumbnails for generation outputs (separate from library thumbnails, stored per-generation).
- Generate and cache thumbnails for generation inputs.
- Handle "clear completed", "remove single", and "reload settings" operations.
- On app startup, mark any `pending` generations from previous sessions as `failed` (interrupted).

---

## 6. Renderer Architecture

### 6.1 State Management

**Zustand** stores in the renderer, organized by domain:

| Store | Key State | Sources |
|-------|-----------|---------|
| `ui-store` | Left/right panel visibility, active tabs, active modals, view mode (grid/loupe), thumbnail size | Local (persisted to app_settings) |
| `library-store` | Filter/sort settings, selected media ID(s), media list (paginated) | IPC queries to main process |
| `generation-store` | Prompt text, ref images, resolution, aspect ratio, timeline generations list, generation thumbnails | Mixed (form state local, timeline from IPC) |
| `engine-store` | Engine state enum, loaded model name, error info | IPC events from main process |
| `queue-store` | Queue items, active job progress (phase, step, elapsed) | IPC events from main process |

Stores subscribe to IPC events for real-time updates. When the user modifies library data (rating, status), the store calls an IPC mutation and optimistically updates local state.

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
  getThumbnail(id: string): Promise<string>;       // returns file path
  getThumbnailsBatch(ids: string[]): Promise<Map<string, string>>;

  // Generation
  submitGeneration(params: GenerationParams): Promise<string>; // returns job ID
  cancelGeneration(jobId: string): Promise<void>;

  // Engine
  getEngineStatus(): Promise<EngineStatus>;
  loadModel(params: ModelLoadParams): Promise<void>;
  unloadModel(): Promise<void>;

  // Queue
  getQueue(): Promise<QueueItem[]>;

  // Timeline
  timeline: {
    getAll(): Promise<{ generations: Generation[] }>;
    get(id: string): Promise<Generation | null>;
    remove(id: string): Promise<void>;
    clearCompleted(): Promise<void>;
    getThumbnail(genId: string): Promise<string | null>;
    getThumbnailsBatch(genIds: string[]): Promise<Map<string, string>>;
    getInputThumbnail(inputId: string): Promise<string | null>;
    getInputThumbnailsBatch(inputIds: string[]): Promise<Map<string, string>>;
    getGenerationInputs(genId: string): Promise<GenerationInput[]>;
  };

  // Settings
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: Partial<AppSettings>): Promise<void>;

  // App
  showOpenDialog(options: OpenDialogOptions): Promise<string[] | null>;
  showSaveDialog(options: SaveDialogOptions): Promise<string | null>;
  showItemInFolder(path: string): Promise<void>;
  getHardwareProfile(): Promise<HardwareProfile>;

  // Events (renderer subscribes)
  on(channel: string, callback: (...args: any[]) => void): () => void;
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
       2. Creates generation record in DB (status: pending)
       3. Persists reference image thumbnails to ref_thumbs/
       4. Creates generation_inputs records
       5. Creates queue record in DB
       6. Broadcasts queue:updated event
       7. If engine idle, dequeues and sends to cn-engine
  -> renderer receives queue:updated, updates queue-store
  -> generation-store adds new generation to timeline list

Engine streams progress
  -> main process receives NDJSON progress lines
  -> broadcasts engine:progress events via IPC
  -> renderer queue-store updates active job progress
  -> Generation panel + status bar re-render progress

Engine completes
  -> main process receives NDJSON result
  -> moves output file to library originals/
  -> generates thumbnail
  -> creates media record in DB (linked to generation)
  -> updates generation record (status: completed, seed, timing)
  -> updates queue record status
  -> broadcasts engine:result + queue:updated + library:updated
  -> renderer library-store prepends new image to grid
  -> renderer generation-store updates timeline entry
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
| `file_path` | TEXT NOT NULL UNIQUE | Relative path from library root |
| `thumb_path` | TEXT | Relative path to thumbnail |
| `file_name` | TEXT NOT NULL | Display name |
| `media_type` | TEXT NOT NULL | `image` (future: `video`) |
| `origin` | TEXT NOT NULL | `generation`, `import` (future: `duplicate`, `sketch`) |
| `width` | INTEGER | Pixel width |
| `height` | INTEGER | Pixel height |
| `file_size` | INTEGER | Bytes |
| `rating` | INTEGER NOT NULL DEFAULT 0 | 0-5 (0 = unrated) |
| `status` | TEXT | `selected`, `rejected`, or NULL |
| `keywords` | TEXT | Comma-separated keywords (future: normalized to junction table) |
| `generation_id` | TEXT FK | References `generations.id` (NULL for imports) |
| `origin_id` | TEXT FK | References `media_origins.id` |
| `created_at` | TEXT NOT NULL | ISO 8601 timestamp |
| `updated_at` | TEXT NOT NULL | ISO 8601 timestamp |

Indexes: `file_path` (unique), `origin`, `rating`, `status`, `media_type`, `created_at`, `generation_id`, `origin_id`.

#### `generations`

One row per generation job. Created when a job is submitted (status: pending), updated when it completes or fails.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `number` | INTEGER NOT NULL | Sequential generation counter (for display: #47) |
| `base_model_id` | TEXT FK | References `base_models.id` |
| `provider` | TEXT NOT NULL | `local` (future: API provider name) |
| `model_file` | TEXT | Filename of the model used (for local) |
| `prompt` | TEXT | Full prompt text |
| `width` | INTEGER | Output width in pixels |
| `height` | INTEGER | Output height in pixels |
| `seed` | INTEGER | Seed used (-1 for random until generation completes) |
| `steps` | INTEGER | Inference steps |
| `guidance` | REAL | Guidance scale |
| `sampling_method` | TEXT | e.g., `euler` |
| `params_json` | TEXT | JSON blob for all other/future parameters |
| `status` | TEXT NOT NULL | `pending`, `completed`, `failed` |
| `error` | TEXT | Error message if failed |
| `total_time_ms` | INTEGER | Total generation time |
| `prompt_cache_hit` | INTEGER | 0 or 1 |
| `ref_latent_cache_hit` | INTEGER | 0 or 1 |
| `output_paths` | TEXT | JSON array of output file paths |
| `created_at` | TEXT NOT NULL | ISO 8601 |
| `started_at` | TEXT | When processing began |
| `completed_at` | TEXT | When processing finished |

Index: `status`, `created_at`, `base_model_id`.

#### `generation_inputs`

Links generations to their input reference images. Persists thumbnails for deleted source media.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `generation_id` | TEXT FK NOT NULL | References `generations.id` |
| `media_id` | TEXT FK | References `media.id` (NULL if source deleted; SET NULL on delete) |
| `position` | INTEGER NOT NULL | Order of the input image (0-indexed) |
| `source_type` | TEXT NOT NULL | `library` or `external` |
| `original_path` | TEXT | Original file path at time of generation |
| `original_filename` | TEXT | Original filename |
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

#### `media_origins`

Tracks provenance of how media entered the library. More flexible than a simple `origin` column -- supports future lineage tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID |
| `kind` | TEXT NOT NULL | `generation`, `import` (future: `duplicate`, `sketch`) |
| `label` | TEXT | Human-readable label |
| `generation_id` | TEXT FK | References `generations.id` (for kind=generation) |
| `source_media_id` | TEXT FK | References `media.id` (for kind=duplicate) |
| `details` | TEXT | JSON blob for additional provenance data |
| `created_at` | TEXT NOT NULL | ISO 8601 |

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

Used for: library root path, model file paths, engine flags, panel states, thumbnail size, window state, etc.

### ER Diagram (MVP)

```
base_models
    |
    | 1:N
    v
generations -------> media (output, via media.generation_id)
    |            \
    | 1:N         \--> media_origins (via media_origins.generation_id)
    v                       |
generation_inputs           | 1:1
    |                       v
    +--> media (input ref, nullable FK, SET NULL on delete)
                        media (via media.origin_id)

queue -----> generations (1:1)
```

### Future Schema Additions

The schema accommodates these without breaking changes:

| Future Feature | Schema Change |
|----------------|---------------|
| Collections | New `collections` + `collection_media` junction tables |
| Keywords (normalized) | New `keywords` + `media_keywords` junction tables |
| Lineage tracking | Already supported: walk media -> generation_id -> generation_inputs -> media_id -> repeat |
| Non-destructive edits | JSON column on `media` (like V1's `edits` column) or new `adjustments` table |
| Upscaling | JSON column on `media` or new `upscale_versions` table |
| Video | `media_type` already supports it; add `video_meta` table |
| API providers | New `providers` table; `generations.provider` already stores provider name |
| Prompt library | New `prompts` + `prompt_collections` + `prompt_collection_members` tables |
| Import folders | New `import_folders` table |
| Sketches | New `sketches` table; `media_origins.kind = 'sketch'` already supported |

---

## 8. cn-engine Integration

### 8.1 Binary Location

- **Development:** Configured path via `app_settings` (e.g., `C:\Users\jason\condenser.cpp\build\bin\cn-engine.exe`).
- **Production (packaged):** Bundled in Electron's `resources/bin/` directory, platform-specific binary.

### 8.2 Model Files Location

- **Development:** Configured path via `app_settings`.
- **Production:** A models directory, e.g., `~/Distillery/Models/`. The app needs paths to three files:
  - Diffusion model GGUF (e.g., `flux2-klein-Q5_K.gguf`)
  - VAE safetensors (e.g., `ae.safetensors`)
  - LLM GGUF (e.g., `qwen3-4b-q8_0.gguf`)

For MVP, the user configures these paths in the settings dialog.

### 8.3 Command Flow

#### App Startup
```
1. EngineManager spawns cn-engine
2. Sends: {"cmd":"ping","id":"health-1"}
3. Receives: {"id":"health-1","type":"ok","data":{"status":"pong"}}
4. Sends load with configured model paths:
   {"cmd":"load","id":"load-1","params":{
     "diffusion_model": "/path/to/model.gguf",
     "vae": "/path/to/ae.safetensors",
     "llm": "/path/to/qwen.gguf",
     "offload_to_cpu": true,
     "flash_attn": true
   }}
5. Receives load confirmation + load_time_ms
6. Broadcasts engine:status { state: "ready", modelName: "..." }
```

#### Generation
```
1. QueueManager dequeues job, sends to EngineManager
2. Sends:
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
4. Engine sends result with output path, actual seed, timing, cache hit info
5. EngineManager notifies QueueManager of completion
6. QueueManager triggers FileManager to move output, generate thumbnail, create media record
```

#### App Shutdown
```
1. Sends: {"cmd":"quit","id":"quit-1"}
2. Engine responds and exits
3. If no exit within 5s, force-kill the process
```

### 8.4 Seed Handling

For MVP, seeds are always random. The renderer sends `seed: -1`, and cn-engine generates a random seed. The actual seed used is returned in the result and stored in `generations.seed` for display and future reproducibility.

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

---

## 9. Performance Considerations

### 9.1 Thumbnail Grid

- **Virtualization:** `@tanstack/react-virtual` for row virtualization. Only visible rows + buffer are rendered.
- **Thumbnail size:** Pre-generate at 400x400 JPEG (~20-40KB each). 10,000 thumbnails = ~200-400MB on disk.
- **Image loading:** `<img>` elements with `loading="lazy"` within the virtual grid. Thumbnails load from local disk, effectively instant.
- **Database pagination:** Cursor-based pagination. Initial load fetches first page (e.g., 200 items). Scrolling triggers additional pages.

### 9.2 Loupe View

- **Canvas rendering:** Decode full image using `createImageBitmap()` and draw to canvas. GPU-accelerated in Chromium.
- **Pre-loading:** Pre-load next and previous images in background to eliminate visible loading lag.
- **Memory:** Keep at most 3 full-size images decoded in memory (current, next, previous). Release others.

### 9.3 Engine Communication

- **Unbuffered stdout:** cn-engine already uses `setvbuf(stdout, NULL, _IONBF, 0)`. Progress lines arrive immediately.
- **Line buffering in Node:** Read stdout with a line-based transform stream to correctly split NDJSON messages.

### 9.4 Timeline Thumbnails

- **Decision (MVP):** reuse the library thumbnail for completed outputs (via the output `media.thumb_path`).
- Persisted input thumbnails already live under `generation_inputs.thumb_path` and must remain stable even if source media is deleted.
- If an output media item is deleted, the timeline card may show a placeholder state (no dedicated output-thumb persistence for MVP).
- Batch thumbnail loading: `getThumbnailsBatch` retrieves multiple thumbnails in a single IPC call.
- Timeline list itself should use virtualization (e.g., `@tanstack/react-virtual`) once the list is large.

---

## 10. Packaging and Distribution

### 10.1 Electron Builder

Use electron-builder for packaging. Platform-specific builds:

| Platform | Format | cn-engine binary |
|----------|--------|-----------------|
| Windows | NSIS installer (.exe) | `cn-engine.exe` (Vulkan or CUDA build) |
| macOS | DMG | `cn-engine` (Metal build) |
| Linux | AppImage / .deb | `cn-engine` (Vulkan build) |

The cn-engine binary is placed in the app's `resources/bin/` directory.

### 10.2 Model Distribution

Models are NOT bundled with the app (4-9GB each). For MVP, the user downloads models separately and points the app at them via the settings dialog.

---

## 11. Development Phases

### Phase 1: Spec (complete)
Finalize this document.

### Phase 2: Scaffolding (complete)
- Initialize electron-vite project with React 19 + TypeScript.
- Configure Tailwind 4, shadcn/ui (Nova style, cyan theme, dark mode overrides).
- Set up SQLite with better-sqlite3, migration runner, initial schema (all MVP tables).
- Implement EngineManager (spawn, ping, load, quit lifecycle).
- Implement basic IPC layer with typed API.
- Establish directory structure and module boundaries.
- Install core dependencies: Zustand, @tanstack/react-virtual, sharp, lucide-react.

### Phase 3: UI Prototype
- Build three-panel layout with fixed-width side panels (no resizers).
- Build left panel with icon tab bar and Generation/Timeline/Import tabs.
- Build right panel with icon tab bar and Info/Generation Info tabs.
- Build Grid view with mock data (placeholder thumbnails).
- Build Loupe view with canvas rendering and film strip navigation.
- Build Generation panel UI (prompt, ref images, resolution, generate button).
- Build Timeline panel with mock timeline cards.
- Build Filter bar.
- Build Status bar.
- Validate layout, navigation flow, keyboard shortcuts.
- All UI is non-functional (mock data only).

**Phase 3 note (shadcn/ui):** prefer composing the UI from shadcn primitives (Button, Select, ToggleGroup, ScrollArea, etc.) and keep any custom components thin wrappers. Add components via the shadcn CLI (e.g., `npx shadcn@latest add sidebar scroll-area`) so their structure matches the upstream docs.

### Phase 4: Wire Up
- Connect generation panel to EngineManager via IPC. User can generate an image.
- Connect queue system. Progress displays in real time.
- Generated images appear in library and timeline automatically.
- Import functionality works.
- Filtering, rating, and status changes work.
- Drag-and-drop from library to generation panel works.
- Loupe navigation works with real data.
- Info panel shows real metadata and generation parameters.
- Timeline shows real generation history with thumbnails.
- Generation Detail Modal works.

**Phase 4 note (Electron main-thread safety):** imports + thumbnail generation can be CPU and disk heavy. Even with synchronous SQLite, keep long-running work chunked and/or moved off the hot path so the main process doesn’t stall IPC responsiveness.

### Phase 5: Polish
- Error handling and edge cases (engine crash recovery, disk full, invalid images).
- Loading states and skeletons.
- Settings dialog (model paths, library root, engine flags).
- Keyboard shortcut refinement.
- Window state persistence (size, position, panel visibility, active tabs).
- Timeline: "reload settings" and "clear completed" actions.
- Performance profiling and optimization (grid virtualization, thumbnail loading).
- Platform testing (Windows, macOS, Linux).

**Phase 5 note (shadcn/ui upgrades):** when upgrading shadcn/ui components, treat it like a code change (review diffs). Avoid local modifications to generated components unless the docs explicitly recommend it; prefer wrapping/extending in app-level components.

---

## 12. shadcn/ui Component Inventory

Components from the shadcn/ui library used in Distillery MVP:

| Component | Usage |
|-----------|-------|
| `AlertDialog` | Delete confirmation, destructive action confirmations |
| `Badge` | Status labels, queue count, generation status, active gen count |
| `Button` | Generate, import, navigation, all actions |
| `Card` | Timeline cards, queue items, reference image containers |
| `Collapsible` | Info panel sections, settings sections |
| `ContextMenu` | Right-click on grid thumbnails, timeline cards |
| `Dialog` | Settings, Generation Detail modal |
| `Skeleton` | Loading states (Phase 5 polish) |
| `Input` | Search filter, settings text fields |
| `Progress` | Generation progress bar (status bar + generation panel) |
| `ScrollArea` | Film strip, right panel content, timeline list, prompt display |
| `Select` | Resolution picker, sort order, filter dropdowns |
| `Separator` | Section dividers in panels |
| `Slider` | Thumbnail size control |
| `Textarea` | Prompt input |
| `Toggle` | Individual filter options |
| `ToggleGroup` | Aspect ratio, status filter, panel tab bars, view mode toggle |
| `Tooltip` | Icon button labels, keyboard shortcut hints, control descriptions |

---

## 13. Decisions Resolved by V1

These were open questions in the original spec. V1's implementation provides the answers:

| Question | V1 Answer | MVP Decision |
|----------|-----------|-------------|
| Zustand vs alternative | V1 uses Zustand with 20 stores successfully | **Zustand confirmed.** |
| sharp for thumbnails | V1 uses sharp across all platforms | **sharp confirmed.** |
| First-run model setup | V1 uses settings dialog | **Settings dialog for MVP.** |
| Custom title bar | V1 uses frameless window + custom title bar | **Frameless + custom title bar.** |
| Electron protocol for thumbnails | V1 uses file:// paths | **file:// paths for MVP.** Consider custom protocol later for security. |

## 14. Remaining Open Questions

1. **Timeline thumbnail storage (resolved):** Reuse library thumbnails for outputs; persist input thumbnails via `generation_inputs.thumb_path`; allow placeholders when outputs are deleted.
2. **Generation counter persistence (resolved):** Persist the sequential counter in the database (`generations.number`). This avoids renumbering surprises when entries are removed and keeps counters stable across sessions.

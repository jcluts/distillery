# Distillery — Agent Guide

## 1. Overview

Distillery is a desktop application for local AI image generation and media management, built on top of [condenser.cpp](https://github.com/jcluts/condenser.cpp). It targets creative professionals — creative directors, graphic designers, product owners, production artists — who need generative AI tools but are underserved by existing web-based offerings.

**Core ethos:** "It just works." Media-forward, not tech-forward. The library is the product; generation is one way media enters it.

**MVP scope:** Local image generation via FLUX.2 Klein, a performant media library with culling and browsing workflows, generation timeline/history, and import support. The architecture anticipates future features (video, API providers, non-destructive editing, upscaling, collections) without implementing them.

**Context:** This is a ground-up rewrite of an existing prototype (simple-ai-client). The V1 validated the UI/UX patterns and architecture but suffers from accumulated tech debt (vanilla JS origins, no CSS framework, 328 files of organically grown code). This rewrite ports the proven design decisions onto a clean foundation with PrimeVue for consistent component styling.

**React reference:** The React version of the renderer lives at `C:\Users\jason\projects\distillery-react` (git worktree of the `react-reference` branch). It and the V1 prototype serve as **wireframes** — they define the feature set, layout structure, and user flows, but the Vue renderer does not attempt to replicate their visual styling. Default PrimeVue appearance is the target.

---

## 2. Agent Rules

### Important Architecture Guidance

**The following rules most be followed at all times:**
- Relentlessly pursue a clean, uncluttered, solid foundation.
- Always take a holistic view of the architecture and work towards the cleanest, most elegant solution. 
- Do not overengineer solutions and create an overcomplicated codebase, *use the simplest architecture that satisfies all requirements*. 
- Adhere to DRY principles at all times, reducing redundant code and looking for opportunities to consolidate similar code.  
- Always delete dead code, never keep something "just in case". You're not going to need it. 
- Never, under any circumstance, leave behind "legacy" or "compatibility" code.
- Never take an ad-hoc approach, slapping on band-aids to address issues rather than creating the properly architected solution. 
- This application is a fresh start with zero users at the moment, never worry about breaking changes or backwards compatibility.

### Components & Styling — PrimeVue First

**The #1 rule: Always use a PrimeVue component when one exists.** Do not build custom HTML+Tailwind versions of things PrimeVue already provides. Consult the [PrimeVue documentation](https://primevue.org/) before writing custom markup.

**Priority order for any UI element:**
1. **PrimeVue component with its built-in props/variants** — use `severity`, `variant`, `size`, `icon`, `loading`, etc. Accept the default PrimeVue Aura appearance.
2. **PrimeVue component with `pt` (pass-through) overrides** — override specific DOM elements' classes only when built-in props can't express the need.
3. **Tailwind utilities for layout only** — flex, grid, spacing, sizing, overflow, positioning. These are fine and expected for arranging components on the page.
4. **Custom Tailwind for visual styling** — absolute last resort. Only when no PrimeVue component or prop can achieve the effect.

**Do not:**
- Recreate the React/V1 styling with custom Tailwind classes. Those designs were built on shadcn/ui — a completely different component library.
- Add decorative Tailwind classes (colors, borders, shadows, rounded corners, typography styles) to elements that a PrimeVue component could render instead.
- Use raw Tailwind color classes (`text-gray-400`, `bg-zinc-900`). Use the semantic utilities in `main.css` (`text-muted`, `bg-elevated`, `border-default`) or PrimeVue component props (`severity="secondary"`).

### UI/UX Aesthetic
- Professional, clean, elegant — achieved through **PrimeVue Aura theme defaults**, not custom CSS.
- Dark mode is the default (`class="dark"` on `<html>`).
- The React reference and V1 screenshots define the feature set and layout structure. They do **not** define the visual styling — PrimeVue's default Aura appearance is the target.
- Never copy React JSX, shadcn class lists, or V1 CSS. Understand the *behavior*, then find the PrimeVue component that provides it.

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 39, electron-vite 5 |
| Renderer | Vue 3 (Composition API, `<script setup>` SFCs), TypeScript 5.9 |
| UI library | PrimeVue 4 (Aura theme via `@primeuix/themes`) |
| Auto-import | unplugin-vue-components + `@primevue/auto-import-resolver` |
| State | Pinia (setup syntax stores, no persistence middleware) |
| CSS | Tailwind 4 (`@tailwindcss/vite` plugin) |
| Database | better-sqlite3 (WAL mode, main process only) |
| Image processing | sharp (thumbnails + ref image prep) |
| AI engine | condenser.cpp (`cn-engine`), NDJSON-over-stdio child process |
| Virtualization | @tanstack/vue-virtual |
| Icons | @iconify/vue with `@iconify-json/lucide` (format: `lucide:icon-name`) |
| Font | Inter Variable (`@fontsource-variable/inter`) |

**PrimeVue config** (in `src/renderer/main.ts`):
- Theme: Aura preset with `darkModeSelector: '.dark'`, `cssLayer: false`
- Prefix: `p` — all PrimeVue CSS classes prefixed with `p-`
- No vue-router; navigation is modal-driven via the UI store

**Template syntax:** SFC templates **only** — no JSX, no render functions.

**Path aliases:** `@` / `@renderer` → `src/renderer/`, `@main` → `src/main/`.

---

## 4. Project Structure

```
src/
├── main/                           # Electron main process
│   ├── index.ts                    # App entry, lifecycle, service wiring
│   ├── types.ts                    # Canonical shared types (single source of truth)
│   ├── profiles.ts                 # Multi-profile userData isolation
│   ├── config/
│   │   ├── model-catalog.json      # Bundled model definitions (FLUX.2 Klein 4B + 9B)
│   │   └── providers/              # Provider configs (local, fal, replicate, wavespeed)
│   ├── db/
│   │   ├── connection.ts           # SQLite connection + migration runner
│   │   ├── migrations/             # Numbered .sql migration files
│   │   └── repositories/           # Plain functions: media, generations, generation-inputs,
│   │                               #   work-queue, models, settings
│   ├── engine/
│   │   ├── engine-manager.ts       # Engine process lifecycle + state machine
│   │   └── engine-protocol.ts      # NDJSON-over-stdio protocol handler
│   ├── files/
│   │   ├── file-manager.ts         # Library root, directory layout, path resolution
│   │   └── image-derivatives.ts    # Thumbnail + reference image generation (sharp)
│   ├── generation/
│   │   ├── generation-service.ts    # Submit/cancel orchestration
│   │   ├── media-ingestion-service.ts # Ref image prep + output ingestion to library
│   │   ├── generate-task-handler.ts # Unified generation work-task handler
│   │   ├── param-utils.ts           # Shared generation + adapter coercion utilities
│   │   ├── providers/               # GenerationProvider interface + local/remote providers
│   │   ├── remote/                  # API client, output downloader, adapter registry/adapters
│   │   ├── browsing/                # Provider model browsing + user model management
│   │   └── catalog/                 # Endpoint catalog + provider config + schema normalization
│   ├── ipc/
│   │   ├── channels.ts             # All IPC channel name constants
│   │   └── handlers/               # IPC handler modules (library, generation, engine,
│   │                               #   queue, timeline, settings, models, window)
│   ├── models/
│   │   ├── model-catalog-service.ts  # Load/cache/seed model catalog
│   │   ├── model-download-manager.ts # Serial HTTP download queue with progress
│   │   ├── model-resolver.ts         # Resolve selected quants → absolute paths
│   │   └── selection-bootstrap.ts    # Auto-detect downloaded quants on startup
│   ├── queue/
│   │   ├── work-queue-manager.ts   # In-process serial task queue
│   │   ├── work-handler-registry.ts # Maps task_type → handler
│   │   └── work-task-types.ts      # Task type constants
│   └── timeline/
│       └── timeline-service.ts     # Generation history queries
│
├── preload/
│   ├── index.ts                    # contextBridge: exposes window.api + window.electron
│   └── index.d.ts                  # Window type augmentation
│
└── renderer/
    ├── main.ts                     # Vue app entry (createApp, Pinia, PrimeVue plugin)
    ├── App.vue                     # Root: IPC subscription bootstrap
    ├── assets/main.css             # Tailwind 4, Inter font, PrimeVue token utilities
    ├── types/index.ts              # Renderer type surface + DistilleryAPI interface
    ├── lib/
    │   ├── constants.ts            # Resolution presets, aspect ratios, defaults
    │   ├── layout.ts               # Panel pixel widths
    │   ├── canvas-draw.ts          # Canvas rendering utilities
    │   └── media.ts                # Duration formatting
    ├── stores/                     # Pinia stores (setup syntax)
    │   ├── ui.ts                   # Panels, view mode, thumbnails, modals
    │   ├── library.ts              # Media list, selection, filters, sort
    │   └── engine.ts               # Engine state mirror
    ├── composables/                # Vue composables (replace React hooks)
    │   ├── useIpcSubscriptions.ts  # Centralized IPC event subscriptions
    │   ├── useKeyboardShortcuts.ts # Lightroom-style keyboard shortcuts
    │   ├── useGridSelection.ts     # Grid click/shift-click/ctrl-click selection
    │   └── useFilmstripSelection.ts # Filmstrip selection logic
    └── components/
        ├── layout/                 # AppLayout, TitleBar, LeftSidebar, RightSidebar, MainContent
        ├── library/                # FilterBar, GridView, LoupeView, LibraryStatusBar,
        │   │                       #   MediaThumbnail, LoupeFilmstrip
        │   └── canvas/             # CanvasViewer (HTML Canvas, DPR-aware)
        └── panes/                  # Sidebar content panels (PaneLayout, PaneSection,
                                    #   GenerationPane, TimelinePane, ImportPane,
                                    #   MediaInfoPane, GenerationInfoPane, CollectionsPane)
```

---

## 5. Architecture

### Process Boundary

All application state lives in the main process. The renderer communicates exclusively through typed IPC:

- **Renderer → Main:** `ipcRenderer.invoke()` (request/response) via `window.api.*`
- **Main → Renderer:** `webContents.send()` (push events) via `window.api.on(channel, callback)`
- **Preload:** Thin typed bridge only — no logic lives here.

The `DistilleryAPI` interface in `src/renderer/types/index.ts` defines the complete IPC surface. Channel name constants live in `src/main/ipc/channels.ts`.

### Database

SQLite via better-sqlite3, WAL mode, foreign keys enabled. Located at `{profileUserData}/data/distillery.db`. The renderer never touches the DB directly.

Repositories are plain functions accepting a `Database` instance — no ORM, no class-based wrappers. Migrations are numbered `.sql` files loaded via `import.meta.glob`.

Key tables: `media`, `generations`, `generation_inputs`, `work_queue`, `base_models`, `app_settings`.

### Type Sharing

`src/main/types.ts` is the canonical source. `src/renderer/types/index.ts` duplicates these for the renderer plus the `DistilleryAPI` interface. This is intentional — avoids circular references across the Electron process boundary.

### Custom Protocol

`distillery://library/{encoded-rel-path}` serves library files. All `file_path` and `thumb_path` fields are rewritten from relative DB paths to protocol URLs before reaching the renderer. This avoids `file://` CORS issues in dev mode.

### Modal System

No vue-router. Navigation is modal-driven via the UI store:
- `activeModals: string[]` tracks open modals by ID (`'settings'`, `'models'`, `'generation-detail'`)
- Use PrimeVue's `Dialog` component with `:visible` bound to a computed getter/setter that reads from/writes to the store

### Three-Panel Layout

```
AppLayout (flex h-screen w-screen flex-col)
├── TitleBar (drag region, window controls)
└── main (flex min-h-0 flex-1 overflow-hidden)
    ├── LeftSidebar (aside)
    │   ├── Icon rail (w-12): Generate | Timeline | Import
    │   └── Pane content (360px default)
    ├── MainContent (section, flex-1)
    │   ├── FilterBar
    │   ├── GridView | LoupeView
    │   └── LibraryStatusBar
    └── RightSidebar (aside)
        ├── Pane content (300px default): MediaInfo | GenerationInfo
        └── Icon rail (w-12, pinned right)
```

The layout uses **plain HTML flex containers**. Sidebar pane switching is driven by the UI store.

### Keyboard Shortcuts (Lightroom-style)

All shortcuts are suppressed when a text input is focused.

| Key | Action |
|---|---|
| `Tab` | Toggle left panel |
| `G` | Grid view |
| `E` / `Enter` | Loupe view |
| `Escape` | Exit loupe / close modal |
| `Arrow Left/Right` | Navigate items |
| `1`-`5` | Set rating |
| `P` | Mark selected |
| `X` | Mark rejected |
| `U` | Clear status |
| `Cmd/Ctrl+K` | Focus prompt |
| `Cmd/Ctrl+Enter` | Submit generation |

---

## 6. cn-engine Integration

### NDJSON-over-stdio Protocol

The engine is a persistent child process. `EngineProtocol` reads newline-delimited JSON from `stdout` and writes JSON commands to `stdin`. Each command has a unique `id`; responses are matched by `id`.

**Commands:**
- `ping` → `{ status: "pong" }`
- `load { diffusion_model, vae, llm, ... }` → `{ load_time_ms }`
- `generate { prompt, width, height, seed, steps, ... }` → streaming `progress` events, then `result`
- `quit` → clean shutdown

**Timeouts:** 30s default, 5min for load, 10min for generate.

### Engine State Machine

`stopped → starting → idle → loading → ready → error`

The engine starts at app launch (if `engine_path` is configured) but loads no model. Model loading is lazy — `LocalGenerateTaskHandler.ensureModelLoaded()` triggers it on the first generation. The model stays resident in VRAM across generations until explicitly unloaded.

### Work Queue

`WorkQueueManager` processes one task at a time (GPU constraint). Tasks persist in the `work_queue` DB table and survive app restart (restarts mark in-progress items as failed). The handler registry maps task type strings to handler implementations.

---

## 7. Generation Pipeline

1. Renderer calls `window.api.submitGeneration()` with form values
2. `GenerationService.submit()` validates params, prepares ref image inputs (copy to `ref_cache/`, create thumbnails in `ref_thumbs/`), inserts `GenerationRecord`, enqueues `WorkItem`
3. `WorkQueueManager` picks up the task, calls `LocalGenerateTaskHandler`:
   - Lazy-loads model via `ModelResolver.getActiveModelPaths()` if engine is idle
   - Sends generate command to cn-engine
   - Progress events bubble: cn-engine → `EngineProtocol` → `EngineManager` → `GenerationService` → renderer via IPC
4. On completion, `GenerationIOService.finalize()` moves output to library, creates thumbnail, inserts `MediaRecord`
5. Renderer receives `generation:result` and `library:updated` events

### Library File Layout

```
{library_root}/
├── originals/YYYY/MM/     # Date-organized source images (UUID.png/jpg/webp)
├── thumbnails/             # {uuid}_thumb.jpg (400x400 JPEG, Q80)
├── ref_cache/              # Pre-processed ref images for engine (1MP, 16px-aligned)
└── ref_thumbs/{genId}/     # Per-generation input thumbnails
```

---

## 8. Model Manager

The bundled `model-catalog.json` defines two models (FLUX.2 Klein 4B and 9B), each with 5 quant levels (Q3_K_S through Q8_0). Both share a single VAE.

- **`ModelCatalogService`** loads and seeds the catalog
- **`ModelDownloadManager`** handles serial HTTP downloads from HuggingFace with progress events
- **`ModelResolver`** maps selected quants to absolute file paths for the engine
- **`selection-bootstrap.ts`** auto-detects downloaded files on startup

Files download to `{model_base_path}/{model-dir}/{filename}.gguf`. The renderer's `useModelStore` tracks catalog, settings, download progress, and file presence.

---

## 9. Pinia Stores

All stores use **setup syntax** (`defineStore('id', () => { ... })`) — not the options syntax. State is `ref()`, derived state is `computed()`, methods are plain functions. Return all public state, getters, and actions from the setup function.

Stores are ephemeral (no persistence middleware). State syncs to the main process via IPC.

| Store | Responsibility |
|---|---|
| `useUIStore` | Panel open/tab/width, view mode, thumbnail size, modal stack |
| `useLibraryStore` | Media items, selection, focus, filters, sort, pagination |
| `useEngineStore` | Engine state + model name (mirror of main process) |

---

## 10. Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start in dev mode (hot reload) |
| `npm run build` | Typecheck + build for production |
| `npm run typecheck` | Run TypeScript checks (node + web) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run build:win` | Package for Windows |

---

## 11. Reference Documents

| Document | Location |
|---|---|
| **Vue porting guide** | `docs/PORTING_GUIDE.md` |
| React reference codebase | `C:\Users\jason\projects\distillery-react` |
| Product spec | `docs/SPEC.md` |
| Model manager spec | `docs/MODEL_MANAGER_SPEC.md` |
| Queue/generation spec | `docs/QUEUE_GENERATION_FOUNDATION_SPEC.md` |
| V1 screenshots | `agent_docs/distillery_v1_screenshots/` |
| V1 source (reference only) | `C:\Users\jason\simple-ai-client` |
| cn-engine README | `C:\Users\jason\condenser.cpp\tools\engine\README.md` |

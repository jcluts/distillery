# Distillery — Vue Migration Plan

## Goal

Replace the React/Tailwind/shadcn renderer with a Vue 3 / Nuxt UI / Pinia foundation. The main process, preload, database, engine, and all backend logic are **untouched**. Only `src/renderer/` is rebuilt.

The React reference codebase lives at `C:\Users\jason\projects\distillery-react` (git worktree of the `react-reference` branch).

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Vue 3 (Composition API, `<script setup>`) | User preference |
| Template syntax | SFC templates only — **no JSX** | User preference |
| State management | Pinia | Vue's official state management; direct Zustand equivalent |
| UI framework | Nuxt UI (Vue/Vite mode, not Nuxt) | Rich component + layout library; dashboard components map cleanly to Distillery's three-panel layout |
| Router | **No** — `router: false` in Nuxt UI config | Distillery uses modal-driven navigation, not page routing. Nuxt UI explicitly supports Electron apps without vue-router. |
| CSS | Tailwind 4 (ships with Nuxt UI) | Already familiar; Nuxt UI builds on it |
| Theming | **Nuxt UI defaults only** — no custom colors, no component theme overrides | Get the foundation right first; customize later |
| Virtualization | TBD — likely `@tanstack/vue-virtual` or `vue-virtual-scroller` | Need a Vue equivalent for the grid; decide during implementation |
| Icons | Lucide via Nuxt UI's `UIcon` or `lucide-vue-next` | Nuxt UI has built-in icon support via `@iconify/vue` |

---

## Phase 0 — Gut the React Renderer

### 0.1 Remove React dependencies

Remove all React-specific packages from `package.json`:

**dependencies to remove:**
- `@base-ui/react`
- `@fontsource-variable/geist`, `@fontsource-variable/geist-mono` (re-evaluate fonts later)
- `@radix-ui/react-context-menu`
- `@radix-ui/react-toggle`
- `lucide-react`
- `radix-ui`
- `react-resizable-panels`
- `tw-animate-css`
- `zustand`

**devDependencies to remove:**
- `@tanstack/react-virtual`
- `@types/react`
- `@types/react-dom`
- `@vitejs/plugin-react`
- `class-variance-authority`
- `clsx`
- `eslint-plugin-react`
- `eslint-plugin-react-hooks`
- `eslint-plugin-react-refresh`
- `react`
- `react-dom`
- `shadcn`
- `tailwind-merge`

### 0.2 Delete React renderer files

Delete everything inside `src/renderer/` **except**:

| Keep | Reason |
|---|---|
| `index.html` | Will be modified for Vue, but the CSP and structure are reusable |
| `types/index.ts` | `DistilleryAPI` interface + all shared types — framework-agnostic |
| `lib/constants.ts` | Resolution presets, aspect ratios, defaults — pure data |
| `lib/format.ts` | Byte/percent formatting — pure functions |
| `lib/media.ts` | Duration formatting — pure functions |
| `lib/transform-math.ts` | Crop/rotate/flip geometry — pure math |
| `lib/schema-to-form.ts` | JSON schema → form field config — framework-agnostic mapping |
| `lib/layout.ts` | Panel width constants |

Delete:
- `App.tsx`, `main.tsx`
- `env.d.ts` (will recreate for Vue)
- `assets/main.css` (will recreate for Nuxt UI)
- `stores/` (all Zustand stores — will rewrite as Pinia stores)
- `hooks/` (all React hooks — will rewrite as Vue composables)
- `components/` (all React components — will rebuild entirely)
- `lib/utils.ts` (`cn()` helper was clsx + tailwind-merge, not needed with Nuxt UI)

### 0.3 Remove `components.json`

The shadcn config file at the project root is no longer needed.

---

## Phase 1 — Install Vue Foundation

### 1.1 Install Vue + Nuxt UI + Pinia

```bash
npm install vue @nuxt/ui pinia
npm install -D @vitejs/plugin-vue
```

Nuxt UI brings Tailwind 4 as a dependency. The existing `tailwindcss` and `@tailwindcss/vite` devDependencies can be removed — Nuxt UI's Vite plugin handles the Tailwind integration.

### 1.2 Update `electron.vite.config.ts`

Replace the React plugin with Vue + Nuxt UI:

```ts
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve('src/main')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer'),
        '@renderer': resolve('src/renderer')
      }
    },
    plugins: [
      vue(),
      ui({
        colorMode: true,
        router: false        // Electron app — no vue-router
        // No custom colors or theme overrides — use Nuxt UI defaults for now
      })
    ]
  }
})
```

**Key:** `router: false` tells Nuxt UI this is an Electron app. Link components render as plain `<a>` tags. No `vue-router` dependency needed.

### 1.3 Update `tsconfig.web.json`

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.web.json",
  "include": [
    "src/renderer/env.d.ts",
    "src/renderer/**/*",
    "src/renderer/**/*.vue",
    "src/preload/*.d.ts",
    "auto-imports.d.ts",
    "components.d.ts"
  ],
  "compilerOptions": {
    "composite": true,
    "baseUrl": ".",
    "paths": {
      "@renderer/*": ["src/renderer/*"],
      "@/*": ["src/renderer/*"],
      "#build/ui": ["./node_modules/.nuxt-ui/ui"],
      "#build/ui/*": ["./node_modules/.nuxt-ui/ui/*"]
    }
  }
}
```

Changes: remove `"jsx": "react-jsx"`, add `.vue` includes, add Nuxt UI type aliases, add auto-import type declarations.

### 1.4 Add `.gitignore` entries

```
auto-imports.d.ts
components.d.ts
```

### 1.5 Update ESLint config

Remove React ESLint plugins, add Vue:

```bash
npm install -D eslint-plugin-vue vue-eslint-parser
```

Update `eslint.config.mjs` to use `vue-eslint-parser` and `eslint-plugin-vue` recommended rules.

---

## Phase 2 — Vue Entry Point + Nuxt UI Shell

### 2.1 New renderer file structure

```
src/renderer/
├── main.ts                    # Vue app entry (createApp, install Pinia + Nuxt UI)
├── App.vue                    # Root component: UApp wrapper, IPC subscriptions
├── env.d.ts                   # Vite + Vue type references
├── assets/
│   └── main.css               # Tailwind + Nuxt UI imports, CSS variable overrides
├── types/
│   └── index.ts               # DistilleryAPI interface (KEPT from React)
├── lib/                       # Pure utility modules (KEPT from React)
│   ├── constants.ts
│   ├── format.ts
│   ├── media.ts
│   ├── layout.ts
│   ├── transform-math.ts
│   └── schema-to-form.ts
├── stores/                    # Pinia stores (rewritten from Zustand)
│   ├── ui.ts
│   ├── library.ts
│   ├── engine.ts
│   ├── generation.ts
│   ├── queue.ts
│   └── model.ts
├── composables/               # Vue composables (rewritten from React hooks)
│   ├── useKeyboardShortcuts.ts
│   ├── useIpcSubscriptions.ts  # Extracted from App.vue for cleanliness
│   └── useModelDownload.ts
└── components/
    ├── layout/                # App shell (TitleBar, sidebars, main area)
    │   ├── AppLayout.vue
    │   ├── TitleBar.vue
    │   ├── LeftSidebar.vue
    │   ├── RightSidebar.vue
    │   └── MainContent.vue
    └── library/               # Grid view (MVP scope)
        ├── GridView.vue           # Virtualized thumbnail grid
        ├── MediaThumbnail.vue     # Single thumbnail cell with overlays
        └── LibraryStatusBar.vue   # Bottom bar: item count + thumbnail slider
```

### 2.2 `src/renderer/env.d.ts`

```ts
/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}
```

### 2.3 `src/renderer/assets/main.css`

```css
@import "tailwindcss";
@import "@nuxt/ui";
```

No custom CSS variables or theme overrides at this stage. Use Nuxt UI's built-in defaults for everything.

### 2.4 `src/renderer/main.ts`

```ts
import './assets/main.css'
import '@fontsource-variable/inter'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ui from '@nuxt/ui/vue-plugin'
import App from './App.vue'

const app = createApp(App)

app.use(createPinia())
app.use(ui)

app.mount('#app')
```

### 2.5 `src/renderer/index.html`

```html
<!doctype html>
<html class="dark">
  <head>
    <meta charset="UTF-8" />
    <title>Distillery</title>
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: file: distillery:; media-src 'self' blob: file: distillery:; font-src 'self'; connect-src 'self'"
    />
  </head>
  <body>
    <div id="app" class="isolate"></div>
    <script type="module" src="/main.ts"></script>
  </body>
</html>
```

Changes from React version: `#root` → `#app`, add `isolate` class (Nuxt UI requirement), `.tsx` → `.ts` entry.

---

## Phase 3 — Three-Panel Layout (MVP)

### Nuxt UI Component Mapping

| Distillery Concept | Nuxt UI Component | Notes |
|---|---|---|
| App shell | `UApp` | Required wrapper; provides Toast, Tooltip, color mode |
| Three-panel container | `UDashboardGroup` | Manages sidebar state, persistence, resize |
| Left sidebar | `UDashboardSidebar` (side="left") | Resizable, collapsible; icon rail + content panel |
| Right sidebar | `UDashboardSidebar` (side="right") | Same component, opposite side |
| Center content area | `UDashboardPanel` | Resizable; holds FilterBar + GridView + StatusBar |
| Title bar buttons | `UButton` | Standard Nuxt UI buttons |
| Sidebar tab strips | `UNavigationMenu` or `UTabs` | Vertical icon tabs for sidebar pane switching |
| Tooltips | `UTooltip` | Built into Nuxt UI |
| Context menus | `UContextMenu` | Built-in |
| Modals (future) | `UModal` / `UDrawer` | Built-in |

### Layout Structure (AppLayout.vue)

```vue
<template>
  <UApp>
    <TitleBar />

    <UDashboardGroup class="flex-1">
      <UDashboardSidebar
        id="left-sidebar"
        resizable
        collapsible
        :min-size="15"
        :default-size="25"
        :max-size="35"
      >
        <LeftSidebar />
      </UDashboardSidebar>

      <UDashboardPanel id="main-content">
        <MainContent />
      </UDashboardPanel>

      <UDashboardSidebar
        id="right-sidebar"
        side="right"
        resizable
        collapsible
        :min-size="15"
        :default-size="20"
        :max-size="30"
      >
        <RightSidebar />
      </UDashboardSidebar>
    </UDashboardGroup>
  </UApp>
</template>
```

### Theming Rules for MVP

- **Dark mode by default** — set via `class="dark"` on `<html>` (already present in `index.html`). Nuxt UI respects this via its `colorMode` integration.
- **No custom colors** — use Nuxt UI's default `primary` (green) and `neutral` palette as-is.
- **No component theme overrides** — no `ui` prop customizations, no theme layer modifications.
- **No custom CSS classes** — if Nuxt UI doesn't provide it out of the box, skip it for now.
- The goal is a functional, stock-looking Nuxt UI dark-mode app. Aesthetics come later.

### MVP Scope — What Gets Built

1. **TitleBar** — Drag region, app title, window control buttons (min/max/close via `window.api`)
2. **LeftSidebar** — Vertical icon rail (Generate / Timeline / Import icons), content area (placeholder panels)
3. **RightSidebar** — Vertical icon rail (Info / Generation icons), content area (placeholder panels)
4. **MainContent** — Status bar (with thumbnail slider + item count), thumbnail grid
5. **Thumbnail Grid** — The full implementation described in Phase 3a below.
6. **Pinia stores (minimal):**
   - `ui` — sidebar open/collapsed state, active sidebar tabs, view mode, `thumbnailSize`
   - `library` — media items list, selection state, focused item, basic pagination
   - `engine` — engine status mirror (subscribed via IPC)
7. **IPC wiring** — `useIpcSubscriptions` composable in App.vue subscribes to `engine:status`, `library:updated` events and hydrates stores on mount

### What's Explicitly NOT in MVP

- Generation pane (form, ref images, submit)
- Timeline pane
- Loupe/canvas view  
- Model manager
- Any modals
- Keyboard shortcuts (beyond basic thumbnail click/select)
- Import functionality (drag-drop import is included in grid as it was trivial in React)
- Right sidebar content panels
- Queue management
- Sort controls (status bar will have thumbnail slider + item count only)

---

## Phase 3a — Thumbnail Grid (Detailed Spec)

The thumbnail grid is the most important visual component in the application. It needs to be solid from day one: performant with hundreds of items, smooth resizing, clean selection behavior, and correct visual rendering. This section specifies exactly how to build it.

### Reference Implementation

The React version lives in `distillery-react/src/renderer/components/library/`:
- `GridView.tsx` — Row-based virtualization, column calculation, scroll container
- `MediaThumbnail.tsx` — Individual thumbnail rendering with overlays (rating stars, status badges, video duration)
- `LibraryStatusBar.tsx` — Thumbnail size slider, item count, sort controls
- `useMediaItemHandlers.ts` — Click/shift-click/ctrl-click selection logic, drag start

### Architecture Overview

```
MainContent.vue
├── GridView.vue              # Scroll container, virtualizer, column layout
│   └── MediaThumbnail.vue    # Single thumbnail cell (image + overlays)
└── LibraryStatusBar.vue      # Bottom bar: item count, thumbnail size slider
```

### Constants (keep in `lib/constants.ts`)

These already exist and are retained from the React version:

```ts
export const THUMBNAIL_SIZE_MIN = 100
export const THUMBNAIL_SIZE_MAX = 400
export const THUMBNAIL_SIZE_DEFAULT = 200
export const GRID_PAGE_SIZE = 200
export const GRID_BUFFER_ROWS = 5
```

The grid gap is hardcoded at `12px` (Tailwind `gap-3`).

### Component 1: `GridView.vue`

**Responsibility:** Scrollable container that virtualizes rows of thumbnails. Dynamically calculates how many columns fit based on container width and `thumbnailSize`, then renders only the visible rows.

**Virtualization:** Use `@tanstack/vue-virtual` (`useVirtualizer`). The API is nearly identical to the React adapter — same `count`, `getScrollElement`, `estimateSize`, `overscan` options. Install via:

```bash
npm install @tanstack/vue-virtual
```

**Column Calculation Algorithm (ported from React):**

1. Use a `ResizeObserver` on the scroll container to track `contentWidth` (container width minus padding).
2. Compute `columnCount = Math.max(1, Math.floor((contentWidth + GRID_GAP) / (thumbnailSize + GRID_GAP)))`.
3. Compute `rowCount = Math.ceil(items.length / columnCount)`.
4. Compute `rowHeight = colWidth + GRID_GAP`, where `colWidth = (contentWidth - GRID_GAP * (columnCount - 1)) / columnCount`. Since thumbnails are `aspect-square`, row height equals column width plus the gap.

**Key Implementation Details:**

```vue
<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { useLibraryStore } from '@/stores/library'
import { useUIStore } from '@/stores/ui'
import { GRID_BUFFER_ROWS } from '@/lib/constants'
import MediaThumbnail from './MediaThumbnail.vue'

const GRID_GAP = 12

const libraryStore = useLibraryStore()
const uiStore = useUIStore()

const scrollRef = ref<HTMLElement | null>(null)
const contentWidth = ref(0)

// Column count derived from container width and thumbnail size
const columnCount = computed(() => {
  if (contentWidth.value <= 0) return 0
  return Math.max(1, Math.floor(
    (contentWidth.value + GRID_GAP) / (uiStore.thumbnailSize + GRID_GAP)
  ))
})

const rowCount = computed(() => {
  if (columnCount.value === 0) return 0
  return Math.ceil(libraryStore.items.length / columnCount.value)
})

// Row height: since cells are aspect-square, height = computed cell width + gap
const rowHeight = computed(() => {
  if (columnCount.value === 0 || contentWidth.value <= 0) {
    return uiStore.thumbnailSize + GRID_GAP
  }
  const colWidth = (contentWidth.value - GRID_GAP * (columnCount.value - 1)) / columnCount.value
  return colWidth + GRID_GAP
})

// Virtualizer
const virtualizer = useVirtualizer(
  computed(() => ({
    count: rowCount.value,
    getScrollElement: () => scrollRef.value,
    estimateSize: () => rowHeight.value,
    overscan: GRID_BUFFER_ROWS
  }))
)

// Re-measure when row height changes (thumbnail slider, container resize)
watch(rowHeight, () => {
  virtualizer.value.measure()
})

// ResizeObserver to track container width
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  const el = scrollRef.value
  if (!el) return

  const measure = () => {
    contentWidth.value = el.clientWidth - 24 // 12px padding each side
  }
  measure()

  resizeObserver = new ResizeObserver(measure)
  resizeObserver.observe(el)
})

onUnmounted(() => {
  resizeObserver?.disconnect()
})

// Row items helper
function getRowItems(rowIndex: number) {
  const start = rowIndex * columnCount.value
  return libraryStore.items.slice(start, start + columnCount.value)
}
</script>
```

**Template Structure:**

The template follows the same pattern as React: an outer scroll container, an inner spacer div sized to `virtualizer.getTotalSize()`, and absolutely-positioned row divs rendered via `virtualizer.getVirtualItems()`. Each row uses CSS grid with `repeat(columnCount, 1fr)`.

```vue
<template>
  <div
    ref="scrollRef"
    class="h-full overflow-auto p-3"
    @dragover.prevent
    @drop="onDropImport"
  >
    <div
      :style="{
        height: `${virtualizer.getTotalSize()}px`,
        position: 'relative',
        width: '100%'
      }"
    >
      <div
        v-for="virtualRow in virtualizer.getVirtualItems()"
        :key="virtualRow.index"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: `${virtualRow.size - GRID_GAP}px`,
          transform: `translateY(${virtualRow.start}px)`,
          display: 'grid',
          gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
          gap: `${GRID_GAP}px`
        }"
      >
        <MediaThumbnail
          v-for="(media, colIdx) in getRowItems(virtualRow.index)"
          :key="media.id"
          :media="media"
          :index="virtualRow.index * columnCount + colIdx"
          :selected="libraryStore.selectedIds.has(media.id)"
          :focused="media.id === libraryStore.focusedId"
          @click="(e: MouseEvent) => handleClick(e, media.id)"
          @dblclick="handleDoubleClick(media.id)"
        />
      </div>
    </div>
  </div>
</template>
```

**Scroll Restoration:** When switching back from loupe to grid, scroll to the focused item's row:

```ts
// On mount, if there's a focused item, scroll to its row
onMounted(() => {
  if (libraryStore.focusedId && columnCount.value > 0) {
    const idx = libraryStore.items.findIndex(m => m.id === libraryStore.focusedId)
    if (idx >= 0) {
      const row = Math.floor(idx / columnCount.value)
      virtualizer.value.scrollToIndex(row, { align: 'center' })
    }
  }
})
```

**Drag-Drop Import:**

```ts
function onDropImport(e: DragEvent) {
  const files = Array.from(e.dataTransfer?.files ?? [])
  const paths = files
    .map(f => (f as File & { path?: string }).path)
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
  if (paths.length > 0) {
    window.api.importMedia(paths)
  }
}
```

### Component 2: `MediaThumbnail.vue`

**Responsibility:** Renders a single thumbnail cell. This is a leaf component — it receives all data via props and emits click events. No store access.

**Props:**
- `media: MediaRecord` — the media item
- `index: number` — for fallback label
- `selected: boolean` — whether this item is in the selection set
- `focused: boolean` — whether this item is the focus target

**Visual Structure:**
- Outer container: `aspect-square rounded-lg` button/div with selection ring
- Image: `<img>` with `object-cover`, loads from `media.thumb_path` (a `distillery://` URL)
- Fallback: centered index label when no thumbnail exists
- **Overlays** (ported from React's `MediaThumbnail`):
  - **Status badge** (top-left): green circle with check (selected) or X (rejected)
  - **Rating stars** (top-right): filled stars matching `media.rating`
  - **Video indicator** (bottom-left): play icon for video items
  - **Duration** (bottom-right): formatted duration for video items

**Selection Ring Styling:**
- Selected (not focused): `ring-2 ring-ring`
- Focused: `ring-2 ring-primary`
- Neither: no ring

```vue
<script setup lang="ts">
import type { MediaRecord } from '@/types'
import { formatDuration } from '@/lib/media'
import { computed } from 'vue'

const props = defineProps<{
  media: MediaRecord
  index: number
  selected: boolean
  focused: boolean
}>()

defineEmits<{
  click: [e: MouseEvent]
  dblclick: []
}>()

const starCount = computed(() =>
  Math.max(0, Math.min(5, Math.floor(props.media.rating)))
)
const isVideo = computed(() => props.media.media_type === 'video')

const ringClass = computed(() => {
  if (props.focused) return 'ring-2 ring-primary'
  if (props.selected) return 'ring-2 ring-ring'
  return ''
})
</script>

<template>
  <button
    type="button"
    class="group relative aspect-square rounded-lg outline-none"
    :class="ringClass"
    @click="$emit('click', $event)"
    @dblclick="$emit('dblclick')"
  >
    <div class="relative h-full w-full overflow-hidden rounded-md border bg-muted">
      <!-- Thumbnail image -->
      <img
        v-if="media.thumb_path"
        :src="media.thumb_path"
        :alt="media.file_name"
        class="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
        draggable="false"
      />
      <!-- Fallback -->
      <div
        v-else
        class="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground"
      >
        {{ index + 1 }}
      </div>

      <!-- Status badge (top-left) -->
      <div
        v-if="media.status"
        class="absolute top-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
      >
        <!-- Check or X icon via Nuxt UI's UIcon -->
      </div>

      <!-- Rating stars (top-right) -->
      <div
        v-if="starCount > 0"
        class="absolute top-1.5 right-1.5 flex items-center gap-px drop-shadow-sm"
      >
        <!-- Star icons repeated starCount times -->
      </div>

      <!-- Video indicators (bottom) -->
      <template v-if="isVideo">
        <div class="absolute bottom-1.5 left-1.5 rounded-full bg-black/65 p-1 text-white shadow-sm">
          <!-- Play icon -->
        </div>
        <div
          v-if="media.duration !== null"
          class="absolute right-1.5 bottom-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white shadow-sm"
        >
          {{ formatDuration(media.duration) }}
        </div>
      </template>
    </div>
  </button>
</template>
```

**Performance Notes:**
- The component should be as light as possible. No store subscriptions — all data comes via props.
- `loading="lazy"` on `<img>` lets the browser defer off-screen thumbnail loading.
- The virtualizer already ensures only visible rows are in the DOM, so lazy loading is a second layer of defense.

### Component 3: `LibraryStatusBar.vue`

**MVP scope:** Bottom bar with item count (left) and thumbnail size slider (right). Sort controls and view mode toggle are deferred.

```vue
<template>
  <div class="flex shrink-0 items-center gap-3 border-t px-3 py-2 text-xs">
    <!-- Item count -->
    <span class="tabular-nums text-muted-foreground">
      {{ libraryStore.items.length }} images
    </span>

    <div class="flex-1" />

    <!-- Thumbnail size slider -->
    <div class="flex w-28 items-center gap-1.5">
      <UIcon name="i-lucide-image" class="size-3 text-muted-foreground" />
      <USlider
        :model-value="uiStore.thumbnailSize"
        :min="THUMBNAIL_SIZE_MIN"
        :max="THUMBNAIL_SIZE_MAX"
        :step="10"
        @update:model-value="uiStore.setThumbnailSize($event)"
      />
      <UIcon name="i-lucide-image" class="size-4 text-muted-foreground" />
    </div>
  </div>
</template>
```

### Selection Behavior (composable: `useGridSelection.ts`)

Port the selection logic from `useMediaItemHandlers.ts` as a Vue composable:

```ts
// composables/useGridSelection.ts
import { useLibraryStore } from '@/stores/library'

export function useGridSelection() {
  const store = useLibraryStore()

  function handleClick(e: MouseEvent, id: string) {
    if (e.ctrlKey || e.metaKey) {
      store.toggleSelect(id)
    } else if (e.shiftKey) {
      store.rangeSelect(id)
    } else {
      store.selectSingle(id)
    }
  }

  function handleDoubleClick(id: string) {
    store.selectSingle(id)
    // Future: switch to loupe view
  }

  return { handleClick, handleDoubleClick }
}
```

The library Pinia store needs these selection methods (ported from the Zustand `library-store`):

- `selectSingle(id)` — clear selection, set `selectedIds = new Set([id])`, set `focusedId = id`
- `toggleSelect(id)` — add/remove from `selectedIds`, set `focusedId = id`
- `rangeSelect(id)` — select all items between `focusedId` and `id` (inclusive)

### Pinia Store: `stores/library.ts` (grid-relevant parts)

```ts
export const useLibraryStore = defineStore('library', () => {
  const items = ref<MediaRecord[]>([])
  const selectedIds = ref(new Set<string>())
  const focusedId = ref<string | null>(null)
  const total = ref(0)

  function selectSingle(id: string) {
    selectedIds.value = new Set([id])
    focusedId.value = id
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds.value)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    selectedIds.value = next
    focusedId.value = id
  }

  function rangeSelect(id: string) {
    if (!focusedId.value) {
      selectSingle(id)
      return
    }
    const startIdx = items.value.findIndex(m => m.id === focusedId.value)
    const endIdx = items.value.findIndex(m => m.id === id)
    if (startIdx < 0 || endIdx < 0) {
      selectSingle(id)
      return
    }
    const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx]
    const rangeIds = items.value.slice(lo, hi + 1).map(m => m.id)
    selectedIds.value = new Set([...selectedIds.value, ...rangeIds])
    focusedId.value = id
  }

  async function loadMedia() {
    // Call window.api.getMedia() and populate items + total
  }

  return { items, selectedIds, focusedId, total, selectSingle, toggleSelect, rangeSelect, loadMedia }
})
```

### Thumbnail Resize Behavior

When the user drags the thumbnail size slider:

1. `uiStore.thumbnailSize` updates reactively.
2. `GridView.vue`'s `columnCount` computed recalculates (more/fewer columns fit).
3. `rowHeight` recomputes (cells are `aspect-square`, so row height = cell width + gap).
4. `virtualizer.measure()` is called via the `watch(rowHeight, ...)` watcher, invalidating cached row measurements.
5. The grid visually reflows — columns adjust, rows resize, scroll position adapts.

This is the same chain as the React version but expressed declaratively via Vue's reactivity. The `ResizeObserver` on the container also fires when sidebars resize, ensuring the grid adapts to available space.

### File Structure Summary

```
src/renderer/
├── components/
│   └── library/
│       ├── GridView.vue           # Virtualized thumbnail grid
│       ├── MediaThumbnail.vue     # Single thumbnail cell
│       └── LibraryStatusBar.vue   # Bottom bar with slider
├── composables/
│   └── useGridSelection.ts       # Click/shift/ctrl selection logic
├── stores/
│   ├── ui.ts                     # thumbnailSize, view mode, panel state
│   └── library.ts                # items, selectedIds, focusedId, loadMedia
└── lib/
    └── constants.ts              # THUMBNAIL_SIZE_MIN/MAX/DEFAULT, GRID_BUFFER_ROWS (kept)
```

---

## Phase 4 — Execution Checklist

### Step 1: Gut React
- [ ] Create a new branch (e.g. `vue-rewrite`)
- [ ] Delete React renderer files per Phase 0 list
- [ ] Remove React dependencies from `package.json`
- [ ] Remove `components.json`
- [ ] Clean up ESLint config

### Step 2: Install Vue Stack
- [ ] Install Vue, Nuxt UI, Pinia, `@vitejs/plugin-vue`, `@tanstack/vue-virtual`
- [ ] Remove `@tailwindcss/vite` (Nuxt UI handles it)
- [ ] Update `electron.vite.config.ts` per Phase 1.2
- [ ] Update `tsconfig.web.json` per Phase 1.3
- [ ] Update `.gitignore` per Phase 1.4
- [ ] Install and configure `eslint-plugin-vue`
- [ ] Run `npm install`, verify clean install

### Step 3: Boot the Shell
- [ ] Create `env.d.ts`, `main.ts`, `App.vue`, `main.css`, `index.html`
- [ ] Verify `npm run dev` launches Electron with a blank Vue page
- [ ] Verify dark mode renders correctly (Nuxt UI default dark theme, no customization)

### Step 4: Build the Layout
- [ ] Create `AppLayout.vue` with `UDashboardGroup` + sidebars + panel
- [ ] Create `TitleBar.vue` with drag region and window controls
- [ ] Create `LeftSidebar.vue` with icon rail and placeholder content
- [ ] Create `RightSidebar.vue` with icon rail and placeholder content
- [ ] Create `MainContent.vue` with placeholder grid area
- [ ] Verify three-panel layout renders, sidebars resize and collapse

### Step 5: Wire Up Stores + IPC
- [ ] Create `stores/ui.ts` (Pinia) — sidebar state, view mode
- [ ] Create `stores/library.ts` (Pinia) — media items, load via `window.api.getMedia()`
- [ ] Create `stores/engine.ts` (Pinia) — engine status mirror
- [ ] Create `composables/useIpcSubscriptions.ts` — subscribe to IPC events
- [ ] Wire subscriptions in `App.vue`'s `onMounted`
- [ ] Verify engine status displays in sidebar footer

### Step 6: Thumbnail Grid
- [ ] Create `MediaThumbnail.vue` — single cell with image, overlays, selection ring
- [ ] Create `GridView.vue` — virtualized grid with `@tanstack/vue-virtual`
  - [ ] ResizeObserver-based column calculation
  - [ ] Row-based virtualization with `useVirtualizer`
  - [ ] `watch(rowHeight)` → `virtualizer.measure()` for smooth resize
  - [ ] Scroll restoration on mount (scroll to focused item's row)
  - [ ] Drag-drop file import handler
- [ ] Create `LibraryStatusBar.vue` — item count + thumbnail size slider (USlider)
- [ ] Create `composables/useGridSelection.ts` — click/shift/ctrl selection logic
- [ ] Wire selection into library store (`selectSingle`, `toggleSelect`, `rangeSelect`)
- [ ] Verify: thumbnails load from `distillery://` protocol URLs
- [ ] Verify: slider smoothly resizes thumbnails, grid reflows columns
- [ ] Verify: selection ring appears on click, multi-select works with shift/ctrl
- [ ] Verify: performance is acceptable with 200+ items

---

## Notes

### Nuxt UI Without vue-router

Nuxt UI's `router: false` config is designed for exactly this use case (Electron apps). The `ULink` and navigation components will render plain `<a>` tags. Distillery doesn't need page routing — the modal-driven navigation pattern from the React version carries over directly (just swap `useUIStore().activeModals` for a Pinia equivalent).

### Pinia vs Zustand

The mental model is nearly identical:

```ts
// Zustand (old)
const useUIStore = create<UIState>((set) => ({
  leftSidebarOpen: true,
  toggleLeftSidebar: () => set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen }))
}))

// Pinia (new)
export const useUIStore = defineStore('ui', () => {
  const leftSidebarOpen = ref(true)
  const toggleLeftSidebar = () => { leftSidebarOpen.value = !leftSidebarOpen.value }
  return { leftSidebarOpen, toggleLeftSidebar }
})
```

Same selector pattern, same ephemeral stores, same IPC-driven hydration. The translation is mechanical.

### electron-vite Compatibility

electron-vite supports `@vitejs/plugin-vue` out of the box — it's just a standard Vite plugin in the `renderer` config. No special configuration needed beyond what's shown in Phase 1.2.

### CSP Considerations

The Nuxt UI Vite plugin uses `unplugin-auto-import` and `unplugin-vue-components` which generate code at build time, not runtime. The existing CSP (`script-src 'self'`) should work. If Nuxt UI injects inline styles at runtime, we may need to verify `style-src 'unsafe-inline'` covers it (it's already present).

---

## References

### Nuxt UI (Vue/Vite mode)
- **MCP Server:** `nuxt-ui` — installed in this workspace. Use it to look up component docs, examples, composables, and templates.
- **LLM-optimized docs:** https://ui.nuxt.com/llms.txt
- **Vue/Vite installation guide:** https://ui.nuxt.com/getting-started/installation/vue
- **Component list:** https://ui.nuxt.com/components
- **Dashboard layout components:** https://ui.nuxt.com/components/dashboard-group, https://ui.nuxt.com/components/dashboard-sidebar, https://ui.nuxt.com/components/dashboard-panel
- **Theming / design system:** https://ui.nuxt.com/getting-started/theme

### Vue 3
- **Quick start:** https://vuejs.org/guide/quick-start.html
- **Composition API:** https://vuejs.org/guide/extras/composition-api-faq.html
- **`<script setup>` syntax:** https://vuejs.org/api/sfc-script-setup.html

### Pinia
- **Getting started:** https://pinia.vuejs.org/getting-started.html
- **Defining stores (composition API):** https://pinia.vuejs.org/core-concepts/#setup-stores

### TanStack Virtual (Vue)
- **Vue adapter:** https://tanstack.com/virtual/latest/docs/framework/vue/vue-virtual
- **Virtualizer API:** https://tanstack.com/virtual/latest/docs/api/virtualizer

### React Reference Codebase
- **Location:** `C:\Users\jason\projects\distillery-react` (git worktree, branch `react-reference`)
- **Key files for grid:** `src/renderer/components/library/GridView.tsx`, `MediaThumbnail.tsx`, `LibraryStatusBar.tsx`
- **Selection logic:** `src/renderer/hooks/useMediaItemHandlers.ts`
- **UI store (thumbnail size):** `src/renderer/stores/ui-store.ts`
- **Constants:** `src/renderer/lib/constants.ts`

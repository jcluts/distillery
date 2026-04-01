# Distillery — Vue Renderer Development Guide

Comprehensive reference for building, updating, and extending the Vue renderer. This document captures the established patterns, conventions, and architectural decisions that all renderer work must follow.

---

## Reference Sources

| Source | Location | What it provides |
|---|---|---|
| PrimeVue documentation | [primevue.org](https://primevue.org/) | **Full documentation for every PrimeVue component** — props, events, slots, styling. Consult this before resorting to custom Tailwind. |
| AGENTS.md | Project root | Architecture overview, process boundary, engine protocol, generation pipeline, PrimeVue conventions. |
| DistilleryAPI interface | `src/renderer/types/index.ts` | The complete IPC surface. Every `window.api.*` call and event subscription is defined here. |
| IPC channel constants | `src/main/ipc/channels.ts` | All IPC channel name strings. |

---

## Tech Stack (Renderer)

| Layer | Technology |
|---|---|
| Framework | Vue 3 (Composition API, `<script setup>` SFCs) |
| UI library | PrimeVue 4 (Aura theme via `@primeuix/themes`) |
| Auto-import | unplugin-vue-components + `@primevue/auto-import-resolver` |
| State | Pinia (setup syntax stores, no persistence middleware) |
| CSS | Tailwind 4 (`@tailwindcss/vite` plugin) |
| Virtualization | `@tanstack/vue-virtual` |
| Icons | `@iconify/vue` with `@iconify-json/lucide` (format: `lucide:icon-name`) |
| Font | Geist Variable (`@fontsource-variable/geist`, `@fontsource-variable/geist-mono`) |
| Template syntax | SFC templates **only** — no JSX, no render functions |

**PrimeVue config** (in `src/renderer/main.ts`):
- Theme: Aura preset with `darkModeSelector: '.dark'`, `cssLayer: false`
- Prefix: `p` — all PrimeVue CSS classes prefixed with `p-`
- Tooltip directive registered globally as `v-tooltip`
- No vue-router; navigation is modal-driven via the UI store

**Path aliases:** `@` / `@renderer` → `src/renderer/`

---

## Renderer Architecture

### App Shell

```
App.vue                             # IPC subscription bootstrap
└── AppLayout.vue                   # flex h-screen w-screen flex-col
    ├── TitleBar                    # Custom Electron title bar (drag region + window controls)
    └── main                        # flex min-h-0 flex-1 overflow-hidden
        ├── LeftSidebar (aside)     # Icon rail (w-12) + pane content area
        ├── MainContent (section)   # GridView | LoupeView + LibraryStatusBar
        └── RightSidebar (aside)    # Pane content area + icon rail (w-12, pinned right)
```

The layout uses **plain HTML flex containers**. Sidebar pane switching is driven by the UI store.

### Pane System

Sidebar content switches based on the active tab in the UI store. Each sidebar uses a computed `activePaneComponent` that resolves to a concrete pane component (GenerationPane, TimelinePane, etc.).

Panes use a set of structural primitives (all in `components/panes/primitives/`). These enforce consistent spacing, typography, and layout across every pane — individual panes should never hard-code spacing or header styles.

| Component | Purpose | Props |
|---|---|---|
| **`PaneLayout`** | Outermost wrapper. Provides the pane title header (`h-10`, uppercase, semibold) and a scrollable body area. Every pane's root element must be `<PaneLayout title="...">`. | `title: string` |
| **`PaneBody`** | Vertical rhythm container for the pane's main content. Wraps a slot in `space-y-8` to enforce consistent spacing between top-level sections. Always the direct child of `PaneLayout` (when content is shown). | *(none — slot only)* |
| **`PaneSection`** | A major labeled group within a pane (e.g. "Brush", "File Info", "Actions"). Renders an uppercase section header (`text-xs font-medium tracking-wider uppercase`) with `space-y-1.5` between header and content. | `title: string` |
| **`PaneField`** | A labeled control *within* a `PaneSection`. Lighter visual weight than a section header — uses `text-xs text-muted` for the label with `space-y-1` between label and content. Use when a section groups multiple related controls (e.g. brush size, feather, mode). | `label: string` |
| **`PaneGate`** | Empty/invalid state message. Centered, muted text shown when the pane can't display its content (no selection, wrong media type, wrong view mode). Use with `v-if`/`v-else-if` chains before the `PaneBody`. | `message: string` |
| **`PaneActions`** | Standardized layout container for action button groups. In row mode (default), child buttons are equal-width side-by-side. With `stack`, child buttons are full-width vertical. Automatically applies `flex-1 min-w-0 justify-center` (row) or `justify-center` (stack) to all direct children. | `stack?: boolean` |

**Visual hierarchy:** `PaneLayout` title > `PaneSection` title > `PaneField` label

Typical pane structure (simple — no gates):

```vue
<template>
  <PaneLayout title="Media Info">
    <PaneBody>
      <PaneSection title="Rating">
        <StarRating ... />
      </PaneSection>

      <PaneSection v-if="showDetails" title="File Info">
        <!-- content -->
      </PaneSection>
    </PaneBody>
  </PaneLayout>
</template>
```

Typical pane structure (with gates and fields):

```vue
<template>
  <PaneLayout title="Removals">
    <PaneGate v-if="noSelection" message="Select an image to remove objects" />
    <PaneGate v-else-if="notImage" message="Removals are available for images only" />
    <PaneGate v-else-if="notLoupe" message="Open an image in loupe view to use removals" />

    <PaneBody v-else>
      <PaneSection title="Brush">
        <div class="space-y-3">
          <PaneField label="Mode">
            <!-- toggle buttons -->
          </PaneField>
          <PaneField label="Size">
            <!-- slider + value -->
          </PaneField>
        </div>
      </PaneSection>

      <PaneSection title="Operations">
        <!-- list content -->
      </PaneSection>
    </PaneBody>
  </PaneLayout>
</template>
```

**When to use each component:**
- `PaneBody` — Always. Never use a raw `<div class="space-y-*">` as PaneLayout's direct child.
- `PaneSection` — For every visually distinct group that deserves a bold header. Aim for 2–4 sections per pane.
- `PaneField` — When a section contains multiple labeled controls. Wrap content in `<div class="space-y-3">` to space fields within a section. Don't use PaneField for a section with only one control.
- `PaneGate` — When the pane requires a specific context to be useful (image selected, loupe view active, etc.). Place gates *before* PaneBody in a `v-if`/`v-else-if`/`v-else` chain.
- `PaneActions` — For any group of action buttons. Use default (row) for side-by-side equal-width buttons (e.g., Apply/Cancel, Copy/Paste). Use `stack` for full-width stacked buttons (e.g., View Details + Reload). Never hand-code `flex gap-2` with `flex-1 justify-center` for button groups — use `PaneActions` instead.

**Reference implementations:**
- `MediaInfoPane.vue` — Definitive pattern for pane structure, store usage, IPC calls, and sub-component organization.
- `RemovalPane.vue` — Best example of gates + PaneField grouping within sections.
- `TransformPane.vue` — Example of combining PaneSection and PaneField for tool-specific controls.
- `CollectionsPane.vue` — List-selection pane using `ListItem`, drag-and-drop, and cross-store reactivity.

### Pinia Stores

All stores use **setup syntax** (`defineStore('id', () => { ... })`), not options syntax. State is `ref()`, derived state is `computed()`, methods are plain functions. Return all public state, getters, and actions from the setup function.

Stores are ephemeral (no persistence middleware). State syncs to the main process via IPC.

| Store | File | Responsibility |
|---|---|---|
| `useUIStore` | `stores/ui.ts` | Panel open/tab/width, view mode, thumbnail size, modal stack, settings |
| `useLibraryStore` | `stores/library.ts` | Media items, selection, focus, filters, sort, pagination |
| `useEngineStore` | `stores/engine.ts` | Engine state + loaded model name (mirror of main process) |
| `useGenerationStore` | `stores/generation.ts` | Generation form fields + timeline records |
| `useQueueStore` | `stores/queue.ts` | Work queue items + active generation progress/elapsed time |
| `useModelStore` | `stores/model.ts` | Model catalog, settings, downloads, file presence |
| `useProviderStore` | `stores/provider.ts` | Provider configs, API key presence, connection status |
| `useModelBrowsingStore` | `stores/model-browsing.ts` | Provider model browsing, user models, identity mappings |
| `useCollectionStore` | `stores/collection.ts` | Collections list, active collection, editing state |
| `useImportFolderStore` | `stores/import-folder.ts` | Import folder list, scan progress |
| `useRemovalStore` | `stores/removal.ts` | Object removal tool state + progress |
| `useTransformStore` | `stores/transform.ts` | Transform/crop tool state |
| `useAdjustmentStore` | `stores/adjustment.ts` | Non-destructive adjustment state |
| `useUpscaleStore` | `stores/upscale.ts` | Upscale task state + progress |

### IPC Pattern

All renderer ↔ main communication goes through `window.api.*` (exposed via preload bridge):
- **Invoke (request/response):** `await window.api.someMethod(args)` → main process handler returns result
- **Events (push from main):** `window.api.on('channel:name', callback)` → returns an unsubscribe function

IPC subscriptions are centralized in `useIpcSubscriptions` (composable mounted in App.vue). When adding a feature that receives push events from the main process, subscribe in this composable and dispatch to the appropriate store.

### Modal System

No router. Modals are tracked by `activeModals: string[]` in the UI store (`openModal(id)` / `closeModal(id)`). Modal components are always mounted in `App.vue`; visibility is driven by a computed getter/setter:

```vue
<script setup lang="ts">
const uiStore = useUIStore()

const visible = computed({
  get: () => uiStore.activeModals.includes('my-modal'),
  set: (val: boolean) => { if (!val) uiStore.closeModal('my-modal') }
})
</script>

<template>
  <Dialog v-model:visible="visible" header="My Modal" modal :closable="true">
    <template #default>...</template>
    <template #footer>...</template>
  </Dialog>
</template>
```

This pattern keeps modal open/close logic in the store (so any component can trigger it) while giving PrimeVue's `Dialog` a reactive two-way binding. All modals mount in `App.vue` — never inside a pane or sidebar.

---

## Icons

Icons use `@iconify/vue` with the `lucide` collection (`@iconify-json/lucide`):

```vue
<Icon icon="lucide:star" class="size-4" />
```

Icon names follow the `{collection}:{name}` convention (`lucide:folder-open`, `lucide:trash-2`, etc.).

For icon-only buttons, wrap an `<Icon>` inside `<Button>`:

```vue
<Button text plain severity="secondary" @click="handler">
  <Icon icon="lucide:folder-open" class="size-4" />
</Button>
```

---

## Development Rules

These apply to all renderer work.

### Architecture
- Simplest solution that satisfies the requirement. No overengineering.
- DRY — consolidate similar code. If two panes share a pattern, extract it.
- Delete dead code immediately. No "just in case" leftovers.
- Never leave legacy or compatibility shims. Zero backwards-compatibility concerns.
- No ad-hoc band-aids. If something is broken, fix the architecture.

### Components & Styling — PrimeVue First

**The #1 rule: Always use a PrimeVue component when one exists.** Do not build custom HTML+Tailwind versions of things PrimeVue already provides. Consult the [PrimeVue documentation](https://primevue.org/) before writing custom markup.

**Priority order for any UI element:**
1. **PrimeVue component with its built-in props/variants** — use `severity`, `variant`, `size`, `icon`, `loading`, etc. Accept the default PrimeVue Aura appearance.
2. **PrimeVue component with `pt` (pass-through) overrides** — override specific DOM elements' classes only when built-in props can't express the need.
3. **Tailwind utilities for layout only** — flex, grid, spacing, sizing, overflow, positioning. These are fine and expected for arranging components on the page.
4. **Custom Tailwind for visual styling** — absolute last resort. Only when no PrimeVue component or prop can achieve the effect.

**Do not:**
- Add decorative Tailwind classes (colors, borders, shadows, rounded corners, typography styles) to elements that a PrimeVue component could render instead.
- Use raw Tailwind color classes (`text-gray-400`, `bg-zinc-900`). Use PrimeVue's semantic CSS variables (`var(--p-text-color)`, `var(--p-text-muted-color)`, etc.) or PrimeVue component props (`severity="secondary"`).

### UI/UX
- Professional, clean, elegant — achieved through **PrimeVue Aura theme defaults**, not custom CSS.
- Dark mode is the default (`class="dark"` on `<html>`).

### TypeScript
- All components use `<script setup lang="ts">`.
- Props use `defineProps<T>()`, emits use `defineEmits<T>()`.
- Store state types should be inferred from `ref()` / `computed()` — explicit interfaces only when needed for complex shapes or IPC payloads.
- The `DistilleryAPI` interface in `src/renderer/types/index.ts` defines every available IPC method and event. Check it before adding new IPC calls.

### File Organization

```
src/renderer/
├── main.ts                         # Vue app entry (createApp, Pinia, PrimeVue plugin)
├── App.vue                         # Root: IPC subscriptions, modal mount points
├── assets/main.css                 # Tailwind 4, Geist font, PrimeVue token utilities
├── types/index.ts                  # Renderer type surface + DistilleryAPI interface
├── lib/                            # Pure utility functions
│   ├── constants.ts                # Resolution presets, aspect ratios, defaults
│   ├── layout.ts                   # Panel pixel widths
│   ├── canvas-draw.ts              # Canvas rendering utilities
│   ├── format.ts                   # Formatting helpers
│   ├── media.ts                    # Duration formatting
│   ├── schema-to-form.ts           # Dynamic form generation from provider schemas
│   ├── transform-math.ts           # Transform/crop geometry math
│   └── adjustment-constants.ts     # Adjustment slider presets
├── stores/                         # Pinia stores (setup syntax)
├── composables/                    # Vue composables
│   ├── useIpcSubscriptions.ts      # Centralized IPC event subscriptions
│   ├── useKeyboardShortcuts.ts     # Lightroom-style keyboard shortcuts
│   ├── useGridSelection.ts         # Grid click/shift-click/ctrl-click selection
│   └── useFilmstripSelection.ts    # Filmstrip selection logic
├── webgl/                          # WebGL shader utilities
└── components/
    ├── layout/                     # AppLayout, TitleBar, LeftSidebar, RightSidebar,
    │                               #   MainContent, SidebarIconRail
    ├── library/                    # FilterBar, GridView, LoupeView, LibraryStatusBar,
    │   │                           #   MediaThumbnail, LoupeFilmstrip, VideoPlayer
    │   └── canvas/                 # CanvasViewer (HTML Canvas, DPR-aware)
    ├── panes/                      # Sidebar content panels
    │   ├── GenerationPane.vue      # AI generation controls
    │   ├── TimelinePane.vue        # Generation history timeline
    │   ├── ImportPane.vue          # Import folder management
    │   ├── MediaInfoPane.vue       # Selected media metadata + actions
    │   ├── GenerationInfoPane.vue  # Generation metadata for selected image
    │   ├── CollectionsPane.vue     # Collection list + management
    │   ├── TransformPane.vue       # Crop/transform tools
    │   ├── AdjustmentsPane.vue     # Non-destructive adjustments
    │   ├── RemovalPane.vue         # Object removal tools
    │   ├── UpscalePane.vue         # Upscaling controls
    │   └── primitives/             # Pane structural building blocks
    │       ├── PaneLayout.vue      # Pane outer wrapper (title + scroll)
    │       ├── PaneBody.vue        # Section spacing container
    │       ├── PaneSection.vue     # Section with header
    │       ├── PaneField.vue       # Labeled control within a section
    │       ├── PaneGate.vue        # Empty-state message
    │       └── PaneActions.vue     # Action button group layout
    ├── shared/                     # Reusable components shared across panes/features
    │   ├── AdjustmentSlider.vue    # Labeled slider with reset
    │   ├── AspectIcon.vue          # Aspect ratio icon
    │   ├── KeywordEditor.vue       # Keyword tag editor
    │   ├── ListItem.vue            # Selectable list row (collections, folders, etc.)
    │   └── StarRating.vue          # Interactive star rating
    ├── generation/                 # Generation-related components
    │   ├── DynamicForm.vue         # Schema-driven form for remote providers
    │   ├── FormField.vue           # Individual dynamic form field
    │   ├── GenerationStatus.vue    # Generation progress display
    │   ├── ModelSelector.vue       # Model selection dropdown
    │   ├── ModeToggle.vue          # Generation mode toggle
    │   ├── LocalSizeSelector.vue   # Local model size controls
    │   ├── SizeSelector.vue        # Remote model size controls
    │   └── RefImageDropzone.vue    # Reference image drop target
    ├── providers/                  # Provider management components
    │   ├── ProviderManager.vue     # Main provider management layout
    │   ├── ProviderSidebar.vue     # Provider list sidebar
    │   ├── ProviderDetail.vue      # Provider config detail view
    │   ├── LocalDetail.vue         # Local engine config detail
    │   ├── LocalModelItem.vue      # Local model list item
    │   ├── ModelBrowser.vue        # Remote model catalog browser
    │   └── IdentityMappingSelect.vue # Model identity mapping selector
    ├── upscale/
    │   └── UpscaleStatus.vue       # Upscale progress display
    └── modals/                     # App-level modals (mounted in App.vue)
        ├── SettingsModal.vue
        ├── ProviderManagerModal.vue
        ├── GenerationDetailModal.vue
        ├── CollectionModal.vue
        ├── ImportFolderModal.vue
        └── ImagePreviewModal.vue
```

**Conventions:**
- Pane components go directly in `components/panes/` — one file per pane.
- Pane structural primitives (`PaneLayout`, `PaneBody`, `PaneSection`, `PaneField`, `PaneGate`, `PaneActions`) live in `components/panes/primitives/`.
- Reusable UI components shared across panes and features (`ListItem`, `StarRating`, `AdjustmentSlider`, etc.) live in `components/shared/`.
- Feature-specific components go in `components/{feature}/` (e.g. `generation/`, `providers/`, `upscale/`).
- Modal components go in `components/modals/` and are always mounted in `App.vue`.
- Stores: `stores/{name}.ts`. Composables: `composables/useXxx.ts`. Pure utilities: `lib/{name}.ts`.
- Types: `types/index.ts` (single file, mirrors `src/main/types.ts`).

---

## PrimeVue Quick Reference

### Component Customization (`pt` pass-through)

The `pt` prop overrides CSS classes on a component's internal DOM elements:

```vue
<Button pt:root="rounded-none" />
<Dialog :pt="{ mask: { class: 'bg-black/80' }, root: { class: 'max-w-2xl' } }" />
```

Consult the [PrimeVue pass-through docs](https://primevue.org/passthrough/) for available element names per component.

### Toasts

PrimeVue uses the `Toast` component + `useToast` composable:

```ts
import { useToast } from 'primevue/usetoast'

const toast = useToast()
toast.add({ severity: 'success', summary: 'Saved', life: 3000 })
```

Requires `<Toast />` mounted in the app root.

### Overlays

```vue
<Dialog v-model:visible="isVisible" header="Settings" modal>
  <template #default>...</template>
  <template #footer>...</template>
</Dialog>

<Menu ref="menuRef" :model="menuItems" :popup="true" />
<Button @click="menuRef.toggle($event)">
  <Icon icon="lucide:ellipsis-vertical" class="size-4" />
</Button>
```

### Form Inputs

PrimeVue form inputs use `v-model` directly:

```vue
<InputText v-model="name" placeholder="Enter name" />
<Textarea v-model="description" rows="3" />
<Select v-model="selected" :options="options" optionLabel="name" optionValue="id" />
<ToggleSwitch v-model="enabled" />
<Checkbox v-model="checked" binary />
<Slider v-model="value" :min="0" :max="100" />
```

---

## Development Workflow

When building a new feature or updating existing functionality:

1. **Check the IPC surface** in `src/renderer/types/index.ts` (the `DistilleryAPI` interface). Verify the methods and events you need exist. If new main-process support is required, add the IPC handler first.
2. **Check types** in `src/renderer/types/index.ts`. If a type is missing, check `src/main/types.ts` and add a matching definition to the renderer types.
3. **Check if a Pinia store exists** for this feature in `src/renderer/stores/`. If not, create one following the setup syntax pattern of existing stores. If it exists but is missing needed state or actions, extend it.
4. **Build or update the Vue component(s)**, following the established patterns documented below:
   - Use `PaneLayout` as the root wrapper for any sidebar pane, with `PaneBody`, `PaneSection`, `PaneField`, and `PaneGate` as needed.
   - Keep sub-components dumb — they emit events, parents handle IPC and store logic.
   - Check [PrimeVue documentation](https://primevue.org/) for components that match each UI element. Use their built-in props and variants.
5. **Wire IPC subscriptions** in `useIpcSubscriptions.ts` if the feature receives push events from the main process.
6. **Run `npx vue-tsc --noEmit -p tsconfig.web.json`** to typecheck before considering the work done.

---

## Established Patterns

These patterns are used consistently across the codebase. Follow them for consistency.

### Pane Structure

Every sidebar pane follows the same skeleton:

```
PaneLayout (title header + scrollable body)
├── PaneGate v-if="..." (zero or more — shown when pane can't display content)
└── PaneBody v-else (vertical rhythm between sections — space-y-8)
    ├── PaneSection title="Section A"
    │   └── content...
    ├── PaneSection title="Section B" (can have v-if for conditional sections)
    │   └── div.space-y-3 (when section has multiple fields)
    │       ├── PaneField label="Control 1"
    │       │   └── control...
    │       └── PaneField label="Control 2"
    │           └── control...
    └── PaneSection title="Section C"
        └── content...
```

**Do not** use raw `<div class="space-y-*">` as PaneLayout's direct child — always use `PaneBody`. This ensures section spacing is controlled in one place.

**Do not** create a separate PaneSection for every individual control. Group related controls (e.g. brush mode, size, feather) under one PaneSection and use PaneField for individual labels within it.

### Sub-component Communication

Sub-components within a pane are **dumb UI** — they emit events, and the parent pane handles all IPC and store logic:

```vue
<!-- Parent (MediaInfoPane.vue) -->
<StarRating :rating="media?.rating ?? 0" @change="handleRatingChange" />

<!-- Child (StarRating.vue) -->
<script setup lang="ts">
defineProps<{ rating: number }>()
const emit = defineEmits<{ change: [rating: number] }>()
</script>
```

This keeps IPC calls centralized in the pane and makes sub-components reusable.

### Status/Toggle Buttons

For mutually exclusive toggle buttons (e.g. status flags), use a row of `<Button>` with conditional styling to express the active state:

```vue
<Button
  :severity="isActive ? undefined : 'secondary'"
  :outlined="!isActive"
  :text="!isActive"
  size="small"
  @click="toggle"
>
  <Icon icon="lucide:circle-check" class="size-4" />
</Button>
```

### Action Button Rows

Icon-only action buttons use `v-tooltip` on `<Button>`:

```vue
<div class="flex flex-wrap gap-1">
  <Button v-tooltip="'Show in folder'" text plain severity="secondary" size="small" @click="...">
    <Icon icon="lucide:folder-open" class="size-4" />
  </Button>
</div>
```

### Confirmation Dialogs

Use `Dialog` with `header` prop, content in the default slot, and action buttons in `#footer`:

```vue
<Dialog v-model:visible="dialogVisible" header="Delete image?" modal>
  <p>This cannot be undone.</p>
  <template #footer>
    <div class="flex justify-end gap-2">
      <Button label="Cancel" severity="secondary" outlined @click="dialogVisible = false" />
      <Button label="Delete" severity="danger" @click="executeDelete" />
    </div>
  </template>
</Dialog>
```

### Info Tables

For key-value metadata display, use a `<dl>` with CSS grid — no custom component needed:

```vue
<dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
  <template v-for="row in rows" :key="row.label">
    <dt class="text-muted">{{ row.label }}</dt>
    <dd class="truncate text-default">{{ row.value }}</dd>
  </template>
</dl>
```

### List Items

For selectable list rows (collections, import folders, etc.), use the reusable **`ListItem`** component at `components/shared/ListItem.vue`.

ListItem provides a consistent look for all list patterns across every pane — selectable radio-style lists, action-button lists, drag-and-drop targets, etc.

**Props:** `selectable`, `selected`, `draggable`, `dragOver`. **Emits:** `select`.

**Named slots:**
| Slot | Purpose |
|---|---|
| `#icon` | Left accessory — icon or thumbnail. Only rendered if provided. |
| default | Main content — title text, subtitle, multi-line layout. Fills available space (`min-w-0 flex-1`). |
| `#actions` | Hover-reveal action buttons. Hidden by default, fades in on row hover (`group-hover/item:opacity-100`). |
| `#badge` | Right-pinned accessory — count badge or status indicator. Always visible. |

**Selectable list example** (collections):
```vue
<ListItem
  selectable
  :selected="item.id === activeId"
  :draggable="true"
  :drag-over="dragTargetId === item.id"
  @select="setActive(item.id)"
>
  <template #icon>
    <Icon icon="lucide:layers-3" class="size-4" />
  </template>
  {{ item.name }}
  <template #actions>
    <Button text plain severity="secondary" size="small" @click.stop="onEdit(item.id)">
      <Icon icon="lucide:settings" class="size-4" />
    </Button>
  </template>
  <template #badge>
    <Tag severity="secondary" :value="String(item.count)" />
  </template>
</ListItem>
```

**Non-selectable list example** (import folders):
```vue
<ListItem>
  <template #icon>
    <Icon icon="lucide:folder" class="size-4 text-muted" />
  </template>
  <div class="truncate font-medium">{{ folder.name }}</div>
  <div class="truncate text-xs text-muted">{{ folder.path }}</div>
  <template #actions>
    <Button text plain severity="secondary" size="small" @click.stop="onDelete(folder.id)">
      <Icon icon="lucide:trash-2" class="size-4" />
    </Button>
  </template>
</ListItem>
```

For drag-and-drop support (reordering or media drops), pass `:draggable="true"` and `:drag-over="isDragTarget"`, then handle native drag events (`@dragstart`, `@dragover`, `@drop`, etc.) on the same element.

### Cross-Store Reactivity

When one store's state depends on another (e.g. library queries need the active collection ID), use `storeToRefs` to get a reactive ref from the dependency store:

```ts
import { storeToRefs } from 'pinia'
import { useCollectionStore } from '@/stores/collection'

export const useLibraryStore = defineStore('library', () => {
  const collectionStore = useCollectionStore()
  const { activeCollectionId } = storeToRefs(collectionStore)

  function buildQuery(): MediaQuery {
    return {
      // ...other filters
      collectionId: activeCollectionId.value
    }
  }

  // Auto-reload when the dependency changes
  watch(activeCollectionId, () => {
    page.value = 1
    void loadMedia()
  })
})
```

Because Pinia refs are reactive, you can `watch` them to trigger side effects automatically.

**Important:** Only use this when there's a genuine data dependency. Avoid circular store dependencies (A → B → A).

### Modal Pattern (Create/Edit/Delete)

For modals that handle both creating and editing an entity (collections, import folders, etc.), follow the `CollectionModal.vue` pattern:

1. Read `editingId` from the entity's store to determine create vs. edit mode.
2. Use a `watch` on the `visible` computed to reset form state when the modal opens/closes.
3. Keep Save/Delete handlers in the modal — they call store actions directly.
4. Always call `closeModal` + clear `editingId` on close.

```vue
const visible = computed({
  get: () => uiStore.activeModals.includes('entity'),
  set: (val) => { if (!val) handleClose() }
})

const isEditing = computed(() => !!entityStore.editingId)

watch(visible, (isOpen) => {
  if (isOpen && editingEntity.value) {
    // Pre-fill form for edit
  } else {
    // Reset form for create
  }
})

function handleClose() {
  uiStore.closeModal('entity')
  entityStore.setEditingId(null)
}
```

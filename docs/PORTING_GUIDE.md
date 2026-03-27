# Distillery — Vue Porting Guide

General-purpose context for porting functionality from the React reference codebase to the Vue renderer.

---

## Background

Distillery is an Electron desktop app for local AI image generation and media management. The renderer is being rewritten from React / shadcn/ui to **Vue 3 / Nuxt UI / Pinia**. The main process, preload bridge, database, engine, and all backend services are unchanged — only `src/renderer/` is rebuilt.

The React version and V1 prototype are **wireframes** — they define *what* functionality exists and roughly *how* it's laid out, but not the pixel-level styling. The goal is a clean, idiomatic Nuxt UI implementation. We are content with default Nuxt UI appearance. Do not try to replicate the exact look of the React or V1 versions.

---

## Reference Sources

When porting a feature, consult these in order:

| Source | Location | What it provides |
|---|---|---|
| React reference codebase | `C:\Users\jason\projects\distillery-react` | **Wireframe reference** for component behavior, store logic, IPC calls, and layout structure. Defines *what* to build, not how it should look. |
| V1 screenshots | `agent_docs/distillery_v1_screenshots/` | Rough visual reference for layout intent. Do not pixel-match — Nuxt UI defaults take priority. |
| V1 source (Distillery prototype) | `C:\Users\jason\simple-ai-client` | Legacy codebase. Use only if the React reference is unclear on a behavioral detail. |
| Nuxt UI component docs | `docs/ui_components/` | **Full documentation for every Nuxt UI component** — props, slots, variants, examples. Consult this exhaustively before resorting to custom Tailwind. |
| Nuxt UI skill | `.agents/skills/nuxt-ui/SKILL.md` | Summarized component library reference with composables, theming, and layout guidance. Load via the skill system. |
| Nuxt UI generated theme files | `node_modules/.nuxt-ui/ui/<component>.ts` | Slot names, variants, and default classes for any Nuxt UI component. Inspect these when using the `:ui` prop. |
| AGENTS.md | Project root | Architecture overview, process boundary, engine protocol, generation pipeline. **Note:** The renderer sections still describe the React version. Ignore those sections; this document is the renderer guide. |
| DistilleryAPI interface | `src/renderer/types/index.ts` | The complete IPC surface. Every `window.api.*` call and event subscription is defined here. |
| IPC channel constants | `src/main/ipc/channels.ts` | All IPC channel name strings. |

---

## Current Tech Stack (Renderer)

| Layer | Technology |
|---|---|
| Framework | Vue 3 (Composition API, `<script setup>` SFCs) |
| UI library | Nuxt UI v4 (Vue/Vite mode — `@nuxt/ui/vite`, `router: false`) |
| State | Pinia |
| CSS | Tailwind 4 (via Nuxt UI) |
| Virtualization | `@tanstack/vue-virtual` |
| Icons | Iconify via Nuxt UI (collection: `lucide`, prefix: `i-lucide-*`) |
| Font | Inter Variable (`@fontsource-variable/inter`) |
| Template syntax | SFC templates **only** — no JSX, no render functions |

**Nuxt UI config** (in `electron.vite.config.ts`):
- `router: false` — no vue-router; navigation is modal-driven
- `colorMode: true` — dark mode via `class="dark"` on `<html>`
- Colors: `primary: 'cyan'`, `neutral: 'neutral'`

**Path aliases:** `@` / `@renderer` → `src/renderer/`

---

## Renderer Architecture

### App Shell

```
App.vue                             # UApp wrapper + IPC subscription bootstrap
└── AppLayout.vue                   # flex h-screen w-screen flex-col
    ├── TitleBar                    # Custom Electron title bar (drag region + window controls)
    └── UMain                       # flex min-h-0 flex-1 overflow-hidden
        ├── LeftSidebar (aside)     # Icon rail (w-12) + pane content area
        ├── MainContent (section)   # GridView | LoupeView + LibraryStatusBar
        └── RightSidebar (aside)    # Pane content area + icon rail (w-12, pinned right)
```

The layout uses **plain HTML flex containers** — no UDashboardGroup/UDashboardSidebar/UDashboardPanel. These were tried and rejected because their `fixed inset-0` / `min-h-svh` defaults fight the Electron frameless window layout.

### Pane System

Sidebar content switches based on the active tab in the UI store. Each sidebar uses a computed `activePaneComponent` that resolves to a concrete pane component (GenerationPane, TimelinePane, etc.).

Panes use two structural components:

- **`PaneLayout`** — Wraps an entire pane. Provides the pane title header and a scrollable body area. Every pane's root element should be `<PaneLayout title="...">`.
- **`PaneSection`** — Wraps a labeled section *within* a pane (e.g. "Rating", "File Info", "Actions"). Provides a consistent uppercase section header and vertical spacing. Use this instead of hand-writing `<div class="space-y-1.5"><p class="text-xs ...">` blocks.

Typical pane structure:

```vue
<template>
  <PaneLayout title="Media Info">
    <div class="space-y-5">
      <PaneSection title="Rating">
        <StarRating ... />
      </PaneSection>

      <PaneSection v-if="showDetails" title="File Info">
        <!-- content -->
      </PaneSection>
    </div>
  </PaneLayout>
</template>
```

**Reference implementations:**
- `MediaInfoPane.vue` — The definitive pattern for pane structure, store usage, IPC calls, and sub-component organization.
- `CollectionsPane.vue` — Example of a list-selection pane using `SelectableItem`, drag-and-drop, and cross-store reactivity.

### IPC Pattern

All renderer ↔ main communication goes through `window.api.*` (exposed via preload bridge):
- **Invoke (request/response):** `await window.api.someMethod(args)` → main process handler returns result
- **Events (push from main):** `window.api.on('channel:name', callback)` → returns an unsubscribe function

IPC subscriptions are centralized in `useIpcSubscriptions` (composable mounted in App.vue). When porting a feature that needs new IPC events, follow the same pattern: subscribe in the composable, dispatch to the appropriate store.

### Modal System

No router. Modals are tracked by `activeModals: string[]` in the UI store (`openModal(id)` / `closeModal(id)`). Modal components are always mounted in `App.vue`; visibility is driven by a computed getter/setter:

```vue
<script setup lang="ts">
const uiStore = useUIStore()

const open = computed({
  get: () => uiStore.activeModals.includes('my-modal'),
  set: (val: boolean) => { if (!val) uiStore.closeModal('my-modal') }
})
</script>

<template>
  <UModal v-model:open="open" title="My Modal">
    <template #body>...</template>
    <template #footer>...</template>
  </UModal>
</template>
```

This pattern keeps modal open/close logic in the store (so any component can trigger it) while giving `UModal` a reactive two-way binding. All modals mount inside `<UApp>` in `App.vue` — never inside a pane or sidebar.

---

## Porting Patterns (React → Vue)

### Components

| React | Vue |
|---|---|
| `.tsx` file with JSX | `.vue` SFC with `<script setup lang="ts">` + `<template>` |
| `props: SomeProps` interface | `defineProps<SomeProps>()` |
| Callback props (`onSomething`) | `defineEmits<{ something: [...args] }>()` |
| `useState` | `ref()` or `reactive()` |
| `useMemo` | `computed()` |
| `useEffect` (mount) | `onMounted()` |
| `useEffect` (watch dep) | `watch()` or `watchEffect()` |
| `useEffect` (cleanup) | `onBeforeUnmount()` or `watch` with cleanup callback |
| `useRef` (DOM) | `const el = ref<HTMLElement \| null>(null)` + `ref="el"` in template |
| `useCallback` | Not needed — Vue functions are stable unless recreated |
| Conditional rendering `{cond && <X />}` | `<X v-if="cond" />` |
| List rendering `{items.map(i => <X key={i.id} />)}` | `<X v-for="i in items" :key="i.id" />` |
| `className={cn(...)}` | `:class="[...]"` or `:class="{ 'cls': cond }"` — no `cn()` needed |
| `children` / render props | `<slot />` / named slots `<slot name="header" />` |

### Stores (Zustand → Pinia)

| Zustand | Pinia |
|---|---|
| `create<State>()((set, get) => ({ ... }))` | `defineStore('id', () => { ... })` (setup syntax) |
| `set({ field: value })` | Direct mutation: `field.value = value` |
| `get().field` | Just read the ref: `field.value` |
| Selector: `useStore(s => s.field)` | `const store = useMyStore(); store.field` |
| No built-in actions | Functions defined inside `defineStore` are actions |
| Derived state via inline functions | `computed()` inside the store |

All Pinia stores use **setup syntax** (`defineStore('id', () => { ... })`), not the options syntax. State is `ref()`, derived state is `computed()`, methods are plain functions. Return all public state, getters, and actions from the setup function.

### Hooks → Composables

React hooks become Vue composables. Same naming convention (`useXxx`), same purpose, different lifecycle:

```ts
// React hook
export function useSomething(arg: string) {
  const [val, setVal] = useState(0)
  useEffect(() => { /* on mount */ }, [])
  useEffect(() => { /* on arg change */ }, [arg])
  return { val }
}

// Vue composable
export function useSomething(arg: MaybeRef<string>) {
  const val = ref(0)
  onMounted(() => { /* on mount */ })
  watch(() => toValue(arg), () => { /* on arg change */ })
  return { val }
}
```

### shadcn/ui → Nuxt UI Component Mapping

| shadcn/ui (React) | Nuxt UI (Vue) | Notes |
|---|---|---|
| `<Button>` | `<UButton>` | Use `icon` prop for icon-only buttons |
| `<Input>` | `<UInput>` | |
| `<Textarea>` | `<UTextarea>` | |
| `<Select>` | `<USelect>` or `<USelectMenu>` | |
| `<Slider>` | `<USlider>` | |
| `<Switch>` | `<USwitch>` | |
| `<Checkbox>` | `<UCheckbox>` | |
| `<Dialog>` / `<AlertDialog>` | `<UModal>` | Use `v-model:open`, `title`, `description` props + `#footer` slot |
| `<Tooltip>` | `<UTooltip>` | Use `text` prop — wraps the trigger element in default slot |
| `<ContextMenu>` | `<UContextMenu>` | |
| `<DropdownMenu>` | `<UDropdownMenu>` | Pass flat or nested arrays to `:items` |
| `<Tabs>` | `<UTabs>` | |
| `<Badge>` | `<UBadge>` | Use `color`, `variant`, `size` props |
| `<Separator>` | `<USeparator>` | |
| `<ToggleGroup>` | Row of `<UButton>` | No direct equivalent — use buttons with conditional `color`/`variant` |
| `<SectionLabel>` | `<PaneSection>` | Custom React component replaced by our `PaneSection.vue` |
| `<InfoTable>` | `<dl>` grid | Use `grid grid-cols-[auto_1fr]` with `<dt>`/`<dd>` pairs |
| `<ScrollArea>` | `overflow-auto` (Tailwind) | Nuxt UI has no direct equivalent; use native overflow |
| `<ResizablePanelGroup>` | No direct equivalent | Use CSS flex + a simple drag handle if needed |
| `cn()` utility | Not needed | Use Tailwind classes directly; Nuxt UI `:class` merging handles conflicts |

For any component not listed, check `docs/ui_components/` (full component docs) or the Nuxt UI skill (`.agents/skills/nuxt-ui/SKILL.md`). Always look for a built-in Nuxt UI component before building custom markup.

### Icons

React used `lucide-react` with JSX components (`<Star />`). Vue uses Nuxt UI's Iconify integration:

```vue
<!-- React -->
<Star className="size-4" />

<!-- Vue -->
<UIcon name="i-lucide-star" class="size-4" />
```

Icon names follow the `i-{collection}-{name}` convention. Browse at [icones.js.org](https://icones.js.org). The `lucide` collection is pre-loaded in `main.ts`.

For buttons with icons: `<UButton icon="i-lucide-star" />` — no separate `<UIcon>` needed.

---

## Development Rules

These apply to all renderer work. Sourced from AGENTS.md, updated for Vue:

### Architecture
- Simplest solution that satisfies the requirement. No overengineering.
- DRY — consolidate similar code. If two panes share a pattern, extract it.
- Delete dead code immediately. No "just in case" leftovers.
- Never leave legacy or compatibility shims. Zero users, zero backwards-compatibility concerns.
- No ad-hoc band-aids. If something is broken, fix the architecture.

### Components & Styling — Nuxt UI First

**The #1 rule: Always use a Nuxt UI component when one exists.** Do not build custom HTML+Tailwind versions of things Nuxt UI already provides. Before writing any custom markup, exhaustively check `docs/ui_components/` for a suitable component. Nuxt UI has 125+ components — the right one almost always exists.

**Priority order for any UI element:**
1. **Nuxt UI component with its built-in props/variants** — use `variant`, `color`, `size`, `icon`, `loading`, `:items`, etc. Accept the default Nuxt UI appearance.
2. **Nuxt UI component with `:ui` prop overrides** — override specific slots only when the built-in props can't express the need. Check slot names in `node_modules/.nuxt-ui/ui/<component>.ts`.
3. **Tailwind utilities for layout only** — flex, grid, spacing, sizing, overflow, positioning. These are fine and expected for arranging components on the page.
4. **Custom Tailwind for visual styling** — absolute last resort. Only when no Nuxt UI component or prop can achieve the effect.

**Do not:**
- Recreate the React/V1 styling with custom Tailwind classes. Those designs were built on shadcn/ui — a completely different component library. Trying to replicate them defeats the purpose of this rewrite.
- Add decorative Tailwind classes (colors, borders, shadows, rounded corners, typography styles) to elements that a Nuxt UI component could render instead.
- Use raw Tailwind color classes (`text-gray-400`, `bg-zinc-900`). Use Nuxt UI's semantic utilities (`text-muted`, `bg-elevated`, `border-default`, `text-toned`) or component props (`color="primary"`).

### UI/UX
- Professional, clean, elegant — but achieved through **Nuxt UI defaults**, not custom CSS.
- Dark mode is the default (`class="dark"` on `<html>`).
- The React and V1 versions are **wireframes**: they define the feature set, layout structure, and user flows. They do **not** define the visual styling — Nuxt UI's default appearance is the target.
- Never copy React JSX, shadcn class lists, or V1 CSS. Understand the *behavior*, then find the Nuxt UI component that provides it.

### TypeScript
- All components use `<script setup lang="ts">`.
- Props use `defineProps<T>()`, emits use `defineEmits<T>()`.
- Store state types should be inferred from `ref()` / `computed()` — explicit interfaces only when needed for complex shapes or IPC payloads.
- The `DistilleryAPI` interface in `src/renderer/types/index.ts` defines every available IPC method and event. Check it before adding new IPC calls.

### File Organization
- Pane components: `src/renderer/components/panes/PaneName.vue`
- Pane sub-components: `src/renderer/components/panes/{pane-name}/SubComponent.vue`
- Shared pane primitives: `src/renderer/components/panes/PaneLayout.vue`, `PaneSection.vue`
- Shared reusable components: `src/renderer/components/shared/ComponentName.vue`
- Modal components: `src/renderer/components/modals/ModalName.vue`
- Other components: `src/renderer/components/{feature}/ComponentName.vue`
- Stores: `src/renderer/stores/{name}.ts`
- Composables: `src/renderer/composables/useXxx.ts`
- Pure utilities: `src/renderer/lib/{name}.ts`
- Types: `src/renderer/types/index.ts` (single file, mirrors `src/main/types.ts`)

When a pane has sub-components (e.g. StarRating, KeywordEditor inside MediaInfoPane), place them in a kebab-case subfolder: `components/panes/media-info/StarRating.vue`. The pane itself stays at `components/panes/MediaInfoPane.vue`.

---

## Nuxt UI Quick Reference

The project has a **nuxt-ui skill** installed at `.agents/skills/nuxt-ui/`. Load it for full component/composable/theming documentation. Key points:

### Component Customization (`:ui` prop)

The `:ui` prop overrides a component's **slots** — it wins over everything:

```vue
<UButton :ui="{ base: 'rounded-none' }" />
<UModal :ui="{ overlay: 'bg-black/80', content: 'max-w-2xl' }" />
```

Find slot names by reading: `node_modules/.nuxt-ui/ui/<component>.ts`

### Useful Composables

```ts
// Toast notifications
const toast = useToast()
toast.add({ title: 'Saved', color: 'success', icon: 'i-lucide-check' })

// Keyboard shortcuts (use for Lightroom-style hotkeys)
defineShortcuts({
  meta_k: () => focusPrompt(),
  escape: () => closeModal()
})
```

### Form Validation

Nuxt UI forms use Standard Schema (Zod, Valibot, etc.):

```vue
<UForm :schema="schema" :state="state" @submit="onSubmit">
  <UFormField name="email" label="Email">
    <UInput v-model="state.email" />
  </UFormField>
</UForm>
```

### Overlays

```vue
<UModal v-model:open="isOpen" title="Settings">
  <template #body>...</template>
  <template #footer>...</template>
</UModal>

<UDropdownMenu :items="menuItems">
  <UButton icon="i-lucide-ellipsis-vertical" variant="ghost" />
</UDropdownMenu>
```

---

## Common Porting Workflow

When picking up a new feature to port:

1. **Read the React component(s)** in `distillery-react/src/renderer/`. Understand the behavior, props, store interactions, and IPC calls.
2. **Read `MediaInfoPane.vue`** as the reference implementation. Follow its patterns for pane structure, store usage, IPC calls, and sub-component organization.
3. **Check types** in `src/renderer/types/index.ts` — the type definitions are already ported and shared. If a type is missing, check `src/main/types.ts` and add it to the renderer types.
4. **Check the IPC surface** in `src/renderer/types/index.ts` (the `DistilleryAPI` interface). The methods you need should already exist since the main process is unchanged.
5. **Check if a Pinia store exists** for this feature. If not, create one following the setup syntax pattern of the existing stores. If the store exists but is missing methods the React version relies on, add them.
6. **Build the Vue component(s)**:
   - Use `PaneLayout` as the root wrapper for any sidebar pane.
   - Use `PaneSection` for every labeled section within that pane.
   - Map React sub-components (e.g. `StarRating`, `KeywordEditor`) to Vue SFCs in a subfolder.
   - Convert React callback props to Vue `defineEmits` — keep the parent in control of IPC/store logic.
   - Exhaustively search `docs/ui_components/` for Nuxt UI components that match each UI element. Use their built-in props and variants. Accept the default Nuxt UI appearance — do not try to pixel-match the React version's styling.
7. **Wire IPC subscriptions** in `useIpcSubscriptions.ts` if the feature receives push events from the main process.
8. **Run `npx vue-tsc --noEmit -p tsconfig.web.json`** to typecheck before considering the work done.

---

## Established Component Patterns

These patterns have been established by already-ported components. Follow them for consistency.

### Pane Structure

Every sidebar pane follows the same skeleton:

```
PaneLayout (title header + scrollable body)
└── div.space-y-5 (vertical rhythm between sections)
    ├── PaneSection title="Section A"
    │   └── content...
    ├── PaneSection title="Section B" (can have v-if for conditional sections)
    │   └── content...
    └── PaneSection title="Section C"
        └── content...
```

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

### Status/Toggle Buttons (React ToggleGroup → Vue UButton row)

React's `<ToggleGroup>` has no direct Nuxt UI equivalent. Use a row of `<UButton>` with conditional `color` and `variant` props to express the active state:

```vue
<UButton
  icon="i-lucide-circle-check"
  :color="isActive ? 'primary' : 'neutral'"
  :variant="isActive ? 'subtle' : 'ghost'"
  size="sm"
/>
```

### Action Button Rows

Icon-only action buttons use `<UTooltip>` wrapping `<UButton>`:

```vue
<div class="flex flex-wrap gap-1">
  <UTooltip text="Show in folder">
    <UButton icon="i-lucide-folder-open" color="neutral" variant="outline" size="sm" @click="..." />
  </UTooltip>
</div>
```

### Confirmation Dialogs

Use `UModal` with `title`, `description`, and a `#footer` slot containing Cancel + action buttons:

```vue
<UModal v-model:open="dialogOpen" title="Delete image?" description="This cannot be undone.">
  <template #footer>
    <div class="flex justify-end gap-2">
      <UButton label="Cancel" color="neutral" variant="outline" @click="dialogOpen = false" />
      <UButton label="Delete" color="error" @click="executeDelete" />
    </div>
  </template>
</UModal>
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

### Selectable Item Lists (React Item/ItemGroup → Vue SelectableItem)

The React codebase uses a custom `Item` / `ItemGroup` component family for selectable list rows (collections, import folders, etc.). In Vue, use the reusable **`SelectableItem`** component at `components/shared/SelectableItem.vue`.

Props: `selected`, `draggable`, `dragOver`. Emits: `select`. Content goes in the default slot. The component provides a `group/item` CSS group so children can use `group-hover/item:opacity-100` for reveal-on-hover actions.

```vue
<SelectableItem
  :selected="item.id === activeId"
  @select="setActive(item.id)"
>
  <UIcon name="i-lucide-layers-3" class="size-4 shrink-0" />
  <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
  <UButton
    icon="i-lucide-settings"
    color="neutral"
    variant="ghost"
    size="xs"
    class="opacity-0 group-hover/item:opacity-100"
    @click.stop="onEdit(item.id)"
  />
  <UBadge color="neutral" variant="subtle" size="sm">
    {{ item.count }}
  </UBadge>
</SelectableItem>
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

This is the Pinia equivalent of the React pattern where `buildQuery()` reads `useOtherStore.getState().field`. The key difference: Pinia refs are reactive, so you can `watch` them to trigger side effects — no need for React-style `useEffect` dependency arrays.

**Important:** Only use this when there's a genuine data dependency. Avoid circular store dependencies (A → B → A).

### Modal Pattern (Create/Edit/Delete)

For modals that handle both creating and editing an entity (collections, import folders, etc.), follow the `CollectionModal.vue` pattern:

1. Read `editingId` from the entity's store to determine create vs. edit mode.
2. Use a `watch` on the `open` computed to reset form state when the modal opens/closes.
3. Keep Save/Delete handlers in the modal — they call store actions directly.
4. Always call `closeModal` + clear `editingId` on close.

```vue
const open = computed({
  get: () => uiStore.activeModals.includes('entity'),
  set: (val) => { if (!val) handleClose() }
})

const isEditing = computed(() => !!entityStore.editingId)

watch(open, (isOpen) => {
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

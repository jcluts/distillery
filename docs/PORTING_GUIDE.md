# Distillery — Vue Porting Guide

General-purpose context for porting functionality from the React reference codebase to the Vue renderer.

---

## Background

Distillery is an Electron desktop app for local AI image generation and media management. The renderer is being rewritten from React / shadcn/ui to **Vue 3 / PrimeVue / Pinia**. The main process, preload bridge, database, engine, and all backend services are unchanged — only `src/renderer/` is rebuilt.

The React version and V1 prototype are **wireframes** — they define *what* functionality exists and roughly *how* it's laid out, but not the pixel-level styling. The goal is a clean, idiomatic PrimeVue implementation. We are content with default PrimeVue Aura appearance. Do not try to replicate the exact look of the React or V1 versions.

---

## Reference Sources

When porting a feature, consult these in order:

| Source | Location | What it provides |
|---|---|---|
| React reference codebase | `C:\Users\jason\projects\distillery-react` | **Wireframe reference** for component behavior, store logic, IPC calls, and layout structure. Defines *what* to build, not how it should look. |
| V1 screenshots | `agent_docs/distillery_v1_screenshots/` | Rough visual reference for layout intent. Do not pixel-match — PrimeVue defaults take priority. |
| V1 source (Distillery prototype) | `C:\Users\jason\simple-ai-client` | Legacy codebase. Use only if the React reference is unclear on a behavioral detail. |
| PrimeVue documentation | [primevue.org](https://primevue.org/) | **Full documentation for every PrimeVue component** — props, events, slots, styling. Consult this before resorting to custom Tailwind. |
| AGENTS.md | Project root | Architecture overview, process boundary, engine protocol, generation pipeline, PrimeVue conventions. |
| DistilleryAPI interface | `src/renderer/types/index.ts` | The complete IPC surface. Every `window.api.*` call and event subscription is defined here. |
| IPC channel constants | `src/main/ipc/channels.ts` | All IPC channel name strings. |

---

## Current Tech Stack (Renderer)

| Layer | Technology |
|---|---|
| Framework | Vue 3 (Composition API, `<script setup>` SFCs) |
| UI library | PrimeVue 4 (Aura theme via `@primeuix/themes`) |
| Auto-import | unplugin-vue-components + `@primevue/auto-import-resolver` |
| State | Pinia (setup syntax stores, no persistence middleware) |
| CSS | Tailwind 4 (`@tailwindcss/vite` plugin) |
| Virtualization | `@tanstack/vue-virtual` |
| Icons | `@iconify/vue` with `@iconify-json/lucide` (format: `lucide:icon-name`) |
| Font | Inter Variable (`@fontsource-variable/inter`) |
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

### shadcn/ui → PrimeVue Component Mapping

| shadcn/ui (React) | PrimeVue (Vue) | Notes |
|---|---|---|
| `<Button>` | `<Button>` | Use `icon` prop for icon-only; `severity` for color; `text`+`plain` for ghost; `outlined` for outline |
| `<Input>` | `<InputText>` | |
| `<Textarea>` | `<Textarea>` | |
| `<Select>` | `<Select>` | Use `optionLabel`, `optionValue`, `:options` props |
| `<Slider>` | `<Slider>` | Emits `number \| number[]` — handle both types |
| `<Switch>` | `<ToggleSwitch>` | |
| `<Checkbox>` | `<Checkbox>` | |
| `<Dialog>` / `<AlertDialog>` | `<Dialog>` | Use `v-model:visible`, `header`, `modal` props + `#footer` slot |
| `<Tooltip>` | `v-tooltip` directive | Registered globally — use `v-tooltip="'text'"` on any element |
| `<ContextMenu>` | `<ContextMenu>` | |
| `<DropdownMenu>` | `<Menu>` / `<TieredMenu>` | Use `:model` with MenuModel API |
| `<Tabs>` | `<Tabs>` + `<TabList>` + `<Tab>` + `<TabPanels>` + `<TabPanel>` | |
| `<Badge>` | `<Tag>` | Use `severity`, `value` props |
| `<Separator>` | `<Divider>` | |
| `<ToggleGroup>` | Row of `<Button>` | Use buttons with conditional `severity`/`outlined` |
| `<SectionLabel>` | `<PaneSection>` | Custom React component replaced by our `PaneSection.vue` |
| `<InfoTable>` | `<dl>` grid | Use `grid grid-cols-[auto_1fr]` with `<dt>`/`<dd>` pairs |
| `<ScrollArea>` | `overflow-auto` (Tailwind) | Use native overflow |
| `<ResizablePanelGroup>` | No direct equivalent | Use CSS flex + a simple drag handle if needed |
| `cn()` utility | Not needed | Use Tailwind classes directly |

For any component not listed, check the [PrimeVue documentation](https://primevue.org/). Always look for a built-in PrimeVue component before building custom markup.

### Icons

React used `lucide-react` with JSX components (`<Star />`). Vue uses `@iconify/vue`:

```vue
<!-- React -->
<Star className="size-4" />

<!-- Vue -->
<Icon icon="lucide:star" class="size-4" />
```

Icon names follow the `{collection}:{name}` convention. The `lucide` collection is available via `@iconify-json/lucide`.

For buttons with icons, use PrimeVue's `icon` slot or pass a PrimeVue-compatible icon class. For icon-only buttons, wrapping an `<Icon>` component inside `<Button>` is the standard pattern:

```vue
<Button text plain severity="secondary" @click="handler">
  <Icon icon="lucide:folder-open" class="size-4" />
</Button>
```

---

## Development Rules

These apply to all renderer work. Sourced from AGENTS.md, updated for Vue:

### Architecture
- Simplest solution that satisfies the requirement. No overengineering.
- DRY — consolidate similar code. If two panes share a pattern, extract it.
- Delete dead code immediately. No "just in case" leftovers.
- Never leave legacy or compatibility shims. Zero users, zero backwards-compatibility concerns.
- No ad-hoc band-aids. If something is broken, fix the architecture.

### Components & Styling — PrimeVue First

**The #1 rule: Always use a PrimeVue component when one exists.** Do not build custom HTML+Tailwind versions of things PrimeVue already provides. Consult the [PrimeVue documentation](https://primevue.org/) before writing custom markup.

**Priority order for any UI element:**
1. **PrimeVue component with its built-in props/variants** — use `severity`, `variant`, `size`, `icon`, `loading`, etc. Accept the default PrimeVue Aura appearance.
2. **PrimeVue component with `pt` (pass-through) overrides** — override specific DOM elements' classes only when built-in props can't express the need.
3. **Tailwind utilities for layout only** — flex, grid, spacing, sizing, overflow, positioning. These are fine and expected for arranging components on the page.
4. **Custom Tailwind for visual styling** — absolute last resort. Only when no PrimeVue component or prop can achieve the effect.

**Do not:**
- Recreate the React/V1 styling with custom Tailwind classes. Those designs were built on shadcn/ui — a completely different component library. Trying to replicate them defeats the purpose of this rewrite.
- Add decorative Tailwind classes (colors, borders, shadows, rounded corners, typography styles) to elements that a PrimeVue component could render instead.
- Use raw Tailwind color classes (`text-gray-400`, `bg-zinc-900`). Use the semantic utilities in `main.css` (`text-muted`, `bg-elevated`, `border-default`) or PrimeVue component props (`severity="secondary"`).

### UI/UX
- Professional, clean, elegant — but achieved through **PrimeVue Aura theme defaults**, not custom CSS.
- Dark mode is the default (`class="dark"` on `<html>`).
- The React and V1 versions are **wireframes**: they define the feature set, layout structure, and user flows. They do **not** define the visual styling — PrimeVue's default Aura appearance is the target.
- Never copy React JSX, shadcn class lists, or V1 CSS. Understand the *behavior*, then find the PrimeVue component that provides it.

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
   - Check [PrimeVue documentation](https://primevue.org/) for components that match each UI element. Use their built-in props and variants. Accept the default PrimeVue Aura appearance — do not try to pixel-match the React version's styling.
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

### Status/Toggle Buttons (React ToggleGroup → Vue Button row)

React's `<ToggleGroup>` has no direct PrimeVue equivalent. Use a row of `<Button>` with conditional styling to express the active state:

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

### Selectable Item Lists (React Item/ItemGroup → Vue SelectableItem)

The React codebase uses a custom `Item` / `ItemGroup` component family for selectable list rows (collections, import folders, etc.). In Vue, use the reusable **`SelectableItem`** component at `components/shared/SelectableItem.vue`.

Props: `selected`, `draggable`, `dragOver`. Emits: `select`. Content goes in the default slot. The component provides a `group/item` CSS group so children can use `group-hover/item:opacity-100` for reveal-on-hover actions.

```vue
<SelectableItem
  :selected="item.id === activeId"
  @select="setActive(item.id)"
>
  <Icon icon="lucide:layers-3" class="size-4 shrink-0" />
  <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
  <Button
    text plain severity="secondary" size="small"
    class="opacity-0 group-hover/item:opacity-100"
    @click.stop="onEdit(item.id)"
  >
    <Icon icon="lucide:settings" class="size-4" />
  </Button>
  <Tag severity="secondary" :value="String(item.count)" />
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

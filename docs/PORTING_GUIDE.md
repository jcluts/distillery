# Distillery — Vue Porting Guide

General-purpose context for porting functionality from the React reference codebase to the Vue renderer.

---

## Background

Distillery is an Electron desktop app for local AI image generation and media management. The renderer is being rewritten from React / shadcn/ui to **Vue 3 / Nuxt UI / Pinia**. The main process, preload bridge, database, engine, and all backend services are unchanged — only `src/renderer/` is rebuilt.

The proven UI/UX patterns from the React version are the design spec. The goal is a clean Vue implementation on top of Nuxt UI — not a line-by-line translation.

---

## Reference Sources

When porting a feature, consult these in order:

| Source | Location | What it provides |
|---|---|---|
| React reference codebase | `C:\Users\jason\projects\distillery-react` | Canonical component behavior, store logic, IPC calls, form layouts. The `src/renderer/` tree is the reference for every feature. |
| V1 screenshots | `agent_docs/distillery_v1_screenshots/` | Visual reference for look and feel. |
| V1 source (Distillery prototype) | `C:\Users\jason\simple-ai-client` | Legacy codebase that informed the React version. Use only if the React reference is unclear on a UI detail. |
| Nuxt UI skill | `.agents/skills/nuxt-ui/SKILL.md` | Component library reference — use this **before** reading raw Nuxt UI docs. It covers components, composables, theming, and layouts. Load via the skill system. |
| Nuxt UI generated theme files | `node_modules/.nuxt-ui/ui/<component>.ts` | Slot names, variants, and default classes for any Nuxt UI component. Inspect these when customizing a component's `:ui` prop. |
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

Sidebar content switches based on the active tab in the UI store. Each sidebar uses a computed `activePaneComponent` that resolves to a concrete pane component (GenerationPane, TimelinePane, etc.). Pane components wrap `PaneLayout.vue` for consistent header/body chrome.

### IPC Pattern

All renderer ↔ main communication goes through `window.api.*` (exposed via preload bridge):
- **Invoke (request/response):** `await window.api.someMethod(args)` → main process handler returns result
- **Events (push from main):** `window.api.on('channel:name', callback)` → returns an unsubscribe function

IPC subscriptions are centralized in `useIpcSubscriptions` (composable mounted in App.vue). When porting a feature that needs new IPC events, follow the same pattern: subscribe in the composable, dispatch to the appropriate store.

### Modal System

No router. Modals are tracked by `activeModals: string[]` in the UI store. Components are always mounted; visibility is driven by `activeModals.includes(id)`. Use Nuxt UI's `UModal` with `v-model:open` bound to a computed getter/setter that reads from/writes to the store.

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
| `<Dialog>` | `<UModal>` | Use `v-model:open` |
| `<Tooltip>` | `<UTooltip>` | |
| `<ContextMenu>` | `<UContextMenu>` | |
| `<DropdownMenu>` | `<UDropdownMenu>` | Pass flat or nested arrays to `:items` |
| `<Tabs>` | `<UTabs>` | |
| `<Badge>` | `<UBadge>` | |
| `<Separator>` | `<USeparator>` | |
| `<ScrollArea>` | `overflow-auto` (Tailwind) | Nuxt UI has no direct equivalent; use native overflow |
| `<ResizablePanelGroup>` | No direct equivalent | Use CSS flex + a simple drag handle if needed |
| `cn()` utility | Not needed | Use Tailwind classes directly; Nuxt UI `:class` merging handles conflicts |

For any component not listed, check the Nuxt UI skill (`.agents/skills/nuxt-ui/SKILL.md`) — it covers 125+ components.

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

### Components & Styling
- **Use Nuxt UI components** for every standard UI element (buttons, inputs, modals, dropdowns, tooltips, badges, etc.).
- **Use Tailwind utilities** for layout, spacing, and any styling Nuxt UI doesn't cover.
- **Use Nuxt UI's `:ui` prop** to customize component slots when the default theme doesn't match the design. Check the generated theme file (`node_modules/.nuxt-ui/ui/<component>.ts`) to find slot names.
- **Use semantic color utilities** (`text-default`, `bg-elevated`, `border-muted`, etc.) — never raw Tailwind palette colors.
- **Custom CSS classes** are a last resort for effects that can't be achieved with Tailwind or Nuxt UI.

### UI/UX
- Professional, clean, elegant. Match the React reference's look and feel.
- Dark mode is the default (`class="dark"` on `<html>`).
- Don't copy React JSX or CSS verbatim — understand the intent, then implement cleanly in Vue/Nuxt UI.
- The V1 screenshots and React reference define "what it should look like." The Vue code defines "how it's built."

### TypeScript
- All components use `<script setup lang="ts">`.
- Props use `defineProps<T>()`, emits use `defineEmits<T>()`.
- Store state types should be inferred from `ref()` / `computed()` — explicit interfaces only when needed for complex shapes or IPC payloads.
- The `DistilleryAPI` interface in `src/renderer/types/index.ts` defines every available IPC method and event. Check it before adding new IPC calls.

### File Organization
- Components: `src/renderer/components/{feature}/ComponentName.vue`
- Stores: `src/renderer/stores/{name}.ts`
- Composables: `src/renderer/composables/useXxx.ts`
- Pure utilities: `src/renderer/lib/{name}.ts`
- Types: `src/renderer/types/index.ts` (single file, mirrors `src/main/types.ts`)

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
2. **Check types** in `src/renderer/types/index.ts` — the type definitions are already ported and shared. If a type is missing, check `src/main/types.ts` and add it to the renderer types.
3. **Check the IPC surface** in `src/renderer/types/index.ts` (the `DistilleryAPI` interface). The methods you need should already exist since the main process is unchanged.
4. **Check if a Pinia store exists** for this feature. If not, create one following the setup syntax pattern of the existing stores.
5. **Build the Vue component(s)**. Use Nuxt UI components where possible. Match the React version's behavior and visual output, not its code structure.
6. **Wire IPC subscriptions** in `useIpcSubscriptions.ts` if the feature receives push events from the main process.
7. **Run `npx vue-tsc --noEmit -p tsconfig.web.json`** to typecheck before considering the work done.

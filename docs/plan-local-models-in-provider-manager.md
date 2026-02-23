# Plan: Local Models as a Provider in Provider Manager

## Problem

The current Model Manager modal has UX issues:
- Side-by-side model cards in a fixed-height modal feel cramped and awkward
- Two separate modals (Model Manager + Provider Manager) for related concerns
- The Provider Manager's sidebar/detail layout is cleaner and more intuitive

## Goal

Retire the standalone Model Manager modal and integrate local model management into the Provider Manager as a "Local" provider entry. The Provider Manager becomes the single place to manage all model sources — both API and local.

---

## Design

### Sidebar Changes

Add a **"Local"** entry to the `ProviderSidebar`, visually separated from the API providers.

```
┌─────────────────────┐
│  Fal            · 3 │  ← API providers (existing)
│  Replicate      · 2 │
│  Wavespeed      · 1 │
│─────────────────────│  ← Separator
│  🟢 Local         2 │  ← New entry; green dot = all models ready
└─────────────────────┘
```

- The status dot reflects overall local readiness: green if all models with selections are ready, amber if any require setup.
- The badge count shows the number of catalog models (currently 2).
- Clicking "Local" sets `selectedProviderId` to `'local'`.

### Detail Panel: `LocalDetail`

When `selectedProviderId === 'local'`, the detail area renders a new `LocalDetail` component instead of `ProviderDetail`. This replaces the entire right-hand content area. No API key section, no model browser — instead, content tailored to local model management.

#### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  ▸ FLUX.1-dev                                  Ready ●         │  ← Model item (collapsed)
│                                                                  │
│  ▾ FLUX.1-schnell                        Setup Required ●       │  ← Model item (expanded)
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  DIFFUSION MODEL                                          │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  ○ Q8_0    ~12.2 GB   Highest quality       [Download] │  │
│  │  │  ● Q5_1    ~8.5 GB    Balanced  (Recommended) [Remove] │  │
│  │  │  ○ Q4_0    ~6.1 GB    Smallest, lower fidelity         │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │  TEXT ENCODER                                              │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  ● Q8_0    ~5.0 GB    Standard               [Ready]  │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │  VAE                                                       │  │
│  │  ┌──────────────────────────────────────────────────────┐  │  │
│  │  │  ae.safetensors   ~168 MB          [Ready] [Remove]    │  │
│  │  └──────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

The key UX improvement: **models are presented as a vertical list of collapsible items** instead of side-by-side cards. This uses the full width of the detail panel and works naturally in the constrained modal height.

#### Detailed Component Breakdown

**`LocalDetail`** (new component, replaces `ProviderDetail` when local is selected)

```
ScrollArea (h-full)
└─ div.space-y-1
   └─ LocalModelItem[] — one per model in catalog
```

**`LocalModelItem`** (new component, replaces `ModelCard`)

Uses Shadcn `Collapsible`. Each item is a single collapsible row.

*Collapsed state:*
```
┌────────────────────────────────────────────────────────────────┐
│  ▸  FLUX.1-dev                                    Ready ●     │
│     Quick image generation                                     │
└────────────────────────────────────────────────────────────────┘
```

- Chevron toggle on the left
- Model name (bold) + description (muted, truncated)
- Status badge on the right: green "Ready" or amber "Setup Required"
- The whole row is clickable to expand/collapse

*Expanded state:*

When expanded, reveals the model's component sections below the header. These are the existing `QuantSection` and `VaeSection` components — they work perfectly in this context and can be reused with minimal or no changes.

```
Collapsible
├─ CollapsibleTrigger (the header row above)
└─ CollapsibleContent
   └─ div.space-y-3.pt-3.pl-6  (indented to align under the model name)
      ├─ QuantSection (Diffusion Model)   ← existing component, reused as-is
      ├─ QuantSection (Text Encoder)       ← existing component, reused as-is
      └─ VaeSection                        ← existing component, reused as-is
```

This means `QuantSection` and `VaeSection` continue to handle all download/selection logic internally via callbacks. The only change is their container — they're now nested inside a collapsible list item instead of a card.

---

## Component Architecture

### New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `LocalDetail` | `src/renderer/components/providers/LocalDetail.tsx` | Detail panel for "Local" provider; renders list of `LocalModelItem`s |
| `LocalModelItem` | `src/renderer/components/providers/LocalModelItem.tsx` | Collapsible row for a single local model; wraps `QuantSection` + `VaeSection` |

### Reused Components (no changes needed)

| Component | Notes |
|-----------|-------|
| `QuantSection` | Handles quant selection, download progress, cancel/remove — works as-is |
| `VaeSection` | Handles VAE download/status — works as-is |
| `ProviderSidebar` | Modified to include "Local" entry |
| `ProviderManager` | Modified to route to `LocalDetail` when local is selected |

### Removed Components (after migration)

| Component | Notes |
|-----------|-------|
| `ModelManagerModal` | Entire modal wrapper — no longer needed |
| `ModelManager` | Main container with grid layout — replaced by `LocalDetail` |
| `ModelCard` | Card wrapper — replaced by `LocalModelItem` |
| `ModelCategoryTabs` | Only relevant when there are many model types; with 2 models, unnecessary. Can be removed. |

---

## State Management

### No new stores needed

- **`model-store`** — continues to be the source of truth for catalog, download status, file checks, and quant selections. `LocalDetail` and `LocalModelItem` consume from this store directly.
- **`provider-store`** — `selectProvider('local')` just works via the existing `selectProvider` action. Sidebar selection doesn't need a separate "local" concept.

### Sidebar status for "Local"

The `ProviderSidebar` needs to know if local models are ready. It can derive this from `model-store`:

```ts
const filesByModelId = useModelStore((s) => s.filesByModelId)
const catalog = useModelStore((s) => s.catalog)

const allReady = catalog?.models.every(
  (m) => filesByModelId[m.id]?.isReady
) ?? false
```

### Hydration

The `ProviderManager` component already hydrates provider data on mount. We add `model-store` hydration alongside it:

```ts
React.useEffect(() => {
  void loadProviders().then(() => void loadAllUserModels())
  void loadIdentities()
  void hydrateModelStore()   // ← add this
}, [...])
```

This ensures model catalog, file status, and download state are loaded when the Provider Manager opens — even if the old Model Manager was never opened.

---

## Sidebar Implementation Detail

The `ProviderSidebar` currently filters to `executionMode === 'remote-async'`. The change:

```tsx
// Current API providers
const apiProviders = providers.filter((p) => p.executionMode === 'remote-async')

// Render:
<ItemGroup>
  {apiProviders.map((provider) => (
    <Item ...> {/* existing API provider items */} </Item>
  ))}

  <Separator className="my-2" />

  {/* Local provider entry */}
  <Item
    variant="outline"
    size="sm"
    className={cn(
      'cursor-pointer',
      selectedProviderId === 'local'
        ? 'border-primary/40 bg-primary/10'
        : 'hover:border-border hover:bg-muted/50'
    )}
    onClick={() => selectProvider('local')}
  >
    <ItemContent>
      <ItemTitle>
        {statusDot(allLocalReady)}
        Local
      </ItemTitle>
    </ItemContent>
    <ItemActions>
      <Badge variant="secondary" className="text-[10px] px-1.5">
        {catalog?.models.length ?? 0}
      </Badge>
    </ItemActions>
  </Item>
</ItemGroup>
```

---

## Detail Panel Routing

In `ProviderManager`, route between the two detail components:

```tsx
<div className="min-w-0 flex-1">
  {selectedProviderId === 'local' ? (
    <LocalDetail />
  ) : selectedProviderId ? (
    <ProviderDetail providerId={selectedProviderId} />
  ) : (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Select a provider to configure
    </div>
  )}
</div>
```

---

## Modal & Entry Point Changes

### ProviderManagerModal

- Update dialog title from "API Providers" to "Providers" (it now covers local too).
- Update description to "Manage API providers, local models, and available endpoints" or similar.

### TitleBar

- Remove the "Models" button entirely. The "Providers" button becomes the single entry point.
- Optionally rename "Providers" to "Models & Providers" or just keep "Providers" (simpler).

### ModelSelector

- The `MANAGE_MODELS_VALUE` action currently calls `openModal('models')`. Change it to `openModal('providers')` and auto-select the local provider:
  ```ts
  openModal('providers')
  selectProvider('local')
  ```

### App.tsx

- Remove `<ModelManagerModal />` from the root render.

---

## Shadcn Components Used

All from existing Shadcn primitives — no custom components needed:

- `Collapsible` / `CollapsibleTrigger` / `CollapsibleContent` — for `LocalModelItem` expand/collapse
- `ScrollArea` — detail panel scrolling
- `Badge` — status indicators (Ready / Setup Required)
- `Button` — expand/collapse toggle
- `Separator` — dividing API providers from Local in sidebar
- `Item` / `ItemGroup` / `ItemContent` / `ItemTitle` / `ItemActions` — sidebar entry for Local
- `Progress` — download progress (via reused `QuantSection`)
- `Tooltip` — description tooltips (via reused `QuantSection`)

---

## Implementation Steps

1. **Create `LocalModelItem`** — Collapsible wrapper around existing `QuantSection` + `VaeSection`. This is mostly layout code with props passed through from model-store state.

2. **Create `LocalDetail`** — ScrollArea containing a list of `LocalModelItem`s. Connects to `model-store` for catalog, settings, file status, and download state. Calls `hydrate()` on mount.

3. **Update `ProviderSidebar`** — Add "Local" entry below a separator. Pull `model-store` state for readiness indicator and model count.

4. **Update `ProviderManager`** — Add conditional rendering for `LocalDetail` vs `ProviderDetail`. Add model-store hydration to the mount effect.

5. **Update `ProviderManagerModal`** — Change title/description to reflect broader scope.

6. **Update `TitleBar`** — Remove the "Models" button.

7. **Update `ModelSelector`** — Change `MANAGE_MODELS_VALUE` handler to open providers modal with local selected.

8. **Remove old Model Manager files** — Delete `ModelManagerModal.tsx`, `ModelManager.tsx`, `ModelCard.tsx`, `ModelCategoryTabs.tsx`. Keep `QuantSection.tsx`, `VaeSection.tsx`, and `utils.ts` (they're reused).

9. **Update `App.tsx`** — Remove `<ModelManagerModal />`.

---

## What Stays the Same

- All download/cancel/remove logic (model-store actions)
- All quant selection logic
- `QuantSection` and `VaeSection` components
- The `utils.ts` helpers (`formatApproxSize`, `toPercent`)
- The model catalog data model and types
- All backend/IPC APIs
- Provider Manager functionality for API providers is completely untouched

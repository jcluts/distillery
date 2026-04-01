# Prompt Library & Prompt Editor — Feature Spec

## 1. Overview

The Prompt Library gives users a persistent, searchable collection of saved prompts. The Prompt Editor modal provides a two-panel interface for composing prompts alongside a browsable library of saved ones — letting users quickly recall, refine, and apply prompts to the generation form.

### Feature Summary

| Capability | Description |
|---|---|
| **Save prompts** | Save the current generation prompt to the library with an optional title |
| **Browse library** | Scrollable list of saved prompts with search filtering |
| **Collections** | Organize prompts into user-created collections (hierarchical via parent_id) |
| **Ratings** | 1–5 star rating on saved prompts |
| **Use tracking** | Automatic use count and last-used timestamp |
| **Prompt Editor modal** | Two-column modal: textarea editor + library browser with preview |
| **Quick actions** | Load a saved prompt into the editor, copy to clipboard |
| **Integration** | Accessible from the generation pane prompt area via an edit/expand button |

### What We're NOT Porting from V1

These V1 features are out of scope for the initial implementation — they add complexity without clear value for the MVP:

- **Smart collections** (rule-based auto-filtering) — over-engineered for a prompt library; manual collections suffice.
- **Prompt templates** (`PromptTemplate` type with system prompts) — not relevant to the image generation workflow.
- **Model association on prompts** (`models[]` field) — unnecessary metadata; users know which prompts work with which models.
- **Tags on prompts** (`tags[]` field) — search covers this need without the UI overhead of tag management.
- **Source media ID tracking** (`sourceImageId`) — edge case from V1's describe feature; can be added later if needed.
- **JSON migration** — V1-specific legacy concern.
- **Quick Collection** — a V1 concept that adds complexity without clear benefit.
- **Prompt stats endpoint** (mostUsed/recentlyUsed/topRated aggregations) — no UI consumes this.

---

## 2. Data Model

### New Types (in `src/main/types.ts`)

```typescript
// ---------------------------------------------------------------------------
// Prompt Library
// ---------------------------------------------------------------------------

export interface PromptRecord {
  id: string
  title: string | null
  text: string
  rating: number          // 0–5
  use_count: number
  collection_id: string | null   // optional membership in one collection
  created_at: string      // ISO 8601
  updated_at: string
  last_used_at: string | null
}

export interface PromptCollectionRecord {
  id: string
  name: string
  parent_id: string | null
  sort_order: number
  created_at: string
  updated_at: string
  prompt_count?: number   // computed, not stored
}

export interface PromptCreate {
  text: string
  title?: string
  collection_id?: string
}

export interface PromptUpdate {
  text?: string
  title?: string
  rating?: number
  collection_id?: string | null
}

export interface PromptCollectionCreate {
  name: string
  parent_id?: string | null
}
```

**Design decisions:**

- **Single collection membership** (`collection_id` FK on `prompts`) instead of V1's many-to-many junction table. A prompt belongs to at most one collection. This eliminates the junction table, simplifies queries, and matches the mental model of "folders." If multi-collection membership is needed later, it's a straightforward migration.
- **No tags or models arrays** — these were JSON-encoded columns in V1 that added schema complexity but were barely used. Search on `text` and `title` covers the discovery need.
- **Flat `PromptRecord`** uses snake_case to match the DB column convention used elsewhere in the codebase (see `MediaRecord`, `CollectionRecord`).

### Database Migration (`019_prompt_library.sql`)

```sql
CREATE TABLE prompt_collections (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    parent_id       TEXT REFERENCES prompt_collections(id) ON DELETE CASCADE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE prompts (
    id              TEXT PRIMARY KEY,
    title           TEXT,
    text            TEXT NOT NULL,
    rating          INTEGER NOT NULL DEFAULT 0,
    use_count       INTEGER NOT NULL DEFAULT 0,
    collection_id   TEXT REFERENCES prompt_collections(id) ON DELETE SET NULL,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    last_used_at    TEXT
);

CREATE INDEX idx_prompts_rating ON prompts(rating);
CREATE INDEX idx_prompts_use_count ON prompts(use_count);
CREATE INDEX idx_prompts_collection_id ON prompts(collection_id);
CREATE INDEX idx_prompts_created_at ON prompts(created_at);
```

---

## 3. Main Process Architecture

### Repository (`src/main/db/repositories/prompts.ts`)

Plain functions following the established pattern (every function takes `db: Database.Database` as its first parameter):

```
getAllPrompts(db)                              → PromptRecord[]
getPromptById(db, id)                         → PromptRecord | undefined
searchPrompts(db, query)                      → PromptRecord[]    // LIKE on text + title
getPromptsByCollection(db, collectionId)      → PromptRecord[]
insertPrompt(db, data: PromptCreate)          → PromptRecord
updatePrompt(db, id, data: PromptUpdate)      → PromptRecord | undefined
deletePrompt(db, id)                          → void
incrementUseCount(db, id)                     → void
setRating(db, id, rating)                     → void

getAllCollections(db)                          → PromptCollectionRecord[]
getCollectionById(db, id)                     → PromptCollectionRecord | undefined
insertCollection(db, data)                    → PromptCollectionRecord
updateCollection(db, id, data)                → PromptCollectionRecord | undefined
deleteCollection(db, id)                      → void
reorderCollections(db, orderedIds: string[])  → void
```

- `getAllPrompts` returns results ordered by `created_at DESC`.
- `searchPrompts` uses parameterized `LIKE` on `text` and `title` columns.
- `getAllCollections` returns with a computed `prompt_count` via a LEFT JOIN / subquery.
- UUID generation uses `crypto.randomUUID()` (Node built-in, no external dependency).

### IPC Channels (`src/main/ipc/channels.ts`)

Add to `IPC_CHANNELS`:

```typescript
// Prompt Library
PROMPTS_GET_ALL:          'prompts:getAll',
PROMPTS_SEARCH:           'prompts:search',
PROMPTS_GET_BY_COLLECTION:'prompts:getByCollection',
PROMPTS_CREATE:           'prompts:create',
PROMPTS_UPDATE:           'prompts:update',
PROMPTS_DELETE:           'prompts:delete',
PROMPTS_INCREMENT_USE:    'prompts:incrementUse',
PROMPTS_SET_RATING:       'prompts:setRating',

PROMPT_COLLECTIONS_GET_ALL:    'promptCollections:getAll',
PROMPT_COLLECTIONS_CREATE:     'promptCollections:create',
PROMPT_COLLECTIONS_UPDATE:     'promptCollections:update',
PROMPT_COLLECTIONS_DELETE:     'promptCollections:delete',
PROMPT_COLLECTIONS_REORDER:    'promptCollections:reorder',
```

### IPC Handler (`src/main/ipc/handlers/prompts.ts`)

Single `registerPromptHandlers()` function following the established pattern. Thin delegation to repository functions — no business logic in the handler. Gets `db` from `getDatabase()`.

### Preload & DistilleryAPI

Add a `prompts` namespace to the `DistilleryAPI` interface:

```typescript
prompts: {
  getAll(): Promise<PromptRecord[]>
  search(query: string): Promise<PromptRecord[]>
  getByCollection(collectionId: string): Promise<PromptRecord[]>
  create(data: PromptCreate): Promise<PromptRecord>
  update(id: string, data: PromptUpdate): Promise<PromptRecord | null>
  delete(id: string): Promise<void>
  incrementUse(id: string): Promise<void>
  setRating(id: string, rating: number): Promise<void>

  collections: {
    getAll(): Promise<PromptCollectionRecord[]>
    create(data: PromptCollectionCreate): Promise<PromptCollectionRecord>
    update(id: string, data: Partial<PromptCollectionCreate>): Promise<PromptCollectionRecord | null>
    delete(id: string): Promise<void>
    reorder(orderedIds: string[]): Promise<void>
  }
}
```

Wire in `src/preload/index.ts` following the existing pattern for other namespaces.

---

## 4. Renderer Architecture

### Pinia Store (`src/renderer/stores/prompt.ts`)

Setup-syntax store following established conventions:

```typescript
export const usePromptStore = defineStore('prompt', () => {
  // State
  const prompts = ref<PromptRecord[]>([])
  const collections = ref<PromptCollectionRecord[]>([])
  const loading = ref(false)

  // Actions
  async function loadPrompts()
  async function searchPrompts(query: string)
  async function loadByCollection(collectionId: string)
  async function createPrompt(data: PromptCreate): Promise<PromptRecord>
  async function updatePrompt(id: string, data: PromptUpdate)
  async function deletePrompt(id: string)
  async function incrementUse(id: string)
  async function setRating(id: string, rating: number)

  async function loadCollections()
  async function createCollection(data: PromptCollectionCreate)
  async function updateCollection(id: string, data: Partial<PromptCollectionCreate>)
  async function deleteCollection(id: string)
  async function reorderCollections(orderedIds: string[])

  return { prompts, collections, loading, /* ...all actions */ }
})
```

The store is the single source of truth in the renderer. All IPC calls go through the store; components never call `window.api.prompts.*` directly.

### Modal Integration

The Prompt Editor is a PrimeVue `Dialog` modal, opened via `uiStore.openModal('prompt-editor')`. It is mounted in `App.vue` alongside the other modals.

**Opening the editor:** The generation pane's prompt `<Textarea>` section gets a small icon button (e.g., `lucide:maximize-2` or `lucide:pen-square`) that opens the modal with the current prompt text as initial content.

---

## 5. Prompt Editor Modal — UI Design

### Layout

A PrimeVue `Dialog` in `modal` mode, sized generously (e.g., `50vw` width × `70vh` height). Two columns inside.

```
┌──────────────────────────────────────────────────────────────┐
│  Prompt Editor                                           [X] │
├────────────────────────────┬─────────────────────────────────┤
│                            │  Library           [▼ filter]   │
│  ┌──────────────────────┐  │  ┌───────────────────────────┐  │
│  │                      │  │  │  Prompt item              │  │
│  │  Textarea            │  │  │  Prompt item (selected)   │  │
│  │  (auto-resize,       │  │  │  Prompt item              │  │
│  │   fills height)      │  │  │  ...                      │  │
│  │                      │  │  └───────────────────────────┘  │
│  │                      │  │                                 │
│  │                      │  │  Preview                        │
│  │                      │  │  ┌───────────────────────────┐  │
│  │                      │  │  │  Selected prompt text...  │  │
│  └──────────────────────┘  │  │                           │  │
│                            │  └───────────────────────────┘  │
│                            │  Used 12x    [Load] [Copy]      │
├────────────────────────────┴─────────────────────────────────┤
│  [Cancel]                            [Use Prompt] [Save]     │
└──────────────────────────────────────────────────────────────┘
```

### Component: `PromptEditorModal.vue`

**File:** `src/renderer/components/modals/PromptEditorModal.vue`

**PrimeVue components used:**
- `Dialog` — modal container with header, footer slots
- `Textarea` — prompt editing area (auto-resize)
- `Select` — collection filter dropdown
- `Button` — all action buttons
- `ProgressSpinner` — loading state

**Custom components used:**
- `ListItem` — each prompt in the library list (selectable, with icon/actions/badge slots)
- `StarRating` — inline rating display for selected prompt in preview

**Props:** The modal receives its initial text from the generation store (reading `generationStore.prompt` when it opens) rather than through props — since it's a store-driven modal, not a prop-driven child component.

### Behavior

1. **On open:** Load all prompts and collections from the store. Pre-populate the textarea with the current generation prompt. Auto-focus the textarea.

2. **Library list:**
   - Shows all prompts by default, ordered by `created_at DESC`.
   - PrimeVue `Select` at the top filters by collection. Selecting a collection fetches that collection's prompts.
   - Each prompt renders as a `ListItem` showing the title (or first line of text if untitled) and star rating in the badge slot.
   - Click to select (preview appears below). Double-click to load into the editor textarea.

3. **Preview panel:**
   - Shows the full text of the selected prompt.
   - Displays use count as a subtle meta line.
   - Two action buttons: **Load** (copies text to textarea) and **Copy** (clipboard).

4. **Footer actions:**
   - **Cancel** — closes with dirty-check confirmation (PrimeVue `ConfirmDialog` or simple `window.confirm`).
   - **Use Prompt** — sends the textarea text back to `generationStore.setFormValue('prompt', text)`, closes the modal. If the text matches a selected saved prompt exactly, increments its use count.
   - **Save to Library** — saves the current textarea text as a new prompt. Shows an inline input for an optional title (can be a small PrimeVue `Dialog` or `Popover`). After save, refreshes the list.

5. **Keyboard shortcuts** (within the modal):
   - `Escape` — close (with dirty check)
   - `Ctrl/Cmd+Enter` — Use Prompt
   - `Ctrl/Cmd+S` — Save to Library

### Generation Pane Integration

Add a small expand/edit button next to (or overlaid on) the prompt Textarea in GenerationPane:

```vue
<PaneSection title="Prompt">
  <div class="relative">
    <Textarea ... />
    <Button
      v-tooltip="'Open prompt editor (Ctrl+K)'"
      text plain severity="secondary"
      class="absolute right-1 top-1"
      @click="uiStore.openModal('prompt-editor')"
    >
      <Icon icon="lucide:pen-square" class="size-3.5" />
    </Button>
  </div>
</PaneSection>
```

The existing `Ctrl+K` shortcut (focus prompt) could be enhanced to open the Prompt Editor modal instead, or kept as focus-prompt with a separate shortcut for the editor.

---

## 6. Prompt Collection Management

Collections are lightweight organizational folders. They live in the library sidebar of the Prompt Editor modal.

### UI

The collection `Select` dropdown shows all collections with a flat list (children indented with `—` prefix, same approach as V1's `flattenCollections`). A small "manage" button next to the dropdown opens a simple inline UI or popover for creating/renaming/deleting collections.

For MVP, collection management can be minimal:
- **Create:** A text input + "Create" button in a `Popover` triggered from a `+` button next to the `Select`.
- **Delete:** Available from a context action when a collection is selected.
- **Rename:** Inline edit via double-click or a small edit button.

There is no need for a separate collections pane or modal — this is a lightweight organizational feature within the Prompt Editor.

---

## 7. Save-to-Library Flow

When saving a prompt (from the editor modal or from a "save" button in the generation pane):

1. User clicks Save (or `Ctrl+S` in the editor).
2. A small inline UI appears requesting an optional title (PrimeVue `Popover` with an `InputText` and confirm/cancel buttons, or a lightweight `Dialog`).
3. On confirm, `promptStore.createPrompt({ text, title })` is called.
4. The new prompt appears in the library list immediately.
5. A brief PrimeVue `Toast` confirms the save.

The generation pane's prompt section gets a small save/bookmark button alongside the editor button:

```vue
<Button
  v-tooltip="'Save prompt to library'"
  text plain severity="secondary"
  @click="handleSavePrompt"
>
  <Icon icon="lucide:bookmark-plus" class="size-3.5" />
</Button>
```

---

## 8. File Inventory

### New Files

| File | Purpose |
|---|---|
| `src/main/db/migrations/019_prompt_library.sql` | Schema migration |
| `src/main/db/repositories/prompts.ts` | Repository functions (prompts + collections) |
| `src/main/ipc/handlers/prompts.ts` | IPC handler registration |
| `src/renderer/stores/prompt.ts` | Pinia store |
| `src/renderer/components/modals/PromptEditorModal.vue` | The modal component |

### Modified Files

| File | Change |
|---|---|
| `src/main/types.ts` | Add `PromptRecord`, `PromptCollectionRecord`, `PromptCreate`, `PromptUpdate`, `PromptCollectionCreate` |
| `src/renderer/types/index.ts` | Duplicate types + add `prompts` namespace to `DistilleryAPI` |
| `src/main/ipc/channels.ts` | Add prompt channel constants |
| `src/main/index.ts` | Call `registerPromptHandlers()` in service wiring |
| `src/preload/index.ts` | Wire `prompts` namespace in the bridge |
| `src/renderer/App.vue` | Mount `PromptEditorModal` |
| `src/renderer/components/panes/GenerationPane.vue` | Add editor button + save button near the prompt textarea |

---

## 9. Implementation Order

1. **Database & types** — Migration file, type definitions in both type files.
2. **Repository** — All prompt and collection CRUD functions.
3. **IPC layer** — Channel constants, handler registration, preload bridge, DistilleryAPI interface.
4. **Pinia store** — State, actions, IPC calls.
5. **Prompt Editor modal** — Full modal component with two-column layout, library browser, preview, and all actions.
6. **Generation pane integration** — Editor button, save button, keyboard shortcut wiring.
7. **Collection management** — The collection dropdown + create/delete UI within the editor.

Steps 1–3 can be implemented and verified independently (via IPC test calls). Steps 4–5 form the main UI work. Steps 6–7 are integration and polish.

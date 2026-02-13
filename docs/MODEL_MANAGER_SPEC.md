# Model Manager Spec

## 1. Overview

Replace the current flat, per-path model settings (`diffusion_model_path`, `vae_path`, `llm_path` in `AppSettings`) with a JSON-config-driven model catalog and a Model Manager UI. The config defines available models and their quant variants; the UI lets users download models and choose active quant levels; the generation form gains a model selector dropdown.

### Goals

- Support multiple models (FLUX.2 Klein 4B and 9B today, more later).
- Support independent quant-level selection for diffusion model and LLM text encoder.
- Shared VAE per model (not performance-tiered).
- Download URLs baked into the config; local paths are relative to a configurable base directory.
- Single-active-quant-per-component constraint (one diffusion quant, one LLM quant per model).
- Clean removal of all legacy per-path settings code.

---

## 2. Model Catalog Config

### 2.1 File Location

**Ship-time default:** `src/main/config/model-catalog.json` — bundled with the app, read-only reference.

**Runtime (user-editable):** Copied on first launch to the Electron `userData` directory:
```
%APPDATA%/distillery/profiles/Default/model-catalog.json   (Windows)
~/Library/Application Support/distillery/...               (macOS)
~/.config/distillery/...                                   (Linux)
```

On startup, the main process reads the runtime copy. If the runtime copy is missing, it is seeded from the bundled default. Version-bumps in the bundled config can be handled via a `catalogVersion` field in the future.

### 2.2 Model Base Directory

A new `AppSettings` key: `model_base_path`. Defaults to `<userData>/models/`. All relative paths in the catalog resolve against this. The user can change this value via Settings.

### 2.3 JSON Schema

```jsonc
{
  "catalogVersion": 1,
  "models": [
    {
      "id": "flux2-klein-4b",                        // Unique stable ID
      "name": "FLUX.2 Klein 4B",                     // Display name
      "description": "Lightweight 4B-param FLUX diffusion model. Best for low-VRAM setups.",
      "type": "image-generation",                    // Category tag (future: "upscaling", "lm", etc.)
      "family": "flux2-klein",                       // Groups models that share an engine config profile

      "vae": {
        "file": "vae/ae.safetensors",                // Relative to model_base_path
        "size": 335544320,                           // Bytes (for UI display, ~320 MB)
        "downloadUrl": "https://huggingface.co/black-forest-labs/FLUX.2-dev/resolve/main/ae.safetensors"
      },

      "diffusion": {
        "quants": [
          {
            "id": "Q3_K_S",
            "label": "Q3_K_S",
            "description": "Smallest — ~2.1 GB, lower quality",
            "file": "flux2-klein-4b/flux-2-klein-4b-Q3_K_S.gguf",
            "size": 2254857830,
            "downloadUrl": "https://huggingface.co/unsloth/FLUX.2-klein-4B-GGUF/resolve/main/flux-2-klein-4b-Q3_K_S.gguf"
          },
          {
            "id": "Q4_K_S",
            "label": "Q4_K_S",
            "description": "Balanced — ~2.6 GB, good quality/size tradeoff",
            "file": "flux2-klein-4b/flux-2-klein-4b-Q4_K_S.gguf",
            "size": 2791728742,
            "downloadUrl": "https://huggingface.co/unsloth/FLUX.2-klein-4B-GGUF/resolve/main/flux-2-klein-4b-Q4_K_S.gguf"
          },
          {
            "id": "Q5_K_M",
            "label": "Q5_K_M",
            "description": "High quality — ~3.1 GB",
            "file": "flux2-klein-4b/flux-2-klein-4b-Q5_K_M.gguf",
            "size": 3326083481,
            "downloadUrl": "https://huggingface.co/unsloth/FLUX.2-klein-4B-GGUF/resolve/main/flux-2-klein-4b-Q5_K_M.gguf"
          },
          {
            "id": "Q6_K",
            "label": "Q6_K",
            "description": "Very high quality — ~3.4 GB",
            "file": "flux2-klein-4b/flux-2-klein-4b-Q6_K.gguf",
            "size": 3693084672,
            "downloadUrl": "https://huggingface.co/unsloth/FLUX.2-klein-4B-GGUF/resolve/main/flux-2-klein-4b-Q6_K.gguf"
          },
          {
            "id": "Q8_0",
            "label": "Q8_0",
            "description": "Near-lossless — ~4.3 GB",
            "file": "flux2-klein-4b/flux-2-klein-4b-Q8_0.gguf",
            "size": 4617089024,
            "downloadUrl": "https://huggingface.co/unsloth/FLUX.2-klein-4B-GGUF/resolve/main/flux-2-klein-4b-Q8_0.gguf"
          }
        ]
      },

      "textEncoder": {
        "quants": [
          {
            "id": "Q3_K_M",
            "label": "Q3_K_M",
            "description": "Smallest — ~2.1 GB",
            "file": "qwen3-4b/Qwen3-4B-Q3_K_M.gguf",
            "size": 2254857830,
            "downloadUrl": "https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q3_K_M.gguf"
          },
          {
            "id": "Q4_K_M",
            "label": "Q4_K_M",
            "description": "Balanced — ~2.5 GB",
            "file": "qwen3-4b/Qwen3-4B-Q4_K_M.gguf",
            "size": 2684354560,
            "downloadUrl": "https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf"
          },
          {
            "id": "Q5_K_M",
            "label": "Q5_K_M",
            "description": "High quality — ~2.9 GB",
            "file": "qwen3-4b/Qwen3-4B-Q5_K_M.gguf",
            "size": 3113851289,
            "downloadUrl": "https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q5_K_M.gguf"
          },
          {
            "id": "Q6_K",
            "label": "Q6_K",
            "description": "Very high quality — ~3.3 GB",
            "file": "qwen3-4b/Qwen3-4B-Q6_K.gguf",
            "size": 3543348019,
            "downloadUrl": "https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q6_K.gguf"
          },
          {
            "id": "Q8_0",
            "label": "Q8_0",
            "description": "Near-lossless — ~4.3 GB",
            "file": "qwen3-4b/Qwen3-4B-Q8_0.gguf",
            "size": 4617089024,
            "downloadUrl": "https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q8_0.gguf"
          }
        ]
      }
    },
    {
      "id": "flux2-klein-9b",
      "name": "FLUX.2 Klein 9B",
      "description": "Full 9B-param FLUX diffusion model. Higher quality, requires more VRAM.",
      "type": "image-generation",
      "family": "flux2-klein",

      "vae": {
        "file": "vae/ae.safetensors",
        "size": 335544320,
        "downloadUrl": "https://huggingface.co/black-forest-labs/FLUX.2-dev/resolve/main/ae.safetensors"
      },

      "diffusion": {
        "quants": [
          {
            "id": "Q3_K_S",
            "label": "Q3_K_S",
            "description": "Smallest — ~4.7 GB, lower quality",
            "file": "flux2-klein-9b/flux-2-klein-9b-Q3_K_S.gguf",
            "size": 5045559091,
            "downloadUrl": "https://huggingface.co/unsloth/FLUX.2-klein-9B-GGUF/resolve/main/flux-2-klein-9b-Q3_K_S.gguf"
          },
          {
            "id": "Q4_K_S",
            "label": "Q4_K_S",
            "description": "Balanced — ~5.8 GB, good quality/size tradeoff",
            "file": "flux2-klein-9b/flux-2-klein-9b-Q4_K_S.gguf",
            "size": 6264135475,
            "downloadUrl": "https://huggingface.co/unsloth/FLUX.2-klein-9B-GGUF/resolve/main/flux-2-klein-9b-Q4_K_S.gguf"
          },
          {
            "id": "Q5_K_M",
            "label": "Q5_K_M",
            "description": "High quality — ~7.0 GB",
            "file": "flux2-klein-9b/flux-2-klein-9b-Q5_K_M.gguf",
            "size": 7549747200,
            "downloadUrl": "https://huggingface.co/unsloth/FLUX.2-klein-9B-GGUF/resolve/main/flux-2-klein-9b-Q5_K_M.gguf"
          },
          {
            "id": "Q6_K",
            "label": "Q6_K",
            "description": "Very high quality — ~7.9 GB",
            "file": "flux2-klein-9b/flux-2-klein-9b-Q6_K.gguf",
            "size": 8451522560,
            "downloadUrl": "https://huggingface.co/unsloth/FLUX.2-klein-9B-GGUF/resolve/main/flux-2-klein-9b-Q6_K.gguf"
          },
          {
            "id": "Q8_0",
            "label": "Q8_0",
            "description": "Near-lossless — ~10.0 GB",
            "file": "flux2-klein-9b/flux-2-klein-9b-Q8_0.gguf",
            "size": 10737418240,
            "downloadUrl": "https://huggingface.co/unsloth/FLUX.2-klein-9B-GGUF/resolve/main/flux-2-klein-9b-Q8_0.gguf"
          }
        ]
      },

      "textEncoder": {
        "quants": [
          {
            "id": "Q3_K_M",
            "label": "Q3_K_M",
            "description": "Smallest — ~4.1 GB",
            "file": "qwen3-8b/Qwen3-8B-Q3_K_M.gguf",
            "size": 4424260608,
            "downloadUrl": "https://huggingface.co/unsloth/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q3_K_M.gguf"
          },
          {
            "id": "Q4_K_M",
            "label": "Q4_K_M",
            "description": "Balanced — ~5.0 GB",
            "file": "qwen3-8b/Qwen3-8B-Q4_K_M.gguf",
            "size": 5402263552,
            "downloadUrl": "https://huggingface.co/unsloth/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf"
          },
          {
            "id": "Q5_K_M",
            "label": "Q5_K_M",
            "description": "High quality — ~5.9 GB",
            "file": "qwen3-8b/Qwen3-8B-Q5_K_M.gguf",
            "size": 6283018240,
            "downloadUrl": "https://huggingface.co/unsloth/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q5_K_M.gguf"
          },
          {
            "id": "Q6_K",
            "label": "Q6_K",
            "description": "Very high quality — ~6.7 GB",
            "file": "qwen3-8b/Qwen3-8B-Q6_K.gguf",
            "size": 7226982400,
            "downloadUrl": "https://huggingface.co/unsloth/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q6_K.gguf"
          },
          {
            "id": "Q8_0",
            "label": "Q8_0",
            "description": "Near-lossless — ~8.7 GB",
            "file": "qwen3-8b/Qwen3-8B-Q8_0.gguf",
            "size": 9353953280,
            "downloadUrl": "https://huggingface.co/unsloth/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q8_0.gguf"
          }
        ]
      }
    }
  ]
}
```

### 2.4 TypeScript Types

```ts
interface ModelCatalog {
  catalogVersion: number
  models: ModelDefinition[]
}

interface ModelDefinition {
  id: string                          // "flux2-klein-4b"
  name: string                        // "FLUX.2 Klein 4B"
  description: string
  type: ModelType                     // "image-generation" (future: "upscaling" | "lm" | etc.)
  family: string                      // Groups models sharing engine profile

  vae: ModelFileRef
  diffusion: QuantCollection
  textEncoder: QuantCollection
}

type ModelType = 'image-generation'   // Extensible union

interface ModelFileRef {
  file: string                        // Relative to model_base_path
  size: number                        // Bytes
  downloadUrl: string
}

interface QuantVariant {
  id: string                          // "Q4_K_S"
  label: string                       // Display label
  description: string                 // Short description with approx size
  file: string                        // Relative to model_base_path
  size: number                        // Bytes
  downloadUrl: string
}

interface QuantCollection {
  quants: QuantVariant[]
}
```

---

## 3. Settings Changes

### 3.1 New Settings Keys

| Key | Type | Default | Description |
|---|---|---|---|
| `model_base_path` | `string` | `<userData>/models/` | Root directory for all local model files |
| `active_model_id` | `string` | `"flux2-klein-4b"` | Which model is selected for generation |
| `active_diffusion_quant.<modelId>` | `string` | `""` | Selected diffusion quant ID per model (e.g. `"Q4_K_S"`) |
| `active_text_encoder_quant.<modelId>` | `string` | `""` | Selected text encoder quant ID per model |

**Implementation note:** Per-model quant selections are stored as a JSON-serialized object in a single settings key rather than dynamic key names:

```ts
// New settings keys
interface AppSettings {
  // ... existing keys ...
  model_base_path: string
  active_model_id: string
  model_quant_selections: ModelQuantSelections   // JSON-serialized in DB
}

interface ModelQuantSelections {
  [modelId: string]: {
    diffusionQuant: string    // Quant ID e.g. "Q4_K_S"
    textEncoderQuant: string  // Quant ID e.g. "Q4_K_M"
  }
}
```

### 3.2 Removed Settings Keys

Delete from the settings table and all code references:

- `diffusion_model_path`
- `vae_path`
- `llm_path`

### 3.3 Model Path Resolution

A new service `ModelResolver` (main process) resolves the currently active absolute paths:

```ts
class ModelResolver {
  constructor(
    private catalog: ModelCatalog,
    private settings: AppSettings
  ) {}

  /** Get the fully resolved paths for the currently active model configuration. */
  getActiveModelPaths(): ModelLoadParams {
    const model = this.catalog.models.find(m => m.id === this.settings.active_model_id)
    if (!model) throw new Error(`Unknown active model: ${this.settings.active_model_id}`)

    const selections = this.settings.model_quant_selections[model.id]
    if (!selections) throw new Error(`No quant selections for model: ${model.id}`)

    const diffQuant = model.diffusion.quants.find(q => q.id === selections.diffusionQuant)
    const teQuant = model.textEncoder.quants.find(q => q.id === selections.textEncoderQuant)

    if (!diffQuant) throw new Error(`Unknown diffusion quant: ${selections.diffusionQuant}`)
    if (!teQuant) throw new Error(`Unknown text encoder quant: ${selections.textEncoderQuant}`)

    const base = this.settings.model_base_path
    return {
      diffusion_model: path.join(base, diffQuant.file),
      vae: path.join(base, model.vae.file),
      llm: path.join(base, teQuant.file),
    }
  }

  /** Check whether a specific file exists on disk. */
  isFileDownloaded(relativePath: string): boolean {
    return fs.existsSync(path.join(this.settings.model_base_path, relativePath))
  }

  /** Check whether a model is ready to use (all required files present). */
  isModelReady(modelId: string): boolean {
    const model = this.catalog.models.find(m => m.id === modelId)
    if (!model) return false
    const selections = this.settings.model_quant_selections[modelId]
    if (!selections?.diffusionQuant || !selections?.textEncoderQuant) return false

    const diffQuant = model.diffusion.quants.find(q => q.id === selections.diffusionQuant)
    const teQuant = model.textEncoder.quants.find(q => q.id === selections.textEncoderQuant)
    if (!diffQuant || !teQuant) return false

    return (
      this.isFileDownloaded(model.vae.file) &&
      this.isFileDownloaded(diffQuant.file) &&
      this.isFileDownloaded(teQuant.file)
    )
  }
}
```

---

## 4. Download System

### 4.1 Main Process Download Manager

A new `ModelDownloadManager` class in `src/main/models/`:

- Accepts download requests: `{ url: string, destRelativePath: string, expectedSize: number }`.
- Downloads to a `.part` temp file, renames on completion.
- Streams the download to avoid memory bloat (large files: multi-GB).
- Emits progress events via IPC: `{ relativePath, downloadedBytes, totalBytes, status }`.
- Supports cancel.
- One download at a time (queue additional requests).

### 4.2 IPC Channels

| Channel | Direction | Payload |
|---|---|---|
| `model:get-catalog` | renderer → main | — |
| `model:get-download-status` | renderer → main | — |
| `model:download-file` | renderer → main | `{ modelId, component, quantId }` |
| `model:cancel-download` | renderer → main | `{ relativePath }` |
| `model:download-progress` | main → renderer | `{ relativePath, downloadedBytes, totalBytes, status }` |
| `model:check-files` | renderer → main | `{ modelId }` → returns which files exist on disk |

---

## 5. Model Manager UI

### 5.1 Entry Point

The Model Manager opens as a full-screen `Dialog` (shadcn). It is invoked from:
- A new "Models" button in the app header, or
- A "Manage Models" link in the generation form's model selector dropdown.

The content is a standalone `<ModelManager />` component that makes no assumptions about being in a dialog — it simply fills its container. This allows it to be extracted to a page/route in the future.

### 5.2 Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Model Manager                                        [✕ Close] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ Category Filter (Tabs) ──────────────────────────────────┐  │
│  │  [All Models]  [Image Generation]  (future tabs grayed)   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ Model Card: FLUX.2 Klein 4B ────────────────────────────┐  │
│  │                                                           │  │
│  │  FLUX.2 Klein 4B                              ● Ready     │  │
│  │  Lightweight 4B-param model. Best for low-VRAM setups.    │  │
│  │                                                           │  │
│  │  ┌─ Diffusion Model ─────────────────────────────────┐   │  │
│  │  │  Q3_K_S  ~2.1 GB  [Downloaded ✓] ( ) Off  (●) On │   │  │
│  │  │  Q4_K_S  ~2.6 GB  [Download ↓  ]  ○  Disabled     │   │  │
│  │  │  Q5_K_M  ~3.1 GB  [Downloaded ✓] ( ) Off  ( ) On  │   │  │
│  │  │  Q6_K    ~3.4 GB  [Download ↓  ]  ○  Disabled     │   │  │
│  │  │  Q8_0    ~4.3 GB  [Download ↓  ]  ○  Disabled     │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  │                                                           │  │
│  │  ┌─ Text Encoder (Qwen3-4B) ─────────────────────────┐   │  │
│  │  │  Q3_K_M  ~2.1 GB  [Downloaded ✓] ( ) Off  (●) On │   │  │
│  │  │  Q4_K_M  ~2.5 GB  [Download ↓  ]  ○  Disabled     │   │  │
│  │  │  ...                                               │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  │                                                           │  │
│  │  ┌─ VAE ─────────────────────────────────────────────┐   │  │
│  │  │  ae.safetensors  ~320 MB  [Downloaded ✓]          │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  │                                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ Model Card: FLUX.2 Klein 9B ────────────────────────────┐  │
│  │  (same structure)                                         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Component Hierarchy

```
<ModelManagerModal>                      // Dialog wrapper, open/close state
  <ModelManager>                         // Container component (reusable)
    <ModelCategoryTabs>                  // shadcn Tabs: "All", "Image Generation", etc.
    <ModelCard model={...}>              // shadcn Card per model
      <ModelCardHeader>                  // Name, description, readiness badge
      <QuantSection                      // "Diffusion Model" section
        label="Diffusion Model"
        quants={model.diffusion.quants}
        activeQuantId={selections.diffusionQuant}
        onSelectQuant={...}
        onDownload={...}
        downloadStatuses={...}
      />
      <QuantSection                      // "Text Encoder" section
        label="Text Encoder"
        quants={model.textEncoder.quants}
        activeQuantId={selections.textEncoderQuant}
        onSelectQuant={...}
        onDownload={...}
        downloadStatuses={...}
      />
      <VaeSection                        // Single-file, no quant selection
        vae={model.vae}
        isDownloaded={...}
        onDownload={...}
        downloadStatus={...}
      />
    </ModelCard>
  </ModelManager>
</ModelManagerModal>
```

### 5.4 shadcn/ui Components Used

| Component | Usage |
|---|---|
| `Dialog` / `DialogContent` | Modal wrapper |
| `Card` / `CardHeader` / `CardContent` | Per-model card |
| `Tabs` / `TabsList` / `TabsTrigger` / `TabsContent` | Category filter |
| `Badge` | Model readiness indicator ("Ready", "Needs Download", etc.) |
| `RadioGroup` / `RadioGroupItem` | Quant selection (one active per section) |
| `Button` | Download / Cancel actions |
| `Progress` | Download progress bar |
| `Separator` | Visual dividers between sections |
| `Tooltip` | Hover details on quant descriptions |
| `ScrollArea` | Scrollable model list |

### 5.5 Quant Row Behavior

Each quant row in a section displays:

1. **Label** — e.g. "Q4_K_S"
2. **Size** — human-readable, e.g. "~2.6 GB"
3. **Download status** — one of:
   - "Download" button (not yet downloaded)
   - Progress bar with percentage + Cancel button (downloading)
   - Checkmark icon (downloaded)
4. **Radio button** — selects this quant as the active one for this component. **Disabled if the file is not downloaded.** Only one radio can be selected per section.

Selecting a radio button immediately persists the choice to `model_quant_selections` in settings.

### 5.6 Model Readiness Badge

Shown in each `ModelCardHeader`:

| State | Badge | Color |
|---|---|---|
| All 3 files present + quants selected | "Ready" | Green (`bg-emerald-500/15 text-emerald-400`) |
| Some files missing or no quant selected | "Setup Required" | Amber (`bg-amber-500/15 text-amber-400`) |

---

## 6. Generation Form Model Selector

### 6.1 Component

A `<ModelSelector />` dropdown added to the generation form, above the prompt field. Uses shadcn `Select` / `SelectContent` / `SelectItem`.

### 6.2 Behavior

- Lists all models from the catalog that have `type: "image-generation"`.
- Each item shows the model display name.
- Models that are not "Ready" show a subtle "(Setup Required)" suffix and are **not selectable** — clicking them opens the Model Manager.
- The selected value maps to `active_model_id` in settings.
- Changing the model triggers the engine to unload the current model and load the new one (if engine is running).
- A "Manage Models..." item at the bottom of the dropdown opens the Model Manager modal.

### 6.3 Future: API Models

The dropdown anticipates API-backed models appearing in the list alongside local models. Each `SelectItem` will show a small icon or tag indicating "Local" vs the API provider name. This is not implemented now but the component structure supports it — the list is driven by the endpoint catalog, not just the local model catalog.

---

## 7. Engine Integration Changes

### 7.1 Model Load Flow

Currently, `loadModel()` in `EngineManager` receives absolute paths directly. This does not change — `ModelResolver.getActiveModelPaths()` produces the same `ModelLoadParams` shape. The change is in **where** the paths come from:

**Before:** Read from `AppSettings.diffusion_model_path`, `vae_path`, `llm_path`.
**After:** Computed by `ModelResolver` from catalog + `model_quant_selections` + `model_base_path`.

### 7.2 Endpoint Catalog Update

The current `local.json` provider config has a single endpoint (`local.flux2-klein.image`). This should be updated:

- One endpoint per model: `local.flux2-klein-4b.image` and `local.flux2-klein-9b.image`.
- Or, a single dynamic endpoint that reads the active model from settings.

**Recommended:** Keep a single endpoint `local.flux2-klein.image` but parameterize it. The `canonicalModelId` in the endpoint is resolved at generation time from `active_model_id`. The engine loads whichever model is selected. This avoids proliferating static endpoint configs.

### 7.3 Generation Record

The `model_file` column on `generations` currently stores the diffusion model filename. Update this to store `active_model_id` (e.g. `"flux2-klein-4b"`) so the generation record is tied to the logical model, not a physical file path. Optionally also store the quant IDs in `params_json` for full reproducibility.

---

## 8. Legacy Code Removal

### 8.1 Settings Keys to Remove

Remove from `AppSettings` interface (both `src/main/types.ts` and `src/renderer/types/index.ts`):
- `diffusion_model_path`
- `vae_path`
- `llm_path`

### 8.2 Settings Modal Changes

Remove from `SettingsModal.tsx`:
- The three `PathField` components for "Diffusion model", "VAE", and "LLM".
- The corresponding `onSave` logic that persists those keys.
- Add a new `PathField` for `model_base_path` ("Model Directory").

### 8.3 Database Migration

Add a migration that:
1. Removes the `diffusion_model_path`, `vae_path`, `llm_path` rows from the settings table.
2. Inserts default values for `model_base_path`, `active_model_id`, and `model_quant_selections`.

### 8.4 Config File Changes

- **Remove:** `src/main/config/core-models.json` — replaced by `model-catalog.json`.
- **Update:** `src/main/config/providers/local.json` — update `canonicalModelId` handling if needed.

### 8.5 Code References to Update

Every file that currently reads `diffusion_model_path`, `vae_path`, or `llm_path` from settings and passes them to `EngineManager.loadModel()` must be updated to use `ModelResolver.getActiveModelPaths()` instead. Key files:

- `src/main/index.ts` (app startup model load)
- `src/main/generation/tasks/local-generate-task.ts` (generation execution)
- `src/main/ipc/handlers/` (any settings-related handlers)

---

## 9. File Structure (New/Changed)

```
src/main/
  config/
    model-catalog.json              // NEW — replaces core-models.json
    core-models.json                // REMOVE
    providers/
      local.json                    // UPDATE — adjust canonicalModelId strategy
  models/
    model-catalog-service.ts        // NEW — loads/caches catalog, seeds to userData
    model-resolver.ts               // NEW — resolves active model paths
    model-download-manager.ts       // NEW — handles file downloads
    types.ts                        // NEW — ModelCatalog, ModelDefinition, etc.
  ipc/handlers/
    models.ts                       // NEW — IPC handlers for model operations

src/renderer/
  components/
    modals/
      ModelManagerModal.tsx          // NEW — dialog wrapper
      SettingsModal.tsx              // UPDATE — remove model path fields
    models/
      ModelManager.tsx               // NEW — main content component
      ModelCard.tsx                  // NEW — per-model card
      QuantSection.tsx              // NEW — quant list with radio + download
      VaeSection.tsx                // NEW — single-file download/status
      ModelCategoryTabs.tsx         // NEW — category filter tabs
    left-panel/
      GenerationForm.tsx            // UPDATE — add ModelSelector
    generation/
      ModelSelector.tsx             // NEW — dropdown for model selection
  hooks/
    useModelCatalog.ts              // NEW — fetches catalog + file statuses
    useModelDownload.ts             // NEW — download progress subscription
  stores/
    model-store.ts                  // NEW — Zustand store for catalog state
```

---

## 10. Implementation Order

1. **Types & catalog file** — Define TypeScript types and create `model-catalog.json`.
2. **Model catalog service** — Main process: load catalog, seed to userData.
3. **Model resolver** — Main process: resolve paths from catalog + settings.
4. **Settings migration** — Add new keys, remove old ones, DB migration.
5. **Model download manager** — Main process: download with progress.
6. **IPC handlers** — Wire up model channels.
7. **Model Manager UI** — `ModelManager`, `ModelCard`, `QuantSection`, `VaeSection`.
8. **Model selector dropdown** — Generation form integration.
9. **Engine integration** — Update load flow to use `ModelResolver`.
10. **Legacy cleanup** — Remove `core-models.json`, old settings fields, old UI fields.
11. **Testing** — Verify download, selection, engine load, generation end-to-end.

---

## 11. Out of Scope (Future)

- Auto-detection of hardware / VRAM to recommend quant levels.
- Custom user-added models (editing the catalog via UI).
- Model deletion from disk via UI.
- API provider models in the model selector.
- Concurrent downloads.
- Download resume on app restart.

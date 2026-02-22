# Generation System Refactor Plan

> **Status:** Ready for implementation  
> **Date:** 2026-02-22  
> **Scope:** `src/main/generation/`, `src/renderer/components/generation/`, `src/renderer/stores/generation-store.ts`, `src/renderer/stores/provider-store.ts`, `src/renderer/lib/schema-to-form.ts`, IPC handlers, types

---

## Executive Summary

The generation system was built local-first, then API providers were bolted on alongside it. The result is two parallel architectures for the same thing — one for local, one for remote — with no shared abstraction. The code is brittle, has confusing file organization, dead interfaces, circular dependency hacks, and duplicated logic. This plan consolidates everything behind a single provider abstraction where local cn-engine is just another provider.

---

## Part 1: Findings (Code Review)

### 1.1 — `GenerationProvider` Interface Is Dead Weight
- [generation-provider.ts](src/main/generation/providers/generation-provider.ts) defines a `GenerationProvider` interface used by exactly one class (`LocalCnEngineProvider`).
- Remote providers bypass it entirely — `RemoteGenerateTaskHandler` manually constructs an `ApiClient` and a `ProviderModel` ad-hoc.
- The interface name implies a universal abstraction, but it isn't one.

### 1.2 — Two Task Handlers Doing the Same Job Differently
- [local-generate-task.ts](src/main/generation/tasks/local-generate-task.ts) (168 lines) and [remote-generate-task.ts](src/main/generation/tasks/remote-generate-task.ts) (100 lines) share ~60% of their logic:
  - Both parse the same payload, look up the same endpoint, call `markGenerationStarted`, call `getRefImagesForProvider`, use the same `finalizeAndNotify` / `handleTaskFailure` helpers.
  - The only real difference is: local calls the engine, remote calls an HTTP API.
- This is the root of most code smell — instead of one pipeline with pluggable execution, there are two near-duplicate pipelines.

### 1.3 — Confusing File Splits: `generation-service.ts` vs `generation-io-service.ts`
- `GenerationService` handles: submit, cancel, list endpoints, emit events, validate params, build storage params, build generation records.
- `GenerationIOService` handles: prepare ref image inputs, finalize outputs (ingest to library), thumbnail management, ref image caching.
- The naming doesn't communicate the split. A developer reading "IO service" expects it handles I/O for the generation service — which it does, but it also does media ingestion, DB inserts for media records, and thumbnail creation (all things that sound like they belong in the file/media layer).
- **Verdict:** The split is reasonable in *scope* but the naming and placement are poor.

### 1.4 — `api/` + `catalog/` + `providers/` Directory Soup
Current layout under `src/main/generation/`:
```
api/
  api-client.ts           # HTTP client for remote providers (890 lines — massive)
  provider-manager-service.ts  # Orchestrates API key mgmt, model browsing, user models
  types.ts                # SearchResult, ProviderModel, GenerationResult types
catalog/
  adapters/
    adapter-factory.ts    # if/else chain returning adapter by name
    adapter-utils.ts      # Shared parsing utilities
    fal-adapter.ts        # Fal-specific normalization
    replicate-adapter.ts  # Replicate-specific normalization
    wavespeed-adapter.ts  # Wavespeed-specific normalization
  model-identity-service.ts    # Cross-provider model identity mapping
  provider-catalog-service.ts  # Builds endpoint catalog from configs + user models
  provider-config-service.ts   # Loads/merges provider JSON configs
  schema-normalizer.ts         # Normalize request schemas
providers/
  generation-provider.ts       # Dead interface
  local-cn-provider.ts         # Local engine wrapper
tasks/
  local-generate-task.ts       # Local task handler
  remote-generate-task.ts      # Remote task handler
  task-utils.ts                # Shared task utilities
```

**Problems:**
- `api/` suggests "API providers" but `catalog/` also serves API providers (adapters, catalog, config loading).
- `providers/` contains one dead interface and one local provider class — it's not where remote providers live.
- `adapters/` are logically part of the provider system but buried under `catalog/`.
- `api-client.ts` at 890 lines is a god file doing HTTP requests, file uploads, async polling, output normalization, model search, model listing, and logging.

### 1.5 — `api-client.ts` Is a God Class
This single 890-line file handles:
1. Authentication header building
2. URL construction  
3. Model search (GET, POST, QUERY methods)
4. Model detail fetching
5. Model list fetching
6. File upload (multipart and JSON)
7. Generation execution (POST + optional async polling)
8. Async polling loop with deadlines
9. Output normalization (recursive URL/array/object unwrapping)
10. Image field detection from schemas
11. Remote file downloading (`downloadRemoteOutput` — a module-level function, not even a method)
12. Logging helpers
13. JSON path traversal
14. Result extraction heuristics

This needs to be broken up.

### 1.6 — Circular Dependency Hack: `UserModelSource`
`ProviderCatalogService` needs user models from `ProviderManagerService`, but can't import it without a circular dep. The solution is a `UserModelSource` interface + runtime `setCatalogService()` wiring. This works but is a code smell indicating the responsibilities aren't split correctly.

### 1.7 — `ProviderManagerService` Uses `getDatabase()` Singleton
Line in [provider-manager-service.ts](src/main/generation/api/provider-manager-service.ts): `const db = getDatabase()` — this breaks the pattern used everywhere else where `db` is injected via constructor. It also makes testing harder.

### 1.8 — Local Provider Special-Cased Everywhere
Throughout the codebase, `providerId === 'local'` or `endpoint.executionMode === 'queued-local'` branches appear in:
- `GenerationService.validateParams()` — local-specific dimension validation
- `GenerationService.buildStorageParams()` — different model ID source for local
- `GenerationService.buildGenerationRecord()` — different base_model_id logic for local
- `GenerationService.resolveTaskType()` — maps to different task types
- `generation-store.ts buildParams()` — decomposes size field for local only
- `ModelSelector.tsx` — separate identity map construction for local vs remote

### 1.9 — `GenerationExecutionRequest` Used by Local Only
The `GenerationExecutionRequest` type (in types.ts) and the `GenerationProvider` interface both exist only for the local provider path. Remote doesn't use either — it builds its own ad-hoc structures.

### 1.10 — Duplicate Type Definitions
`api/types.ts` defines `GenerationResult` with `outputs: GenerationOutputArtifact[]`. Meanwhile `types.ts` defines `GenerationExecutionResult` with nearly identical shape. Two result types for the same concept.

### 1.11 — `param-utils.ts` vs `adapter-utils.ts` Overlap
Both files contain similar type coercion utilities (`asString`/`getString`, `asNumber`/`toOptionalNumber`). These should be consolidated.

### 1.12 — Frontend: `provider-store.ts` Is Overgrown
At 311 lines, this store handles: provider configs, user models, identities, connection testing, API key presence, model search, model listing, model management, and identity mapping. It's doing too much for a single store.

### 1.13 — Two Size Selectors
`SizeSelector.tsx` (236 lines) and `LocalSizeSelector.tsx` (216 lines) are two completely different components for the same concept. The local one uses resolution presets + aspect ratios; the remote one uses presets + custom inputs. The schema drives which one renders via `ui.component: 'local-size'` vs `'size'`. This is fine architecturally, but the duplication in preset definitions and shared utility logic (clamping, parsing `W*H` strings) could be reduced.

### 1.14 — Adapter Factory Is a Naive If/Else Chain
`adapter-factory.ts` is a trivial if/else mapping `'wavespeed' | 'fal' | 'replicate'` → adapter object. No registration system, no extensibility.

---

## Part 2: Target Architecture

### 2.1 — Single Provider Abstraction

Replace the current dual-path system with a single `GenerationProvider` interface that ALL providers implement — local and remote alike:

```typescript
// src/main/generation/providers/types.ts

export interface GenerationProvider {
  readonly providerId: string
  readonly executionMode: 'queued-local' | 'remote-async'

  /**
   * Execute a generation request. Returns a result with local file paths
   * for all outputs (providers that produce URLs must download them first).
   */
  execute(request: GenerationRequest): Promise<GenerationResult>

  /**
   * Optional: called before execute() to give the provider a chance to
   * prepare (e.g., load a model into VRAM). Default: no-op.
   */
  prepare?(): Promise<void>

  /**
   * Optional: emit progress events during generation.
   */
  on?(event: 'progress', listener: (event: GenerationProgressEvent) => void): void
}

export interface GenerationRequest {
  generationId: string
  endpoint: CanonicalEndpointDef
  params: CanonicalGenerationParams
  refImagePaths: string[]   // Already-resolved local file paths
  outputDir: string         // Where to write output files
}

export interface GenerationResult {
  success: boolean
  outputs: Array<{ localPath: string; mimeType?: string }>
  metrics?: GenerationMetrics
  error?: string
}
```

### 2.2 — Provider Implementations

**`LocalCnProvider`** — wraps [engine-manager.ts](src/main/engine/engine-manager.ts):
- `prepare()` → lazy-loads the model (current `ensureModelLoaded()` logic)
- `execute()` → calls `engineManager.generate()`, returns local output path
- `on('progress')` → forwards engine progress events

**`RemoteApiProvider`** — wraps the current `ApiClient`:
- Constructed per-provider config (fal, replicate, wavespeed, custom)
- `execute()` → upload ref images → POST generation → poll if async → download outputs to local temp files → return local paths
- No `prepare()` needed

### 2.3 — Single Task Handler

Replace `LocalGenerateTaskHandler` + `RemoteGenerateTaskHandler` with one unified `GenerateTaskHandler`:

```typescript
export class GenerateTaskHandler implements WorkTaskHandler {
  async execute(item: WorkItem): Promise<WorkTaskResult> {
    const { generationId, endpointKey, params } = parseTaskPayload(item)
    
    const endpoint = await this.catalog.getEndpoint(endpointKey)
    const provider = this.providerRegistry.get(endpoint.providerId)
    
    generationRepo.markGenerationStarted(this.db, generationId)
    
    const refImages = await this.ioService.getRefImagesForProvider(generationId)
    const outputDir = await this.ioService.getOutputDir(generationId)
    
    if (provider.prepare) await provider.prepare()
    
    const result = await provider.execute({
      generationId, endpoint, params,
      refImagePaths: refImages,
      outputDir
    })
    
    return this.finalize(result)
  }
}
```

Single task type: `WORK_TASK_TYPES.GENERATION` (no more `_LOCAL_IMAGE` / `_REMOTE_IMAGE` split). Concurrency limits are per-provider, not per-task-type.

### 2.4 — Proposed Directory Structure

```
src/main/generation/
├── generation-service.ts          # Submit, cancel, list endpoints, emit events
├── generation-io-service.ts       # Ref image prep, output ingestion, thumbnails (RENAME below)
├── generate-task-handler.ts       # Single unified task handler
├── param-utils.ts                 # Param coercion utilities (merged with adapter-utils)
├── providers/
│   ├── types.ts                   # GenerationProvider interface + GenerationRequest/Result
│   ├── provider-registry.ts       # Map<providerId, GenerationProvider> with get/register
│   ├── local-cn-provider.ts       # Local engine provider (implements GenerationProvider)
│   └── remote-api-provider.ts     # Remote API provider (implements GenerationProvider)
├── remote/
│   ├── api-client.ts              # Slim HTTP client: request, poll, upload (broken up from 890-line god class)
│   ├── output-downloader.ts       # Download remote URLs to local temp files
│   └── adapters/
│       ├── types.ts               # ProviderAdapter interface
│       ├── adapter-registry.ts    # Map-based adapter registry (replaces if/else factory)
│       ├── fal-adapter.ts         # Fal normalization
│       ├── replicate-adapter.ts   # Replicate normalization
│       └── wavespeed-adapter.ts   # Wavespeed normalization
├── catalog/
│   ├── endpoint-catalog.ts        # RENAMED from provider-catalog-service.ts — builds endpoint map
│   ├── provider-config.ts         # RENAMED from provider-config-service.ts — loads/merges configs
│   ├── model-identity-service.ts  # Cross-provider identity mapping (stays)
│   └── schema-normalizer.ts       # Schema normalization (stays)
└── browsing/
    ├── provider-manager.ts        # RENAMED from provider-manager-service.ts — model browsing + user model mgmt
    └── types.ts                   # SearchResult, ProviderModel, SearchResultModel
```

**Key changes:**
- `api/` → split into `remote/` (execution) + `browsing/` (model management)
- `providers/` → home for ALL provider implementations + the shared interface
- `tasks/` → eliminated; single `generate-task-handler.ts` at top level
- `catalog/` → retained for endpoint catalog + config loading (distinct from providers)
- `adapters/` → moved under `remote/` where they belong (they normalize remote API responses)

### 2.5 — Rename: `GenerationIOService` → `MediaIngestionService`

The current name is vague. This service does two things:
1. **Ref image preparation** — cache, thumbnail, input records
2. **Output ingestion** — move output to library, create thumbnails, insert media records

Rename to `MediaIngestionService` to better communicate its role, or split into:
- `RefImageService` — ref image preparation + caching
- `OutputIngestionService` — output file handling + media record creation

**Recommendation:** Keep as one file (the two concerns are tightly coupled during the generation lifecycle) but rename to `MediaIngestionService`.

### 2.6 — Eliminate `UserModelSource` Circular Dependency Hack

The circular dependency exists because `ProviderCatalogService` needs user models from `ProviderManagerService`, and the manager needs the catalog to invalidate it.

**Solution:** Inject user models as a simple data fetch callback:
```typescript
class EndpointCatalog {
  constructor(
    private configService: ProviderConfigService,
    private getUserModels: () => Array<{ providerId: string; models: ProviderModel[] }>
  ) {}
}
```

No interface needed, no runtime wiring, no `setCatalogService()` dance.

### 2.7 — Inject `db` into `ProviderManagerService`

Replace the `getDatabase()` singleton call with constructor injection to match every other service in the codebase.

---

## Part 3: Implementation Plan

### Phase 1: Provider Abstraction (Foundation)

**Goal:** Establish the unified provider interface and registry.

| Step | Action | Files |
|------|--------|-------|
| 1.1 | Create `providers/types.ts` with new `GenerationProvider` interface, `GenerationRequest`, `GenerationResult` | New file |
| 1.2 | Create `providers/provider-registry.ts` — simple `Map<string, GenerationProvider>` | New file |
| 1.3 | Refactor `LocalCnEngineProvider` to implement new interface. Move `ensureModelLoaded()` into `prepare()`. Remove `EventEmitter` base — use typed callback in interface. | Modify `providers/local-cn-provider.ts` |
| 1.4 | Create `remote-api-provider.ts` implementing `GenerationProvider`. Extract execution logic from `RemoteGenerateTaskHandler` + `ApiClient.generate()`. | New file |
| 1.5 | Delete old `providers/generation-provider.ts` (the dead 7-line interface) | Delete file |

### Phase 2: Unified Task Handler

**Goal:** Collapse two task handlers into one.

| Step | Action | Files |
|------|--------|-------|
| 2.1 | Create `generate-task-handler.ts` — unified handler using provider registry | New file |
| 2.2 | Update `work-task-types.ts` — single `GENERATION` type replacing `GENERATION_LOCAL_IMAGE` + `GENERATION_REMOTE_IMAGE` | Modify file |
| 2.3 | Update `index.ts` — register one handler, use provider registry | Modify file |
| 2.4 | Delete `tasks/local-generate-task.ts`, `tasks/remote-generate-task.ts`, `tasks/task-utils.ts` | Delete 3 files |
| 2.5 | Move shared task utilities (`parseTaskPayload`, `finalizeAndNotify`, `handleTaskFailure`) into the new task handler or a small utility | Inline or keep minimal util |

### Phase 3: Break Up `api-client.ts`

**Goal:** Decompose the 890-line god class into focused modules.

| Step | Action | Files |
|------|--------|-------|
| 3.1 | Extract `output-downloader.ts` — `downloadRemoteOutput()` + `resolveAsyncOutputs()` | New file under `remote/` |
| 3.2 | Extract `polling-client.ts` or keep polling as internal to a slimmed `api-client.ts` — the async polling loop + status checking | Part of `remote/api-client.ts` |
| 3.3 | Slim `api-client.ts` to: auth headers, URL building, `generate()`, `uploadFile()`, `searchModels()`, `fetchModelList()`, `fetchModelDetail()` | Modify file |
| 3.4 | Move `normalizeOutputs()`, `getByPath()`, image field detection into a small `response-utils.ts` if needed | New file or inline |

### Phase 4: Directory Restructure

**Goal:** Clean directory layout matching Section 2.4.

| Step | Action |
|------|--------|
| 4.1 | Move `api/api-client.ts` → `remote/api-client.ts` |
| 4.2 | Move `api/types.ts` → `browsing/types.ts` (model browsing types: `SearchResult`, `ProviderModel`, etc.) |
| 4.3 | Move `api/provider-manager-service.ts` → `browsing/provider-manager.ts` |
| 4.4 | Move `catalog/adapters/` → `remote/adapters/` |
| 4.5 | Rename `catalog/provider-catalog-service.ts` → `catalog/endpoint-catalog.ts` |
| 4.6 | Rename `catalog/provider-config-service.ts` → `catalog/provider-config.ts` |
| 4.7 | Delete empty `api/` and `tasks/` directories |
| 4.8 | Rename `generation-io-service.ts` → `media-ingestion-service.ts` |
| 4.9 | Update all import paths across the entire codebase |

### Phase 5: Consolidate Utilities & Types

**Goal:** Eliminate duplication, clean up types.

| Step | Action | Files |
|------|--------|-------|
| 5.1 | Merge overlapping utilities from `param-utils.ts` and `adapter-utils.ts` into one `param-utils.ts`. Keep adapter-specific helpers (OpenAPI parsing, etc.) in a separate `remote/adapters/schema-utils.ts`. | Modify/create files |
| 5.2 | Eliminate `api/types.ts::GenerationResult` — use the new unified `GenerationResult` from `providers/types.ts` everywhere | Modify types |
| 5.3 | Remove `GenerationExecutionRequest` and `GenerationExecutionResult` from `types.ts` — replaced by new provider types | Modify types.ts |
| 5.4 | Verify `CanonicalEndpointDef`, `CanonicalGenerationParams`, `GenerationSubmitInput` are still clean and necessary | Audit |

### Phase 6: Reduce Local Special-Casing

**Goal:** Make local provider work through the same code paths as remote.

| Step | Action | Files |
|------|--------|-------|
| 6.1 | `GenerationService.validateParams()` — move local dimension validation into `LocalCnProvider.execute()` (the provider knows its own constraints) | Modify files |
| 6.2 | `GenerationService.buildStorageParams()` — local model metadata should come from the endpoint/provider, not from separate settings lookups | Modify file |
| 6.3 | `GenerationService.buildGenerationRecord()` — `base_model_id` should be set from `endpoint.canonicalModelId` for all providers, not branching on `providerId === 'local'` | Modify file |
| 6.4 | `generation-store.ts buildParams()` — the size→width/height decomposition for local should happen in the provider or the service, not in the renderer store | Move logic to main process |

### Phase 7: Fix Circular Dependencies & Injection

**Goal:** Clean dependency graph.

| Step | Action | Files |
|------|--------|-------|
| 7.1 | Eliminate `UserModelSource` interface — use callback injection per Section 2.6 | Modify `endpoint-catalog.ts` |
| 7.2 | Inject `db` into `ProviderManagerService` constructor — remove `getDatabase()` usage | Modify file |
| 7.3 | Remove `setCatalogService()` runtime wiring — pass invalidation callback in constructor | Modify files |

### Phase 8: Adapter Registry

**Goal:** Replace if/else adapter factory with extensible registry.

| Step | Action | Files |
|------|--------|-------|
| 8.1 | Create `remote/adapters/adapter-registry.ts` — `Map<string, ProviderAdapter>` with `register()` and `get()` | New file |
| 8.2 | Register adapters at startup in `index.ts` | Modify file |
| 8.3 | Delete `adapter-factory.ts` | Delete file |

### Phase 9: Frontend Cleanup

**Goal:** Align stores and components with the new backend.

| Step | Action | Files |
|------|--------|-------|
| 9.1 | Update `generation-store.ts` — remove local-specific `buildParams()` size decomposition (moved to main process per 6.4) | Modify file |
| 9.2 | Simplify `ModelSelector.tsx` — the identity map logic can be simplified now that local and remote endpoints come from the same catalog with consistent shape | Modify file |
| 9.3 | Evaluate merging `provider-store.ts` split: keep provider config/connection/API-key state separate from model browsing/search state. Consider splitting into `provider-store.ts` (configs, keys, connections) and `model-browsing-store.ts` (search, list, user models) | Modify/split files |
| 9.4 | `GenerationPane.tsx` — the `isLocal` / `isRemote` branching for the Generate button disabled state and status indicator can be simplified. Engine state should only matter when a local endpoint is selected. | Modify file |
| 9.5 | Consider extracting shared size preset logic from `SizeSelector.tsx` and `LocalSizeSelector.tsx` into a `size-utils.ts` | Minor refactor |

### Phase 10: Update IPC & Wiring

**Goal:** Ensure all renames propagate through IPC and the entry point.

| Step | Action | Files |
|------|--------|-------|
| 10.1 | Update `src/main/index.ts` — new service construction, provider registry setup, single task handler registration | Modify file |
| 10.2 | Update IPC handlers to use renamed services | Modify handlers |
| 10.3 | Update `AGENTS.md` project structure section | Modify file |
| 10.4 | Verify DB migration compatibility — the `work_queue` table's `task_type` column will have new values. Write a migration if there are persisted queue items with old task types. | Check + possibly add migration |

---

## Part 4: Migration Notes

### Breaking Changes (Internal Only)
- Work queue task type values change (`generation.local.image` + `generation.remote.image` → `generation.image`)
- All import paths under `src/main/generation/` change
- Service class names change (`GenerationIOService` → `MediaIngestionService`)
- `AGENTS.md` project structure will need updating

### What NOT to Change
- `CanonicalEndpointDef` — this is a good, clean type. Keep it.
- `CanonicalRequestSchema` / `CanonicalSchemaProperty` — solid schema system. Keep it.
- Provider config JSON format (`defaults/providers/*.json`) — keep the declarative config approach. It's the right pattern for future user-created providers.
- `schema-to-form.ts` — clean, well-structured. Keep as-is.
- `DynamicForm.tsx` / `FormField.tsx` — good components, no changes needed.
- `RefImageDropzone.tsx` — solid implementation, keep as-is.
- `LocalSizeSelector.tsx` / `SizeSelector.tsx` — functional, keep as-is (minor shared util extraction optional).
- The queue system (`WorkQueueManager`, `WorkHandlerRegistry`) — clean, leave as-is.
- `model-identity-service.ts` — well-designed, keep as-is.
- `schema-normalizer.ts` — clean, keep as-is.

### Future-Proofing
- The `GenerationProvider` interface supports `text-to-video` / `image-to-video` with no changes — just new provider implementations.
- User-configured providers with static model JSON files work naturally — they're just `ProviderConfig` entries with pre-seeded endpoints (same as `local.json`).
- New API providers (beyond fal/replicate/wavespeed) just need a new adapter registered in the registry + a config JSON file.

---

## Part 5: Implementation Order & Dependencies

```
Phase 1 (Provider Abstraction) ──┐
                                  ├── Phase 2 (Unified Task Handler)
Phase 3 (Break Up ApiClient) ────┤
                                  ├── Phase 4 (Directory Restructure)
Phase 5 (Consolidate Types) ─────┤
                                  ├── Phase 6 (Reduce Local Special-Casing)
Phase 7 (Fix Dependencies) ──────┤
                                  ├── Phase 8 (Adapter Registry)
Phase 8 ──────────────────────────┤
                                  ├── Phase 9 (Frontend Cleanup)
Phase 4 + 6 ─────────────────────┤
                                  └── Phase 10 (Update IPC & Wiring)
```

**Recommended execution:** Phases 1→2→3→4→5→6→7→8→9→10 sequentially. Each phase should leave the app in a working state. Phases 3, 5, 7, and 8 are lower-risk and can be done in any order after Phase 2.

---

## Part 6: Estimated File Changes

| Action | Count |
|--------|-------|
| New files | ~8 |
| Deleted files | ~6 (`generation-provider.ts`, `local-generate-task.ts`, `remote-generate-task.ts`, `task-utils.ts`, `adapter-factory.ts`, `api/types.ts`) |
| Renamed/moved files | ~6 |
| Modified files | ~15 |
| Net file count change | ~+2 (from current ~22 to ~24, but with dramatically less total code and much clearer organization) |

---

## Appendix: Current vs Proposed File Map

| Current Path | Action | New Path |
|---|---|---|
| `generation-service.ts` | Keep (modify) | `generation-service.ts` |
| `generation-io-service.ts` | Rename | `media-ingestion-service.ts` |
| `param-utils.ts` | Merge with adapter-utils | `param-utils.ts` |
| `providers/generation-provider.ts` | **Delete** | — |
| `providers/local-cn-provider.ts` | Refactor | `providers/local-cn-provider.ts` |
| — | **Create** | `providers/types.ts` |
| — | **Create** | `providers/provider-registry.ts` |
| — | **Create** | `providers/remote-api-provider.ts` |
| `api/api-client.ts` | Slim + move | `remote/api-client.ts` |
| `api/types.ts` | Move + merge | `browsing/types.ts` |
| `api/provider-manager-service.ts` | Move + rename | `browsing/provider-manager.ts` |
| `catalog/adapters/adapter-factory.ts` | **Delete** → registry | `remote/adapters/adapter-registry.ts` |
| `catalog/adapters/adapter-utils.ts` | Move + merge | `remote/adapters/schema-utils.ts` (OpenAPI-specific) + `param-utils.ts` (shared) |
| `catalog/adapters/fal-adapter.ts` | Move | `remote/adapters/fal-adapter.ts` |
| `catalog/adapters/replicate-adapter.ts` | Move | `remote/adapters/replicate-adapter.ts` |
| `catalog/adapters/wavespeed-adapter.ts` | Move | `remote/adapters/wavespeed-adapter.ts` |
| `catalog/provider-catalog-service.ts` | Rename | `catalog/endpoint-catalog.ts` |
| `catalog/provider-config-service.ts` | Rename | `catalog/provider-config.ts` |
| `catalog/model-identity-service.ts` | Keep | `catalog/model-identity-service.ts` |
| `catalog/schema-normalizer.ts` | Keep | `catalog/schema-normalizer.ts` |
| `tasks/local-generate-task.ts` | **Delete** | — |
| `tasks/remote-generate-task.ts` | **Delete** | — |
| `tasks/task-utils.ts` | **Delete** (inline) | — |
| — | **Create** | `generate-task-handler.ts` |
| — | **Create** | `remote/output-downloader.ts` |

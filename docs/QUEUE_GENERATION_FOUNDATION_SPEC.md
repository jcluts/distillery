# Distillery Queue + Generation Foundation Refactor Spec

**Status:** Proposed  
**Date:** 2026-02-12  
**Scope:** Main process architecture (queue, generation, JSON-based provider catalog/schema normalization, engine integration, IPC contracts)

---

## 1) Why this refactor

The current MVP behavior works, but the architecture is misaligned with long-term product direction:

- `QueueManager` currently owns queue orchestration **and** generation-specific concerns (input preparation, engine invocation, output ingestion, media persistence).
- Queue data model is generation-specific (`queue.generation_id`) and cannot cleanly support other heavy tasks (upscaling, inpainting, etc.).
- Generation pipeline is implicitly “local engine only,” which makes future API providers harder to add without duplicating I/O logic.
- Provider integration foundation is missing a canonical schema/catalog layer (adapter ETL + normalized endpoint contracts).

This spec re-establishes the intended foundation:

- Queue = generic serial executor for heavy local work.
- Generation = domain workflow with provider abstraction.
- Generation I/O = one shared path for both local and API generation outputs.
- Provider catalog = adapter-based ETL from provider-native feeds/schemas into a canonical endpoint schema.

---

## 2) Goals and non-goals

## 2.1 Goals

- Make queue infrastructure reusable across modules needing heavy GPU/CPU serialization.
- Remove cn-engine/local-generation logic from queue internals.
- Introduce a generation domain layer that supports multiple providers without duplicating I/O code.
- Add a provider catalog foundation using adapter-based ETL into a canonical endpoint schema (Wavespeed-like baseline).
- Keep provider configuration and feed cache file-based JSON (profile-local), not database-managed.
- Preserve timeline/library provenance links (generation inputs, outputs, metadata).
- Prioritize architectural correctness over temporary renderer/UI compatibility during refactor.

## 2.2 Non-goals

- No new end-user features in this refactor.
- No UI redesign.
- No full production rollout of remote providers in this pass (foundation + contracts only).
- No multi-lane concurrent scheduler yet (single serial lane remains MVP default).

---

## 3) Architectural principles

1. **Single responsibility by module**
   - Queue handles scheduling/execution state.
   - Generation handles request lifecycle.
   - Providers handle inference transport/protocol.
   - I/O services handle file/media persistence.

2. **Provider-agnostic generation pipeline**
   - Local and remote providers return a normalized generation result payload.
   - One shared generation finalization path persists media + generation outcomes.

3. **Schema-first provider integration**
   - Provider-native model feeds/request schemas are transformed to canonical endpoint definitions.
   - Generation execution and future dynamic forms consume canonical schema only.

4. **Fast-track cutover is acceptable**
   - MVP has no active users; temporary breakage during refactor is acceptable.
   - We optimize for clean final architecture over compatibility shims.

---

## 4) Target architecture

## 4.1 Domain boundaries

### A) Queue domain (generic)

Responsibilities:

- Persist and manage work items.
- Enforce serial execution for heavy tasks.
- Dispatch work to registered task handlers.
- Emit queue/work update events.

Must **not**:

- Import generation repositories.
- Import media/file ingestion logic.
- Call `EngineManager` directly.

### B) Generation domain (provider-agnostic)

Responsibilities:

- Validate/normalize generation requests.
- Create generation records and input provenance records.
- Route requests to provider strategy (local vs remote API).
- Finalize outputs through shared generation I/O pipeline.
- Emit generation progress/result events.

### C) Generation I/O pipeline (shared)

Responsibilities:

- Prepare input assets (reference image normalization/cache/thumbnail persistence).
- Resolve provider output artifacts.
- Ingest outputs into library storage.
- Create media records and update generation completion metadata.

This module is reused by both local and remote generation results.

### D) Provider catalog + schema normalization domain

Responsibilities:

- Load provider definitions/configs (auth, feed source, upload strategy, async strategy).
- Ingest provider model feeds (static JSON or provider APIs).
- Transform provider-native payloads through adapters into canonical endpoint definitions.
- Normalize request schemas into a single internal format.
- Expose endpoint catalog + schema for generation execution and future dynamic forms.

Must **not**:

- Execute generations directly.
- Persist generated media outputs.

### E) Provider adapters

Responsibilities:

- Convert canonical execution request into provider-specific calls.
- Stream provider progress events.
- Return normalized provider result payload.

Provider examples:

- `LocalCnEngineProvider` (current cn-engine path).
- `RemoteApiProvider` (future async API providers).

---

## 4.2 Proposed main-process folder structure

```text
src/main/
  queue/
    work-queue-manager.ts         # generic serial queue executor
    work-task-types.ts            # task type constants
    work-handler-registry.ts      # task handler registration/lookup
  generation/
    generation-service.ts         # submit/cancel/query orchestration
    generation-io-service.ts      # input prep + output ingestion (shared path)
    generation-events.ts          # typed generation event payloads
    catalog/
      provider-config-service.ts  # load/merge provider definitions and overrides
      provider-catalog-service.ts # build runtime endpoint catalog (from JSON files)
      schema-normalizer.ts        # provider schema -> canonical schema
      catalog-store.ts            # read/write normalized endpoint catalog JSON
      adapters/
        adapter-factory.ts
        wavespeed-adapter.ts
        fal-adapter.ts
        replicate-adapter.ts
    providers/
      generation-provider.ts      # provider interface
      local-cn-provider.ts        # wraps EngineManager for local generation
      remote-api-provider.ts      # future scaffold
    tasks/
      local-generate-task.ts      # queue task handler for local generation
  config/
    providers/
      *.json                      # built-in provider definitions / feed hints
    core-models.json              # canonical model IDs + provider mappings
  db/
    repositories/
      work-queue.ts
      generations.ts
      generation-inputs.ts
      media.ts
```

Notes:

- Use `providers` naming (not `/api`) to avoid confusion with Distillery’s own IPC/API surface.
- Keep `engine/` as-is; it stays a low-level process/protocol adapter.
- Canonical endpoint schema should survive provider feed quirks and version drift.
- Provider definitions and endpoint catalog snapshots are JSON files under the active profile.

---

## 4.3 Execution model

## Local generation (heavy task, queued)

1. Renderer submits generation with `endpointKey` + canonical params.
2. `GenerationService.submit()` resolves endpoint from provider catalog.
3. `GenerationService` creates generation + generation_inputs records.
4. `GenerationService` enqueues `generation.local.image` work item.
5. `WorkQueueManager` dispatches to `LocalGenerateTaskHandler`.
6. Handler calls `LocalCnEngineProvider.generate()`.
7. Handler returns normalized result.
8. `GenerationIOService.finalize()` ingests outputs and updates generation/media records.

## Remote provider generation (future, not queued)

1. `GenerationService.submit()` resolves endpoint from catalog and creates generation records.
2. Service calls `RemoteApiProvider.startGeneration()` directly.
3. Provider returns external job reference using canonical async contract.
4. Poll/webhook completion callback enters `GenerationIOService.finalize()`.

---

## 5) Data model changes

## 5.1 New table: `work_queue`

Introduce a generic queue table instead of overloading generation-specific `queue` table.

Suggested schema:

```sql
CREATE TABLE IF NOT EXISTS work_queue (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL,
  correlation_id TEXT,
  owner_module TEXT NOT NULL,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT
);
```

Indexes:

- `(status, priority, created_at)` for dequeue path.
- `(correlation_id)` for timeline/job lookup.
- `(owner_module)` for diagnostics/filtering.

## 5.2 Provider catalog/config storage (JSON, profile-local)

Provider configuration and live-feed cache are file-based JSON, not DB tables.

Profile file layout:

```text
<profileRoot>/
  api-providers/
    fal.json
    replicate.json
    wavespeed.json
  model_feeds/
    replicate.json      # cached raw feed/search results
    wavespeed.json      # cached raw feed/search results
    fal.json            # optional (search-only providers may omit)
  endpoint_catalog/
    endpoints.normalized.json    # canonical endpoint definitions (merged)
    endpoints.by-provider.json   # optional provider-partitioned snapshot
  core-models.json               # canonical model IDs + provider mappings
```

Notes:

- `api-providers/*.json` contains provider auth/model-source/search/upload/async request definitions.
- `model_feeds/*.json` stores cached raw provider responses for faster startup/offline fallback.
- `endpoint_catalog/*.json` stores normalized canonical endpoint definitions used by runtime generation and future dynamic forms.

## 5.3 Legacy queue migration

- Backfill existing `queue` rows into `work_queue`:
  - `task_type = 'generation.local.image'`
  - `correlation_id = generation_id`
  - `owner_module = 'generation'`
  - `payload_json = '{"generationId":"..."}'`
- Remove legacy `queue` table/repository after cutover.

## 5.4 Generation schema

- Keep existing `generations` and `generation_inputs` tables.
- Continue using `generations.provider` as provider source of truth (`local`, future provider IDs).
- Use `params_json` for provider-specific metadata when needed.

## 5.5 Provider config layering

Provider definitions are loaded in this order (later wins):

1. Built-in provider config bundle (`src/main/config/providers/`).
2. Profile-level overrides (`userData/profiles/<name>/api-providers/`).
3. Runtime secrets/settings (API keys) from settings store.

For Fal/Replicate/Wavespeed:

- Treat provider config as user-maintainable JSON contracts.
- Treat model feeds as live-fetch + cached JSON snapshots.
- Do not persist provider configs or normalized endpoint catalog into SQLite in this phase.

---

## 6) Contracts

## 6.1 Queue contracts

```ts
interface WorkQueueManager {
  enqueue(input: EnqueueWorkInput): Promise<string>
  cancel(workId: string): Promise<void>
  getItems(filter?: WorkFilter): Promise<WorkItem[]>
  registerHandler(taskType: string, handler: WorkTaskHandler): void
}

interface WorkTaskHandler {
  execute(item: WorkItem): Promise<WorkTaskResult>
}
```

## 6.2 Provider execution contracts

```ts
interface GenerationProvider {
  id: string
  mode: 'queued-local' | 'remote-async'
  start(request: GenerationExecutionRequest): Promise<GenerationProviderStartResult>
}
```

Local provider returns completion in-process. Remote provider may return external job ID first, then completion later.

## 6.3 Provider catalog contracts

```ts
interface ProviderCatalogService {
  refresh(): Promise<void>
  listEndpoints(filter?: { providerId?: string; outputType?: 'image' | 'video' }): Promise<CanonicalEndpointDef[]>
  getEndpoint(endpointKey: string): Promise<CanonicalEndpointDef | null>
}

interface CanonicalEndpointDef {
  endpointKey: string
  providerId: string
  providerModelId: string
  canonicalModelId?: string
  displayName: string
  modes: Array<'text-to-image' | 'image-to-image' | 'text-to-video' | 'image-to-video'>
  outputType: 'image' | 'video'
  executionMode: 'queued-local' | 'remote-async'
  requestSchema: CanonicalRequestSchema
  uiSchema?: CanonicalUiSchema
}
```

## 6.4 Canonical schema contracts

```ts
interface CanonicalRequestSchema {
  properties: Record<string, CanonicalSchemaProperty>
  required?: string[]
  order?: string[]
}

interface CanonicalSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array'
  title?: string
  description?: string
  default?: unknown
  minimum?: number
  maximum?: number
  step?: number
  enum?: Array<string | number>
  items?: { type: string; minItems?: number; maxItems?: number }
  ui?: {
    component?: string
    placeholder?: string
    hidden?: boolean
    transformMap?: Record<string, unknown>
  }
}

interface CanonicalUiSchema {
  groups?: Array<{ id: string; label: string; order?: number }>
  controls?: Record<string, { group?: string; order?: number; graphical?: boolean }>
}
```

This preserves the strengths of the V1 adapter/schema model while keeping Distillery’s internal contract provider-neutral.

## 6.5 Shared generation result contract

```ts
interface GenerationExecutionResult {
  generationId: string
  success: boolean
  outputs?: Array<{
    providerPath: string
    mimeType?: string
  }>
  metrics?: {
    seed?: number
    totalTimeMs?: number
    promptCacheHit?: boolean
    refLatentCacheHit?: boolean
  }
  error?: string
}
```

---

## 7) Event and IPC plan

## 7.1 Internal events (main process)

- `workQueue.updated` (queue state changed)
- `generation.progress` (provider-agnostic progress)
- `generation.result` (provider-agnostic completion)
- `library.updated` (new media ingested)

## 7.2 IPC channels (post-cutover)

- `generation:submit` (payload includes `endpointKey` + canonical params)
- `generation:cancel`
- `generation:listEndpoints`
- `generation:getEndpointSchema`
- `generation:progress`
- `generation:result`
- `queue:get`
- `queue:updated`

Engine-named channels (`engine:progress`, `engine:result`) are not required after this refactor.

---

## 8) Migration map from current code

| Current location | Current responsibility | Target location |
|---|---|---|
| `queue/queue-manager.ts::submit` | Builds generation records + queue entry | `generation/generation-service.ts::submit` |
| `queue/queue-manager.ts::processNext` | Queue dequeue + execution loop | `queue/work-queue-manager.ts::processNext` |
| `queue/queue-manager.ts::prepareGenerationInputs` | Ref input prep + provenance records | `generation/generation-io-service.ts::prepareInputs` |
| `queue/queue-manager.ts::createRefCacheFile` | Downscale/cached refs | `generation/generation-io-service.ts` |
| `queue/queue-manager.ts::resolveEngineOutputPath` | Provider output resolution | `generation/providers/local-cn-provider.ts` |
| `queue/queue-manager.ts::ingestGenerationOutput` | Move file, generate thumb, insert media | `generation/generation-io-service.ts::ingestOutputs` |
| `ipc/handlers/generation.ts` | Calls queue manager directly | Calls `GenerationService` |
| `ipc/handlers/queue.ts` | Reads legacy queue table | Reads `work_queue` repository |
| V1 adapter ETL (`simple-ai-client/src/generation/api/adapters/*`) | Provider feed -> unified schema | `generation/catalog/adapters/*` + `schema-normalizer.ts` |
| V1 provider registry (`simple-ai-client/src/generation/api/provider-registry.ts`) | Provider config/feed/core-model mapping | `generation/catalog/provider-catalog-service.ts` + `generation/catalog/catalog-store.ts` |

---

## 9) Phased implementation plan

## Phase 1 — Extract generation I/O + provider catalog foundation

- Create `generation-io-service.ts` and move input/output file logic there.
- Add provider catalog domain with adapter ETL and canonical schema normalization.
- Register local endpoint(s) in the same catalog contract used by future API endpoints.
- Persist provider config/feed/catalog as JSON files in active profile.

**Exit criteria:**

- `queue-manager.ts` no longer contains file manipulation/media insert logic.
- Canonical endpoint catalog returns at least one local endpoint schema.

## Phase 2 — Introduce generic work queue

- Add `work_queue` table + repository.
- Implement `WorkQueueManager` and task-handler registry.
- Create `LocalGenerateTaskHandler` as first registered handler.

**Exit criteria:**

- Local generation runs through generic queue task dispatch.
- Queue module has no generation-repo or engine dependencies.

## Phase 3 — Add generation service + provider boundary

- Add `GenerationService` to own generation submission/cancellation.
- Add provider interface and `LocalCnEngineProvider`.
- Move engine-call specifics out of queue.

**Exit criteria:**

- Generation submission no longer enters queue directly from IPC.
- Queue only executes `task_type` handlers.

## Phase 4 — IPC/event normalization + schema endpoints

- Add `generation:listEndpoints` and `generation:getEndpointSchema`.
- Add `generation:progress` and `generation:result` as primary channels.

**Exit criteria:**

- Renderer can consume provider-agnostic generation events and endpoint schemas.

## Phase 5 — Legacy cleanup

- Remove old queue table usage and old generation-coupled queue code.
- Remove transitional adapter/protocol compatibility code.

**Exit criteria:**

- No production code path depends on legacy `queue` schema or coupled queue logic.
- No generation execution path depends on raw provider payload shape.

---

## 10) Acceptance criteria (definition of done)

1. Queue domain is generic and reusable for at least two task types (`generation.local.image` + one placeholder heavy task type).
2. Queue module does not import `EngineManager`, `media` repository, or generation I/O helpers.
3. Generation result ingestion path is single and shared (no duplicated local vs remote output persistence code).
4. Provider abstraction exists with local provider implemented and remote provider contract scaffolded.
5. Provider catalog exists with adapter-based ETL into canonical endpoint schema.
6. Generation execution references `endpointKey` + canonical params (not provider-specific payloads).
7. Timeline/library provenance remains intact for generation inputs/outputs.
8. Fal/Replicate/Wavespeed provider configuration is JSON-backed and user-editable at profile level.

---

## 11) Risks and mitigations

- **Risk:** Event/API contract churn temporarily breaks renderer state hydration.  
  **Mitigation:** Refactor renderer + main in the same implementation window; treat channel changes as atomic.

- **Risk:** DB migration introduces queue history mismatch.  
  **Mitigation:** Backfill with row-count verification + transactional migration.

- **Risk:** Cancellation semantics diverge between queued-local and remote-async jobs.  
  **Mitigation:** Define explicit cancellation state machine in `GenerationService` before remote provider rollout.

- **Risk:** Provider feed/schema drift causes runtime failures.  
  **Mitigation:** Adapter isolation + schema normalization validation before endpoint activation.

- **Risk:** User-edited provider JSON can become invalid.  
  **Mitigation:** Strict JSON schema validation + startup diagnostics + fallback to last-known-good feed cache.

---

## 12) Naming decisions

- Use `providers` (not `/api`) for generation backends.
- Use `work_queue` for generic heavy-task scheduling.
- Use `endpointKey` as stable identifier for executable generation targets.
- Use JSON files as the source of truth for provider configuration and feed/cache state.
- Reserve `queue` as UX language in renderer where helpful; code-level domain should prefer `work` semantics.

---

## 13) Immediate next implementation ticket

Preferred implementation slice: **Phase 1 + Phase 2 in one shot**

1. Introduce `generation-io-service.ts`.
2. Add provider catalog + adapter ETL + canonical endpoint schema for local endpoint(s).
3. Add JSON catalog store for provider configs/feed caches/normalized endpoint snapshots.
4. Introduce `work_queue` and generic queue manager.
5. Wire generation submit path through `GenerationService` using `endpointKey`.

This avoids a second disruptive pass and sets the clean foundation for local + API generation convergence.

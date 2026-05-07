# API Video Generation Plan

## Summary

Implement remote-provider text-to-video and image-to-video as first-class generation modes. The existing foundation already supports `GenerationMode` video values, endpoint `outputType: "video"`, video library ingestion, video thumbnails, and playback. The missing work is mode-aware endpoint exposure, richer provider model capability detection, submission mode validation, and robust remote video output downloading.

## Key Changes

- Expose video endpoints through IPC by changing `GENERATION_LIST_ENDPOINTS` to return all endpoints by default, with optional filtering only when a caller explicitly requests it.
- Extend provider model capability metadata from a single `type?: GenerationMode` to explicit `modes?: GenerationMode[]` plus `outputType?: "image" | "video"` while keeping `type` as a backward-compatible read input only during loading.
- Update provider adapters to infer video capabilities from provider metadata, model id/name, and request schema:
  - video output if provider type/category/task/id/name indicates video.
  - image-to-video if a video model schema has image input fields like `image`, `image_url`, `input_image`, `reference_image`, or array variants.
  - text-to-video if a video model has a prompt/text field and does not require only image input.
- Update `EndpointCatalog.mapUserModel()` to create endpoints with the model's explicit `modes` and `outputType`; fall back to the current `inferModeInfo()` only for old persisted user-model files.
- Add `mode: GenerationMode` to `GenerationSubmitInput`, set it from `generationStore.generationMode`, validate that the selected endpoint supports the submitted mode, and store the mode in `params_json`.

## Renderer Behavior

- Rework `ModeToggle.vue` so available buttons come from all catalog endpoints, not only the currently selected endpoint's output type. This unlocks switching from an image endpoint to a video mode.
- When the user selects a mode, if the current endpoint does not support it, auto-select the first ready compatible endpoint, preferring an already ready local endpoint for image modes and any configured remote endpoint for video modes.
- Keep `ModelSelector.vue` filtered by `generationMode`, but ensure it refreshes endpoints after provider model changes and gracefully shows an empty model selector state when no model supports the selected mode.
- Keep `RefImageDropzone` visible for `image-to-image` and `image-to-video`. The existing upload path can continue mapping one uploaded URL into scalar image fields and multiple URLs into array fields.
- In `ProviderManager`/`ModelBrowser`, display mode tags for models with multiple capabilities, so a model can appear as both text-to-video and image-to-video instead of only one tag.

## Main Process Behavior

- In `GenerationService.validateParams()`, enforce:
  - prompt is required for all four MVP modes.
  - `image-to-image` and `image-to-video` require at least one reference image.
  - submitted mode must be present in `endpoint.modes`.
- Keep local endpoints image-only. Do not add local video support or cn-engine video handling in this pass.
- Keep database schema unchanged for MVP. Store generation mode in `params_json` rather than adding a `generations.mode` column.
- Update `RemoteApiProvider` and `ApiClient` only as needed for video-safe handling; do not create provider-specific generation branches unless a provider's API shape truly requires it.
- Change `downloadRemoteOutput()` to preserve response `content-type` and return `{ localPath, mimeType }`; use that MIME type during final ingestion so extensionless remote URLs become valid `.mp4`, `.webm`, or `.mov` files instead of temporary `.bin` artifacts.
- Leave `MediaIngestionService.finalize()` as the library boundary: it should continue using `endpoint.outputType` to ingest video outputs, create thumbnails, extract metadata, and emit library updates.

## Testing

- Run `npm run typecheck` and `npm run lint`.
- Add or manually verify these scenarios:
  - A persisted old user model with only `type: "text-to-image"` still becomes an image endpoint.
  - A provider model with video metadata and no image input appears only under text-to-video.
  - A provider model with video metadata and image input appears under image-to-video, and under text-to-video when prompt-only use is also valid.
  - Switching from text-to-image to text-to-video auto-selects a compatible video endpoint instead of leaving the UI stuck on an image model.
  - Image-to-video submission uploads the selected reference image and rejects submit when no reference image is selected.
  - Remote video output with an extensionless URL but `video/mp4` content type ingests as video, generates a thumbnail, and appears under the library Video filter.

## Assumptions

- Scope is API providers only; local video generation is intentionally out of scope.
- The MVP supports provider-discovered/user-added video models rather than bundling specific static video endpoints.
- A single remote model may support multiple modes, so `modes[]` is the source of truth.
- No database migration is required for this pass.

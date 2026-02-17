# Configuration Source of Truth

Distillery now uses a consistent JSON-first config model for user-editable runtime configuration.

## Runtime Mode Policy

- **Development (`app.isPackaged === false`)**
  - Reads bundled config defaults directly from `src/main/config/**`.
  - This makes tweaking defaults in the repo immediately visible in dev.
- **Packaged/Distributed (`app.isPackaged === true`)**
  - Reads editable config files from the active profile directory (`app.getPath('userData')`).
  - Missing files are automatically seeded from bundled defaults.

## Primary Config Files

### 1) App paths

- **Bundled default:** `src/main/config/app-config.json`
- **Packaged runtime file:** `{profileUserData}/app-config.json`
- Keys:
  - `model_base_path`
  - `cn_engine_base_path`

Path tokens supported:

- `$USER_DATA`
- `$RESOURCES`
- `$APP`

`engine_path` used by runtime services is derived from `cn_engine_base_path` + platform binary name.

### 2) Model catalog

- **Bundled default:** `src/main/config/model-catalog.json`
- **Packaged runtime file:** `{profileUserData}/model-catalog.json`

### 3) Provider configs

- **Bundled defaults:** `src/main/config/providers/*.json`
- **Packaged runtime files:** `{profileUserData}/api-providers/*.json`

In packaged builds, bundled provider files are seeded into `api-providers` (if missing), then loaded from there.

## Settings vs Config Files

`model_base_path` and `engine_path` are no longer persisted in SQLite `app_settings`.
They are file-backed through `app-config.json` behavior above.

SQLite `app_settings` remains the source of truth for non-file-backed settings (UI state, generation flags, active model selections, etc.).

## Shared Config Utilities

Common JSON config behavior is centralized in:

- `src/main/config/config-file-utils.ts`

Services that use this shared behavior:

- `src/main/config/app-config-service.ts`
- `src/main/models/model-catalog-service.ts`
- `src/main/generation/catalog/provider-config-service.ts`

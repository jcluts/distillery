# Legacy Library Import

This one-time importer copies media from the deprecated `simple-ai-client` library into the current Distillery library and writes matching rows into the current `distillery.db`.

It defaults to dry-run mode:

```sh
npm run import:legacy
```

For the known legacy library on this machine, apply the import with:

```sh
npm run import:legacy -- --apply --legacy-db ~/Import/library.db --legacy-root ~/Import
```

The importer preserves the metadata that maps cleanly to the current schema:

- media dimensions, file size, rating, selected/rejected status, created/updated timestamps
- legacy keywords into normalized Distillery keyword tables
- generated-image provenance via `generations` rows, including prompt, provider, model, status, duration, and raw legacy params JSON
- generation output links and compatible generation input thumbnails
- manual collections and collection membership
- image crops/flips and adjustment values when they match the current edit model
- video trim edits when they match the current video edit model

Legacy upscale/removal cache data is intentionally not imported. Those records reference old cache files and data shapes that are not compatible with the current edit pipeline.

Useful options:

```sh
npm run import:legacy -- --limit 10
npm run import:legacy -- --apply --no-collections
npm run import:legacy -- --apply --no-generation-inputs
npm run import:legacy -- --apply --target-db "/path/to/distillery.db" --target-library "/path/to/Library"
```

Run the importer while Distillery is closed to avoid write contention on the SQLite database.

The npm script runs through Electron's Node runtime so native modules like `better-sqlite3` use the same ABI as the app.

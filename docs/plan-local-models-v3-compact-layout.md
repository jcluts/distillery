# Plan: Local Models — Compact Two-Column Layout (v3)

Iteration on the existing v2 implementation. Targets the specific UX issues seen in practice: double-nesting, wasted vertical space, confused hierarchy.

---

## What's Wrong Now

1. **Two levels of collapse** — Model collapse → QuantSection collapse. Seeing/changing quants requires two expand actions, and the expanded state is a vertical wall of content.
2. **Two-line quant rows** — Each quant row shows label+size on line 1 and description on line 2. With 5 quants per component, that's 10 lines just for one quant list.
3. **Deep left indentation** — The `pl-6` indent inside the model collapse pushes content right, wasting horizontal space and creating a nested "drawer" feel.
4. **Single-column stacking** — Diffusion, Text Encoder, and VAE are stacked vertically. With 5 quants each, that's ~25+ rows before you even reach VAE.

## Design Goals

- **One level of collapse only** — model expand/collapse. Quant lists are always visible when the model is expanded.
- **Single-line quant rows** — label, size, and action on one line. Description available via tooltip.
- **Two-column layout** — Diffusion and Text Encoder side by side, exploiting available horizontal space.
- **VAE as a compact row** spanning below both columns.
- **Minimal indentation** — clean, table-like feel.

---

## New Layout

### Collapsed model (unchanged)

```
┌──────────────────────────────────────────────────────────────────────┐
│  ▸  FLUX.2 Klein 4B                                       Ready ●   │
│     Lightweight 4B-param FLUX diffusion model.                       │
└──────────────────────────────────────────────────────────────────────┘
```

### Expanded model (redesigned)

```
┌──────────────────────────────────────────────────────────────────────┐
│  ▾  FLUX.2 Klein 4B                                       Ready ●   │
│     Lightweight 4B-param FLUX diffusion model.                       │
│                                                                      │
│  DIFFUSION MODEL                    TEXT ENCODER                     │
│  ┌────────────────────────────────┐ ┌────────────────────────────────┐│
│  │ ○ Low Memory     ~2.1 GB  [DL]│ │ ○ Low Memory     ~2.1 GB  [DL]││
│  │ ○ Balanced       ~2.6 GB  [DL]│ │ ● Balanced       ~2.5 GB  [rm]││
│  │ ● High Quality   ~3.1 GB  [rm]│ │ ○ High Quality   ~2.9 GB  [DL]││
│  │ ○ V. High Qual.  ~3.4 GB  [DL]│ │ ○ V. High Qual.  ~3.3 GB  [DL]││
│  │ ○ Max Quality    ~4.3 GB  [rm]│ │ ○ Max Quality    ~4.3 GB  [rm]││
│  └────────────────────────────────┘ └────────────────────────────────┘│
│                                                                      │
│  VAE   flux2-vae.safetensors   ~320 MB                  ✓ Ready [rm]│
└──────────────────────────────────────────────────────────────────────┘
```

**Key properties:**
- 5 quant rows per column, ~5 lines total height for both component lists (same height, aligned)
- VAE is a single row spanning full width
- No nesting inside the expanded area — just a flat two-column grid + a footer row
- Section headers ("DIFFUSION MODEL", "TEXT ENCODER") are small muted labels above each column

---

## Detailed Quant Row Spec

Each quant row is a **single line**:

```
[radio] [label]  [size]  [action]
```

- **Radio indicator** — filled circle (active) or empty circle. Same visual as current but on one line.
- **Label** — e.g. "Balanced", "High Quality". Font medium, text-sm.
- **Size** — e.g. "~2.6 GB". Muted, text-xs. Pushed right or after a flexible gap.
- **Action** — right-aligned. One of:
  - Download icon button (not downloaded)
  - Trash icon button (downloaded, not active)
  - Nothing or checkmark (active + downloaded — the radio already indicates selection)
  - Progress bar + cancel (downloading)
  - "Queued" badge + cancel (queued)
  - "Retry" button (failed)

- **Description** — NOT shown inline. Available via `Tooltip` on hover over the label text. This is the single biggest vertical space saving — going from 2 lines to 1 per quant row.

- **Recommended badge** — small inline badge after label, same line. e.g. `Balanced  ~2.6 GB  Rec.  [DL]`

- **Row height** — compact: `py-1` or `py-1.5`, not `py-2`.

- **Clickability** — entire row is clickable to select (if downloaded and not already active). Same behavior as current.

### Download Progress (inline)

When a quant is downloading, its action area shows a mini progress bar:

```
│ ○ Balanced       ~2.6 GB   ▓▓▓░░ 54% [✕] │
```

The progress bar + percentage + cancel button replace the download icon. Compact, same single line.

---

## Component Changes

### `LocalModelItem.tsx` — **Major rewrite**

Currently wraps `QuantSection` + `VaeSection` in a collapsible with `pl-6` indent.

**Changes:**
- Remove left indentation (`pl-6` → `px-3`)
- Remove `QuantSection` and `VaeSection` usage entirely
- Render quant lists directly as a **two-column CSS grid** (`grid grid-cols-2 gap-3`)
- Each column has a `SectionHeader` label + a list of `QuantRow` components
- VAE rendered as a simple single row below the grid
- Quant rows are the new single-line design (built inline or as a small sub-component)

**New structure:**
```tsx
<Collapsible>
  <CollapsibleTrigger> {/* model header — keep as-is */} </CollapsibleTrigger>
  <CollapsibleContent>
    <div className="px-3 pb-3 pt-1">
      {/* Two-column quant grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0">
        {/* Left column: Diffusion */}
        <div>
          <SectionHeader className="mb-1">DIFFUSION MODEL</SectionHeader>
          {model.diffusion.quants.map(q => (
            <QuantRow key={q.id} ... />
          ))}
        </div>

        {/* Right column: Text Encoder */}
        <div>
          <SectionHeader className="mb-1">TEXT ENCODER</SectionHeader>
          {model.textEncoder.quants.map(q => (
            <QuantRow key={q.id} ... />
          ))}
        </div>
      </div>

      {/* VAE row — full width */}
      <VaeRow ... />
    </div>
  </CollapsibleContent>
</Collapsible>
```

### `QuantRow` — **New sub-component** (inside `LocalModelItem.tsx` or extracted)

Single-line quant row replacing the old two-line `QuantRow` from `QuantSection.tsx`.

```tsx
function QuantRow({ quant, isActive, isDownloaded, downloadStatus, onSelect, onDownload, onCancel, onRemove }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={cn(
            'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm transition-colors',
            isActive
              ? 'bg-primary/10'
              : canSelect
                ? 'cursor-pointer hover:bg-muted/50'
                : 'cursor-default opacity-60'
          )}
          onClick={canSelect ? onSelect : undefined}
        >
          {/* Radio */}
          <RadioCircle active={isActive} downloaded={isDownloaded} />

          {/* Label */}
          <span className={cn('truncate', isActive ? 'font-medium' : 'font-normal')}>
            {quant.label}
          </span>
          {isRecommended && <Badge className="text-[9px] px-1 py-0">Rec.</Badge>}

          {/* Spacer */}
          <span className="flex-1" />

          {/* Size */}
          <span className="shrink-0 text-xs text-muted-foreground">{formatApproxSize(quant.size)}</span>

          {/* Action (icon only, no text labels) */}
          <div className="w-7 shrink-0" onClick={e => e.stopPropagation()}>
            <ActionIcon ... />  {/* Download / Trash / Progress / etc */}
          </div>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{quant.description}</TooltipContent>
    </Tooltip>
  )
}
```

No borders on individual quant rows — just hover highlight. This creates the clean table-like feel. The containing column can have a subtle border if needed.

### `VaeRow` — **New sub-component** (inside `LocalModelItem.tsx`)

Simple inline row, no separate component file needed:

```tsx
function VaeRow({ vae, isDownloaded, downloadStatus, onDownload, onCancel, onRemove }) {
  return (
    <div className="mt-2 flex items-center gap-2 rounded-md border border-border/40 px-2 py-1.5 text-sm">
      <SectionHeader className="shrink-0 text-xs">VAE</SectionHeader>
      <span className="truncate font-medium">{filename}</span>
      <span className="text-xs text-muted-foreground">{formatApproxSize(vae.size)}</span>
      <span className="flex-1" />
      {/* Status + action — same pattern as current VaeSection but inline */}
      <StatusAction ... />
    </div>
  )
}
```

### `QuantSection.tsx` — **Delete**

No longer used. All quant display logic moves into `LocalModelItem`.

### `VaeSection.tsx` — **Delete**

No longer used. VAE display becomes a simple inline row.

### `LocalDetail.tsx` — **No changes needed**

It just renders `LocalModelItem`s from the catalog. The interface between `LocalDetail` and `LocalModelItem` stays identical.

### `ProviderSidebar.tsx` — **No changes needed**

### `ProviderManager.tsx` — **No changes needed**

---

## Files Changed

| File | Action |
|------|--------|
| `src/renderer/components/providers/LocalModelItem.tsx` | **Rewrite** — two-column layout, inline quant rows, inline VAE row |
| `src/renderer/components/models/QuantSection.tsx` | **Delete** |
| `src/renderer/components/models/VaeSection.tsx` | **Delete** |
| `src/renderer/components/models/utils.ts` | **Keep** — still needed for `formatApproxSize`, `toPercent` |

That's it. Three files touched, two deleted.

---

## Vertical Space Budget

Current (expanded, per model):
- Section header (DIFFUSION MODEL) — 1 line
- Summary pill — 1 line
- "Change" → expand → 5 quant rows × 2 lines each = 10 lines
- Repeat for Text Encoder = 10 more lines
- VAE section header + row = 2 lines
- **Total: ~24+ lines, requires inner scrolling**

New (expanded, per model):
- Model header — 2 lines (name + description)
- Section headers — 1 line (both columns on same line effectively)
- 5 quant rows × 1 line each = 5 lines (both columns same height, side by side)
- VAE row — 1 line
- **Total: ~9 lines**

That's roughly a **60% reduction** in vertical space for the expanded state.

---

## Implementation Steps

1. **Rewrite `LocalModelItem.tsx`** — Replace the QuantSection/VaeSection composition with the new two-column grid layout containing inline `QuantRow` and `VaeRow` sub-components. All quant row logic (radio, download state, progress, actions) is reimplemented as single-line rows.

2. **Delete `QuantSection.tsx` and `VaeSection.tsx`** — Confirm no other consumers exist (there shouldn't be any since ModelManager/ModelCard were already deleted in v2).

3. **Verify imports** — Ensure `utils.ts` path references still resolve (they import from `@/components/models/utils` which still exists).

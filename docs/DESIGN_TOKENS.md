# PrimeVue Aura Design Tokens Reference

Complete reference of all semantic design tokens available in the Aura preset, extracted from the [PrimeVue source](../packages/themes/src/presets/aura/base/index.js). These tokens can be overridden in `DistilleryPreset` via `definePreset(Aura, { semantic: { ... } })`.

> **Current overrides in `src/renderer/main.ts`:** `primary`, `surface` (light + dark), `text` (light + dark).

---

## Table of Contents

- [1. Primitive Tokens (Color Palettes)](#1-primitive-tokens-color-palettes)
- [2. Global Semantic Tokens](#2-global-semantic-tokens)
- [3. Color Scheme Tokens (Light / Dark)](#3-color-scheme-tokens-light--dark)
- [4. Component Tokens](#4-component-tokens)

---

## 1. Primitive Tokens (Color Palettes)

Primitive tokens define raw values with no semantic meaning. They are referenced by semantic tokens using `{palette.shade}` syntax.

### Border Radius

| Token | Value |
|---|---|
| `border.radius.none` | `0` |
| `border.radius.xs` | `2px` |
| `border.radius.sm` | `4px` |
| `border.radius.md` | `6px` |
| `border.radius.lg` | `8px` |
| `border.radius.xl` | `12px` |

### Color Palettes

Each palette provides shades `50` through `950`. Available palettes:

| Palette | Example 500 value |
|---|---|
| `emerald` | `#10b981` |
| `green` | `#22c55e` |
| `lime` | `#84cc16` |
| `red` | `#ef4444` |
| `orange` | `#f97316` |
| `amber` | `#f59e0b` |
| `yellow` | `#eab308` |
| `teal` | `#14b8a6` |
| `cyan` | `#06b6d4` |
| `sky` | `#0ea5e9` |
| `blue` | `#3b82f6` |
| `indigo` | `#6366f1` |
| `violet` | `#8b5cf6` |
| `purple` | `#a855f7` |
| `fuchsia` | `#d946ef` |
| `pink` | `#ec4899` |
| `rose` | `#f43f5e` |
| `slate` | `#64748b` |
| `gray` | `#6b7280` |
| `zinc` | `#71717a` |
| `neutral` | `#737373` |
| `stone` | `#78716c` |

Each palette has: `50`, `100`, `200`, `300`, `400`, `500`, `600`, `700`, `800`, `900`, `950`.

---

## 2. Global Semantic Tokens

These are **not** color-scheme-dependent — they apply to both light and dark modes.

### General

| Token path | Aura default | Description |
|---|---|---|
| `transitionDuration` | `0.2s` | Global transition duration |
| `disabledOpacity` | `0.6` | Opacity for disabled elements |
| `iconSize` | `1rem` | Default icon size |
| `anchorGutter` | `2px` | Spacing for anchored overlays |

### Focus Ring

| Token path | Aura default | Description |
|---|---|---|
| `focusRing.width` | `1px` | Focus ring width |
| `focusRing.style` | `solid` | Focus ring border style |
| `focusRing.color` | `{primary.color}` | Focus ring color |
| `focusRing.offset` | `2px` | Focus ring offset from element |
| `focusRing.shadow` | `none` | Focus ring box-shadow |

### Primary Color Palette

| Token path | Aura default | Distillery override |
|---|---|---|
| `primary.50` | `{emerald.50}` | `{cyan.50}` |
| `primary.100` | `{emerald.100}` | `{cyan.100}` |
| `primary.200` | `{emerald.200}` | `{cyan.200}` |
| `primary.300` | `{emerald.300}` | `{cyan.300}` |
| `primary.400` | `{emerald.400}` | `{cyan.400}` |
| `primary.500` | `{emerald.500}` | `{cyan.500}` |
| `primary.600` | `{emerald.600}` | `{cyan.600}` |
| `primary.700` | `{emerald.700}` | `{cyan.700}` |
| `primary.800` | `{emerald.800}` | `{cyan.800}` |
| `primary.900` | `{emerald.900}` | `{cyan.900}` |
| `primary.950` | `{emerald.950}` | `{cyan.950}` |

### Form Field (shared, non-scheme-dependent)

| Token path | Aura default | Description |
|---|---|---|
| `formField.paddingX` | `0.75rem` | Horizontal padding |
| `formField.paddingY` | `0.5rem` | Vertical padding |
| `formField.sm.fontSize` | `0.875rem` | Small variant font size |
| `formField.sm.paddingX` | `0.625rem` | Small variant horizontal padding |
| `formField.sm.paddingY` | `0.375rem` | Small variant vertical padding |
| `formField.lg.fontSize` | `1.125rem` | Large variant font size |
| `formField.lg.paddingX` | `0.875rem` | Large variant horizontal padding |
| `formField.lg.paddingY` | `0.625rem` | Large variant vertical padding |
| `formField.borderRadius` | `{border.radius.md}` | Input border radius |
| `formField.focusRing.width` | `0` | Input focus ring width |
| `formField.focusRing.style` | `none` | Input focus ring style |
| `formField.focusRing.color` | `transparent` | Input focus ring color |
| `formField.focusRing.offset` | `0` | Input focus ring offset |
| `formField.focusRing.shadow` | `none` | Input focus ring shadow |
| `formField.transitionDuration` | `{transition.duration}` | Input transition duration |

### List (shared structure)

| Token path | Aura default | Description |
|---|---|---|
| `list.padding` | `0.25rem 0.25rem` | List container padding |
| `list.gap` | `2px` | Gap between list items |
| `list.header.padding` | `0.5rem 1rem 0.25rem 1rem` | List header padding |
| `list.option.padding` | `0.5rem 0.75rem` | Option item padding |
| `list.option.borderRadius` | `{border.radius.sm}` | Option item border radius |
| `list.optionGroup.padding` | `0.5rem 0.75rem` | Option group padding |
| `list.optionGroup.fontWeight` | `600` | Option group font weight |

### Content (shared structure)

| Token path | Aura default | Description |
|---|---|---|
| `content.borderRadius` | `{border.radius.md}` | Content area border radius |

### Mask (shared structure)

| Token path | Aura default | Description |
|---|---|---|
| `mask.transitionDuration` | `0.3s` | Mask fade transition duration |

### Navigation (shared structure)

| Token path | Aura default | Description |
|---|---|---|
| `navigation.list.padding` | `0.25rem 0.25rem` | Nav list padding |
| `navigation.list.gap` | `2px` | Nav list gap |
| `navigation.item.padding` | `0.5rem 0.75rem` | Nav item padding |
| `navigation.item.borderRadius` | `{border.radius.sm}` | Nav item border radius |
| `navigation.item.gap` | `0.5rem` | Nav item inner gap |
| `navigation.submenuLabel.padding` | `0.5rem 0.75rem` | Submenu label padding |
| `navigation.submenuLabel.fontWeight` | `600` | Submenu label font weight |
| `navigation.submenuIcon.size` | `0.875rem` | Submenu icon size |

### Overlay (shared structure)

| Token path | Aura default | Description |
|---|---|---|
| `overlay.select.borderRadius` | `{border.radius.md}` | Select overlay border radius |
| `overlay.select.shadow` | `0 4px 6px -1px rgba(0,0,0,0.1), ...` | Select overlay shadow |
| `overlay.popover.borderRadius` | `{border.radius.md}` | Popover border radius |
| `overlay.popover.padding` | `0.75rem` | Popover padding |
| `overlay.popover.shadow` | `0 4px 6px -1px rgba(0,0,0,0.1), ...` | Popover shadow |
| `overlay.modal.borderRadius` | `{border.radius.xl}` | Modal border radius |
| `overlay.modal.padding` | `1.25rem` | Modal padding |
| `overlay.modal.shadow` | `0 20px 25px -5px rgba(0,0,0,0.1), ...` | Modal shadow |
| `overlay.navigation.shadow` | `0 4px 6px -1px rgba(0,0,0,0.1), ...` | Navigation overlay shadow |

---

## 3. Color Scheme Tokens (Light / Dark)

These tokens are defined per color scheme inside `colorScheme.light` and `colorScheme.dark`. All values below show **dark mode** defaults (since Distillery uses dark mode). Light mode equivalents follow the same structure.

### Surface

| Token path | Dark default | Light default |
|---|---|---|
| `surface.0` | `#ffffff` | `#ffffff` |
| `surface.50` | `{zinc.50}` | `{slate.50}` |
| `surface.100` | `{zinc.100}` | `{slate.100}` |
| `surface.200` | `{zinc.200}` | `{slate.200}` |
| `surface.300` | `{zinc.300}` | `{slate.300}` |
| `surface.400` | `{zinc.400}` | `{slate.400}` |
| `surface.500` | `{zinc.500}` | `{slate.500}` |
| `surface.600` | `{zinc.600}` | `{slate.600}` |
| `surface.700` | `{zinc.700}` | `{slate.700}` |
| `surface.800` | `{zinc.800}` | `{slate.800}` |
| `surface.900` | `{zinc.900}` | `{slate.900}` |
| `surface.950` | `{zinc.950}` | `{slate.950}` |

### Primary (scheme-specific variants)

| Token path | Dark default | Light default | Description |
|---|---|---|---|
| `primary.color` | `{primary.400}` | `{primary.500}` | Main primary color |
| `primary.contrastColor` | `{surface.900}` | `#ffffff` | Text on primary backgrounds |
| `primary.hoverColor` | `{primary.300}` | `{primary.600}` | Primary on hover |
| `primary.activeColor` | `{primary.200}` | `{primary.700}` | Primary when active/pressed |

### Text

| Token path | Dark default | Light default | Description |
|---|---|---|---|
| `text.color` | `{surface.0}` | `{surface.700}` | Default text color |
| `text.hoverColor` | `{surface.0}` | `{surface.800}` | Text color on hover |
| `text.mutedColor` | `{surface.400}` | `{surface.500}` | Secondary/muted text |
| `text.hoverMutedColor` | `{surface.300}` | `{surface.600}` | Muted text on hover |

### Highlight

| Token path | Dark default | Light default | Description |
|---|---|---|---|
| `highlight.background` | `color-mix(in srgb, {primary.400}, transparent 84%)` | `{primary.50}` | Selected item background |
| `highlight.focusBackground` | `color-mix(in srgb, {primary.400}, transparent 76%)` | `{primary.100}` | Focused selected item bg |
| `highlight.color` | `rgba(255,255,255,.87)` | `{primary.700}` | Selected item text color |
| `highlight.focusColor` | `rgba(255,255,255,.87)` | `{primary.800}` | Focused selected item text |

### Mask

| Token path | Dark default | Light default | Description |
|---|---|---|---|
| `mask.background` | `rgba(0,0,0,0.6)` | `rgba(0,0,0,0.4)` | Modal backdrop color |
| `mask.color` | `{surface.200}` | `{surface.200}` | Mask text color |

### Content

| Token path | Dark default | Light default | Description |
|---|---|---|---|
| `content.background` | `{surface.900}` | `{surface.0}` | Content area background |
| `content.hoverBackground` | `{surface.800}` | `{surface.100}` | Content area hover bg |
| `content.borderColor` | `{surface.700}` | `{surface.200}` | Content area border |
| `content.color` | `{text.color}` | `{text.color}` | Content area text color |
| `content.hoverColor` | `{text.hover.color}` | `{text.hover.color}` | Content area hover text |

### Form Field (scheme-specific styling)

| Token path | Dark default | Light default | Description |
|---|---|---|---|
| `formField.background` | `{surface.950}` | `{surface.0}` | Input background |
| `formField.disabledBackground` | `{surface.700}` | `{surface.200}` | Disabled input bg |
| `formField.filledBackground` | `{surface.800}` | `{surface.50}` | Filled variant bg |
| `formField.filledHoverBackground` | `{surface.800}` | `{surface.50}` | Filled variant hover bg |
| `formField.filledFocusBackground` | `{surface.800}` | `{surface.50}` | Filled variant focus bg |
| `formField.borderColor` | `{surface.600}` | `{surface.300}` | Input border |
| `formField.hoverBorderColor` | `{surface.500}` | `{surface.400}` | Input hover border |
| `formField.focusBorderColor` | `{primary.color}` | `{primary.color}` | Input focus border |
| `formField.invalidBorderColor` | `{red.300}` | `{red.400}` | Invalid input border |
| `formField.color` | `{surface.0}` | `{surface.700}` | Input text color |
| `formField.disabledColor` | `{surface.400}` | `{surface.500}` | Disabled input text |
| `formField.placeholderColor` | `{surface.400}` | `{surface.500}` | Placeholder text |
| `formField.invalidPlaceholderColor` | `{red.400}` | `{red.600}` | Invalid placeholder text |
| `formField.floatLabelColor` | `{surface.400}` | `{surface.500}` | Float label idle color |
| `formField.floatLabelFocusColor` | `{primary.color}` | `{primary.600}` | Float label focus color |
| `formField.floatLabelActiveColor` | `{surface.400}` | `{surface.500}` | Float label active color |
| `formField.floatLabelInvalidColor` | `{form.field.invalid.placeholder.color}` | `{form.field.invalid.placeholder.color}` | Float label invalid color |
| `formField.iconColor` | `{surface.400}` | `{surface.400}` | Input icon color |
| `formField.shadow` | `0 0 #0000, 0 0 #0000, 0 1px 2px 0 rgba(18,18,23,0.05)` | *(same)* | Input box-shadow |

### Overlay (scheme-specific backgrounds)

| Token path | Dark default | Light default | Description |
|---|---|---|---|
| `overlay.select.background` | `{surface.900}` | `{surface.0}` | Select dropdown bg |
| `overlay.select.borderColor` | `{surface.700}` | `{surface.200}` | Select dropdown border |
| `overlay.select.color` | `{text.color}` | `{text.color}` | Select dropdown text |
| `overlay.popover.background` | `{surface.900}` | `{surface.0}` | Popover bg |
| `overlay.popover.borderColor` | `{surface.700}` | `{surface.200}` | Popover border |
| `overlay.popover.color` | `{text.color}` | `{text.color}` | Popover text |
| `overlay.modal.background` | `{surface.900}` | `{surface.0}` | Modal bg |
| `overlay.modal.borderColor` | `{surface.700}` | `{surface.200}` | Modal border |
| `overlay.modal.color` | `{text.color}` | `{text.color}` | Modal text |

### List (scheme-specific styling)

| Token path | Dark default | Light default | Description |
|---|---|---|---|
| `list.option.focusBackground` | `{surface.800}` | `{surface.100}` | Focused option bg |
| `list.option.selectedBackground` | `{highlight.background}` | `{highlight.background}` | Selected option bg |
| `list.option.selectedFocusBackground` | `{highlight.focus.background}` | `{highlight.focus.background}` | Selected+focused option bg |
| `list.option.color` | `{text.color}` | `{text.color}` | Option text |
| `list.option.focusColor` | `{text.hover.color}` | `{text.hover.color}` | Focused option text |
| `list.option.selectedColor` | `{highlight.color}` | `{highlight.color}` | Selected option text |
| `list.option.selectedFocusColor` | `{highlight.focus.color}` | `{highlight.focus.color}` | Selected+focused option text |
| `list.option.icon.color` | `{surface.500}` | `{surface.400}` | Option icon color |
| `list.option.icon.focusColor` | `{surface.400}` | `{surface.500}` | Focused option icon |
| `list.optionGroup.background` | `transparent` | `transparent` | Option group bg |
| `list.optionGroup.color` | `{text.muted.color}` | `{text.muted.color}` | Option group text |

### Navigation (scheme-specific styling)

| Token path | Dark default | Light default | Description |
|---|---|---|---|
| `navigation.item.focusBackground` | `{surface.800}` | `{surface.100}` | Focused nav item bg |
| `navigation.item.activeBackground` | `{surface.800}` | `{surface.100}` | Active nav item bg |
| `navigation.item.color` | `{text.color}` | `{text.color}` | Nav item text |
| `navigation.item.focusColor` | `{text.hover.color}` | `{text.hover.color}` | Focused nav item text |
| `navigation.item.activeColor` | `{text.hover.color}` | `{text.hover.color}` | Active nav item text |
| `navigation.item.icon.color` | `{surface.500}` | `{surface.400}` | Nav item icon |
| `navigation.item.icon.focusColor` | `{surface.400}` | `{surface.500}` | Focused nav item icon |
| `navigation.item.icon.activeColor` | `{surface.400}` | `{surface.500}` | Active nav item icon |
| `navigation.submenuLabel.background` | `transparent` | `transparent` | Submenu label bg |
| `navigation.submenuLabel.color` | `{text.muted.color}` | `{text.muted.color}` | Submenu label text |
| `navigation.submenuIcon.color` | `{surface.500}` | `{surface.400}` | Submenu icon |
| `navigation.submenuIcon.focusColor` | `{surface.400}` | `{surface.500}` | Focused submenu icon |
| `navigation.submenuIcon.activeColor` | `{surface.400}` | `{surface.500}` | Active submenu icon |

---

## 4. Component Tokens

Each PrimeVue component has its own token file under `@primeuix/themes/aura/{component}`. Component tokens map to the semantic tokens above. Override them in `DistilleryPreset` under `components.{component}`.

**Example:** To customize the Button component:

```ts
const DistilleryPreset = definePreset(Aura, {
  components: {
    button: {
      borderRadius: '{border.radius.sm}',
      // ... per-component token overrides
    }
  }
})
```

Component token files exist for: `accordion`, `autocomplete`, `avatar`, `badge`, `blockui`, `breadcrumb`, `button`, `card`, `carousel`, `cascadeselect`, `checkbox`, `chip`, `colorpicker`, `confirmdialog`, `confirmpopup`, `contextmenu`, `datatable`, `dataview`, `datepicker`, `dialog`, `divider`, `dock`, `drawer`, `editor`, `fieldset`, `fileupload`, `floatlabel`, `galleria`, `iconfield`, `iftalabel`, `image`, `imagecompare`, `inlinemessage`, `inplace`, `inputchips`, `inputgroup`, `inputnumber`, `inputotp`, `inputtext`, `knob`, `listbox`, `megamenu`, `menu`, `menubar`, `message`, `metergroup`, `multiselect`, `orderlist`, `organizationchart`, `overlaybadge`, `paginator`, `panel`, `panelmenu`, `password`, `picklist`, `popover`, `progressbar`, `progressspinner`, `radiobutton`, `rating`, `ripple`, `scrollpanel`, `select`, `selectbutton`, `skeleton`, `slider`, `speeddial`, `splitbutton`, `splitter`, `stepper`, `steps`, `tabmenu`, `tabs`, `tabview`, `tag`, `terminal`, `textarea`, `tieredmenu`, `timeline`, `toast`, `togglebutton`, `toggleswitch`, `toolbar`, `tooltip`, `tree`, `treeselect`, `treetable`, `virtualscroller`.

---

## Tailwind CSS Utility Mappings (via `tailwindcss-primeui`)

The `tailwindcss-primeui` plugin exposes these tokens as Tailwind utility classes:

| Tailwind class | Maps to |
|---|---|
| `bg-primary` | `primary.color` |
| `text-primary` | `primary.color` |
| `text-primary-contrast` | `primary.contrastColor` |
| `bg-primary-emphasis` | `primary.hoverColor` |
| `bg-highlight` | `highlight.background` |
| `bg-highlight-emphasis` | `highlight.focusBackground` |
| `bg-surface-{0-950}` | `surface.{0-950}` |
| `text-surface-{0-950}` | `surface.{0-950}` |
| `border-surface` | `content.borderColor` |
| `bg-emphasis` | `content.hoverBackground` |
| `text-color` | `text.color` |
| `text-color-emphasis` | `text.hoverColor` |
| `text-muted-color` | `text.mutedColor` |
| `text-muted-color-emphasis` | `text.hoverMutedColor` |
| `rounded-border` | `content.borderRadius` |
| `primary-{50-950}` | Primitive primary palette shade |
| `surface-{0-950}` | Scheme-dependent surface palette shade |

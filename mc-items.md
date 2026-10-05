# MCItems — Procedural Minecraft-style 16×16 Item Sprites

A tiny, dependency-free JavaScript library that generates **deterministic Minecraft-style 16×16 pixel-art item sprites** on `<canvas>` elements. Companion to `mc-tex.js`.

---

## Table of Contents

- [MCItems — Procedural Minecraft-style 16×16 Item Sprites](#mcitems--procedural-minecraft-style-1616-item-sprites)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
  - [Public API](#public-api)
    - [`MCItems.get(name, materialOrPalette)`](#mcitemsgetname-materialorpalette)
    - [`MCItems.getAll(materialOrPalette)`](#mcitemsgetallmaterialorpalette)
    - [`MCItems.generate(name, opts)`](#mcitemsgeneratename-opts)
    - [`MCItems.list()`](#mcitemslist)
    - [`MCItems.materials()`](#mcitemsmaterials)
    - [`MCItems.toPNG(name, materialOrPalette)`](#mcitemstopngname-materialorpalette)
    - [`MCItems.toPNGBlob(name, materialOrPalette, cb)`](#mcitemstopngblobname-materialorpalette-cb)
    - [`MCItems.registerMaterial(name, palette)`](#mcitemsregistermaterialname-palette)
    - [`MCItems.MATERIALS`](#mcitemsmaterials-1)
    - [`MCItems.SIZE`](#mcitemssize)
  - [Built-in Items](#built-in-items)
  - [Built-in Materials](#built-in-materials)
  - [Custom Palettes](#custom-palettes)
  - [Custom Materials](#custom-materials)
    - [1. Via the `MATERIALS` table (advanced)](#1-via-the-materials-table-advanced)
    - [2. Via `registerMaterial` (recommended)](#2-via-registermaterial-recommended)
  - [Character Map Reference](#character-map-reference)
  - [Notes \& Behavior](#notes--behavior)

---

## Features

- 🎨 **10 built-in items** — swords, tools, weapons, and utilities.
- 🧱 **6 built-in materials** — wood, stone, iron, gold, diamond, netherite.
- 🖌️ **Vanilla-style shading** — dark 1px outline, top-left light source, ramped highlights.
- 🧩 **Custom palettes & materials** — register your own ramps at runtime.
- 📦 **Deterministic** — no randomness; the same input always yields the same sprite.
- 🪶 **Zero dependencies** — pure browser JavaScript, works with a single `<script>` tag.
- 🖼️ **PNG export** — synchronous (data URL) and asynchronous (Blob) exporters.

---

## Installation

Drop the file into your project and include it via a `<script>` tag:

```html
<script src="mc-items.js"></script>
```

The library attaches itself to `window.MCItems` (or `globalThis.MCItems` in non-browser environments).

---

## Quick Start

```html
<script src="mc-items.js"></script>
<script>
  // 1. Grab a canvas and append it to the page
  const canvas = MCItems.get('sword', 'diamond');
  document.body.appendChild(canvas);

  // 2. Export as a PNG data URL
  const dataURL = MCItems.toPNG('pickaxe', 'gold');
  document.querySelector('img').src = dataURL;

  // 3. Generate every sprite for a material
  const all = MCItems.getAll('netherite');
  for (const [name, canvas] of Object.entries(all)) {
    document.body.appendChild(canvas);
  }
</script>
```

---

## Public API

### `MCItems.get(name, materialOrPalette)`

Returns a cached `<canvas>` element (16×16) for the given item and material/palette.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Item name (e.g. `'sword'`). Falls back to `'sword'` if unknown. |
| `materialOrPalette` | `string \| object \| null` | Material name, custom palette object, or `null`. Defaults to `'iron'` head + `'wood'` handle. |

**Returns:** `HTMLCanvasElement`

> Caching: only string materials (and the default) are cached. Custom palette objects are re-rendered on every call so callers can mutate them freely.

```js
const sword = MCItems.get('sword', 'gold');
document.body.appendChild(sword);
```

---

### `MCItems.getAll(materialOrPalette)`

Returns an object mapping every item name to its rendered `<canvas>`.

**Returns:** `{ [itemName: string]: HTMLCanvasElement }`

```js
const sprites = MCItems.getAll('diamond');
// → { sword: <canvas>, pickaxe: <canvas>, axe: <canvas>, ... }
```

---

### `MCItems.generate(name, opts)`

Like `get`, but **always renders a fresh canvas** — no caching, no reuse.

| Option | Type | Description |
|--------|------|-------------|
| `opts.material` | `string` | Material name (e.g. `'iron'`). |
| `opts.palette` | `object` | Custom palette object. Takes precedence over `material`. |

**Returns:** `HTMLCanvasElement`

```js
const fresh = MCItems.generate('axe', { material: 'stone' });

const custom = MCItems.generate('sword', {
  palette: {
    head:   [[255,255,255], [200,200,200], [120,120,120]],
    handle: [[160,120,60],  [120, 90,45],  [80, 60,30]],
    accent: [[255,200,0],   [220,160,0],   [140,100,0]],
  },
});
```

---

### `MCItems.list()`

Returns the names of all built-in items.

**Returns:** `string[]`

```js
MCItems.list();
// → ['sword','pickaxe','axe','shovel','hoe','bow','arrow','fishing_rod','shield','torch']
```

---

### `MCItems.materials()`

Returns the names of all registered materials (built-in + custom).

**Returns:** `string[]`

```js
MCItems.materials();
// → ['wood','stone','iron','gold','diamond','netherite']
```

---

### `MCItems.toPNG(name, materialOrPalette)`

Convenience wrapper that returns a PNG **data URL** for the given sprite.

**Returns:** `string`

```js
const url = MCItems.toPNG('shield', 'netherite');
document.querySelector('img').src = url;
```

---

### `MCItems.toPNGBlob(name, materialOrPalette, cb)`

Asynchronously produces a PNG `Blob`. Falls back to a manual data-URL → Blob conversion if `canvas.toBlob` is unavailable.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Item name. |
| `materialOrPalette` | `string \| object \| null` | Material or palette. |
| `cb` | `(blob: Blob, name: string) => void` | Callback receiving the Blob and item name. |

```js
MCItems.toPNGBlob('bow', 'wood', (blob, name) => {
  const url = URL.createObjectURL(blob);
  console.log(`${name} → ${url}`);
});
```

---

### `MCItems.registerMaterial(name, palette)`

Registers (or overwrites) a material in the internal `MATERIALS` table. Invalidates the cache for that material.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Unique material name (required). |
| `palette` | `object` | Palette with `head`, `handle`, `accent`, and optional `outline`. Missing fields fall back to defaults. |

```js
MCItems.registerMaterial('ruby', {
  head:   [[255,120,140], [220,60,90],  [140,20,40]],
  handle: [[160,120,60],  [120,90,45],  [80,60,30]],
  accent: [[255,160,180], [230,90,120], [150,40,70]],
});

MCItems.get('sword', 'ruby'); // uses the new material
```

---

### `MCItems.MATERIALS`

The raw, mutable material table. Each material is `{ head, handle, accent, outline? }`, where each ramp is an array of three `[r, g, b]` triples.

```js
console.log(MCItems.MATERIALS.gold.head);
// → [[255,247,160], [240,192,56], [176,124,24]]
```

---

### `MCItems.SIZE`

The fixed sprite dimension. Always `16`.

```js
MCItems.SIZE; // → 16
```

---

## Built-in Items

| Name | Description |
|------|-------------|
| `sword` | Classic diagonal sword, handle bottom-left. |
| `pickaxe` | Vanilla-style pickaxe with head top-right. |
| `axe` | Single-bladed axe. |
| `shovel` | Rounded-blade shovel. |
| `hoe` | Hoe with an L-shaped head. |
| `bow` | Curved bow with a drawn string. |
| `arrow` | Arrow with flint head and fletching. |
| `fishing_rod` | Rod with a line and bobber. |
| `shield` | Rounded shield with a crest. |
| `torch` | Wooden stick with flame (fixed fire colors). |

---

## Built-in Materials

| Name | Head ramp | Handle ramp |
|------|-----------|-------------|
| `wood` | Brown wood | Wood |
| `stone` | Grey stone | Wood |
| `iron` | Light grey metal | Wood |
| `gold` | Warm yellow metal | Wood |
| `diamond` | Cyan gem | Wood |
| `netherite` | Dark purple-grey | Dark leather |

Each material provides three 3-shade ramps:

- **`head`** — blade/tool-head.
- **`handle`** — wooden/leather grip.
- **`accent`** — decorative details.

Each ramp is `[light, mid, dark]`.

---

## Custom Palettes

A palette object looks like:

```js
{
  head:   [rgb, rgb, rgb],   // [light, mid, dark]
  handle: [rgb, rgb, rgb],
  accent: [rgb, rgb, rgb],
  outline: {                 // optional
    head:   rgb,
    handle: rgb,
    accent: rgb,
  },
}
```

Where `rgb` is `[r, g, b]` (0–255).

If `outline` is omitted, it is derived automatically by **darkening the darkest shade** of each ramp:

```js
head:   darken(head[2],   0.50)
handle: darken(handle[2], 0.52)
accent: darken(accent[2], 0.52)
```

---

## Custom Materials

Two ways to add a material:

### 1. Via the `MATERIALS` table (advanced)

```js
MCItems.MATERIALS.emerald = {
  head:   [[100,255,180], [40,200,120], [10,120,70]],
  handle: MCItems.MATERIALS.wood.handle,
  accent: [[120,255,200], [60,220,150], [20,140,90]],
};
```

### 2. Via `registerMaterial` (recommended)

```js
MCItems.registerMaterial('emerald', {
  head:   [[100,255,180], [40,200,120], [10,120,70]],
  accent: [[120,255,200], [60,220,150], [20,140,90]],
  // handle omitted → falls back to 'wood'
});
```

Only `registerMaterial` invalidates the internal cache — prefer it.

---

## Character Map Reference

Sprites are defined as 16×16 grids of characters. Every character maps to a resolver that produces an `[r, g, b]` color.

| Char | Meaning |
|:---:|---------|
| `1` `2` `3` | Head ramp — light / mid / dark |
| `h` `H` `x` | Handle ramp — light / mid / dark |
| `a` `A` `q` | Accent ramp — light / mid / dark |
| `o` `O` `u` | Outline — head / handle / accent |
| `f` `g` `G` | Fire — light / mid / dark (fixed) |
| `s` `S` | String — light / dark (fixed) |
| `.` | Transparent |

Fixed colors (never material-dependent):

- **Fire:** `#ffee8a`, `#ffa030`, `#c23c10`
- **String:** `#e6e6e6`, `#9a9a9a`

---

## Notes & Behavior

- **Deterministic** — the library intentionally does **not** support random generation. The same `(item, material)` pair always yields the same sprite.
- **Sprite validation** — on load, every sprite is validated to be exactly 16×16. Invalid definitions throw an error.
- **Fallbacks** — unknown item names fall back to `'sword'`; unknown material names fall back to `'iron'`.
- **Caching** — only string materials (and the default) are cached. Custom palettes are re-rendered on every call.
- **Light source** — top-left. Highlights sit on the upper/left edges; dark shades on the lower/right.
- **Rendering** — sprites are drawn pixel-perfect into a 16×16 `ImageData` buffer, then placed on a canvas via `putImageData`.
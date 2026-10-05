# mc-tex

[https://luisrguerra.github.io/mc-tex/mc-tex.js](https://luisrguerra.github.io/mc-tex/mc-tex.js)

[Demo](https://luisrguerra.github.io/mc-tex/main.html)
[Game Demo](https://luisrguerra.github.io/mc-tex/game-demo.html)

Procedural **Minecraft-style 16×16 textures** generated entirely in the browser — no image assets, no network requests. Every texture is drawn pixel-by-pixel with a deterministic pseudo-random generator, so the same name always produces the same result.

Textures are deterministic by default, but you can optionally generate **random variations** on demand with `MCTex.random()` / `MCTex.randomAll()` — see [Random textures](#random-textures).

- Zero dependencies (Three.js is optional, only needed for `blockMaterials`)
- Works in any modern browser via a single `<script>` tag
- Exports to `HTMLCanvasElement`, PNG data URL, or `Blob`
- Ready-made Three.js materials for cube blocks (with per-face textures)

---

## Installation

Just include the script. It attaches a global `MCTex` object.

```html
<script src="https://luisrguerra.github.io/mc-tex/mc-tex.js"></script>
<script>
  const canvas = MCTex.get('grass');
  document.body.appendChild(canvas);
</script>
```

The library also works in non-browser environments that expose a global object (it falls back to `globalThis`), but it requires a DOM `canvas` implementation to generate textures.

---

## Quick start

```js
// 1. Get a texture as a 16x16 canvas
const canvas = MCTex.get('stone');
document.body.appendChild(canvas); // canvas is displayable as-is

// 2. List every available texture name
console.log(MCTex.list());

// 3. Export a texture as a PNG data URL
const dataUrl = MCTex.toPNG('diamond_ore');
const img = new Image();
img.src = dataUrl;
document.body.appendChild(img);
```

---

## API reference

### `MCTex.SIZE`

`number` — the texture resolution in pixels. Always `16`.

---

### `MCTex.get(name)`

Returns the texture as an `HTMLCanvasElement` (16×16).

| Parameter | Type     | Description                          |
| --------- | -------- | ------------------------------------ |
| `name`    | `string` | Texture name or alias (see below).   |

If the name is unknown, it falls back to the `dirt` texture. Aliases are resolved automatically (e.g. `grass` → `grass_top`, `log` → `oak_log_side`).

```js
const canvas = MCTex.get('cobblestone');
canvas.width;  // 16
canvas.height; // 16
```

---

### `MCTex.getAll()`

Returns a **new object** mapping every texture name to its canvas. Mutating the returned object does not affect the library.

```js
const all = MCTex.getAll();
Object.keys(all).length; // number of textures
```

---

### `MCTex.list()`

Returns an array of all texture names (the raw keys, including per-face variants such as `grass_top`, `grass_side`, `oak_log_top`, …).

```js
MCTex.list().forEach(name => console.log(name));
```

---

### `MCTex.toPNG(name)`

Returns a PNG **data URL** (`data:image/png;base64,...`) for the given texture.

```js
const url = MCTex.toPNG('gold_block');
```

---

### `MCTex.toPNGBlob(name, callback)`

Asynchronously produces a PNG `Blob`. The callback receives `(blob, resolvedName)`.

| Parameter  | Type       | Description                                        |
| ---------- | ---------- | -------------------------------------------------- |
| `name`     | `string`   | Texture name or alias.                             |
| `callback` | `function` | Called with `(blob, resolvedName)` when ready.     |

```js
MCTex.toPNGBlob('tnt_side', (blob, name) => {
  const url = URL.createObjectURL(blob);
  // use url, e.g. as a download link
});
```

---

### `MCTex.generate(generatorName, seedString)`

Generates a **fresh** texture canvas using a specific internal generator and a custom seed. Unlike `get()`, this does not use the cached deterministic texture — you can produce variations of the same texture.

| Parameter       | Type     | Description                                                       |
| --------------- | -------- | ----------------------------------------------------------------- |
| `generatorName` | `string` | Internal generator key (e.g. `stone`, `grass_top`, `wool_red`).   |
| `seedString`    | `string` | Any string; the same seed always yields the same texture.         |

Throws an `Error` if the generator name is unknown.

```js
const a = MCTex.generate('stone', 'seed-1');
const b = MCTex.generate('stone', 'seed-2'); // different noise pattern
```

---

## Random textures

The random API is **opt-in** and **non-destructive**: it never mutates the cached textures used by `get()` / `blockMaterials()`, so the default deterministic behavior is always preserved. Calling one of these methods is the only way to get randomness.

### `MCTex.randomSeed()`

Returns a short random seed string (e.g. `"k3f9a2x1"`). Useful for generating a seed you can display, copy, or persist so a random variant can be reproduced later.

```js
const seed = MCTex.randomSeed(); // "k3f9a2x1"
```

---

### `MCTex.random(name, seed?)`

Returns a **fresh** `HTMLCanvasElement` (16×16) for a single texture, generated with a random seed. Aliases are resolved exactly like `get()`, and unknown names fall back to `dirt`.

| Parameter | Type     | Description                                                                 |
| --------- | -------- | --------------------------------------------------------------------------- |
| `name`    | `string` | Texture name or alias.                                                      |
| `seed`    | `string` | Optional. Same seed always yields the same variant; omit for a random one.  |

```js
// A random stone variant
const canvas = MCTex.random('stone');

// Reproducible variant
const a = MCTex.random('stone', 'my-seed');
const b = MCTex.random('stone', 'my-seed'); // identical to a
```

---

### `MCTex.randomAll(seed?)`

Returns a **new object** mapping every texture name to a freshly generated random canvas. The cached textures are left untouched, so `get()` and `blockMaterials()` keep returning the deterministic versions.

| Parameter | Type     | Description                                                                        |
| --------- | -------- | ---------------------------------------------------------------------------------- |
| `seed`    | `string` | Optional master seed. The same master seed always reproduces the same whole set.   |

```js
// Randomize every texture at once
const set = MCTex.randomAll();
set.stone; // a random stone canvas

// Reproduce a whole set later from its master seed
const seed = MCTex.randomSeed();
const first  = MCTex.randomAll(seed);
const second = MCTex.randomAll(seed); // identical to first
```

> Each texture in a `randomAll()` set derives its own seed from the master seed, so a single string reproduces the entire collection.

---

### `MCTex.blockMaterials(name, THREE, options?)`

Builds an array of **6 Three.js materials** in the order `[+X, -X, +Y (top), -Y (bottom), +Z, -Z]`, ready to assign to a `BoxGeometry`. Per-face textures (top / side / bottom / front) are resolved automatically.

| Parameter | Type     | Description                                                        |
| --------- | -------- | ------------------------------------------------------------------ |
| `name`    | `string` | Block name or alias.                                               |
| `THREE`   | `object` | The Three.js namespace (needed for `CanvasTexture`, `Color`, etc.).|
| `options` | `object` | Optional. `{ faceShade: true }` applies Minecraft-like face shading.|

Materials are cached, so calling this repeatedly for the same block is cheap.

```js
import * as THREE from 'three';

const geometry = new THREE.BoxGeometry(1, 1, 1);
const materials = MCTex.blockMaterials('grass', THREE, { faceShade: true });
const mesh = new THREE.Mesh(geometry, materials);
scene.add(mesh);
```

**Face shading** (`faceShade: true`) multiplies each face by a brightness factor to mimic Minecraft's directional lighting:

| Face        | Brightness |
| ----------- | ---------- |
| Top (+Y)    | 1.0        |
| Bottom (-Y) | 0.5        |
| X sides     | 0.6        |
| Z sides     | 0.8        |

Without `faceShade`, all faces use full brightness (`1`).

**Special material behavior:**

- `glass` → `alphaTest: 0.5` (transparent pixels are cut out)
- `water` → `transparent: true`

---

## Aliases

Some convenient short names map to specific face textures:

| Alias              | Resolves to          |
| ------------------ | -------------------- |
| `grass`            | `grass_top`          |
| `log`              | `oak_log_side`       |
| `oak_log`          | `oak_log_side`       |
| `spruce_log`       | `spruce_log_side`    |
| `birch_log`        | `birch_log_side`     |
| `jungle_log`       | `jungle_log_side`    |
| `acacia_log`       | `acacia_log_side`    |
| `dark_oak_log`     | `dark_oak_log_side`  |
| `crimson_stem`     | `crimson_stem_side`  |
| `warped_stem`      | `warped_stem_side`   |
| `planks`           | `oak_planks`         |
| `oak_planks`       | `oak_planks`         |
| `leaves`           | `oak_leaves`         |
| `sandstone`        | `sandstone_side`     |
| `red_sandstone`    | `red_sandstone_side` |
| `brick`            | `bricks`             |
| `netherrack_bricks`| `nether_bricks`      |

---

## Multi-face blocks

For blocks that look different on each side, `blockMaterials` uses a built-in face map. These blocks are recognized automatically:

| Block            | Top                | Side                 | Bottom             | Front                |
| ---------------- | ------------------ | -------------------- | ------------------ | -------------------- |
| `grass`          | `grass_top`        | `grass_side`         | `dirt`             | —                    |
| `oak_log`        | `oak_log_top`      | `oak_log_side`       | `oak_log_top`      | —                    |
| `spruce_log`     | `spruce_log_top`   | `spruce_log_side`    | `spruce_log_top`   | —                    |
| `birch_log`      | `birch_log_top`    | `birch_log_side`     | `birch_log_top`    | —                    |
| `jungle_log`     | `jungle_log_top`   | `jungle_log_side`    | `jungle_log_top`   | —                    |
| `acacia_log`     | `acacia_log_top`   | `acacia_log_side`    | `acacia_log_top`   | —                    |
| `dark_oak_log`   | `dark_oak_log_top` | `dark_oak_log_side`  | `dark_oak_log_top` | —                    |
| `crimson_stem`   | `crimson_stem_top` | `crimson_stem_side`  | `crimson_stem_top` | —                    |
| `warped_stem`    | `warped_stem_top`  | `warped_stem_side`   | `warped_stem_top`  | —                    |
| `sandstone`      | `sandstone_top`    | `sandstone_side`     | `sandstone_top`    | —                    |
| `red_sandstone`  | `red_sandstone_top`| `red_sandstone_side` | `red_sandstone_top`| —                    |
| `crafting_table` | `crafting_table_top`| `crafting_table_side`| `oak_planks`      | `crafting_table_front`|
| `furnace`        | `furnace_top`      | `furnace_side`       | `furnace_top`      | `furnace_front`      |
| `chest`          | `chest_top`        | `chest_side`         | `chest_top`        | `chest_front`        |
| `pumpkin`        | `pumpkin_top`      | `pumpkin_side`       | `pumpkin_top`      | `pumpkin_face`       |
| `melon`          | `melon_top`        | `melon_side`         | `melon_top`        | —                    |
| `tnt`            | `tnt_top`          | `tnt_side`           | `tnt_bottom`       | —                    |
| `hay`            | `hay_top`          | `hay_side`           | `hay_top`          | —                    |
| `cactus`         | `cactus_top`       | `cactus_side`        | `cactus_top`       | —                    |

When a block defines a `front`, the `-Z` face receives the front texture and `+Z` receives the side texture.

---

## Available textures

### Terrain & stone
`dirt`, `grass_top`, `grass_side`, `stone`, `cobblestone`, `mossy_cobblestone`, `stone_bricks`, `cracked_stone_bricks`, `gravel`, `bedrock`, `clay`

### Stone variants
`andesite`, `diorite`, `granite`, `deepslate`, `cobbled_deepslate`, `blackstone`

### Sand
`sand`, `sandstone_side`, `sandstone_top`, `red_sand`, `red_sandstone_side`, `red_sandstone_top`

### Wood
`oak_log_side`, `oak_log_top`, `oak_planks`, `spruce_log_side`, `spruce_log_top`, `spruce_planks`, `birch_log_side`, `birch_log_top`, `birch_planks`, `jungle_log_side`, `jungle_log_top`, `jungle_planks`, `acacia_log_side`, `acacia_log_top`, `acacia_planks`, `dark_oak_log_side`, `dark_oak_log_top`, `dark_oak_planks`, `crimson_stem_side`, `crimson_stem_top`, `crimson_planks`, `warped_stem_side`, `warped_stem_top`, `warped_planks`, `oak_leaves`, `jungle_leaves`, `acacia_leaves`, `dark_oak_leaves`

### Ores
`coal_ore`, `iron_ore`, `gold_ore`, `diamond_ore`, `redstone_ore`, `lapis_ore`, `emerald_ore`, `quartz_ore`

### Mineral blocks
`iron_block`, `gold_block`, `diamond_block`, `emerald_block`, `coal_block`, `lapis_block`, `redstone_block`, `quartz_block`

### Construction
`copper_block`, `oxidized_copper`, `mud`, `packed_mud`, `sea_lantern`

### Nether & End
`bricks`, `nether_bricks`, `netherrack`, `soul_sand`, `glowstone`, `obsidian`, `end_stone`, `purpur_block`, `prismarine`, `nether_wart_block`, `warped_wart_block`

### Nature & liquids
`snow`, `ice`, `water`, `lava`, `glass`, `farmland`, `cactus_side`, `cactus_top`, `hay_side`, `hay_top`, `sponge`, `bookshelf`, `brown_mushroom_block`, `red_mushroom_block`

### Functional blocks
`crafting_table_top`, `crafting_table_side`, `crafting_table_front`, `furnace_side`, `furnace_top`, `furnace_front`, `chest_side`, `chest_top`, `chest_front`, `tnt_side`, `tnt_top`, `tnt_bottom`, `pumpkin_side`, `pumpkin_top`, `pumpkin_face`, `melon_side`, `melon_top`

### Wool
`wool_white`, `wool_red`, `wool_orange`, `wool_yellow`, `wool_green`, `wool_blue`, `wool_purple`, `wool_black`

> Use `MCTex.list()` to get the authoritative, up-to-date list at runtime.

---

## How it works

Each texture is produced by a small generator function that receives a seeded random number generator (`mulberry32`). The seed is derived from the texture name via an FNV-1a hash, so results are **deterministic** across reloads and machines.

Common building blocks used by the generators:

- **Value noise** (`tileNoise`) for clumpy, tileable patterns
- **Voronoi cells** for cobblestone, gravel, and glowstone
- **Palette ramps** for color variation
- **Scatter passes** for speckles and highlights

Because everything is procedural, textures are crisp, tiny, and free of external assets.

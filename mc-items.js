/* ============================================================
   mc-items.js — Procedural Minecraft-style 16x16 item sprites
   Companion to mc-tex.js

   Public API:
     MCItems.get(name, materialOrPalette)         -> HTMLCanvasElement
     MCItems.getAll(materialOrPalette)            -> { name: canvas }
     MCItems.list()                               -> [name, ...]
     MCItems.materials()                          -> [material, ...]
     MCItems.toPNG(name, materialOrPalette)       -> data URL
     MCItems.toPNGBlob(name, materialOrPalette, cb) -> Blob via callback
     MCItems.generate(name, opts)                 -> fresh canvas
         opts = { material: 'gold' }  OR
         opts = { palette: { head:[rgb,rgb,rgb], handle:[...], accent:[...],
                             outline:{ head:rgb, handle:rgb, accent:rgb } } }
         (`outline` is optional; when omitted it is derived automatically
          by darkening the darkest shade of each ramp)
     MCItems.registerMaterial(name, palette)      -> register custom material
     MCItems.MATERIALS                            -> raw material table
     MCItems.THREE.texture(name, mat, THREE)      -> THREE.CanvasTexture
     MCItems.THREE.spriteMaterial(name, mat, THREE) -> THREE.SpriteMaterial
     MCItems.THREE.planeMaterial(name, mat, THREE)  -> THREE.MeshBasicMaterial

   Items (10):
     sword, pickaxe, axe, shovel, hoe,
     bow, arrow, fishing_rod, shield, torch

   Materials (6):
     wood, stone, iron, gold, diamond, netherite

   Style notes (v2):
     - Every sprite has a dark 1px outline, like vanilla Minecraft items.
     - Light comes from the top-left: highlights on the upper/left
       edges, darker shades on the lower/right edges.
     - Tools follow the vanilla diagonal layout (handle bottom-left,
       business end top-right).

   NOTE: This library does NOT support random generation.
   Every item/material produces a deterministic sprite.
   ============================================================ */
(function (global) {
  'use strict';

  const SIZE = 16;

  const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const pal = (...hs) => hs.map(hex);
  const darken = (c, f) => [
    Math.round(c[0] * f),
    Math.round(c[1] * f),
    Math.round(c[2] * f),
  ];

  /* ============================================================
     MATERIALS
     Each material provides three 3-shade ramps:
       head   — the blade/tool-head part      (light, mid, dark)
       handle — the wooden/leather grip       (light, mid, dark)
       accent — decorative details / guard    (light, mid, dark)
     Outlines are derived automatically from the dark shade of
     each ramp (see deriveOutline) unless a palette provides its
     own `outline` object.
     ============================================================ */
  const MATERIALS = {
    wood: {
      head:   pal(0xb08a52, 0x8a6638, 0x5c4120),
      handle: pal(0xa57d45, 0x7c5a2e, 0x503818),
      accent: pal(0xb8905a, 0x8c6a3c, 0x5e4420),
    },
    stone: {
      head:   pal(0xc2c2c2, 0x8e8e8e, 0x5e5e5e),
      handle: pal(0xa57d45, 0x7c5a2e, 0x503818),
      accent: pal(0xa8a8a8, 0x777777, 0x4c4c4c),
    },
    iron: {
      head:   pal(0xf4f4f4, 0xc0c0c0, 0x7c7c7c),
      handle: pal(0xa57d45, 0x7c5a2e, 0x503818),
      accent: pal(0xdcdcdc, 0xa4a4a4, 0x6c6c6c),
    },
    gold: {
      head:   pal(0xfff7a0, 0xf0c038, 0xb07c18),
      handle: pal(0xa57d45, 0x7c5a2e, 0x503818),
      accent: pal(0xffe060, 0xdca820, 0x94701a),
    },
    diamond: {
      head:   pal(0xbafaf2, 0x54d8cc, 0x249a90),
      handle: pal(0xa57d45, 0x7c5a2e, 0x503818),
      accent: pal(0x90f0e8, 0x44bcb2, 0x1e8a80),
    },
    netherite: {
      head:   pal(0x82787a, 0x544a4c, 0x2e2628),
      handle: pal(0x544232, 0x3a2c1c, 0x22190e),
      accent: pal(0x685c5e, 0x433a3c, 0x261e20),
    },
  };

  /* Fixed palettes (never material-dependent) */
  const FIRE   = pal(0xffee8a, 0xffa030, 0xc23c10);
  const STRING = pal(0xe6e6e6, 0x9a9a9a);

  /* ============================================================
     OUTLINE DERIVATION
     Vanilla item outlines are a much darker version of the
     material's darkest shade.
     ============================================================ */
  function deriveOutline(p) {
    const o = p.outline || {};
    return {
      head:   o.head   || darken(p.head[2],   0.50),
      handle: o.handle || darken(p.handle[2], 0.52),
      accent: o.accent || darken(p.accent[2], 0.52),
    };
  }

  /* ============================================================
     CHARACTER -> COLOR RESOLVER
     Sprite rows use characters that map to shades of the palette.
       '1','2','3' — head   light / mid / dark
       'h','H','x' — handle light / mid / dark
       'a','A','q' — accent light / mid / dark
       'o','O','u' — outline of head / handle / accent
       'f','g','G' — fire   light / mid / dark  (fixed colors)
       's','S'     — string light / dark         (fixed colors)
       '.'         — transparent
     Each resolver receives (palette, outlines).
     ============================================================ */
  const CHAR_MAP = {
    '1': (p) => p.head[0],
    '2': (p) => p.head[1],
    '3': (p) => p.head[2],
    'h': (p) => p.handle[0],
    'H': (p) => p.handle[1],
    'x': (p) => p.handle[2],
    'a': (p) => p.accent[0],
    'A': (p) => p.accent[1],
    'q': (p) => p.accent[2],
    'o': (p, o) => o.head,
    'O': (p, o) => o.handle,
    'u': (p, o) => o.accent,
    'f': ()  => FIRE[0],
    'g': ()  => FIRE[1],
    'G': ()  => FIRE[2],
    's': ()  => STRING[0],
    'S': ()  => STRING[1],
  };

  /* ============================================================
     SPRITE DEFINITIONS
     Each sprite is 16 rows × 16 chars. See CHAR_MAP above.
     ============================================================ */
  const SPRITES = {

    sword: {
      rows: [
        '..............oo',
        '.............o13',
        '............o13o',
        '...........o13o.',
        '..........o13o..',
        '.........o13o...',
        '........o13o....',
        '...uu..o13o.....',
        '..uaAuo13o......',
        '...uAA13o.......',
        '....uAAo........',
        '...OhuAAu.......',
        '..OHO.uAqu......',
        '.OhO...uu.......',
        'uHO.............',
        'Au..............',
      ],
    },

    pickaxe: {
      rows: [
        '................',
        '................',
        '....ooooo.......',
        '...o11112oo.....',
        '....o222212o....',
        '.....oooo222o...',
        '.........o22o...',
        '.......O..o12o..',
        '......OHO.o12o..',
        '.....OhO..o12o..',
        '....OHO...o22o..',
        '...OhO.....o3o..',
        '..OHO.......o...',
        '.OhO............',
        'OHO.............',
        'hO..............',
      ],
    },

    axe: {
      rows: [
        '................',
        '.......ooooo....',
        '.....oo11112o...',
        '....o1122223hO..',
        '...o1222223HO...',
        '...o122223hO....',
        '...o22223HO.....',
        '....o223hO......',
        '.....ooHO.......',
        '.....OhO........',
        '....OHO.........',
        '...OhO..........',
        '..OHO...........',
        '.OhO............',
        'OHO.............',
        'hO..............',
      ],
    },

    shovel: {
      rows: [
        '.........oooooo.',
        '........o111112o',
        '........o122222o',
        '.......o1222223o',
        '.......o122222o.',
        '.......o122223o.',
        '.......o2223oo..',
        '.......Ohooo....',
        '......OHO.......',
        '.....OhO........',
        '....OHO.........',
        '...OhO..........',
        '..OHO...........',
        '.OhO............',
        'OHO.............',
        'hO..............',
      ],
    },

    hoe: {
      rows: [
        '................',
        '.....ooooooo....',
        '....o1111112o...',
        '...o12222223o...',
        '...o13oooooHO...',
        '...o3o...OhO....',
        '....o...OHO.....',
        '.......OhO......',
        '......OHO.......',
        '.....OhO........',
        '....OHO.........',
        '...OhO..........',
        '..OHO...........',
        '.OhO............',
        'OHO.............',
        'hO..............',
      ],
    },

    bow: {
      rows: [
        '..OOOOOOO.......',
        '.OhHhHhHhOO.....',
        '.OhHOOOOOHhOO...',
        '..OOs....OOHhO..',
        '.....s.....OhO..',
        '......s.....OHO.',
        '.......s....OHO.',
        '........s...OHhO',
        '.........s...OhO',
        '..........s..OhO',
        '...........s.OhO',
        '............sHhO',
        '...........OOHO.',
        '..........OHhO..',
        '...........OO...',
        '................',
      ],
    },

    arrow: {
      rows: [
        '.............o12',
        '............o123',
        '...........o123o',
        '...........o23o.',
        '..........OHoo..',
        '.........OhO....',
        '........OHO.....',
        '.......OhO......',
        '......OHO.......',
        '....uuhO........',
        '...uaAu.........',
        '..uuhqu.........',
        '.uaAuu..........',
        'uaAqu...........',
        'aAqu............',
        'uqu.............',
      ],
    },

    fishing_rod: {
      rows: [
        '................',
        '.............O..',
        '............OHs.',
        '...........OhOs.',
        '..........OHO.s.',
        '.........OhO..s.',
        '........OHO...s.',
        '.......OhO....s.',
        '......OHO.....s.',
        '.....OhO......s.',
        '....OHO.......s.',
        '...OhO........s.',
        '..OHO.......oo1o',
        '.OhO.......o2o3o',
        'OHO.........o2o.',
        'hO...........o..',
      ],
    },

    shield: {
      rows: [
        '..oooooooooooo..',
        '..o1111111112o..',
        '..o1hHhxxhHh2o..',
        '..o1hHhuuhHh2o..',
        '..o1hHuaAuHh2o..',
        '..o1huaaAquh2o..',
        '..o1huaAAquh2o..',
        '..o1hHuAquHh2o..',
        '..o1hHhuuhHh2o..',
        '..o1hHhxxhHh2o..',
        '...o1HhxxhH2o...',
        '....o1hxxh2o....',
        '.....o1xx2o.....',
        '......o12o......',
        '.......oo.......',
        '................',
      ],
    },

    torch: {
      rows: [
        '................',
        '.......gG.......',
        '......gffG......',
        '......gffG......',
        '.......gG.......',
        '.......Hx.......',
        '.......hH.......',
        '.......hH.......',
        '.......hH.......',
        '.......HH.......',
        '.......hH.......',
        '.......hH.......',
        '.......hH.......',
        '.......hH.......',
        '.......xx.......',
        '................',
      ],
    },
  };

  /* ============================================================
     VALIDATION — every sprite must be exactly 16x16
     ============================================================ */
  Object.keys(SPRITES).forEach((name) => {
    const sp = SPRITES[name];
    if (sp.rows.length !== SIZE) {
      throw new Error('[mc-items] Sprite "' + name + '" must have ' + SIZE + ' rows, got ' + sp.rows.length);
    }
    sp.rows.forEach((row, i) => {
      if (row.length !== SIZE) {
        throw new Error('[mc-items] Sprite "' + name + '" row ' + i + ' must be ' + SIZE + ' chars, got ' + row.length);
      }
    });
  });

  /* ============================================================
     RENDERING
     ============================================================ */
  function render(sprite, palette) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(SIZE, SIZE);
    const d = img.data;
    const rows = sprite.rows;
    const outlines = deriveOutline(palette);

    for (let y = 0; y < SIZE; y++) {
      const row = rows[y];
      for (let x = 0; x < SIZE; x++) {
        const ch = row[x];
        if (ch === '.' || ch === undefined) continue;
        const resolver = CHAR_MAP[ch];
        if (!resolver) continue;
        const c = resolver(palette, outlines);
        const i = (y * SIZE + x) * 4;
        d[i]     = c[0];
        d[i + 1] = c[1];
        d[i + 2] = c[2];
        d[i + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  /* ============================================================
     PALETTE RESOLUTION
     Accepts either:
       - a material name string ('iron', 'gold', ...)
       - a custom palette object  { head:[rgb,rgb,rgb], handle, accent, outline? }
       - null/undefined  -> defaults to 'iron' head + 'wood' handle
     ============================================================ */
  function resolvePalette(mat) {
    if (mat == null) return MATERIALS.iron;
    if (typeof mat === 'string') return MATERIALS[mat] || MATERIALS.iron;
    if (typeof mat === 'object') {
      return {
        head:    mat.head    || MATERIALS.iron.head,
        handle:  mat.handle  || MATERIALS.wood.handle,
        accent:  mat.accent  || MATERIALS.iron.accent,
        outline: mat.outline || null,
      };
    }
    return MATERIALS.iron;
  }

  function getSprite(name) {
    return SPRITES[name] || SPRITES.sword;
  }

  /* ============================================================
     CACHE
     Only cached for string materials (or default). Custom palettes
     are re-rendered every time so the caller can mutate freely.
     ============================================================ */
  const cache = new Map();

  function get(name, mat) {
    const isCustom = mat != null && typeof mat !== 'string';
    const matKey = isCustom ? null : (mat == null ? 'iron' : mat);
    const key = name + ':' + matKey;

    if (!isCustom && cache.has(key)) return cache.get(key);

    const canvas = render(getSprite(name), resolvePalette(mat));
    if (!isCustom) cache.set(key, canvas);
    return canvas;
  }

  function getAll(mat) {
    const out = {};
    Object.keys(SPRITES).forEach((name) => { out[name] = get(name, mat); });
    return out;
  }

  /* ============================================================
     PNG EXPORT
     ============================================================ */
  function toPNG(name, mat) {
    return get(name, mat).toDataURL('image/png');
  }

  function toPNGBlob(name, mat, cb) {
    const canvas = get(name, mat);
    if (canvas.toBlob) {
      canvas.toBlob((blob) => cb(blob, name), 'image/png');
    } else {
      const data = canvas.toDataURL('image/png');
      const bin = atob(data.split(',')[1]);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      cb(new Blob([arr], { type: 'image/png' }), name);
    }
  }

  /* ============================================================
     CUSTOM MATERIAL REGISTRATION
     ============================================================ */
  function registerMaterial(name, palette) {
    if (!name || typeof name !== 'string') {
      throw new Error('[mc-items] registerMaterial requires a name string');
    }
    MATERIALS[name] = {
      head:    (palette && palette.head)    || MATERIALS.iron.head,
      handle:  (palette && palette.handle)  || MATERIALS.wood.handle,
      accent:  (palette && palette.accent)  || MATERIALS.iron.accent,
      outline: (palette && palette.outline) || null,
    };
    // invalidate cache for this material
    for (const k of Array.from(cache.keys())) {
      if (k.endsWith(':' + name)) cache.delete(k);
    }
  }

  /* ============================================================
     THREE.js helpers (optional — only used if THREE is passed in)
     ============================================================ */
  const textureCache = new Map();

  function threeTexture(name, mat, THREE) {
    const matKey = (typeof mat === 'string') ? mat : (mat == null ? 'iron' : 'custom');
    const key = name + ':' + matKey + (matKey === 'custom' ? ':' + Math.random() : '');
    if (textureCache.has(key)) return textureCache.get(key);

    const canvas = get(name, mat);
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;

    if (matKey !== 'custom') textureCache.set(key, tex);
    return tex;
  }

  function threeSpriteMaterial(name, mat, THREE) {
    return new THREE.SpriteMaterial({
      map: threeTexture(name, mat, THREE),
      transparent: true,
      depthWrite: false,
      alphaTest: 0.5,
    });
  }

  function threePlaneMaterial(name, mat, THREE) {
    return new THREE.MeshBasicMaterial({
      map: threeTexture(name, mat, THREE),
      transparent: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
  }

  /* ============================================================
     PUBLIC API
     ============================================================ */
  global.MCItems = {
    SIZE,

    /* ---- introspection ---- */
    list: () => Object.keys(SPRITES),
    materials: () => Object.keys(MATERIALS),
    MATERIALS,

    /* ---- main getters ---- */
    get,
    getAll,

    /* ---- fresh generation (no caching, no randomness) ---- */
    generate: function (name, opts) {
      opts = opts || {};
      const mat = opts.palette || opts.material;
      return render(getSprite(name), resolvePalette(mat));
    },

    /* ---- PNG export ---- */
    toPNG,
    toPNGBlob,

    /* ---- custom materials ---- */
    registerMaterial,

    /* ---- THREE.js helpers ---- */
    THREE: {
      texture: threeTexture,
      spriteMaterial: threeSpriteMaterial,
      planeMaterial: threePlaneMaterial,
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
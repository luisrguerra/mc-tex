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
         opts = { palette: { head:[rgb,rgb,rgb], handle:[...], accent:[...] } }
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

   NOTE: This library does NOT support random generation.
   Every item/material produces a deterministic sprite.
   ============================================================ */
(function (global) {
  'use strict';

  const SIZE = 16;

  const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const pal = (...hs) => hs.map(hex);

  /* ============================================================
     MATERIALS
     Each material provides three 3-shade ramps:
       head   — the blade/tool-head part      (light, mid, dark)
       handle — the wooden/leather grip       (light, mid, dark)
       accent — decorative details / guard    (light, mid, dark)
     ============================================================ */
  const MATERIALS = {
    wood: {
      head:   pal(0xa07a44, 0x7c5a2e, 0x503818),
      handle: pal(0xa07a44, 0x7c5a2e, 0x503818),
      accent: pal(0xb8905a, 0x8c6a3c, 0x5e4420),
    },
    stone: {
      head:   pal(0xb0b0b0, 0x848484, 0x585858),
      handle: pal(0x9c7c4c, 0x74562e, 0x4c3818),
      accent: pal(0x9c9c9c, 0x707070, 0x484848),
    },
    iron: {
      head:   pal(0xf0f0f0, 0xb8b8b8, 0x787878),
      handle: pal(0x9c7c4c, 0x74562e, 0x4c3818),
      accent: pal(0xd8d8d8, 0xa0a0a0, 0x686868),
    },
    gold: {
      head:   pal(0xfff090, 0xe8b830, 0xa87818),
      handle: pal(0x9c7c4c, 0x74562e, 0x4c3818),
      accent: pal(0xffd850, 0xd8a020, 0x907010),
    },
    diamond: {
      head:   pal(0xa8f4ec, 0x50c8c0, 0x249088),
      handle: pal(0x9c7c4c, 0x74562e, 0x4c3818),
      accent: pal(0x80e8e0, 0x40b0a8, 0x1c8078),
    },
    netherite: {
      head:   pal(0x746a6a, 0x4c4242, 0x2a2222),
      handle: pal(0x4a3a2c, 0x342818, 0x1e160c),
      accent: pal(0x5c5050, 0x3c3232, 0x221a1a),
    },
  };

  /* Fixed fire palette for torches (never material-dependent) */
  const FIRE = pal(0xffe87a, 0xffa030, 0xbe3810);

  /* ============================================================
     CHARACTER -> COLOR RESOLVER
     Sprite rows use characters that map to shades of the palette.
       '1','2','3' — head   light / mid / dark
       'h','H','x' — handle light / mid / dark
       'a','A','q' — accent light / mid / dark
       'f','g','G' — fire   light / mid / dark  (fixed colors)
       '.'         — transparent
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
    'f': ()  => FIRE[0],
    'g': ()  => FIRE[1],
    'G': ()  => FIRE[2],
  };

  /* ============================================================
     SPRITE DEFINITIONS
     Each sprite is 16 rows × 16 chars. See CHAR_MAP above.
     ============================================================ */
  const SPRITES = {

    /* -------- Sword -------- */
    sword: {
      rows: [
        '..............1.',
        '.............12.',
        '............12..',
        '...........12...',
        '..........12....',
        '.........12.....',
        '........12......',
        '.......12.......',
        '......12........',
        '.....12.........',
        '..aaa12.........',
        '..hhaA..........',
        '..hh............',
        '.hh.............',
        'hh..............',
        '................',
      ],
    },

    /* -------- Pickaxe -------- */
    pickaxe: {
      rows: [
        '................',
        '....11111111....',
        '...1222222221...',
        '..12...hh...21..',
        '..1....hh....1..',
        '.1.....hh.....1.',
        '.1.....hh.....1.',
        '......hh........',
        '......hh........',
        '.....hh.........',
        '.....hh.........',
        '....hh..........',
        '...hh...........',
        '..hh............',
        '.hh.............',
        '................',
      ],
    },

    /* -------- Axe -------- */
    axe: {
      rows: [
        '................',
        '...11111........',
        '..1222221.......',
        '..122222h.......',
        '..1222.hh.......',
        '..122.hh........',
        '..122.hh........',
        '..122.hh........',
        '..122.hh........',
        '...12hh.........',
        '....1hh.........',
        '.....hh.........',
        '.....hh.........',
        '....hh..........',
        '...hh...........',
        '................',
      ],
    },

    /* -------- Shovel -------- */
    shovel: {
      rows: [
        '................',
        '...11111111.....',
        '..1222222221....',
        '..1222222221....',
        '..1222222221....',
        '..1222222221....',
        '..1222222221....',
        '...12222221.....',
        '.....hhhh.......',
        '.....hh.........',
        '.....hh.........',
        '....hh..........',
        '....hh..........',
        '...hh...........',
        '..hh............',
        '................',
      ],
    },

    /* -------- Hoe -------- */
    hoe: {
      rows: [
        '................',
        '..111111111.....',
        '.12222222221....',
        '.1222.....hh....',
        '..1......hh.....',
        '.........hh.....',
        '........hh......',
        '........hh......',
        '.......hh.......',
        '.......hh.......',
        '......hh........',
        '......hh........',
        '.....hh.........',
        '....hh..........',
        '...hh...........',
        '................',
      ],
    },

    /* -------- Bow -------- */
    bow: {
      rows: [
        '..........hh....',
        '.........hh.a...',
        '........hh..a...',
        '.......hh...a...',
        '.......hh...a...',
        '......hh....a...',
        '......hh....a...',
        '......hh....a...',
        '......hh....a...',
        '......hh....a...',
        '......hh....a...',
        '.......hh...a...',
        '.......hh...a...',
        '........hh..a...',
        '.........hh.a...',
        '..........hh....',
      ],
    },

    /* -------- Arrow -------- */
    arrow: {
      rows: [
        '..............1.',
        '.............11.',
        '............11..',
        '...........1h...',
        '..........hh....',
        '.........hh.....',
        '........hh......',
        '.......hh.......',
        '......hh........',
        '.....hh.........',
        '...ahh..........',
        '..aah...........',
        '.aa.............',
        'a...............',
        '................',
        '................',
      ],
    },

    /* -------- Fishing Rod -------- */
    fishing_rod: {
      rows: [
        '..hh............',
        '...hh...........',
        '....hh..........',
        '.....hh.........',
        '......hh........',
        '.......h........',
        '................',
        '...........a....',
        '...........a....',
        '...........a....',
        '...........a....',
        '...........a....',
        '...........a....',
        '...........aa...',
        '...........a.a..',
        '...........aa...',
      ],
    },

    /* -------- Shield -------- */
    shield: {
      rows: [
        '..111111111111..',
        '..122222222221..',
        '..122222222221..',
        '..1222aaa22221..',
        '..122aaaaa2221..',
        '..12aaaaaaa221..',
        '..122aaaaa2221..',
        '..1222aaa22221..',
        '..122222222221..',
        '..122222222221..',
        '..122222222221..',
        '...1222222221...',
        '....12222221....',
        '.....122221.....',
        '......1221......',
        '.......11.......',
      ],
    },

    /* -------- Torch -------- */
    torch: {
      rows: [
        '.......ff.......',
        '......fggf......',
        '.....fggggf.....',
        '.....fggggf.....',
        '......fggf......',
        '.......hh.......',
        '.......hh.......',
        '.......hh.......',
        '.......hh.......',
        '.......hh.......',
        '.......hh.......',
        '.......hh.......',
        '.......hh.......',
        '.......hh.......',
        '.......hh.......',
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

    for (let y = 0; y < SIZE; y++) {
      const row = rows[y];
      for (let x = 0; x < SIZE; x++) {
        const ch = row[x];
        if (ch === '.' || ch === undefined) continue;
        const resolver = CHAR_MAP[ch];
        if (!resolver) continue;
        const c = resolver(palette);
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
       - a custom palette object  { head:[rgb,rgb,rgb], handle, accent }
       - null/undefined  -> defaults to 'iron' head + 'wood' handle
     ============================================================ */
  function resolvePalette(mat) {
    if (mat == null) return MATERIALS.iron;
    if (typeof mat === 'string') return MATERIALS[mat] || MATERIALS.iron;
    if (typeof mat === 'object') {
      return {
        head:   mat.head   || MATERIALS.iron.head,
        handle: mat.handle || MATERIALS.wood.handle,
        accent: mat.accent || MATERIALS.iron.accent,
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
      head:   (palette && palette.head)   || MATERIALS.iron.head,
      handle: (palette && palette.handle) || MATERIALS.wood.handle,
      accent: (palette && palette.accent) || MATERIALS.iron.accent,
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
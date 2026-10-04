/* ============================================================
   mc-tex.js — Procedural Minecraft-style 16x16 textures (v3)
   Public API:
     MCTex.get(name)                        -> HTMLCanvasElement
     MCTex.getAll()                         -> { name: canvas }
     MCTex.list()                           -> [name, ...]
     MCTex.toPNG(name)                      -> data URL
     MCTex.toPNGBlob(name, cb)              -> Blob via callback
     MCTex.blockMaterials(name, THREE)      -> 6 materials
     MCTex.blockMaterials(name, THREE, { faceShade: true })
     MCTex.generate(generator, seedString)  -> fresh canvas
   ============================================================ */
(function (global) {
  'use strict';

  const SIZE = 16;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function createImage(size) {
    size = size || SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const d = img.data;
    const set = (x, y, r, g, b, a) => {
      x = x | 0; y = y | 0;
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      const i = (y * size + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a === undefined ? 255 : a;
    };
    const bump = (x, y, amt) => {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      const i = (y * size + x) * 4;
      d[i] += amt; d[i + 1] += amt; d[i + 2] += amt;
    };
    const finish = () => { ctx.putImageData(img, 0, 0); return canvas; };
    return { canvas, ctx, set, bump, finish, size };
  }

  const shade = (c, amt) => [c[0] + amt, c[1] + amt, c[2] + amt];
  const hex   = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  const pal   = (...hs) => hs.map(hex);
  const putc  = (t, x, y, c, a) => t.set(x, y, c[0], c[1], c[2], a);
  const rint  = (r, n) => Math.floor(r() * n);
  const pick  = (r, arr) => arr[Math.floor(r() * arr.length)];
  const ramp  = (p, v) => p[Math.max(0, Math.min(p.length - 1, Math.floor(v * p.length)))];
  const grey  = (g) => [g, g, g];
  const wrap  = (v) => ((v % SIZE) + SIZE) % SIZE;

  function tileNoise(r, cells) {
    const g = [];
    for (let i = 0; i < cells * cells; i++) g.push(r());
    const sm = (t) => t * t * (3 - 2 * t);
    return (x, y) => {
      const fx = (x + 0.5) / SIZE * cells, fy = (y + 0.5) / SIZE * cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = sm(fx - x0), ty = sm(fy - y0);
      const X0 = x0 % cells, Y0 = y0 % cells;
      const X1 = (x0 + 1) % cells, Y1 = (y0 + 1) % cells;
      const a = g[Y0 * cells + X0], b = g[Y0 * cells + X1];
      const c = g[Y1 * cells + X0], d = g[Y1 * cells + X1];
      const top = a + (b - a) * tx, bot = c + (d - c) * tx;
      return top + (bot - top) * ty;
    };
  }

  function fillNoise(t, r, p, o) {
    o = o || {};
    const nf = tileNoise(r, o.cells || 4);
    const cw = o.clump === undefined ? 0.55 : o.clump;
    const st = o.stretch || 1.4;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let v = nf(x, y) * cw + r() * (1 - cw);
      v = (v - 0.5) * st + 0.5;
      putc(t, x, y, ramp(p, v), o.alpha);
    }
  }

  function scatter(t, r, n, colorFn) {
    for (let i = 0; i < n; i++) putc(t, rint(r, 16), rint(r, 16), colorFn());
  }

  function voronoi(r, n) {
    const cs = SIZE / n, pts = [];
    for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) {
      pts.push([(gx + 0.2 + r() * 0.6) * cs, (gy + 0.2 + r() * 0.6) * cs]);
    }
    const ids = new Array(SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      let best = 1e9, bi = 0;
      for (let i = 0; i < pts.length; i++) {
        let dx = Math.abs(x + 0.5 - pts[i][0]); if (dx > SIZE / 2) dx = SIZE - dx;
        let dy = Math.abs(y + 0.5 - pts[i][1]); if (dy > SIZE / 2) dy = SIZE - dy;
        const d = dx * dx + dy * dy;
        if (d < best) { best = d; bi = i; }
      }
      ids[y * SIZE + x] = bi;
    }
    const cell = (x, y) => ids[wrap(y) * SIZE + wrap(x)];
    return { pts, cell };
  }

  const DIRT_PAL  = pal(0x6c4c33, 0x795639, 0x866043, 0x926b49, 0x9e7753);
  const GRASS_PAL = pal(0x4f8f30, 0x5e9f38, 0x6fb046, 0x80c155, 0x92d066);
  const STONE_PAL = pal(0x6b6b6b, 0x767676, 0x7f7f7f, 0x898989, 0x959595);
  const SAND_PAL  = pal(0xcdbf90, 0xd5c799, 0xdbcfa3, 0xe2d8ae, 0xe9e0b9);
  const WOOD_PAL  = pal(0x7f6339, 0x8e7144, 0x9c7f4e, 0xa98a56, 0xb8945f);

  function paintDirt(t, r) {
    fillNoise(t, r, DIRT_PAL, { cells: 4, clump: 0.5, stretch: 1.5 });
    scatter(t, r, 7, () => pick(r, pal(0x5b4a3c, 0x66554a, 0x594632)));
    scatter(t, r, 5, () => pick(r, pal(0xa98262, 0xb08a68)));
  }
  function paintStone(t, r) {
    fillNoise(t, r, STONE_PAL, { cells: 4, clump: 0.5, stretch: 1.5 });
    scatter(t, r, 6, () => grey(96 + rint(r, 10)));
  }
  function metalBlock(r, color) {
    const t = createImage();
    const P = [shade(color, -22), shade(color, -10), color, shade(color, 12), shade(color, 24)];
    fillNoise(t, r, P, { cells: 3, clump: 0.5, stretch: 1.3 });
    for (let i = 0; i < 16; i++) {
      t.bump(i, 0, 14); t.bump(0, i, 9);
      t.bump(i, 15, -14); t.bump(15, i, -9);
    }
    return t.finish();
  }
  function woodTexture(r, P) {
    const t = createImage();
    fillNoise(t, r, P, { cells: 4, clump: 0.4, stretch: 1.3 });
    return t;
  }

  const T = {};

  /* ---------- BASIC BLOCKS ---------- */
  T.dirt = function (r) { const t = createImage(); paintDirt(t, r); return t.finish(); };

  T.grass_top = function (r) {
    const t = createImage();
    fillNoise(t, r, GRASS_PAL, { cells: 4, clump: 0.45, stretch: 1.5 });
    scatter(t, r, 8, () => pick(r, pal(0x4a8a2c, 0x56982f)));
    scatter(t, r, 6, () => pick(r, pal(0x9ad86e, 0x8fcc62)));
    return t.finish();
  };

  T.grass_side = function (r) {
    const t = createImage();
    paintDirt(t, r);
    const nf = tileNoise(r, 4);
    for (let x = 0; x < 16; x++) {
      const hang = [0, 0, 1, 1, 2, 2, 3][rint(r, 7)];
      const h = 3 + hang;
      for (let y = 0; y < h; y++) {
        const last = (y === h - 1) && hang > 0;
        let v = nf(x, y) * 0.5 + r() * 0.5;
        if (last) v *= 0.45;
        if (last && r() < 0.18) continue;
        putc(t, x, y, ramp(GRASS_PAL, (v - 0.5) * 1.4 + 0.5));
      }
    }
    return t.finish();
  };

  T.stone = function (r) { const t = createImage(); paintStone(t, r); return t.finish(); };

  T.cobblestone = function (r) {
    const t = createImage();
    const v = voronoi(r, 3);
    const tone = v.pts.map(() => 112 + r() * 36);
    const mortar = pal(0x2e2e2e, 0x3a3a3a, 0x484848);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const c = v.cell(x, y);
      if (v.cell(x + 1, y) !== c || v.cell(x, y + 1) !== c) {
        putc(t, x, y, pick(r, mortar));
      } else {
        let g = tone[c] + (r() * 2 - 1) * 9;
        if (v.cell(x - 1, y) !== c || v.cell(x, y - 1) !== c) g += 20;
        g = Math.round(g / 7) * 7;
        putc(t, x, y, grey(g));
      }
    }
    return t.finish();
  };

  T.mossy_cobblestone = function (r) {
    const t = createImage();
    const v = voronoi(r, 3);
    const tone = v.pts.map(() => 100 + r() * 30);
    const moss = pal(0x3f5a2a, 0x4a6b30, 0x557a38, 0x355020);
    const mortar = pal(0x2e2e2e, 0x3a3a3a, 0x484848);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const c = v.cell(x, y);
      if (v.cell(x + 1, y) !== c || v.cell(x, y + 1) !== c) {
        putc(t, x, y, pick(r, mortar));
      } else if (r() < 0.35) {
        putc(t, x, y, pick(r, moss));
      } else {
        let g = tone[c] + (r() * 2 - 1) * 9;
        if (v.cell(x - 1, y) !== c || v.cell(x, y - 1) !== c) g += 18;
        g = Math.round(g / 7) * 7;
        putc(t, x, y, grey(g));
      }
    }
    return t.finish();
  };

  T.stone_bricks = function (r) {
    const t = createImage();
    const mortar = pal(0x4a4a4a, 0x555555, 0x606060);
    const brick = pal(0x767676, 0x808080, 0x8a8a8a, 0x939393, 0x9e9e9e);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) putc(t, x, y, pick(r, mortar));
    for (let row = 0; row < 4; row++) {
      const y0 = row * 4, off = (row % 2) * 4;
      for (let bx = -8; bx < 24; bx += 8) {
        const x0 = bx + off;
        const tone = r();
        for (let y = y0; y < y0 + 3; y++) for (let x = x0; x < x0 + 7; x++) {
          let c = ramp(brick, (tone * 0.55 + r() * 0.45 - 0.5) * 1.4 + 0.5);
          if (y === y0) c = shade(c, 8);
          if (y === y0 + 2) c = shade(c, -8);
          putc(t, x, y, c);
        }
      }
    }
    return t.finish();
  };

  T.cracked_stone_bricks = function (r) {
    const canvas = T.stone_bricks(r);
    const ctx = canvas.getContext('2d');
    const img = ctx.getImageData(0, 0, 16, 16);
    const d = img.data;
    for (let i = 0; i < 22; i++) {
      const x = rint(r, 16), y = rint(r, 16);
      const i2 = (y * 16 + x) * 4;
      d[i2] -= 40; d[i2 + 1] -= 40; d[i2 + 2] -= 40;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  };

  /* ---------- STONE VARIANTS ---------- */
  T.andesite = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0x7a7d7a, 0x848784, 0x8e918e, 0x989b98, 0xa2a5a2),
      { cells: 4, clump: 0.5, stretch: 1.5 });
    scatter(t, r, 8, () => pick(r, pal(0x6a6d6a, 0x626562)));
    scatter(t, r, 6, () => pick(r, pal(0xacafac, 0xb4b7b4)));
    return t.finish();
  };

  T.diorite = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0xb8b8bc, 0xc2c2c6, 0xccccd0, 0xd6d6da, 0xe0e0e4),
      { cells: 4, clump: 0.5, stretch: 1.5 });
    scatter(t, r, 10, () => pick(r, pal(0x8a8a90, 0x7e7e84)));
    scatter(t, r, 8,  () => pick(r, pal(0xeaeaee, 0xf2f2f6)));
    return t.finish();
  };

  T.granite = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0x8a5a4a, 0x966454, 0xa26e5e, 0xae7868, 0xba8272),
      { cells: 4, clump: 0.5, stretch: 1.5 });
    scatter(t, r, 9, () => pick(r, pal(0x7a4c3e, 0x6e4438)));
    scatter(t, r, 7, () => pick(r, pal(0xc08a78, 0xca9482)));
    return t.finish();
  };

  T.deepslate = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0x3a3a3e, 0x424246, 0x4a4a4e, 0x525256, 0x5a5a5e),
      { cells: 4, clump: 0.5, stretch: 1.5 });
    scatter(t, r, 7, () => pick(r, pal(0x2e2e32, 0x28282c)));
    scatter(t, r, 5, () => pick(r, pal(0x646468, 0x6e6e72)));
    return t.finish();
  };

  T.cobbled_deepslate = function (r) {
    const t = createImage();
    const v = voronoi(r, 3);
    const tone = v.pts.map(() => 58 + r() * 26);
    const mortar = pal(0x1e1e22, 0x26262a, 0x2e2e32);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const c = v.cell(x, y);
      if (v.cell(x + 1, y) !== c || v.cell(x, y + 1) !== c) {
        putc(t, x, y, pick(r, mortar));
      } else {
        let g = tone[c] + (r() * 2 - 1) * 8;
        if (v.cell(x - 1, y) !== c || v.cell(x, y - 1) !== c) g += 16;
        g = Math.round(g / 6) * 6;
        putc(t, x, y, grey(g));
      }
    }
    return t.finish();
  };

  T.blackstone = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0x1e1a20, 0x26222a, 0x2e2a34, 0x36323e, 0x3e3a48),
      { cells: 4, clump: 0.5, stretch: 1.6 });
    scatter(t, r, 8, () => pick(r, pal(0x141018, 0x100c14)));
    scatter(t, r, 5, () => pick(r, pal(0x4a4654, 0x565262)));
    return t.finish();
  };

  /* ---------- SAND / SANDSTONE ---------- */
  T.sand = function (r) {
    const t = createImage();
    fillNoise(t, r, SAND_PAL, { cells: 4, clump: 0.4, stretch: 1.5 });
    scatter(t, r, 6, () => pick(r, pal(0xc2b383, 0xbdae7e)));
    return t.finish();
  };

  T.sandstone_side = function (r) {
    const t = createImage();
    fillNoise(t, r, SAND_PAL, { cells: 3, clump: 0.35, stretch: 1.1 });
    for (let x = 0; x < 16; x++) {
      t.bump(x, 0, 14);
      if (r() > 0.2) t.bump(x, 4, -24);
      if (r() > 0.2) t.bump(x, 11, -24);
      t.bump(x, 14, -12);
      t.bump(x, 15, -30);
    }
    return t.finish();
  };

  T.sandstone_top = function (r) {
    const t = createImage();
    fillNoise(t, r, SAND_PAL, { cells: 3, clump: 0.4, stretch: 1.1 });
    for (let i = 0; i < 16; i++) {
      t.bump(i, 0, 9);  t.bump(0, i, 7);
      t.bump(i, 15, -11); t.bump(15, i, -9);
    }
    return t.finish();
  };

  T.red_sand = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0xb05424, 0xba5e2c, 0xc46a36, 0xce7640, 0xd8824c),
      { cells: 4, clump: 0.4, stretch: 1.5 });
    scatter(t, r, 6, () => pick(r, pal(0xa04c1e, 0xa84818)));
    return t.finish();
  };

  T.red_sandstone_side = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0xb05424, 0xba5e2c, 0xc46a36, 0xce7640, 0xd8824c),
      { cells: 3, clump: 0.35, stretch: 1.1 });
    for (let x = 0; x < 16; x++) {
      t.bump(x, 0, 14);
      if (r() > 0.2) t.bump(x, 4, -24);
      if (r() > 0.2) t.bump(x, 11, -24);
      t.bump(x, 14, -12);
      t.bump(x, 15, -30);
    }
    return t.finish();
  };

  T.red_sandstone_top = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0xb05424, 0xba5e2c, 0xc46a36, 0xce7640, 0xd8824c),
      { cells: 3, clump: 0.4, stretch: 1.1 });
    for (let i = 0; i < 16; i++) {
      t.bump(i, 0, 9);  t.bump(0, i, 7);
      t.bump(i, 15, -11); t.bump(15, i, -9);
    }
    return t.finish();
  };

  /* ---------- GRAVEL / BEDROCK / CLAY ---------- */
  T.gravel = function (r) {
    const t = createImage();
    const v = voronoi(r, 5);
    const stones = pal(0x8a8582, 0x7a7673, 0x9a9590, 0x6a6663, 0x857f78, 0xa09a92, 0x8b7f70, 0x77706a);
    const col = v.pts.map(() => pick(r, stones));
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const c = v.cell(x, y);
      let a = (r() * 2 - 1) * 7;
      if (v.cell(x + 1, y) !== c || v.cell(x, y + 1) !== c) a -= 26;
      else if (v.cell(x - 1, y) !== c || v.cell(x, y - 1) !== c) a += 12;
      putc(t, x, y, shade(col[c], a));
    }
    return t.finish();
  };

  T.bedrock = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0x1a1a1a, 0x2a2a2a, 0x3b3b3b, 0x4f4f4f, 0x666666, 0x7c7c7c),
      { cells: 5, clump: 0.65, stretch: 2.0 });
    return t.finish();
  };

  T.clay = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0x8a92a6, 0x949cb0, 0x9ea6ba, 0xa8b0c4, 0xb2bace),
      { cells: 4, clump: 0.5, stretch: 1.3 });
    return t.finish();
  };

  /* ---------- WOODS ---------- */
  function logSide(r, P, dark) {
    const t = createImage();
    const tone = []; let xx = 0;
    while (xx < 16) {
      const w = 1 + rint(r, 3), v = r();
      for (let i = 0; i < w && xx < 16; i++) tone[xx++] = v;
    }
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const v = tone[x] * 0.7 + r() * 0.3;
      putc(t, x, y, ramp(P, (v - 0.5) * 1.5 + 0.5));
    }
    for (let i = 0; i < 6; i++) {
      const x = rint(r, 16), y0 = rint(r, 16), len = 2 + rint(r, 4);
      for (let k = 0; k < len; k++) putc(t, x, wrap(y0 + k), dark);
    }
    scatter(t, r, 8, () => P[4]);
    return t.finish();
  }
  function logTop(r, rings) {
    const t = createImage();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.floor(Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)));
      putc(t, x, y, shade(rings[Math.min(d, rings.length - 1)], (r() * 2 - 1) * 6));
    }
    return t.finish();
  }
  function planksTexture(r, P, seamCol) {
    const t = createImage();
    for (let row = 0; row < 4; row++) {
      const ry = row * 4;
      const seam = rint(r, 16);
      const rowTone = (r() - 0.5) * 0.2;
      const off = []; let xx = 0;
      while (xx < 16) {
        const w = 2 + rint(r, 5), o = (r() - 0.5) * 0.5;
        for (let i = 0; i < w && xx < 16; i++) off[xx++] = o;
      }
      for (let y = ry; y < ry + 4; y++) for (let x = 0; x < 16; x++) {
        let c;
        if (y === ry + 3) {
          c = shade(hex(seamCol), (r() * 2 - 1) * 5);
        } else {
          c = ramp(P, 0.5 + rowTone + off[x] + (r() - 0.5) * 0.22);
          if (y === ry) c = shade(c, 8);
          if (x === seam) c = shade(c, -24);
        }
        putc(t, x, y, c);
      }
    }
    return t.finish();
  }

  T.oak_log_side  = (r) => logSide(r, pal(0x3b2d19, 0x4e3d23, 0x624b2c, 0x765d36, 0x866c40), 0x3b2d19);
  T.oak_log_top   = (r) => logTop(r, pal(0x9a7b45, 0xb89a5e, 0xa0804a, 0xb5955a, 0x9a7b45, 0xb08f55, 0x6b5330, 0x594326));
  T.oak_planks    = (r) => planksTexture(r, WOOD_PAL, 0x6b5231);
  T.spruce_log_side = (r) => logSide(r, pal(0x2a1e12, 0x362718, 0x483420, 0x5a4228, 0x6a5030), 0x2a1e12);
  T.spruce_log_top  = (r) => logTop(r, pal(0x6a4e2e, 0x8a6a3e, 0x7a5a34, 0x8e6c40, 0x6a4e2e, 0x8a6838, 0x4a3520, 0x3a2818));
  T.spruce_planks   = (r) => planksTexture(r, pal(0x5a3e22, 0x6a4a28, 0x7a562e, 0x886236, 0x966e3e), 0x4a3018);
  T.birch_log_side  = (r) => logSide(r, pal(0xa09a80, 0xb8b298, 0xd0cab0, 0xe0dac0, 0xeee8cc), 0x4a4538);
  T.birch_log_top   = (r) => logTop(r, pal(0xc0a878, 0xd8c090, 0xccb488, 0xd8c090, 0xc0a878, 0xd0b888, 0x8a7048, 0x6a5538));
  T.birch_planks    = (r) => planksTexture(r, pal(0xc0a878, 0xd0b888, 0xdcc498, 0xe8d0a8, 0xf0dcb8), 0xa89060);

  T.jungle_log_side = (r) => logSide(r, pal(0x3a2a16, 0x4c3a1e, 0x5e4a28, 0x705a32, 0x826a3c), 0x3a2a16);
  T.jungle_log_top  = (r) => logTop(r, pal(0x9a7a48, 0xb09058, 0xa0804c, 0xb4945c, 0x9a7a48, 0xac8c54, 0x6a5230, 0x584424));
  T.jungle_planks   = (r) => planksTexture(r, pal(0x9a6a3a, 0xa87844, 0xb6864e, 0xc49458, 0xd2a264), 0x7a5028);

  T.acacia_log_side = (r) => logSide(r, pal(0x3a2c1c, 0x4a3824, 0x5c462c, 0x6e5636, 0x806640), 0x3a2c1c);
  T.acacia_log_top  = (r) => logTop(r, pal(0xa8542a, 0xc06a34, 0xb05e2e, 0xc46e38, 0xa8542a, 0xbc6632, 0x7a3c1e, 0x663018));
  T.acacia_planks   = (r) => planksTexture(r, pal(0xa85a2c, 0xb86834, 0xc6763c, 0xd48444, 0xe0924c), 0x884420);

  T.dark_oak_log_side = (r) => logSide(r, pal(0x241a0e, 0x302314, 0x3e2e1a, 0x4c3a22, 0x5a462a), 0x241a0e);
  T.dark_oak_log_top  = (r) => logTop(r, pal(0x6a4e2c, 0x7e5e36, 0x745430, 0x826238, 0x6a4e2c, 0x7a5a34, 0x4a3620, 0x3a2a18));
  T.dark_oak_planks   = (r) => planksTexture(r, pal(0x4a3218, 0x563c1e, 0x624624, 0x6e502a, 0x7a5a30), 0x3a2612);

  T.crimson_stem_side = (r) => logSide(r, pal(0x5a2438, 0x6e2c44, 0x823450, 0x963c5c, 0xaa4468), 0x4a1c2e);
  T.crimson_stem_top  = (r) => logTop(r, pal(0x8a3a54, 0xa04864, 0x94405c, 0xa84c68, 0x8a3a54, 0x9c4460, 0x6a2a40, 0x5a2234));
  T.crimson_planks    = (r) => planksTexture(r, pal(0x6a2c44, 0x7a3450, 0x8a3c5c, 0x9a4468, 0xaa4c74), 0x521e34);

  T.warped_stem_side = (r) => logSide(r, pal(0x1e4a4a, 0x265a5a, 0x2e6a6a, 0x367a7a, 0x3e8a8a), 0x183c3c);
  T.warped_stem_top  = (r) => logTop(r, pal(0x2e6a6a, 0x3a7e7e, 0x347474, 0x3e8282, 0x2e6a6a, 0x387878, 0x1e4a4a, 0x163a3a));
  T.warped_planks    = (r) => planksTexture(r, pal(0x2a5a5a, 0x326868, 0x3a7676, 0x428484, 0x4a9292), 0x1e4444);

  function leavesTexture(r, P, dark, light) {
    const t = createImage();
    fillNoise(t, r, P, { cells: 6, clump: 0.5, stretch: 1.6 });
    scatter(t, r, 14, () => pick(r, dark));
    scatter(t, r, 8,  () => pick(r, light));
    return t.finish();
  }

  T.oak_leaves = (r) => leavesTexture(r,
    pal(0x1e4d14, 0x2c6a1c, 0x3c8527, 0x4ea030, 0x62b83e),
    pal(0x153a0e, 0x1a4410), pal(0x7ccf4c, 0x70c244));
  T.jungle_leaves = (r) => leavesTexture(r,
    pal(0x1a4a10, 0x266018, 0x347a22, 0x44942c, 0x56ae38),
    pal(0x123a0a, 0x16420c), pal(0x6ec244, 0x62b43c));
  T.acacia_leaves = (r) => leavesTexture(r,
    pal(0x3a5a14, 0x4a6e1c, 0x5a8224, 0x6a962c, 0x7aaa34),
    pal(0x2c460e, 0x325010), pal(0x96c850, 0x8abc48));
  T.dark_oak_leaves = (r) => leavesTexture(r,
    pal(0x143a0e, 0x1e4c14, 0x285c1a, 0x326c20, 0x3c7c26),
    pal(0x0e2c08, 0x12340a), pal(0x54a838, 0x4a9c30));

  T.nether_wart_block = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0x6a0e14, 0x7a1418, 0x8a1a1e, 0x9a2024, 0xaa282c),
      { cells: 5, clump: 0.55, stretch: 1.5 });
    scatter(t, r, 10, () => pick(r, pal(0x5a0a10, 0x4e080c)));
    scatter(t, r, 6,  () => pick(r, pal(0xb83438, 0xc04044)));
    return t.finish();
  };

  T.warped_wart_block = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0x1a6a6a, 0x1e7a7a, 0x228a8a, 0x269a9a, 0x2aaaaa),
      { cells: 5, clump: 0.55, stretch: 1.5 });
    scatter(t, r, 10, () => pick(r, pal(0x145858, 0x104c4c)));
    scatter(t, r, 6,  () => pick(r, pal(0x3ac0c0, 0x46cccc)));
    return t.finish();
  };

  /* ---------- BRICKS / NETHER ---------- */
  T.bricks = function (r) {
    const t = createImage();
    const mortar = pal(0xaaa49a, 0xb8b2a8, 0xc4beb4);
    const brick  = pal(0x7e3a2c, 0x8f4535, 0x9b4c3a, 0xa8573f, 0xb5634a);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) putc(t, x, y, pick(r, mortar));
    const tones = {};
    for (let row = 0; row < 4; row++) {
      const y0 = row * 4, off = (row % 2) * 4;
      for (let bx = -8; bx < 24; bx += 8) {
        const x0 = bx + off;
        const key = row + ':' + wrap(x0);
        if (tones[key] === undefined) tones[key] = r();
        for (let y = y0; y < y0 + 3; y++) for (let x = x0; x < x0 + 7; x++) {
          let c = ramp(brick, (tones[key] * 0.55 + r() * 0.45 - 0.5) * 1.5 + 0.5);
          if (y === y0) c = shade(c, 10);
          putc(t, x, y, c);
        }
      }
    }
    return t.finish();
  };

  T.nether_bricks = function (r) {
    const t = createImage();
    const mortar = pal(0x1c0e14, 0x241420, 0x2c1a28);
    const brick  = pal(0x2e161c, 0x3a1c24, 0x46222c, 0x522a34, 0x5e343c);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) putc(t, x, y, pick(r, mortar));
    for (let row = 0; row < 4; row++) {
      const y0 = row * 4, off = (row % 2) * 4;
      for (let bx = -8; bx < 24; bx += 8) {
        const x0 = bx + off;
        const tone = r();
        for (let y = y0; y < y0 + 3; y++) for (let x = x0; x < x0 + 7; x++) {
          let c = ramp(brick, (tone * 0.55 + r() * 0.45 - 0.5) * 1.5 + 0.5);
          if (y === y0) c = shade(c, 10);
          putc(t, x, y, c);
        }
      }
    }
    return t.finish();
  };

  T.netherrack = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0x542426, 0x622e2e, 0x70363a, 0x7e3e3c, 0x8c4a46),
      { cells: 3, clump: 0.5, stretch: 1.6 });
    scatter(t, r, 8, () => pick(r, pal(0x4c1a1c, 0x431618)));
    scatter(t, r, 5, () => pick(r, pal(0x9a504c, 0xa05a54)));
    return t.finish();
  };

  T.soul_sand = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0x3a2820, 0x463226, 0x523c2c, 0x5e4632, 0x6a5038),
      { cells: 4, clump: 0.5, stretch: 1.4 });
    for (let i = 0; i < 6; i++) {
      const x = rint(r, 16), y = rint(r, 16);
      for (let k = 0; k < 3; k++) putc(t, x + k, y, [0x22, 0x18, 0x10]);
    }
    return t.finish();
  };

  T.glowstone = function (r) {
    const t = createImage();
    const P = pal(0x7e5c28, 0xa07834, 0xc49640, 0xe8b452, 0xffde80);
    const v = voronoi(r, 4);
    const tone = v.pts.map(() => rint(r, P.length));
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const c = v.cell(x, y);
      let i = tone[c];
      if (r() < 0.25) i += r() < 0.5 ? -1 : 1;
      if ((v.cell(x + 1, y) !== c || v.cell(x, y + 1) !== c) && r() < 0.8) i -= 1;
      else if ((v.cell(x - 1, y) !== c || v.cell(x, y - 1) !== c) && r() < 0.6) i += 1;
      putc(t, x, y, P[Math.max(0, Math.min(P.length - 1, i))]);
    }
    return t.finish();
  };

  /* ---------- ORES ---------- */
  function oreTexture(r, op, count) {
    const t = createImage();
    paintStone(t, r);
    const mask = new Set();
    for (let k = 0; k < count; k++) {
      const size = 4 + rint(r, 3);
      const cells = [[2 + rint(r, 12), 2 + rint(r, 12)]];
      let guard = 0;
      while (cells.length < size && guard++ < 40) {
        const [bx, by] = cells[rint(r, cells.length)];
        const dir = [[1, 0], [-1, 0], [0, 1], [0, -1]][rint(r, 4)];
        const nx = bx + dir[0], ny = by + dir[1];
        if (nx < 1 || ny < 1 || nx > 14 || ny > 14) continue;
        if (!cells.some((c) => c[0] === nx && c[1] === ny)) cells.push([nx, ny]);
      }
      cells.forEach(([x, y]) => mask.add(y * 16 + x));
    }
    const has = (x, y) => mask.has(y * 16 + x);
    mask.forEach((k) => {
      const x = k % 16, y = (k / 16) | 0;
      let i = 1;
      if ((!has(x, y - 1) || !has(x - 1, y)) && r() < 0.65) i = 2;
      if ((!has(x, y + 1) || !has(x + 1, y)) && r() < 0.65) i = 0;
      if (r() < 0.12) i = rint(r, 3);
      putc(t, x, y, op[i]);
    });
    return t.finish();
  }
  T.coal_ore     = (r) => oreTexture(r, pal(0x101010, 0x242424, 0x3d3d3d), 5);
  T.iron_ore     = (r) => oreTexture(r, pal(0xa27c5b, 0xd8af93, 0xefd3bd), 5);
  T.gold_ore     = (r) => oreTexture(r, pal(0xc9a21c, 0xfcee4b, 0xfff9a0), 5);
  T.diamond_ore  = (r) => oreTexture(r, pal(0x2fb3b8, 0x5decf5, 0xcffcff), 5);
  T.redstone_ore = (r) => oreTexture(r, pal(0x8a0000, 0xd10f0f, 0xff5a4a), 6);
  T.lapis_ore    = (r) => oreTexture(r, pal(0x1a3a8e, 0x2f55c8, 0x6f93f0), 5);
  T.emerald_ore  = (r) => oreTexture(r, pal(0x0f8c3c, 0x17dd62, 0x8bf5b0), 5);
  T.quartz_ore   = (r) => oreTexture(r, pal(0x9a8a78, 0xd0c0a8, 0xf0e4c8), 5);

  /* ---------- MINERAL BLOCKS ---------- */
  T.iron_block     = (r) => metalBlock(r, [220, 220, 220]);
  T.gold_block     = (r) => metalBlock(r, [245, 200, 45]);
  T.diamond_block  = (r) => metalBlock(r, [95, 235, 245]);
  T.emerald_block  = (r) => metalBlock(r, [40, 200, 100]);
  T.coal_block     = (r) => metalBlock(r, [24, 24, 24]);
  T.lapis_block    = (r) => metalBlock(r, [30, 60, 150]);
  T.redstone_block = (r) => metalBlock(r, [180, 24, 24]);
  T.quartz_block   = (r) => metalBlock(r, [235, 230, 220]);

  /* ---------- CONSTRUCTION ---------- */
  T.copper_block = function (r) {
    const t = createImage();
    const P = pal(0xb05a34, 0xc06a3c, 0xd07a44, 0xe08a4c, 0xf09a54);
    fillNoise(t, r, P, { cells: 3, clump: 0.5, stretch: 1.3 });
    for (let i = 0; i < 16; i++) {
      t.bump(i, 0, 14); t.bump(0, i, 9);
      t.bump(i, 15, -14); t.bump(15, i, -9);
    }
    scatter(t, r, 6, () => pick(r, pal(0x9a4a28, 0xa85230)));
    return t.finish();
  };

  T.oxidized_copper = function (r) {
    const t = createImage();
    const P = pal(0x3a8a72, 0x449a80, 0x4eaa8e, 0x58ba9c, 0x62caaa);
    fillNoise(t, r, P, { cells: 3, clump: 0.5, stretch: 1.3 });
    for (let i = 0; i < 16; i++) {
      t.bump(i, 0, 14); t.bump(0, i, 9);
      t.bump(i, 15, -14); t.bump(15, i, -9);
    }
    scatter(t, r, 8, () => pick(r, pal(0x2e7a64, 0x266a56)));
    scatter(t, r, 5, () => pick(r, pal(0x74d8b8, 0x80e0c0)));
    return t.finish();
  };

  T.mud = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0x3c3228, 0x443a2e, 0x4c4234, 0x544a3a, 0x5c5240),
      { cells: 4, clump: 0.55, stretch: 1.4 });
    scatter(t, r, 8, () => pick(r, pal(0x30281e, 0x2a2218)));
    scatter(t, r, 5, () => pick(r, pal(0x665c48, 0x706650)));
    return t.finish();
  };

  T.packed_mud = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0x8a6a4a, 0x967454, 0xa27e5e, 0xae8868, 0xba9272),
      { cells: 4, clump: 0.5, stretch: 1.4 });
    scatter(t, r, 7, () => pick(r, pal(0x7a5c3e, 0x6e5238)));
    scatter(t, r, 5, () => pick(r, pal(0xc49c7c, 0xcea686)));
    return t.finish();
  };

  T.sea_lantern = function (r) {
    const t = createImage();
    const P = pal(0x8ad8d0, 0x9ee4dc, 0xb2f0e8, 0xc6fcf4, 0xdafff8);
    const v = voronoi(r, 4);
    const tone = v.pts.map(() => rint(r, P.length));
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const c = v.cell(x, y);
      let i = tone[c];
      if (r() < 0.25) i += r() < 0.5 ? -1 : 1;
      if ((v.cell(x + 1, y) !== c || v.cell(x, y + 1) !== c) && r() < 0.8) i -= 1;
      else if ((v.cell(x - 1, y) !== c || v.cell(x, y - 1) !== c) && r() < 0.6) i += 1;
      putc(t, x, y, P[Math.max(0, Math.min(P.length - 1, i))]);
    }
    return t.finish();
  };

  /* ---------- OBSIDIAN / END ---------- */
  T.obsidian = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0x0c0a14, 0x120f1e, 0x1a1530, 0x251c46, 0x34265f),
      { cells: 4, clump: 0.5, stretch: 1.8 });
    scatter(t, r, 5, () => pick(r, pal(0x6a48a8, 0x553a8c)));
    return t.finish();
  };

  T.end_stone = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0xcfcca0, 0xdad7a8, 0xe4e0b0, 0xeeeaba, 0xf6f2c4),
      { cells: 4, clump: 0.5, stretch: 1.3 });
    scatter(t, r, 8, () => pick(r, pal(0xb8b490, 0xa8a480)));
    return t.finish();
  };

  T.purpur_block = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0x8a5c92, 0x9a6aa0, 0xa878ae, 0xb68abc, 0xc49aca),
      { cells: 4, clump: 0.5, stretch: 1.3 });
    scatter(t, r, 4, () => pick(r, pal(0xd0a8d6, 0xbe96c4)));
    return t.finish();
  };

  T.prismarine = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0x2e6a60, 0x387a6e, 0x428a7c, 0x4e9a8a, 0x5aaa98),
      { cells: 5, clump: 0.5, stretch: 1.4 });
    scatter(t, r, 6, () => pick(r, pal(0x6ab8a6, 0x7cc4b2)));
    return t.finish();
  };

  /* ---------- SNOW / ICE / WATER / GLASS ---------- */
  T.snow = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0xdde9ef, 0xe9f3f6, 0xf4fafb, 0xfdffff, 0xffffff),
      { cells: 4, clump: 0.3, stretch: 1.2 });
    return t.finish();
  };

  T.ice = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0x78a2ea, 0x86b0f2, 0x93bcf8, 0xa6caff, 0xbfdcff),
      { cells: 3, clump: 0.6, stretch: 1.4 });
    for (let i = 0; i < 4; i++) {
      let x = rint(r, 16), y = rint(r, 16);
      const len = 3 + rint(r, 3);
      for (let s = 0; s < len; s++) { putc(t, x, y, [214, 232, 255]); x++; y++; }
    }
    return t.finish();
  };

  T.water = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0x2c5fd0, 0x3568d8, 0x3f76e4, 0x4d85ee, 0x6096f2),
      { cells: 4, clump: 0.6, stretch: 1.5, alpha: 190 });
    return t.finish();
  };

  T.lava = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0x8a1e00, 0xc43400, 0xe85810, 0xff8a30, 0xffc060),
      { cells: 3, clump: 0.6, stretch: 1.8 });
    scatter(t, r, 6, () => pick(r, pal(0xffe090, 0xffd070)));
    return t.finish();
  };

  T.glass = function (r) {
    const t = createImage();
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) t.set(x, y, 0, 0, 0, 0);
    const frame = pal(0xd5e8ee, 0xc4dde6, 0xe4f1f5);
    for (let i = 0; i < 16; i++) {
      putc(t, i, 0,  pick(r, frame), 235);
      putc(t, i, 15, pick(r, frame), 235);
      putc(t, 0, i,  pick(r, frame), 235);
      putc(t, 15, i, pick(r, frame), 235);
    }
    [[2, 5], [3, 4], [4, 3], [5, 2]].forEach(([x, y]) => t.set(x, y, 255, 255, 255, 230));
    [[2, 8], [3, 7]].forEach(([x, y]) => t.set(x, y, 245, 250, 255, 205));
    [[12, 13], [13, 12]].forEach(([x, y]) => t.set(x, y, 215, 235, 250, 215));
    return t.finish();
  };

  /* ---------- PLANTS / CROPS ---------- */
  T.farmland = function (r) {
    const t = createImage();
    paintDirt(t, r);
    for (let x = 0; x < 16; x++) {
      t.bump(x, 3, -30);
      t.bump(x, 8, -30);
      t.bump(x, 13, -30);
    }
    return t.finish();
  };

  T.cactus_side = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0x0e4a1e, 0x155c28, 0x1c6e34, 0x248040, 0x2c924c),
      { cells: 3, clump: 0.5, stretch: 1.4 });
    for (let y = 0; y < 16; y++) {
      t.bump(0, y, -40); t.bump(1, y, -10);
      t.bump(15, y, -40); t.bump(14, y, -10);
    }
    for (let i = 0; i < 8; i++) {
      const y = rint(r, 16);
      putc(t, 4 + rint(r, 8), y, [230, 240, 190]);
    }
    return t.finish();
  };

  T.cactus_top = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0x1c6e34, 0x248040, 0x2c924c, 0x3aa258, 0x4ab264),
      { cells: 3, clump: 0.4, stretch: 1.3 });
    for (let i = 0; i < 16; i++) {
      t.bump(i, 0, -40); t.bump(i, 15, -40);
      t.bump(0, i, -40); t.bump(15, i, -40);
    }
    return t.finish();
  };

  T.hay_side = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0xb08820, 0xc89a28, 0xd8ac30, 0xe6bc3c, 0xf0cc48),
      { cells: 4, clump: 0.4, stretch: 1.3 });
    for (let x = 0; x < 16; x += 5) {
      for (let y = 0; y < 16; y++) t.bump(x, y, -35);
    }
    return t.finish();
  };

  T.hay_top = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0xa88020, 0xc09028, 0xd8a830, 0xe8b840, 0xf0c850),
      { cells: 3, clump: 0.4, stretch: 1.3 });
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if ((x + y) % 3 === 0) t.bump(x, y, -25);
    }
    return t.finish();
  };

  T.sponge = function (r) {
    const t = createImage();
    fillNoise(t, r, pal(0xb0a828, 0xbdb630, 0xc8c038, 0xd4cc40, 0xdfd748),
      { cells: 4, clump: 0.5, stretch: 1.4 });
    for (let i = 0; i < 30; i++) {
      const x = rint(r, 16), y = rint(r, 16);
      putc(t, x, y, [90, 80, 20]);
    }
    return t.finish();
  };

  function mushroomBlock(r, cap, spot) {
    const t = createImage();
    fillNoise(t, r, cap, { cells: 4, clump: 0.5, stretch: 1.4 });
    const n = 5 + rint(r, 3);
    for (let k = 0; k < n; k++) {
      const cx = 2 + rint(r, 12), cy = 2 + rint(r, 12);
      const rad = 1 + rint(r, 2);
      for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy <= rad * rad) putc(t, x, y, pick(r, spot));
      }
    }
    return t.finish();
  }

  T.brown_mushroom_block = (r) => mushroomBlock(r,
    pal(0x8a6a4a, 0x967454, 0xa27e5e, 0xae8868, 0xba9272),
    pal(0x6a4e34, 0x5e442c, 0x745638));
  T.red_mushroom_block = (r) => mushroomBlock(r,
    pal(0xa83028, 0xb83a30, 0xc84438, 0xd84e40, 0xe85848),
    pal(0xe8e0d0, 0xf0e8d8, 0xdcd4c4));

  /* ---------- FUNCTIONAL BLOCKS ---------- */
  const CRAFT_WOOD = pal(0x9a7038, 0xa87c42, 0xb6884c, 0xc49456, 0xd2a060);
  const CRAFT_SEAM = [70, 46, 20];
  const CRAFT_EDGE = [56, 36, 14];
  const GRID_CELL = pal(0xa85420, 0xb86028, 0xc66c30, 0xd47838, 0xe08440);
  const GRID_LINE = [64, 34, 14];
  const GRID_BORDER = pal(0xd8c090, 0xe2cc9c, 0xecd6a8);

  function craftWoodBase(t, r) {
    // base wood with vertical grain
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) putc(t, x, y, ramp(CRAFT_WOOD, r()));
    // horizontal grain streaks
    for (let y = 0; y < 16; y++) if (r() < 0.35) for (let x = 0; x < 16; x++) t.bump(x, y, -7);
    // vertical plank seams (4 planks)
    [0, 5, 10, 15].forEach((sx) => {
      for (let y = 0; y < 16; y++) { putc(t, sx, y, CRAFT_SEAM); if (sx + 1 < 16) t.bump(sx + 1, y, -16); }
    });
    // top highlight / bottom shadow
    for (let x = 0; x < 16; x++) { t.bump(x, 0, 16); t.bump(x, 15, -20); }
  }

  T.crafting_table_top = function (r) {
    const t = createImage();
    // cream border frame
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) putc(t, x, y, pick(r, GRID_BORDER));
    // 3x3 grid cells
    [1, 6, 11].forEach((sx) => [1, 6, 11].forEach((sy) => {
      const tone = r();
      for (let y = sy; y < sy + 4; y++) for (let x = sx; x < sx + 4; x++) {
        let c = ramp(GRID_CELL, (tone * 0.5 + r() * 0.5 - 0.5) * 1.3 + 0.5);
        if (y === sy) c = shade(c, 14);
        if (y === sy + 3) c = shade(c, -16);
        if (x === sx) c = shade(c, 10);
        if (x === sx + 3) c = shade(c, -12);
        putc(t, x, y, c);
      }
    }));
    // dark grid lines
    [5, 10].forEach((g) => { for (let i = 0; i < 16; i++) { putc(t, g, i, GRID_LINE); putc(t, i, g, GRID_LINE); } });
    // dark outline around border
    for (let i = 0; i < 16; i++) {
      putc(t, i, 0, CRAFT_EDGE); putc(t, i, 15, CRAFT_EDGE);
      putc(t, 0, i, CRAFT_EDGE); putc(t, 15, i, CRAFT_EDGE);
    }
    return t.finish();
  };

  T.crafting_table_side = function (r) {
    const t = createImage();
    craftWoodBase(t, r);
    const blade = [176, 176, 184], bladeHi = [222, 222, 228], bladeDk = [104, 104, 112];
    const handle = [104, 70, 34], handleDk = [72, 46, 20];
    // saw blade (diagonal, with teeth)
    for (let i = 0; i < 8; i++) {
      const x = 3 + i, y = 10 - i;
      putc(t, x, y, bladeHi);
      putc(t, x, y + 1, blade);
      if (i % 2 === 0) putc(t, x, y + 2, bladeDk);
    }
    // saw handle
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) putc(t, 2 + i, 12 + j, handle);
    putc(t, 2, 12, handleDk); putc(t, 4, 13, handleDk);
    return t.finish();
  };

  T.crafting_table_front = function (r) {
    const t = createImage();
    craftWoodBase(t, r);
    const dark = [40, 26, 12];
    const blade = [176, 176, 184], bladeHi = [222, 222, 228], bladeDk = [104, 104, 112];
    const handle = [104, 70, 34], handleDk = [72, 46, 20];
    // saw blade (diagonal, lower-left)
    for (let i = 0; i < 8; i++) {
      const x = 2 + i, y = 11 - i;
      putc(t, x, y, bladeHi);
      putc(t, x, y + 1, blade);
      if (i % 2 === 0) putc(t, x, y + 2, bladeDk);
    }
    // saw handle
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) putc(t, 1 + i, 12 + j, handle);
    putc(t, 1, 12, dark); putc(t, 3, 13, dark);
    // hammer head (upper-right)
    for (let x = 9; x < 13; x++) for (let y = 3; y < 6; y++) putc(t, x, y, blade);
    for (let x = 9; x < 13; x++) putc(t, x, 3, bladeHi);
    for (let x = 9; x < 13; x++) putc(t, x, 5, bladeDk);
    // hammer handle
    for (let y = 6; y < 13; y++) { putc(t, 10, y, handle); putc(t, 11, y, handleDk); }
    return t.finish();
  };

  T.furnace_side = function (r) {
    const t = createImage();
    paintStone(t, r);
    for (let i = 0; i < 16; i++) {
      t.bump(i, 0, 15);
      t.bump(i, 15, -15);
      t.bump(0, i, 10);
      t.bump(15, i, -10);
    }
    return t.finish();
  };

  T.furnace_top = function (r) {
    const t = createImage();
    paintStone(t, r);
    for (let i = 0; i < 16; i++) {
      t.bump(i, 0, 15);
      t.bump(0, i, 12);
      t.bump(i, 15, -12);
      t.bump(15, i, -8);
    }
    // dark circular opening in the center (like the reference)
    const dark = pal(0x141414, 0x1e1e1e, 0x282828, 0x323232);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 3.1) putc(t, x, y, pick(r, dark));
      else if (d < 4.1) t.bump(x, y, -20);
      else if (d < 4.9) t.bump(x, y, 10);
    }
    return t.finish();
  };

  T.furnace_front = function (r) {
    const t = createImage();
    paintStone(t, r);
    const dark  = pal(0x101010, 0x1a1a1a, 0x242424, 0x2e2e2e);
    const frame = pal(0x9a9a9a, 0xa6a6a6, 0xb2b2b2, 0xbebebe);
    // light gray frame around the mouth
    for (let y = 4; y < 13; y++) for (let x = 2; x < 14; x++) putc(t, x, y, pick(r, frame));
    // dark mouth interior
    for (let y = 5; y < 12; y++) for (let x = 3; x < 13; x++) putc(t, x, y, pick(r, dark));
    // lighter bottom lip band
    for (let x = 2; x < 14; x++) for (let y = 12; y < 14; y++) putc(t, x, y, shade(pick(r, frame), 18));
    // shading: top of frame darker, inner mouth highlights
    for (let x = 2; x < 14; x++) t.bump(x, 4, -26);
    for (let x = 2; x < 14; x++) t.bump(x, 13, -16);
    for (let x = 4; x < 12; x += 2) for (let y = 6; y < 11; y++) t.bump(x, y, 26);
    for (let i = 0; i < 16; i++) {
      t.bump(i, 0, 12);
      t.bump(i, 15, -15);
    }
    return t.finish();
  };

  T.bookshelf = function (r) {
    const t = createImage();

    // --- Oak plank frame bands (top, middle, bottom) ---
    const PLANK = pal(0x9c7f4e, 0xa98a56, 0xb8945f, 0xc09a64, 0xc8a26c);
    const PLANK_SEAM = [0x6b5231, 0x5c4527];
    function plankBand(y0, y1) {
      for (let y = y0; y <= y1; y++) for (let x = 0; x < 16; x++) {
        let c = ramp(PLANK, 0.5 + (r() - 0.5) * 0.5);
        if (y === y0) c = shade(c, 14);          // top highlight
        if (y === y1) c = shade(c, -20);         // bottom shadow
        putc(t, x, y, c);
      }
      // horizontal grain streaks
      for (let y = y0; y <= y1; y++) if (r() < 0.5)
        for (let x = 0; x < 16; x++) t.bump(x, y, -6);
      // vertical plank seams
      [0, 5, 10, 15].forEach((sx) => {
        for (let y = y0; y <= y1; y++) { putc(t, sx, y, pick(r, PLANK_SEAM)); if (sx + 1 < 16) t.bump(sx + 1, y, -14); }
      });
    }
    plankBand(0, 1);
    plankBand(7, 8);
    plankBand(14, 15);

    // --- Books ---
    // Rich, saturated spine colors matching the reference palette
    const bookColors = pal(
      0xb03a2e, 0x8f2a22, 0x2f4fa0, 0x1e3a72, 0x2f8a3a, 0x1e5c2a,
      0xc9a227, 0x8a7a2a, 0x7a3a9a, 0x4a2a6a, 0xa85a2a, 0x6a4420,
      0x2f7a8a, 0x1e4a5a, 0xc04a2a, 0x3a7a2a, 0x9a2a5a, 0x5a2a3a
    );
    const PAGE = pal(0xe8e0c8, 0xf0e8d0, 0xdcd4bc, 0xf4ecd8, 0xe0d8c0);
    const SHELF_SHADOW = [0x2a1c0c];

    function bookRow(y0, y1) {
      // dark recessed back behind the books
      for (let y = y0; y <= y1; y++) for (let x = 0; x < 16; x++)
        putc(t, x, y, shade(hex(0x3a2a16), (r() * 2 - 1) * 8));

      let x = 2;
      while (x < 14) {
        const w = 1 + rint(r, 3);                 // book width 1-3
        const c = pick(r, bookColors);
        const pageH = 1 + (r() < 0.5 ? 1 : 0);    // cream page edge 1-2px tall
        const topGap = r() < 0.25 ? 1 : 0;        // some books sit slightly lower
        const by0 = y0 + topGap;
        const hasBand = r() < 0.45;               // decorative spine band
        const bandY = by0 + pageH + 1 + rint(r, Math.max(1, (y1 - by0 - pageH - 1)));
        for (let i = 0; i < w && x < 14; i++, x++) {
          for (let y = by0; y <= y1; y++) {
            let col;
            if (y < by0 + pageH) {
              // cream page edges at the top of the book
              col = pick(r, PAGE);
              if (y === by0 + pageH - 1) col = shade(col, -18);
            } else {
              col = c;
              // spine shading
              if (y === y1) col = shade(col, -26);
              if (i === 0) col = shade(col, 14);      // left edge highlight
              if (i === w - 1) col = shade(col, -16); // right edge shadow
              // subtle vertical spine ridge on wider books
              if (w > 1 && i === (w >> 1)) col = shade(col, 6);
              // decorative band / label
              if (hasBand && (y === bandY || y === bandY + 1))
                col = shade(c, 36 + r() * 22);
            }
            putc(t, x, y, shade(col, (r() * 2 - 1) * 6));
          }
        }
        // dark gap between books
        if (x < 14) { for (let y = y0; y <= y1; y++) putc(t, x, y, shade(c, -55)); x++; }
      }
      // shadow cast under the shelf row
      for (let xx = 0; xx < 16; xx++) t.bump(xx, y1, -16);
      for (let xx = 0; xx < 16; xx++) putc(t, xx, y1, shade(hex(0x2a1c0c), (r() * 2 - 1) * 6));
    }
    bookRow(2, 6);
    bookRow(9, 13);

    // --- Vertical wooden columns on the left and right edges ---
    const COLUMN = pal(0x8a6c3e, 0x9c7f4e, 0xa98a56, 0xb8945f, 0xc09a64);
    const COLUMN_SEAM = [0x5c4527, 0x4a3720];
    function column(x0, x1) {
      for (let y = 0; y < 16; y++) for (let x = x0; x <= x1; x++) {
        let c = ramp(COLUMN, 0.5 + (r() - 0.5) * 0.5);
        if (x === x0) c = shade(c, 16);          // outer edge highlight
        if (x === x1) c = shade(c, -20);         // inner edge shadow
        putc(t, x, y, c);
      }
      // vertical grain streaks
      for (let x = x0; x <= x1; x++) if (r() < 0.5)
        for (let y = 0; y < 16; y++) t.bump(x, y, -6);
      // horizontal seam near the middle
      for (let x = x0; x <= x1; x++) putc(t, x, 8, pick(r, COLUMN_SEAM));
    }
    column(0, 1);
    column(14, 15);

    return t.finish();
  };

  T.bookshelf_top = function (r) {
    const t = createImage();
    const PLANK = pal(0x9c7f4e, 0xa98a56, 0xb8945f, 0xc09a64, 0xc8a26c);
    const PLANK_SEAM = [0x6b5231, 0x5c4527];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let c = ramp(PLANK, 0.5 + (r() - 0.5) * 0.5);
      if (y === 0) c = shade(c, 14);
      if (y === 15) c = shade(c, -20);
      putc(t, x, y, c);
    }
    // horizontal grain streaks
    for (let y = 0; y < 16; y++) if (r() < 0.5)
      for (let x = 0; x < 16; x++) t.bump(x, y, -6);
    // vertical plank seams
    [0, 5, 10, 15].forEach((sx) => {
      for (let y = 0; y < 16; y++) { putc(t, sx, y, pick(r, PLANK_SEAM)); if (sx + 1 < 16) t.bump(sx + 1, y, -14); }
    });
    return t.finish();
  };

  T.tnt_side = function (r) {
    const t = createImage();
    const red = pal(0xa03028, 0xb53830, 0xc54038, 0xd04840, 0xdc5048);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) putc(t, x, y, pick(r, red));
    for (let x = 0; x < 16; x++) for (let y = 5; y < 11; y++)
      putc(t, x, y, shade(hex(0xeaeaea), (r() * 2 - 1) * 10));
    const dark = [30, 30, 30];
    const strokes = [
      [2, 6], [3, 6], [4, 6], [3, 7], [3, 8], [3, 9],
      [6, 6], [6, 7], [6, 8], [6, 9], [7, 7], [8, 8], [9, 6], [9, 7], [9, 8], [9, 9],
      [11, 6], [12, 6], [13, 6], [12, 7], [12, 8], [12, 9],
    ];
    strokes.forEach(([x, y]) => putc(t, x, y, dark));
    return t.finish();
  };

  T.tnt_top = function (r) {
    const t = createImage();
    const red = pal(0xa03028, 0xb53830, 0xc54038, 0xd04840, 0xdc5048);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) putc(t, x, y, pick(r, red));
    const fuse = pal(0x2a2a2a, 0x3a3a3a, 0x4a4a4a);
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) putc(t, x, y, pick(r, fuse));
    return t.finish();
  };

  T.tnt_bottom = function (r) {
    const t = createImage();
    const red = pal(0x8a2820, 0x962e26, 0xa2342c, 0xae3a32);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) putc(t, x, y, pick(r, red));
    return t.finish();
  };

  const CHEST_WOOD  = pal(0x8a5a2a, 0x9a6630, 0xa87238, 0xb67e40, 0xc48a4a);
  const CHEST_FRAME = pal(0x2e1c0c, 0x38220f, 0x422812, 0x4c2e16);

  function chestWood(t, r, x0, y0, x1, y1) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      putc(t, x, y, ramp(CHEST_WOOD, r()));
    }
    // vertical plank seams
    for (let x = x0 + 3; x <= x1; x += 4) {
      for (let y = y0; y <= y1; y++) t.bump(x, y, -16);
    }
    // horizontal grain streaks
    for (let y = y0; y <= y1; y++) {
      if (r() < 0.45) for (let x = x0; x <= x1; x++) t.bump(x, y, -7);
    }
  }

  function chestFrame(t, r) {
    for (let i = 0; i < 16; i++) {
      putc(t, i, 0,  pick(r, CHEST_FRAME));
      putc(t, i, 15, pick(r, CHEST_FRAME));
      putc(t, 0, i,  pick(r, CHEST_FRAME));
      putc(t, 15, i, pick(r, CHEST_FRAME));
    }
  }

  function chestLidSeam(t, r) {
    for (let x = 1; x < 15; x++) {
      putc(t, x, 5, pick(r, CHEST_FRAME));
      t.bump(x, 6, -20);
    }
  }

  T.chest_side = function (r) {
    const t = createImage();
    chestWood(t, r, 1, 1, 14, 14);
    chestFrame(t, r);
    chestLidSeam(t, r);
    return t.finish();
  };

  T.chest_top = function (r) {
    const t = createImage();
    chestWood(t, r, 1, 1, 14, 14);
    chestFrame(t, r);
    return t.finish();
  };

  T.chest_front = function (r) {
    const t = createImage();
    chestWood(t, r, 1, 1, 14, 14);
    chestFrame(t, r);
    chestLidSeam(t, r);
    // metal latch spanning the lid seam
    const metal = pal(0x8a8a8a, 0x9e9e9e, 0xb2b2b2, 0xc6c6c6);
    for (let y = 3; y < 9; y++) for (let x = 7; x < 9; x++) putc(t, x, y, pick(r, metal));
    for (let x = 7; x < 9; x++) t.bump(x, 3, 20);
    for (let x = 7; x < 9; x++) t.bump(x, 8, -20);
    // keyhole
    putc(t, 7, 6, [40, 40, 40]);
    putc(t, 8, 6, [40, 40, 40]);
    return t.finish();
  };

  /* ---------- PUMPKIN / MELON ---------- */
  T.pumpkin_side = function (r) {
    const t = createImage();
    const P = pal(0xb05010, 0xc0601a, 0xd07020, 0xdc8028, 0xe89030);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) putc(t, x, y, ramp(P, r()));
    for (let x = 0; x < 16; x += 3) for (let y = 0; y < 16; y++) t.bump(x, y, -30);
    for (let x = 1; x < 16; x += 3) for (let y = 0; y < 16; y++) t.bump(x, y, 15);
    return t.finish();
  };

  T.pumpkin_top = function (r) {
    const t = createImage();
    const P = pal(0xb05010, 0xc0601a, 0xd07020, 0xdc8028, 0xe89030);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) putc(t, x, y, ramp(P, r()));
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (Math.floor(d) % 2 === 0) t.bump(x, y, -25);
    }
    const stem = pal(0x6a4a1a, 0x7a5620);
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) putc(t, x, y, pick(r, stem));
    return t.finish();
  };

  T.pumpkin_face = function (r) {
    const t = createImage();
    const P = pal(0xb05010, 0xc0601a, 0xd07020, 0xdc8028, 0xe89030);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) putc(t, x, y, ramp(P, r()));
    for (let x = 0; x < 16; x += 3) for (let y = 0; y < 16; y++) t.bump(x, y, -30);
    for (let x = 1; x < 16; x += 3) for (let y = 0; y < 16; y++) t.bump(x, y, 15);
    const dark = [30, 15, 5];
    [[3, 5], [4, 5], [3, 6], [4, 6]].forEach(([x, y]) => putc(t, x, y, dark));
    [[11, 5], [12, 5], [11, 6], [12, 6]].forEach(([x, y]) => putc(t, x, y, dark));
    for (let x = 4; x < 12; x++) putc(t, x, 10, dark);
    [[5, 9], [6, 9], [9, 9], [10, 9], [6, 11], [9, 11]].forEach(([x, y]) => putc(t, x, y, dark));
    return t.finish();
  };

  T.melon_side = function (r) {
    const t = createImage();
    const P = pal(0x4a6a1a, 0x5a7c22, 0x6a8e2a, 0x7aa032, 0x8ab03a);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) putc(t, x, y, ramp(P, r()));
    for (let x = 2; x < 16; x += 5) for (let y = 0; y < 16; y++) t.bump(x, y, -30);
    for (let x = 0; x < 16; x += 5) for (let y = 0; y < 16; y++) t.bump(x, y, 20);
    scatter(t, r, 10, () => [60, 90, 20]);
    return t.finish();
  };

  T.melon_top = function (r) {
    const t = createImage();
    const P = pal(0x4a6a1a, 0x5a7c22, 0x6a8e2a, 0x7aa032, 0x8ab03a);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) putc(t, x, y, ramp(P, r()));
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if ((x + y) % 4 === 0) t.bump(x, y, -22);
    }
    return t.finish();
  };

  /* ---------- WOOL ---------- */
  function woolTexture(r, color) {
    const t = createImage();
    const p = [shade(color, -28), shade(color, -13), color, shade(color, 10), shade(color, 20)];
    fillNoise(t, r, p, { cells: 8, clump: 0.35, stretch: 1.5 });
    return t.finish();
  }
  T.wool_white  = (r) => woolTexture(r, [233, 236, 236]);
  T.wool_red    = (r) => woolTexture(r, [165, 42, 36]);
  T.wool_blue   = (r) => woolTexture(r, [56, 72, 170]);
  T.wool_yellow = (r) => woolTexture(r, [248, 197, 39]);
  T.wool_green  = (r) => woolTexture(r, [84, 114, 28]);
  T.wool_black  = (r) => woolTexture(r, [28, 28, 33]);
  T.wool_orange = (r) => woolTexture(r, [240, 118, 19]);
  T.wool_purple = (r) => woolTexture(r, [137, 50, 184]);

  /* ============================================================
     GENERATION (deterministic seed per name)
     ============================================================ */
  const textures = {};
  Object.keys(T).forEach((name) => {
    const rand = mulberry32(hashStr('mctex:' + name));
    textures[name] = T[name](rand);
  });

  /* ============================================================
     PUBLIC API
     ============================================================ */
  const ALIASES = {
    grass:      'grass_top',
    log:        'oak_log_side',
    oak_log:    'oak_log_side',
    spruce_log: 'spruce_log_side',
    birch_log:  'birch_log_side',
    jungle_log: 'jungle_log_side',
    acacia_log: 'acacia_log_side',
    dark_oak_log: 'dark_oak_log_side',
    crimson_stem: 'crimson_stem_side',
    warped_stem:  'warped_stem_side',
    planks:     'oak_planks',
    oak_planks: 'oak_planks',
    leaves:     'oak_leaves',
    sandstone:  'sandstone_side',
    red_sandstone: 'red_sandstone_side',
    brick:      'bricks',
    netherrack_bricks: 'nether_bricks',
  };

  function get(name) {
    const key = ALIASES[name] || name;
    return textures[key] || textures.dirt;
  }

  const SPECIAL_FACES = {
    grass:     { top: 'grass_top',        bottom: 'dirt',              side: 'grass_side' },
    oak_log:   { top: 'oak_log_top',      bottom: 'oak_log_top',       side: 'oak_log_side' },
    spruce_log:{ top: 'spruce_log_top',   bottom: 'spruce_log_top',    side: 'spruce_log_side' },
    birch_log: { top: 'birch_log_top',    bottom: 'birch_log_top',     side: 'birch_log_side' },
    jungle_log:{ top: 'jungle_log_top',   bottom: 'jungle_log_top',    side: 'jungle_log_side' },
    acacia_log:{ top: 'acacia_log_top',   bottom: 'acacia_log_top',    side: 'acacia_log_side' },
    dark_oak_log:{ top: 'dark_oak_log_top', bottom: 'dark_oak_log_top', side: 'dark_oak_log_side' },
    crimson_stem:{ top: 'crimson_stem_top', bottom: 'crimson_stem_top', side: 'crimson_stem_side' },
    warped_stem: { top: 'warped_stem_top',  bottom: 'warped_stem_top',  side: 'warped_stem_side' },
    sandstone: { top: 'sandstone_top',    bottom: 'sandstone_top',     side: 'sandstone_side' },
    red_sandstone: { top: 'red_sandstone_top', bottom: 'red_sandstone_top', side: 'red_sandstone_side' },
    crafting_table: { top: 'crafting_table_top', bottom: 'oak_planks', side: 'crafting_table_side', front: 'crafting_table_front' },
    furnace:   { top: 'furnace_top',      bottom: 'furnace_top',       side: 'furnace_side', front: 'furnace_front' },
    chest:     { top: 'chest_top',        bottom: 'chest_top',         side: 'chest_side',   front: 'chest_front' },
    pumpkin:   { top: 'pumpkin_top',      bottom: 'pumpkin_top',       side: 'pumpkin_side', front: 'pumpkin_face' },
    melon:     { top: 'melon_top',        bottom: 'melon_top',         side: 'melon_side' },
    tnt:       { top: 'tnt_top',          bottom: 'tnt_bottom',        side: 'tnt_side' },
    hay:       { top: 'hay_top',          bottom: 'hay_top',           side: 'hay_side' },
    cactus:    { top: 'cactus_top',       bottom: 'cactus_top',        side: 'cactus_side' },
    bookshelf: { top: 'bookshelf_top',    bottom: 'bookshelf_top',     side: 'bookshelf' },
  };
  const FACE_ALIASES = {
    log: 'oak_log',
    planks: 'oak_planks',
    brick: 'bricks',
  };

  function resolveFaces(name) {
    const fa = FACE_ALIASES[name] || name;
    const key = ALIASES[name] || name;
    const s = SPECIAL_FACES[fa] || SPECIAL_FACES[key];
    if (s) return s;
    return { top: key, bottom: key, side: key };
  }

  const texCache = new Map();
  const matCache = new Map();

  function getTexture(texName, THREE) {
    if (texCache.has(texName)) return texCache.get(texName);
    const tex = new THREE.CanvasTexture(textures[texName] || textures.dirt);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    texCache.set(texName, tex);
    return tex;
  }

  function getMaterial(texName, THREE, bright) {
    bright = bright === undefined ? 1 : bright;
    const key = texName + '@' + bright;
    if (matCache.has(key)) return matCache.get(key);

    const opts = { map: getTexture(texName, THREE) };
    if (bright !== 1) opts.color = new THREE.Color(bright, bright, bright);
    if (texName === 'glass') {
      opts.alphaTest = 0.5;
    } else if (texName === 'water') {
      opts.transparent = true;
    }
    const mat = new THREE.MeshLambertMaterial(opts);
    matCache.set(key, mat);
    return mat;
  }

  const FACE_BRIGHT = { top: 1.0, bottom: 0.5, x: 0.6, z: 0.8 };
  const FLAT_BRIGHT = { top: 1, bottom: 1, x: 1, z: 1 };

  function blockMaterials(name, THREE, opts) {
    const f = resolveFaces(name);
    const b = (opts && opts.faceShade) ? FACE_BRIGHT : FLAT_BRIGHT;
    const front = f.front;
    const sideM = getMaterial(f.side, THREE, b.z);
    const sideX = getMaterial(front || f.side, THREE, b.x);
    const mTop    = getMaterial(f.top,    THREE, b.top);
    const mBottom = getMaterial(f.bottom, THREE, b.bottom);
    // [ +X, -X, +Y(top), -Y(bottom), +Z, -Z ]
    // Faces com "front" customizado: -Z recebe o front, +Z recebe side
    if (front) {
      return [sideM, sideM, mTop, mBottom, sideM, getMaterial(front, THREE, b.z)];
    }
    return [sideX, sideX, mTop, mBottom, sideM, sideM];
  }

  /* ---------- PNG export ---------- */
  function toPNG(name) {
    const key = ALIASES[name] || name;
    const canvas = textures[key] || textures.dirt;
    return canvas.toDataURL('image/png');
  }

  function toPNGBlob(name, cb) {
    const key = ALIASES[name] || name;
    const canvas = textures[key] || textures.dirt;
    if (canvas.toBlob) {
      canvas.toBlob((blob) => cb(blob, key), 'image/png');
    } else {
      // Fallback: parse data URL manually
      const data = canvas.toDataURL('image/png');
      const bin = atob(data.split(',')[1]);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      cb(new Blob([arr], { type: 'image/png' }), key);
    }
  }

  function getAll() {
    return Object.assign({}, textures);
  }

  global.MCTex = {
    SIZE,
    textures,
    get,
    getAll,
    toPNG,
    toPNGBlob,
    blockMaterials,
    list: () => Object.keys(textures),
    generate: (generatorName, seedString) => {
      const fn = T[generatorName];
      if (!fn) throw new Error('Unknown generator: ' + generatorName);
      return fn(mulberry32(hashStr(String(seedString || generatorName))));
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
/* Troubadour Map: the library of places (lake, castle, windmill...), drawn as small coloured stickers on the map.
 *
 *   MapStamps.LIST            [{ id, label, group }]
 *   MapStamps.GROUPS          the groups of the library, in order
 *   MapStamps.draw(ctx, id, size, pal)   draws the place centred on (0, 0), `size` units wide
 *
 * `pal` gives the ink of the theme (the outlines) and its paper. The places carry their own bright colours; a picture
 * that wants one tint (the covers of the library) passes `pal.mono` and `pal.monoFill`.
 * Every drawing is made of paths, so it stays sharp at any zoom.
 */
(function (global) {
  'use strict';

  const GROUPS = ['Nature', 'Village', 'Castles and wonders', 'Roads and adventure'];
  const LIST = [
    ['bush', 'Bush', 0], ['tree', 'Tree', 0], ['deadtree', 'Dead tree', 0], ['pine', 'Pine', 0], ['cactus', 'Cactus', 0], ['grove', 'Grove', 0],
    ['forest', 'Forest', 0], ['jungle', 'Jungle', 0], ['haunted', 'Haunted woods', 0], ['worldtree', 'World tree', 0], ['mushrooms', 'Mushrooms', 0], ['meadow', 'Meadow', 0],
    ['pond', 'Pond', 0], ['lake', 'Lake', 0], ['swamp', 'Swamp', 0], ['hotspring', 'Hot spring', 0], ['oasis', 'Oasis', 0], ['beach', 'Beach', 0],
    ['island', 'Island', 0], ['rocks', 'Rocks', 0], ['hill', 'Hills', 0], ['dunes', 'Dunes', 0], ['peak', 'Peak', 0], ['mountains', 'Mountains', 0],
    ['range', 'Mountain range', 0], ['volcano', 'Volcano', 0], ['glacier', 'Glacier', 0], ['canyon', 'Canyon', 0], ['cave', 'Cave', 0], ['waterfall', 'Waterfall', 0],
    ['crystals', 'Crystals', 0], ['fields', 'Fields', 0],
    ['hut', 'Hut', 1], ['house', 'House', 1], ['bakery', 'Bakery', 1], ['shop', 'Shop', 1], ['tavern', 'Tavern', 1], ['forge', 'Forge', 1],
    ['library', 'Library', 1], ['guildhall', 'Guildhall', 1], ['stable', 'Stable', 1], ['barn', 'Barn', 1], ['farm', 'Farm', 1], ['windmill', 'Windmill', 1],
    ['watermill', 'Watermill', 1], ['well', 'Well', 1], ['fountain', 'Fountain', 1], ['market', 'Market', 1], ['church', 'Church', 1], ['hamlet', 'Hamlet', 1],
    ['village', 'Village', 1], ['town', 'Town', 1], ['city', 'City', 1],
    ['statue', 'Statue', 2], ['grave', 'Grave', 2], ['tomb', 'Tomb', 2], ['altar', 'Altar', 2], ['stones', 'Standing stones', 2], ['portal', 'Portal', 2],
    ['ruins', 'Ruins', 2], ['watchtower', 'Watchtower', 2], ['wall', 'City wall', 2], ['tower', 'Tower', 2], ['wizard', "Wizard's tower", 2], ['keep', 'Keep', 2],
    ['fort', 'Fort', 2], ['castle', 'Castle', 2], ['citadel', 'Citadel', 2], ['palace', 'Palace', 2], ['kingdom', 'Kingdom', 2], ['temple', 'Temple', 2],
    ['monastery', 'Monastery', 2], ['cathedral', 'Cathedral', 2], ['observatory', 'Observatory', 2], ['pyramid', 'Pyramid', 2], ['arena', 'Arena', 2],
    ['signpost', 'Signpost', 3], ['crates', 'Crates', 3], ['chest', 'Treasure', 3], ['logs', 'Logs', 3], ['cart', 'Cart', 3], ['caravan', 'Caravan', 3],
    ['tent', 'Tent', 3], ['camp', 'Camp', 3], ['fire', 'Campfire', 3], ['bones', 'Bones', 3], ['gallows', 'Gallows', 3], ['battlefield', 'Battlefield', 3],
    ['dragon', "Dragon's lair", 3], ['stairs', 'Stairs', 3], ['door', 'Gate', 3], ['bridge', 'Bridge', 3], ['ropebridge', 'Rope bridge', 3], ['mine', 'Mine', 3],
    ['quarry', 'Quarry', 3], ['boat', 'Boat', 3], ['ship', 'Ship', 3], ['shipwreck', 'Shipwreck', 3], ['harbor', 'Harbour', 3], ['lighthouse', 'Lighthouse', 3],
  ].map(([id, label, g]) => ({ id, label, group: GROUPS[g] }));

  /* How big each place is by nature, from 1 (a bush, a chest) to 5 (a city, a kingdom): laid with the size Auto,
   * a place takes that share of the width of its map. */
  const SHARE = [0, 0.055, 0.08, 0.12, 0.17, 0.25];
  const CLASS = {};
  [
    [1, 'bush tree deadtree pine cactus mushrooms rocks crystals statue grave altar signpost crates chest logs cart tent fire bones gallows well stairs boat'],
    [2, 'grove pond hotspring cave waterfall hut house bakery shop tavern forge library guildhall stable barn windmill watermill fountain market church tomb stones portal ruins watchtower tower wizard caravan door mine quarry ship shipwreck lighthouse battlefield dragon'],
    [3, 'forest jungle haunted worldtree meadow lake swamp oasis beach island hill dunes peak volcano glacier canyon fields farm hamlet wall keep fort castle temple monastery cathedral observatory pyramid arena bridge ropebridge harbor camp'],
    [4, 'mountains village town citadel palace'],
    [5, 'range city kingdom'],
  ].forEach(([k, ids]) => ids.split(' ').forEach((id) => { CLASS[id] = k; }));
  /** The share of the map's width a place takes at its natural size. */
  const natural = (id) => SHARE[CLASS[id] || 2];

  // The colours of the stickers: bright, a little soft.
  const K = {
    red: '#EE6B5E', coral: '#F48A6A', blue: '#5B92EE', sky: '#9AD8F5', water: '#5CC4EA', deep: '#3A9AD0', cream: '#FBEFD6', wall: '#F4E1BE',
    wood: '#C98D57', darkwood: '#8E5B36', stone: '#C9C6D6', stone2: '#A29EB6', leaf: '#76CB6C', leaf2: '#4FAA5D', pine: '#3FA37C', grass: '#A2DD78',
    sand: '#F5D88F', sand2: '#E5BA68', lava: '#FF7B3A', flame: '#FFC93C', pink: '#F59CC6', purple: '#A783EA', violet: '#7B5BD1', gold: '#F7C64B',
    snow: '#FFFFFF', mush: '#EF5A50', crystal: '#7EE6F2', teal: '#3FC1B0', dark: '#3B3046', glass: '#FFE68A', moss: '#93C15F', mud: '#A0805A',
    bone: '#F5EEDF', white: '#FFFFFF', straw: '#F2CF6B', smoke: '#E6E3EE', ice: '#D6F1FB',
  };

  /* ---------- Drawing in unit coordinates: x and y from -0.5 to 0.5 across the place ---------- */
  let CT = null, S = 1, MONO = null;
  const col = (h) => MONO || h;
  const X = (v) => v * S;
  function path(pts, close = true) { CT.beginPath(); pts.forEach(([x, y], i) => (i ? CT.lineTo(X(x), X(y)) : CT.moveTo(X(x), X(y)))); if (close) CT.closePath(); }
  function rr(x, y, w, h, r) {
    CT.beginPath();
    if (CT.roundRect) CT.roundRect(X(x), X(y), X(w), X(h), X(r)); else CT.rect(X(x), X(y), X(w), X(h));
  }
  function ell(x, y, rx, ry) { CT.beginPath(); CT.ellipse(X(x), X(y), X(rx), X(ry === undefined ? rx : ry), 0, 0, Math.PI * 2); }
  function paint(c, stroke = true) { CT.fillStyle = col(c); CT.fill(); if (stroke) CT.stroke(); }
  function line(pts, w) { path(pts, false); CT.save(); if (w) CT.lineWidth = X(w); CT.stroke(); CT.restore(); }
  function shine(x, y, rx, ry) { if (MONO) return; CT.save(); CT.globalAlpha = 0.5; ell(x, y, rx, ry); CT.fillStyle = '#fff'; CT.fill(); CT.restore(); }
  function shade(fn, a = 0.14) { if (MONO) return; CT.save(); CT.globalAlpha = a; fn(); CT.fillStyle = '#000'; CT.fill(); CT.restore(); }
  function shadow(y = 0.4, rx = 0.36, ry = 0.06) { shade(() => ell(0, y, rx, ry), 0.16); }
  /** A soft cloud of bumps (crowns, puffs, bushes), seeded so it is the same each time. */
  function puff(cx, cy, r, n, rand, wob = 0.18) {
    CT.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, a2 = ((i + 0.5) / n) * Math.PI * 2;
      const k = 1 + (rand() - 0.5) * wob;
      if (!i) CT.moveTo(X(cx + Math.cos(a) * r), X(cy + Math.sin(a) * r));
      else CT.quadraticCurveTo(X(cx + Math.cos(a2 - Math.PI / n) * r * 1.28 * k), X(cy + Math.sin(a2 - Math.PI / n) * r * 1.28 * k), X(cx + Math.cos(a) * r), X(cy + Math.sin(a) * r));
    }
    CT.closePath();
  }
  function rng(seed) {
    let s = 0;
    for (let i = 0; i < seed.length; i++) s = (s * 31 + seed.charCodeAt(i)) >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  // Small pieces used by several places.
  function window_(x, y, w, h, lit = true) { rr(x, y, w, h, Math.min(w, h) * 0.3); paint(lit ? K.glass : K.dark); line([[x + w / 2, y], [x + w / 2, y + h]], 0.012); }
  function door(x, y, w, h, c = K.darkwood) { CT.beginPath(); CT.moveTo(X(x), X(y + h)); CT.lineTo(X(x), X(y + w / 2)); CT.arc(X(x + w / 2), X(y + w / 2), X(w / 2), Math.PI, 0); CT.lineTo(X(x + w), X(y + h)); CT.closePath(); paint(c); }
  function roundTree(x, y, r, rand, c = K.leaf) {
    rr(x - r * 0.18, y + r * 0.5, r * 0.36, r * 0.9, r * 0.1); paint(K.wood);
    puff(x, y, r, 7, rand); paint(c);
    shine(x - r * 0.35, y - r * 0.35, r * 0.22, r * 0.14);
  }
  function palm(x, y, h, rand) {
    CT.beginPath(); CT.moveTo(X(x - 0.025), X(y)); CT.quadraticCurveTo(X(x - 0.05), X(y - h * 0.5), X(x + 0.01), X(y - h)); CT.lineTo(X(x + 0.04), X(y - h)); CT.quadraticCurveTo(X(x - 0.01), X(y - h * 0.5), X(x + 0.025), X(y)); CT.closePath(); paint(K.wood);
    [[-1, -0.2], [-0.8, 0.25], [1, -0.15], [0.8, 0.3], [0.1, -0.6]].forEach(([dx, dy]) => {
      const tx = x + 0.025 + dx * h * 0.42, ty = y - h + dy * h * 0.25;
      CT.beginPath(); CT.moveTo(X(x + 0.025), X(y - h)); CT.quadraticCurveTo(X((x + tx) / 2 + 0.01), X(y - h - h * 0.22), X(tx), X(ty));
      CT.quadraticCurveTo(X((x + tx) / 2), X(y - h - h * 0.05), X(x + 0.025), X(y - h)); paint(K.leaf2);
    });
  }
  function flower(x, y, r, c) { for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; ell(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75); paint(c, false); } ell(x, y, r * 0.6); paint(K.gold, false); }
  function flag(x, y, h, c) { line([[x, y], [x, y - h]], 0.016); path([[x, y - h], [x + h * 0.55, y - h * 0.8], [x, y - h * 0.6]]); paint(c); }
  function waves(y, x0, x1, n = 3) { CT.save(); CT.globalAlpha = 0.55; CT.strokeStyle = MONO ? CT.strokeStyle : K.white; for (let k = 0; k < n; k++) { const xa = x0 + ((x1 - x0) * (k + 0.2)) / n, w = (x1 - x0) / n * 0.6, yy = y + (k % 2) * 0.05; CT.beginPath(); CT.moveTo(X(xa), X(yy)); CT.quadraticCurveTo(X(xa + w / 2), X(yy - 0.03), X(xa + w), X(yy)); CT.stroke(); } CT.restore(); }
  function house(x, y, w, h, roof, wall = K.wall) {
    rr(x - w / 2, y - h, w, h, 0.03); paint(wall);
    path([[x - w / 2 - 0.05, y - h + 0.02], [x, y - h - w * 0.55], [x + w / 2 + 0.05, y - h + 0.02]]); paint(roof);
    shine(x - w * 0.18, y - h - w * 0.22, w * 0.12, w * 0.05);
  }
  /** A thick limb (branch, cactus arm, root): an outline of ink, then the colour inside. */
  function limb(pts, w, c) {
    const o = CT.lineWidth;
    path(pts, false); CT.save(); CT.lineWidth = X(w) + o * 2; CT.stroke(); CT.strokeStyle = col(c); CT.lineWidth = X(w); CT.stroke(); CT.restore();
  }
  function pineAt(x, b, h, c = K.pine) {
    const w = h * 0.4;
    rr(x - w * 0.16, b - h * 0.2, w * 0.32, h * 0.2, w * 0.06); paint(K.wood);
    [[0, 1], [0.3, 0.78], [0.56, 0.58]].forEach(([o, k]) => { const bb = b - h * 0.16 - o * h * 0.62; path([[x - w * k, bb], [x, bb - h * 0.46 * k], [x + w * k, bb]]); paint(c); });
  }
  function cottage(x, b, w, roof, wall = K.wall) {
    const h = w * 0.62;
    house(x, b, w, h, roof, wall);
    door(x - w * 0.13, b - h * 0.6, w * 0.26, h * 0.6, K.darkwood);
    if (w > 0.16) window_(x + w * 0.2, b - h * 0.78, w * 0.2, w * 0.18);
  }
  function crenel(x, y, w, n, c = K.stone) { const u = w / n; for (let k = 0; k < n; k++) { rr(x + k * u + u * 0.14, y - u * 0.62, u * 0.72, u * 0.7, 0.008); paint(c); } }
  function towerAt(x, b, w, h, roof = K.blue, c = K.stone2) {
    rr(x - w / 2, b - h, w, h, 0.015); paint(c);
    if (roof) { path([[x - w / 2 - w * 0.16, b - h + 0.005], [x, b - h - w * 1.25], [x + w / 2 + w * 0.16, b - h + 0.005]]); paint(roof); }
    else crenel(x - w / 2, b - h, w, 3, c);
    window_(x - w * 0.18, b - h + h * 0.2, w * 0.36, Math.min(h * 0.18, w * 0.5));
  }
  function star(x, y, r, c = K.gold, stroke = false) { CT.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, q = k % 2 ? r * 0.45 : r; CT.lineTo(X(x + Math.cos(a) * q), X(y + Math.sin(a) * q)); } CT.closePath(); paint(c, stroke); }
  function tentAt(x, b, w, c, stripe = K.cream) {
    path([[x - w / 2, b], [x, b - w * 0.85], [x + w / 2, b]]); paint(c);
    CT.save(); path([[x - w / 2, b], [x, b - w * 0.85], [x + w / 2, b]]); CT.clip(); path([[x - w * 0.14, b + 0.02], [x, b - w * 0.86], [x + w * 0.14, b + 0.02]]); paint(stripe, false); CT.restore();
    path([[x - w / 2, b], [x, b - w * 0.85], [x + w / 2, b]]); CT.stroke();
    path([[x - w * 0.1, b], [x, b - w * 0.36], [x + w * 0.1, b]]); paint(K.dark);
  }
  function leafAt(x, y, rx, ry, a, c) { CT.save(); CT.translate(X(x), X(y)); CT.rotate(a); ell(0, 0, rx, ry); paint(c); line([[-rx * 0.8, 0], [rx * 0.8, 0]], 0.008); CT.restore(); }
  /** A peak with its snow, as in the mountains. */
  function peakAt(x, b, hw, h, cc, snow = true) {
    CT.beginPath(); CT.moveTo(X(x - hw), X(b)); CT.lineTo(X(x - 0.05), X(b - h + 0.04)); CT.quadraticCurveTo(X(x), X(b - h - 0.02), X(x + 0.05), X(b - h + 0.04)); CT.lineTo(X(x + hw), X(b)); CT.closePath(); paint(cc);
    if (!snow) return;
    CT.beginPath(); CT.moveTo(X(x - hw * 0.36), X(b - h * 0.64)); CT.lineTo(X(x - 0.05), X(b - h + 0.04)); CT.quadraticCurveTo(X(x), X(b - h - 0.02), X(x + 0.05), X(b - h + 0.04));
    CT.lineTo(X(x + hw * 0.36), X(b - h * 0.64)); CT.quadraticCurveTo(X(x + hw * 0.18), X(b - h * 0.56), X(x + hw * 0.05), X(b - h * 0.66)); CT.quadraticCurveTo(X(x - hw * 0.12), X(b - h * 0.55), X(x - hw * 0.36), X(b - h * 0.64)); CT.closePath(); paint(K.snow);
  }
  /** Another place of the library, drawn smaller inside this one (villages, kingdoms...). */
  function mini(id, x, y, k, R) {
    CT.save(); CT.translate(X(x), X(y)); CT.scale(k, k); CT.lineWidth *= 0.8 / k;
    D[id](CT, S, null, R || rng(id)); CT.restore();
  }
  function wheel(x, y, r) { ell(x, y, r); paint(K.darkwood); ell(x, y, r * 0.25); paint(K.gold); for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 4; line([[x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85], [x - Math.cos(a) * r * 0.85, y - Math.sin(a) * r * 0.85]], 0.008); } }
  function ground(y, rx, ry, c = K.grass) { ell(0, y, rx, ry); paint(c); }

  const D = {
    /* ----- Nature ----- */
    lake(c, s, p, R) {
      puff(0, 0.02, 0.36, 9, R, 0.1); paint(K.water);
      puff(0.02, 0.04, 0.24, 8, R, 0.1); CT.fillStyle = col(K.sky); CT.fill();
      waves(0.0, -0.22, 0.2);
      ell(-0.2, 0.16, 0.08, 0.05); paint(K.leaf2); flower(-0.19, 0.15, 0.018, K.pink);
      [[0.3, 0.18], [0.34, 0.12]].forEach(([x, y]) => line([[x, y + 0.1], [x, y - 0.06]], 0.016)); ell(0.3, -0.07, 0.018, 0.04); paint(K.darkwood);
    },
    mountains(c, s, p) {
      shadow(0.38, 0.44);
      [[-0.22, 0.34, 0.24, 0.5, K.stone2], [0.22, 0.34, 0.22, 0.42, K.stone2], [0.02, 0.36, 0.3, 0.68, K.stone]].forEach(([x, b, hw, h, cc]) => {
        CT.beginPath(); CT.moveTo(X(x - hw), X(b)); CT.lineTo(X(x - 0.05), X(b - h + 0.04)); CT.quadraticCurveTo(X(x), X(b - h - 0.02), X(x + 0.05), X(b - h + 0.04)); CT.lineTo(X(x + hw), X(b)); CT.closePath(); paint(cc);
        CT.beginPath(); CT.moveTo(X(x - hw * 0.36), X(b - h * 0.64)); CT.lineTo(X(x - 0.05), X(b - h + 0.04)); CT.quadraticCurveTo(X(x), X(b - h - 0.02), X(x + 0.05), X(b - h + 0.04));
        CT.lineTo(X(x + hw * 0.36), X(b - h * 0.64)); CT.quadraticCurveTo(X(x + hw * 0.18), X(b - h * 0.56), X(x + hw * 0.05), X(b - h * 0.66)); CT.quadraticCurveTo(X(x - hw * 0.12), X(b - h * 0.55), X(x - hw * 0.36), X(b - h * 0.64)); CT.closePath(); paint(K.snow);
      });
    },
    hill(c, s, p, R) {
      shadow(0.36, 0.44);
      [[-0.16, 0.34, 0.3, 0.36, K.leaf2], [0.16, 0.36, 0.28, 0.26, K.leaf]].forEach(([x, b, hw, h, cc]) => {
        CT.beginPath(); CT.moveTo(X(x - hw), X(b)); CT.bezierCurveTo(X(x - hw * 0.6), X(b - h * 1.3), X(x + hw * 0.6), X(b - h * 1.3), X(x + hw), X(b)); CT.closePath(); paint(cc);
        shine(x - hw * 0.35, b - h * 0.65, hw * 0.25, 0.03);
      });
      flower(-0.06, 0.2, 0.02, K.pink); flower(0.24, 0.24, 0.018, K.white); flower(-0.3, 0.26, 0.016, K.gold);
    },
    forest(c, s, p, R) {
      shadow(0.4, 0.44);
      [[-0.2, -0.12, 0.17, K.leaf2], [0.18, -0.14, 0.16, K.pine], [0.0, -0.2, 0.18, K.leaf], [-0.26, 0.12, 0.15, K.leaf], [0.26, 0.1, 0.15, K.leaf2], [0.0, 0.08, 0.17, K.moss]]
        .forEach(([x, y, r, cc]) => roundTree(x, y, r, R, cc));
    },
    tree(c, s, p, R) {
      shadow(0.42, 0.24);
      rr(-0.06, 0.02, 0.12, 0.38, 0.03); paint(K.wood);
      puff(0, -0.12, 0.3, 8, R); paint(K.leaf);
      shine(-0.12, -0.26, 0.08, 0.05);
      [[-0.12, -0.04], [0.12, -0.16], [0.06, 0.02], [-0.02, -0.26]].forEach(([x, y]) => { ell(x, y, 0.035); paint(K.red); });
    },
    pine(c, s, p) {
      shadow(0.42, 0.22);
      rr(-0.05, 0.26, 0.1, 0.16, 0.02); paint(K.wood);
      [[0.3, 0.34, 0.26], [0.08, 0.27, 0.24], [-0.12, 0.2, 0.22]].forEach(([b, hw, h]) => {
        CT.beginPath(); CT.moveTo(X(-hw), X(b)); CT.quadraticCurveTo(X(0), X(b + 0.05), X(hw), X(b)); CT.lineTo(X(0.02), X(b - h)); CT.quadraticCurveTo(X(0), X(b - h - 0.02), X(-0.02), X(b - h)); CT.closePath(); paint(K.pine);
      });
      path([[-0.06, -0.3], [0, -0.42], [0.06, -0.3], [0.02, -0.28], [0, -0.32], [-0.02, -0.28]]); paint(K.snow);
    },
    swamp(c, s, p, R) {
      puff(0, 0.04, 0.38, 9, R, 0.2); paint(K.moss);
      puff(-0.04, 0.06, 0.25, 8, R, 0.25); paint(K.teal);
      ell(0.12, 0.12, 0.08, 0.045); paint(K.leaf2);
      [[-0.14, -0.02, 0.025], [-0.06, 0.12, 0.018], [0.02, -0.04, 0.014]].forEach(([x, y, r]) => { ell(x, y, r); paint(K.sky); });
      [[-0.32, 0.1], [-0.27, 0.14], [0.3, 0.0], [0.35, 0.04]].forEach(([x, y]) => { line([[x, y + 0.08], [x, y - 0.12]], 0.016); ell(x, y - 0.14, 0.02, 0.05); paint(K.darkwood); });
    },
    rocks(c, s, p, R) {
      shadow(0.34, 0.42);
      [[-0.18, 0.12, 0.17, 0.15, K.stone2], [0.16, 0.14, 0.15, 0.12, K.stone2], [0, 0.02, 0.2, 0.2, K.stone]].forEach(([x, y, rx, ry, cc]) => {
        puff(x, y, Math.min(rx, ry), 6, R, 0.1); CT.save(); CT.translate(X(x), X(y)); CT.scale(rx / Math.min(rx, ry), ry / Math.min(rx, ry)); CT.translate(-X(x), -X(y)); paint(cc); CT.restore();
        shine(x - rx * 0.35, y - ry * 0.45, rx * 0.3, ry * 0.16);
      });
      flower(0.3, 0.26, 0.016, K.gold);
    },
    cave(c, s, p, R) {
      shadow(0.38, 0.44);
      CT.beginPath(); CT.moveTo(X(-0.44), X(0.36)); CT.bezierCurveTo(X(-0.4), X(-0.3), X(0.4), X(-0.34), X(0.44), X(0.36)); CT.closePath(); paint(K.stone2);
      CT.beginPath(); CT.moveTo(X(-0.17), X(0.36)); CT.bezierCurveTo(X(-0.17), X(-0.06), X(0.17), X(-0.06), X(0.17), X(0.36)); CT.closePath(); paint(K.dark);
      shine(-0.2, -0.1, 0.1, 0.04); ell(0.26, 0.04, 0.05, 0.035); paint(K.moss); ell(-0.3, 0.14, 0.045, 0.03); paint(K.moss);
    },
    volcano(c, s, p, R) {
      puff(0.1, -0.36, 0.08, 5, R); paint(K.smoke); puff(-0.02, -0.3, 0.07, 5, R); paint(K.smoke);
      shadow(0.38, 0.44);
      path([[-0.44, 0.36], [-0.12, -0.18], [0.12, -0.18], [0.44, 0.36]]); paint(K.mud);
      CT.beginPath(); CT.moveTo(X(-0.12), X(-0.18)); CT.quadraticCurveTo(X(0), X(-0.24), X(0.12), X(-0.18)); CT.lineTo(X(0.08), X(-0.06)); CT.quadraticCurveTo(X(0.06), X(0.06), X(0.02), X(0.02)); CT.quadraticCurveTo(X(-0.02), X(-0.04), X(-0.04), X(0.1)); CT.quadraticCurveTo(X(-0.08), X(-0.04), X(-0.12), X(-0.18)); CT.closePath(); paint(K.lava);
      ell(0, -0.19, 0.11, 0.035); paint(K.flame);
    },
    waterfall(c, s, p, R) {
      ell(0, 0.3, 0.42, 0.12); paint(K.water);
      rr(-0.44, -0.36, 0.3, 0.62, 0.08); paint(K.stone2); rr(0.14, -0.36, 0.3, 0.62, 0.08); paint(K.stone2);
      rr(-0.15, -0.38, 0.3, 0.68, 0.03); paint(K.sky);
      CT.save(); CT.globalAlpha = 0.6; CT.strokeStyle = MONO ? CT.strokeStyle : K.white; [-0.08, 0, 0.08].forEach((x) => { CT.beginPath(); CT.moveTo(X(x), X(-0.3)); CT.lineTo(X(x), X(0.2)); CT.stroke(); }); CT.restore();
      [[-0.14, 0.3], [0.0, 0.33], [0.14, 0.29]].forEach(([x, y]) => { puff(x, y, 0.05, 5, R); paint(K.white); });
      ell(-0.3, -0.36, 0.13, 0.05); paint(K.leaf); ell(0.3, -0.36, 0.13, 0.05); paint(K.leaf);
    },
    island(c, s, p, R) {
      ell(0, 0.12, 0.46, 0.28); paint(K.water); waves(0.3, -0.3, 0.3, 3);
      puff(0, 0.14, 0.24, 7, R, 0.1); CT.save(); CT.translate(0, X(0.14)); CT.scale(1, 0.55); CT.translate(0, -X(0.14)); paint(K.sand); CT.restore();
      palm(-0.04, 0.12, 0.42, R);
    },
    dunes(c, s, p, R) {
      shadow(0.36, 0.44);
      [[0.16, 0.34, 0.3, 0.3, K.sand2], [-0.14, 0.36, 0.32, 0.38, K.sand]].forEach(([x, b, hw, h, cc]) => {
        CT.beginPath(); CT.moveTo(X(x - hw), X(b)); CT.quadraticCurveTo(X(x - hw * 0.1), X(b - h * 1.6), X(x + hw), X(b)); CT.closePath(); paint(cc);
        line([[x - hw * 0.1, b - h * 0.7], [x + hw * 0.4, b - h * 0.3]], 0.01);
      });
      // A little cactus.
      rr(0.26, 0.02, 0.07, 0.26, 0.035); paint(K.leaf2); rr(0.2, 0.08, 0.05, 0.1, 0.025); paint(K.leaf2); rr(0.34, 0.06, 0.05, 0.1, 0.025); paint(K.leaf2);
      flower(0.295, 0.0, 0.012, K.pink);
    },
    oasis(c, s, p, R) {
      puff(0, 0.1, 0.4, 9, R, 0.1); CT.save(); CT.translate(0, X(0.1)); CT.scale(1, 0.7); CT.translate(0, -X(0.1)); paint(K.sand); CT.restore();
      ell(0.04, 0.16, 0.2, 0.1); paint(K.water); shine(-0.02, 0.13, 0.08, 0.025);
      palm(-0.22, 0.14, 0.42, R); palm(0.26, 0.1, 0.36, R);
    },
    meadow(c, s, p, R) {
      puff(0, 0.06, 0.38, 9, R, 0.15); CT.save(); CT.translate(0, X(0.06)); CT.scale(1, 0.72); CT.translate(0, -X(0.06)); paint(K.grass); CT.restore();
      const cols = [K.pink, K.white, K.gold, K.purple, K.red, K.sky];
      for (let k = 0; k < 11; k++) { const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 0.28; flower(Math.cos(a) * r, 0.06 + Math.sin(a) * r * 0.6, 0.022, cols[k % cols.length]); }
    },
    mushrooms(c, s, p) {
      shadow(0.38, 0.38);
      [[-0.2, 0.36, 0.14, 0.22], [0.2, 0.36, 0.12, 0.18], [0.0, 0.38, 0.19, 0.34]].forEach(([x, b, r, h]) => {
        rr(x - r * 0.38, b - h, r * 0.76, h, r * 0.2); paint(K.bone);
        CT.beginPath(); CT.moveTo(X(x - r * 1.2), X(b - h + 0.02)); CT.bezierCurveTo(X(x - r * 1.2), X(b - h - r * 1.4), X(x + r * 1.2), X(b - h - r * 1.4), X(x + r * 1.2), X(b - h + 0.02)); CT.closePath(); paint(K.mush);
        [[-0.5, -0.4], [0.3, -0.7], [0.55, -0.25], [-0.1, -0.9]].forEach(([dx, dy]) => { ell(x + dx * r, b - h + dy * r * 0.8, r * 0.15); paint(K.white, false); });
      });
    },
    crystals(c, s, p) {
      shadow(0.38, 0.38);
      [[-0.2, 0.36, 0.08, 0.36, K.purple, -0.3], [0.2, 0.36, 0.08, 0.32, K.crystal, 0.3], [0.0, 0.38, 0.11, 0.6, K.crystal, 0], [-0.08, 0.38, 0.06, 0.24, K.pink, -0.15], [0.1, 0.38, 0.06, 0.28, K.purple, 0.15]].forEach(([x, b, w, h, cc, t]) => {
        CT.save(); CT.translate(X(x), X(b)); CT.rotate(t);
        path([[-w, 0], [-w, -h * 0.75], [0, -h], [w, -h * 0.75], [w, 0]]); paint(cc);
        CT.save(); CT.globalAlpha = MONO ? 0 : 0.45; path([[-w * 0.5, -0.02], [-w * 0.5, -h * 0.72], [0, -h * 0.9]], false); CT.strokeStyle = '#fff'; CT.stroke(); CT.restore();
        CT.restore();
      });
    },
    fields(c, s, p) {
      CT.save(); CT.translate(0, X(0.04)); CT.transform(1, 0, -0.3, 0.62, 0, 0);
      [[-0.42, -0.4, K.straw], [0.02, -0.4, K.leaf], [-0.42, 0.04, K.leaf2], [0.02, 0.04, K.sand2]].forEach(([x, y, cc], i) => {
        rr(x, y, 0.4, 0.4, 0.05); paint(cc);
        CT.save(); CT.globalAlpha = 0.35; for (let k = 1; k < 5; k++) { CT.beginPath(); CT.moveTo(X(x + 0.03), X(y + k * 0.08)); CT.lineTo(X(x + 0.37), X(y + k * 0.08)); CT.stroke(); } CT.restore();
      });
      CT.restore();
    },

    /* ----- Village ----- */
    house(c, s, p) {
      shadow(0.4, 0.38);
      rr(0.12, -0.38, 0.08, 0.16, 0.02); paint(K.stone2);
      house(0, 0.38, 0.56, 0.36, K.red);
      window_(-0.2, 0.1, 0.12, 0.11); window_(0.1, 0.1, 0.12, 0.11);
      door(-0.06, 0.18, 0.12, 0.2, K.darkwood);
      flower(-0.3, 0.36, 0.018, K.pink); flower(0.3, 0.36, 0.018, K.gold);
    },
    tavern(c, s, p) {
      shadow(0.4, 0.44);
      house(-0.04, 0.38, 0.7, 0.38, K.coral);
      window_(-0.3, 0.08, 0.13, 0.12); window_(0.17, 0.08, 0.13, 0.12);
      door(-0.07, 0.16, 0.14, 0.22, K.darkwood);
      line([[0.34, 0.0], [0.45, 0.0]], 0.018); line([[0.4, 0.0], [0.4, 0.04]], 0.01);
      rr(0.34, 0.04, 0.12, 0.12, 0.03); paint(K.wood);
      rr(0.37, 0.07, 0.05, 0.06, 0.01); paint(K.gold); ell(0.395, 0.07, 0.03, 0.015); paint(K.white, false);
    },
    market(c, s, p) {
      shadow(0.4, 0.42);
      rr(-0.36, 0.06, 0.72, 0.32, 0.03); paint(K.wood);
      line([[-0.32, 0.06], [-0.32, -0.2]], 0.02); line([[0.32, 0.06], [0.32, -0.2]], 0.02);
      for (let k = 0; k < 6; k++) { const x = -0.4 + k * 0.1333; CT.beginPath(); CT.moveTo(X(x), X(-0.3)); CT.lineTo(X(x + 0.1333), X(-0.3)); CT.lineTo(X(x + 0.1333), X(-0.14)); CT.quadraticCurveTo(X(x + 0.0667), X(-0.06), X(x), X(-0.14)); CT.closePath(); paint(k % 2 ? K.white : K.red); }
      [[-0.22, 0.04, K.red], [-0.14, 0.03, K.flame], [0.0, 0.04, K.leaf], [0.1, 0.03, K.purple], [0.2, 0.04, K.flame]].forEach(([x, y, cc]) => { ell(x, y, 0.045); paint(cc); });
    },
    forge(c, s, p) {
      shadow(0.4, 0.42);
      rr(0.12, -0.42, 0.1, 0.22, 0.02); paint(K.stone2);
      puff(0.2, -0.46, 0.05, 5, rng('smoke')); paint(K.smoke);
      house(0, 0.38, 0.62, 0.34, K.stone2, K.stone);
      rr(-0.2, 0.12, 0.2, 0.26, 0.04); paint(K.dark);
      ell(-0.1, 0.3, 0.07, 0.05); paint(K.lava); ell(-0.1, 0.3, 0.035, 0.025); paint(K.flame, false);
      // The anvil.
      path([[0.06, 0.2], [0.3, 0.2], [0.26, 0.26], [0.22, 0.26], [0.24, 0.34], [0.12, 0.34], [0.14, 0.26], [0.1, 0.26]]); paint(K.dark);
      line([[0.18, 0.12], [0.3, 0.02]], 0.02); rr(0.27, -0.02, 0.07, 0.04, 0.01); paint(K.stone2);
    },
    barn(c, s, p) {
      shadow(0.4, 0.4);
      path([[-0.32, 0.38], [-0.32, -0.04], [-0.2, -0.24], [0, -0.34], [0.2, -0.24], [0.32, -0.04], [0.32, 0.38]]); paint(K.red);
      shine(-0.18, -0.16, 0.08, 0.03);
      rr(-0.14, 0.08, 0.28, 0.3, 0.02); paint(K.white);
      line([[-0.14, 0.08], [0.14, 0.38]], 0.014); line([[0.14, 0.08], [-0.14, 0.38]], 0.014);
      rr(-0.06, -0.18, 0.12, 0.1, 0.02); paint(K.straw);
    },
    windmill(c, s, p) {
      shadow(0.42, 0.26);
      path([[-0.16, 0.4], [-0.1, -0.12], [0.1, -0.12], [0.16, 0.4]]); paint(K.cream);
      path([[-0.14, -0.1], [0, -0.26], [0.14, -0.1]]); paint(K.red);
      door(-0.05, 0.24, 0.1, 0.16, K.darkwood); window_(-0.035, 0.04, 0.07, 0.08);
      CT.save(); CT.translate(X(0), X(-0.12)); CT.rotate(0.35);
      for (let k = 0; k < 4; k++) { CT.save(); CT.rotate((k * Math.PI) / 2); rr(-0.03, -0.42, 0.11, 0.34, 0.02); paint(K.wall); line([[0.0, -0.42], [0.0, -0.06]], 0.012); CT.restore(); }
      CT.restore();
      ell(0, -0.12, 0.035); paint(K.wood);
    },
    well(c, s, p) {
      shadow(0.4, 0.3);
      line([[-0.2, 0.18], [-0.2, -0.18]], 0.035); line([[0.2, 0.18], [0.2, -0.18]], 0.035);
      path([[-0.3, -0.14], [0, -0.38], [0.3, -0.14]]); paint(K.red);
      line([[0, -0.14], [0, 0.0]], 0.01); rr(-0.05, 0.0, 0.1, 0.08, 0.02); paint(K.wood);
      ell(0, 0.16, 0.26, 0.08); paint(K.dark);
      CT.beginPath(); CT.moveTo(X(-0.26), X(0.16)); CT.lineTo(X(-0.26), X(0.32)); CT.ellipse(0, X(0.32), X(0.26), X(0.08), 0, Math.PI, 0, true); CT.lineTo(X(0.26), X(0.16)); CT.ellipse(0, X(0.16), X(0.26), X(0.08), 0, 0, Math.PI, false); CT.closePath(); paint(K.stone);
      [-0.13, 0.0, 0.13].forEach((x) => line([[x, 0.22], [x, 0.38]], 0.01));
    },
    fountain(c, s, p, R) {
      shadow(0.4, 0.42);
      ell(0, 0.28, 0.4, 0.12); paint(K.stone);
      ell(0, 0.25, 0.33, 0.08); paint(K.water);
      rr(-0.04, -0.02, 0.08, 0.26, 0.02); paint(K.stone2);
      ell(0, -0.02, 0.16, 0.05); paint(K.stone);
      CT.save(); CT.strokeStyle = MONO ? CT.strokeStyle : K.deep; CT.lineWidth = X(0.02);
      [[-1, 1], [1, 1]].forEach(([d]) => { CT.beginPath(); CT.moveTo(X(0), X(-0.12)); CT.quadraticCurveTo(X(0.18 * d), X(-0.34), X(0.26 * d), X(0.18)); CT.stroke(); });
      CT.beginPath(); CT.moveTo(X(0), X(-0.06)); CT.lineTo(X(0), X(-0.3)); CT.stroke(); CT.restore();
      ell(0, -0.32, 0.03); paint(K.sky);
    },
    church(c, s, p) {
      shadow(0.4, 0.44);
      house(-0.1, 0.38, 0.5, 0.3, K.blue);
      rr(0.14, -0.2, 0.2, 0.58, 0.02); paint(K.wall);
      path([[0.1, -0.18], [0.24, -0.42], [0.38, -0.18]]); paint(K.blue);
      line([[0.24, -0.42], [0.24, -0.5]], 0.016); line([[0.205, -0.47], [0.275, -0.47]], 0.016);
      ell(0.24, -0.06, 0.045); paint(K.glass);
      door(-0.17, 0.2, 0.14, 0.18, K.darkwood); ell(-0.1, 0.06, 0.05); paint(K.pink);
      door(0.2, 0.18, 0.08, 0.12, K.dark);
    },

    /* ----- Castles and wonders ----- */
    castle(c, s, p) {
      shadow(0.4, 0.46);
      const crenel = (x, y, w, n) => { for (let k = 0; k < n; k++) { rr(x + (k * w) / n + 0.005, y - 0.05, w / n - 0.02, 0.06, 0.01); paint(K.stone); } };
      rr(-0.3, -0.06, 0.6, 0.44, 0.02); paint(K.stone); crenel(-0.3, -0.06, 0.6, 5);
      [[-0.38, -0.2], [0.24, -0.2]].forEach(([x, y]) => {
        rr(x, y, 0.14, 0.58, 0.02); paint(K.stone2);
        path([[x - 0.03, y + 0.01], [x + 0.07, y - 0.2], [x + 0.17, y + 0.01]]); paint(K.blue);
        flag(x + 0.07, y - 0.2, 0.12, K.red); window_(x + 0.04, y + 0.1, 0.06, 0.09);
      });
      door(-0.09, 0.14, 0.18, 0.24, K.darkwood); line([[0, 0.17], [0, 0.38]], 0.012);
      window_(-0.22, 0.06, 0.07, 0.09); window_(0.15, 0.06, 0.07, 0.09);
    },
    tower(c, s, p) {
      shadow(0.42, 0.26);
      rr(-0.16, -0.2, 0.32, 0.6, 0.03); paint(K.stone);
      rr(-0.21, -0.3, 0.42, 0.12, 0.03); paint(K.stone2);
      for (let k = 0; k < 4; k++) { rr(-0.21 + k * 0.115, -0.38, 0.07, 0.1, 0.015); paint(K.stone2); }
      window_(-0.05, -0.08, 0.1, 0.12); door(-0.07, 0.2, 0.14, 0.2, K.darkwood);
      flag(0.0, -0.38, 0.12, K.red);
      [[-0.12, 0.08], [0.1, 0.14], [-0.08, 0.3]].forEach(([x, y]) => { rr(x, y, 0.06, 0.03, 0.01); CT.stroke(); });
    },
    wizard(c, s, p) {
      shadow(0.42, 0.24);
      path([[-0.14, 0.4], [-0.1, -0.08], [0.1, -0.08], [0.14, 0.4]]); paint(K.purple);
      CT.beginPath(); CT.moveTo(X(-0.2), X(-0.06)); CT.lineTo(X(0.02), X(-0.48)); CT.quadraticCurveTo(X(0.12), X(-0.42), X(0.2), X(-0.5)); CT.quadraticCurveTo(X(0.12), X(-0.36), X(0.2), X(-0.06)); CT.closePath(); paint(K.violet);
      const star = (x, y, r) => { CT.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr2 = k % 2 ? r * 0.45 : r; CT.lineTo(X(x + Math.cos(a) * rr2), X(y + Math.sin(a) * rr2)); } CT.closePath(); paint(K.gold, false); };
      star(-0.02, -0.22, 0.04); star(0.08, -0.12, 0.025); star(0.24, -0.5, 0.035);
      window_(-0.04, 0.04, 0.08, 0.1); door(-0.06, 0.24, 0.12, 0.16, K.darkwood);
    },
    temple(c, s, p) {
      shadow(0.42, 0.44);
      rr(-0.42, 0.3, 0.84, 0.08, 0.02); paint(K.stone); rr(-0.38, 0.24, 0.76, 0.07, 0.02); paint(K.cream);
      [-0.3, -0.15, 0, 0.15, 0.3].forEach((x) => { rr(x - 0.045, -0.06, 0.09, 0.3, 0.02); paint(K.cream); line([[x, -0.03], [x, 0.21]], 0.008); });
      rr(-0.38, -0.12, 0.76, 0.07, 0.02); paint(K.cream);
      path([[-0.42, -0.12], [0, -0.36], [0.42, -0.12]]); paint(K.gold);
      ell(0, -0.2, 0.04); paint(K.red);
    },
    ruins(c, s, p, R) {
      shadow(0.38, 0.44);
      rr(-0.34, -0.24, 0.12, 0.6, 0.02); paint(K.stone); rr(-0.37, -0.28, 0.18, 0.06, 0.02); paint(K.stone2);
      path([[0.1, 0.36], [0.1, -0.06], [0.16, -0.1], [0.2, -0.02], [0.24, -0.08], [0.24, 0.36]]); paint(K.stone);
      rr(-0.18, 0.24, 0.24, 0.1, 0.03); paint(K.stone2); CT.save(); CT.translate(X(0.33), X(0.3)); CT.rotate(0.4); rr(-0.06, -0.04, 0.14, 0.08, 0.02); paint(K.stone2); CT.restore();
      ell(-0.28, -0.24, 0.08, 0.035); paint(K.moss); ell(0.17, 0.08, 0.06, 0.03); paint(K.moss); flower(-0.04, 0.22, 0.016, K.pink);
    },
    altar(c, s, p) {
      shadow(0.4, 0.4);
      rr(-0.34, 0.06, 0.68, 0.1, 0.03); paint(K.stone);
      rr(-0.26, 0.15, 0.16, 0.24, 0.02); paint(K.stone2); rr(0.1, 0.15, 0.16, 0.24, 0.02); paint(K.stone2);
      [-0.24, 0.24].forEach((x) => { rr(x - 0.03, -0.08, 0.06, 0.14, 0.015); paint(K.cream); path([[x, -0.18], [x + 0.025, -0.1], [x, -0.08], [x - 0.025, -0.1]]); paint(K.flame); });
      path([[0, -0.2], [0.08, -0.08], [0, 0.04], [-0.08, -0.08]]); paint(K.crystal); shine(-0.02, -0.1, 0.02, 0.03);
    },
    statue(c, s, p) {
      shadow(0.42, 0.3);
      rr(-0.2, 0.18, 0.4, 0.22, 0.03); paint(K.stone2); rr(-0.24, 0.14, 0.48, 0.06, 0.02); paint(K.stone);
      // A little knight with his sword.
      path([[-0.1, 0.14], [-0.12, -0.12], [0.12, -0.12], [0.1, 0.14]]); paint(K.stone);
      ell(0, -0.22, 0.09); paint(K.stone); rr(-0.09, -0.24, 0.18, 0.04, 0.01); paint(K.stone2);
      line([[0.16, 0.08], [0.16, -0.34]], 0.024); line([[0.11, -0.06], [0.21, -0.06]], 0.02);
      shine(-0.04, -0.26, 0.03, 0.02);
    },
    stones(c, s, p) {
      ell(0, 0.14, 0.44, 0.22); paint(K.grass);
      [[-0.3, 0.1, 0.07, 0.24], [-0.14, -0.02, 0.06, 0.22], [0.06, -0.04, 0.07, 0.26], [0.26, 0.04, 0.06, 0.22], [-0.04, 0.3, 0.07, 0.24], [0.24, 0.28, 0.06, 0.2], [-0.24, 0.32, 0.06, 0.2]].forEach(([x, y, w, h]) => {
        rr(x - w, y - h, w * 2, h, w * 0.7); paint(K.stone2); shine(x - w * 0.4, y - h * 0.8, w * 0.3, h * 0.12);
      });
    },
    portal(c, s, p) {
      shadow(0.42, 0.36);
      ell(0, -0.02, 0.32, 0.38); paint(K.stone2);
      ell(0, -0.02, 0.22, 0.28); paint(K.violet);
      CT.save(); CT.globalAlpha = MONO ? 0.5 : 0.9; CT.strokeStyle = MONO ? CT.strokeStyle : K.pink; CT.lineWidth = X(0.03);
      CT.beginPath(); for (let t = 0; t < 14; t += 0.2) { const r = 0.02 + t * 0.013; CT.lineTo(X(Math.cos(t) * r), X(-0.02 + Math.sin(t) * r * 1.25)); } CT.stroke(); CT.restore();
      [[-0.32, -0.3], [0.3, -0.34], [0.36, 0.2]].forEach(([x, y]) => { ell(x, y, 0.02); paint(K.crystal, false); });
    },
    grave(c, s, p) {
      shadow(0.4, 0.3);
      ell(0, 0.34, 0.3, 0.08); paint(K.grass);
      CT.beginPath(); CT.moveTo(X(-0.18), X(0.34)); CT.lineTo(X(-0.18), X(-0.12)); CT.arc(0, X(-0.12), X(0.18), Math.PI, 0); CT.lineTo(X(0.18), X(0.34)); CT.closePath(); paint(K.stone);
      line([[0, -0.2], [0, 0.06]], 0.024); line([[-0.08, -0.12], [0.08, -0.12]], 0.024);
      shine(-0.08, -0.22, 0.04, 0.03); flower(0.24, 0.3, 0.02, K.pink); flower(-0.24, 0.32, 0.016, K.white);
    },

    /* ----- Roads and adventure ----- */
    bridge(c, s, p) {
      ell(0, 0.22, 0.46, 0.14); paint(K.water); waves(0.26, -0.3, 0.3, 2);
      CT.beginPath(); CT.moveTo(X(-0.46), X(0.24)); CT.lineTo(X(-0.46), X(-0.02)); CT.quadraticCurveTo(X(0), X(-0.24), X(0.46), X(-0.02)); CT.lineTo(X(0.46), X(0.24)); CT.lineTo(X(0.26), X(0.24));
      CT.quadraticCurveTo(X(0), X(-0.06), X(-0.26), X(0.24)); CT.closePath(); paint(K.stone);
      CT.beginPath(); CT.moveTo(X(-0.46), X(-0.08)); CT.quadraticCurveTo(X(0), X(-0.3), X(0.46), X(-0.08)); CT.lineTo(X(0.46), X(-0.02)); CT.quadraticCurveTo(X(0), X(-0.24), X(-0.46), X(-0.02)); CT.closePath(); paint(K.stone2);
    },
    door(c, s, p) {
      shadow(0.42, 0.4);
      rr(-0.38, -0.28, 0.76, 0.68, 0.04); paint(K.stone);
      door(-0.22, -0.18, 0.44, 0.58, K.wood);
      line([[0, 0.04], [0, 0.4]], 0.012); [0.1, 0.26].forEach((y) => line([[-0.22, y], [0.22, y]], 0.016));
      ell(0.08, 0.2, 0.02); paint(K.gold); ell(-0.08, 0.2, 0.02); paint(K.gold);
      for (let k = 0; k < 5; k++) { rr(-0.38 + k * 0.17, -0.36, 0.08, 0.09, 0.015); paint(K.stone); }
    },
    stairs(c, s, p) {
      shadow(0.4, 0.42);
      rr(-0.36, -0.32, 0.72, 0.7, 0.06); paint(K.stone2);
      rr(-0.26, -0.24, 0.52, 0.54, 0.03); paint(K.dark);
      [[0.18, K.stone], [0.08, K.stone], [-0.02, K.stone2], [-0.12, K.stone2]].forEach(([y, cc], i) => { rr(-0.26 + i * 0.03, y, 0.52 - i * 0.06, 0.1, 0.015); paint(cc); });
    },
    tent(c, s, p) {
      shadow(0.4, 0.42);
      path([[-0.38, 0.36], [0, -0.3], [0.38, 0.36]]); paint(K.red);
      CT.save(); path([[-0.38, 0.36], [0, -0.3], [0.38, 0.36]]); CT.clip();
      [-0.2, 0.0, 0.2].forEach((x) => { path([[x - 0.05, 0.4], [0, -0.32], [x + 0.05, 0.4]]); paint(K.cream, false); }); CT.restore();
      path([[-0.38, 0.36], [0, -0.3], [0.38, 0.36]]); CT.stroke();
      path([[-0.08, 0.36], [0, 0.08], [0.08, 0.36]]); paint(K.dark);
      flag(0, -0.3, 0.12, K.gold);
    },
    fire(c, s, p) {
      shadow(0.38, 0.32);
      [[-0.22, 0.3, 0.24, 0.3], [0.22, 0.3, -0.24, 0.3]].forEach(([x0, y0, x1]) => { CT.save(); CT.lineWidth = X(0.07); CT.strokeStyle = MONO ? CT.strokeStyle : K.darkwood; line([[x0, y0], [x1 * 0.4, 0.18]]); CT.restore(); });
      const flame = (h, w, cc) => { CT.beginPath(); CT.moveTo(X(0), X(0.28 - h)); CT.bezierCurveTo(X(w * 0.9), X(0.28 - h * 0.6), X(w), X(0.26), X(0), X(0.28)); CT.bezierCurveTo(X(-w), X(0.26), X(-w * 0.9), X(0.28 - h * 0.5), X(0), X(0.28 - h)); CT.closePath(); paint(cc); };
      flame(0.56, 0.24, K.red); flame(0.4, 0.17, K.lava); flame(0.24, 0.1, K.flame);
      [[-0.12, 0.34], [0.12, 0.35], [0.0, 0.37]].forEach(([x, y]) => { ell(x, y, 0.06, 0.035); paint(K.stone2); });
    },
    mine(c, s, p) {
      shadow(0.4, 0.44);
      CT.beginPath(); CT.moveTo(X(-0.46), X(0.36)); CT.bezierCurveTo(X(-0.4), X(-0.34), X(0.4), X(-0.34), X(0.46), X(0.36)); CT.closePath(); paint(K.mud);
      rr(-0.18, -0.04, 0.36, 0.4, 0.02); paint(K.dark);
      line([[-0.18, 0.36], [-0.18, -0.06]], 0.04); line([[0.18, 0.36], [0.18, -0.06]], 0.04); line([[-0.22, -0.06], [0.22, -0.06]], 0.045);
      line([[-0.08, 0.36], [-0.04, 0.1]], 0.012); line([[0.08, 0.36], [0.04, 0.1]], 0.012);
      ell(0.3, 0.24, 0.05); paint(K.crystal); ell(-0.32, 0.2, 0.04); paint(K.gold);
    },
    ship(c, s, p) {
      ell(0, 0.32, 0.44, 0.08); paint(K.water);
      CT.beginPath(); CT.moveTo(X(-0.4), X(0.1)); CT.lineTo(X(0.4), X(0.1)); CT.quadraticCurveTo(X(0.32), X(0.32), X(0.2), X(0.32)); CT.lineTo(X(-0.24), X(0.32)); CT.quadraticCurveTo(X(-0.36), X(0.3), X(-0.4), X(0.1)); CT.closePath(); paint(K.wood);
      line([[-0.36, 0.17], [0.36, 0.17]], 0.01); [-0.2, -0.04, 0.12].forEach((x) => { ell(x, 0.24, 0.022); paint(K.dark); });
      line([[0, 0.1], [0, -0.44]], 0.022);
      CT.beginPath(); CT.moveTo(X(-0.26), X(-0.36)); CT.quadraticCurveTo(X(0), X(-0.3), X(0.26), X(-0.36)); CT.quadraticCurveTo(X(0.32), X(-0.12), X(0.26), X(0.04)); CT.quadraticCurveTo(X(0), X(0.0), X(-0.26), X(0.04)); CT.quadraticCurveTo(X(-0.32), X(-0.14), X(-0.26), X(-0.36)); CT.closePath(); paint(K.cream);
      flag(0, -0.44, 0.1, K.red);
    },
    harbor(c, s, p) {
      rr(-0.46, -0.3, 0.92, 0.7, 0.1); paint(K.water); waves(0.2, -0.4, -0.05, 2);
      rr(-0.08, -0.34, 0.16, 0.66, 0.02); paint(K.wood);
      for (let k = 0; k < 6; k++) line([[-0.08, -0.28 + k * 0.1], [0.08, -0.28 + k * 0.1]], 0.008);
      [[-0.12, -0.2], [0.12, -0.2], [-0.12, 0.12], [0.12, 0.12]].forEach(([x, y]) => { ell(x, y, 0.035); paint(K.darkwood); });
      CT.beginPath(); CT.moveTo(X(0.16), X(0.02)); CT.lineTo(X(0.4), X(0.02)); CT.quadraticCurveTo(X(0.36), X(0.12), X(0.3), X(0.12)); CT.lineTo(X(0.22), X(0.12)); CT.quadraticCurveTo(X(0.18), X(0.1), X(0.16), X(0.02)); CT.closePath(); paint(K.red);
      line([[0.28, 0.02], [0.28, -0.14]], 0.012); path([[0.28, -0.14], [0.37, 0.0], [0.28, 0.0]]); paint(K.white);
    },
    lighthouse(c, s, p) {
      ell(0, 0.36, 0.38, 0.08); paint(K.stone2);
      CT.save(); CT.globalAlpha = MONO ? 0.3 : 0.55; path([[0, -0.3], [-0.5, -0.46], [-0.5, -0.14]]); CT.fillStyle = col(K.glass); CT.fill(); path([[0, -0.3], [0.5, -0.46], [0.5, -0.14]]); CT.fill(); CT.restore();
      path([[-0.14, 0.36], [-0.09, -0.2], [0.09, -0.2], [0.14, 0.36]]); paint(K.white);
      CT.save(); path([[-0.14, 0.36], [-0.09, -0.2], [0.09, -0.2], [0.14, 0.36]]); CT.clip(); [0.18, -0.02].forEach((y) => { rr(-0.2, y, 0.4, 0.1, 0); paint(K.red, false); }); CT.restore();
      path([[-0.14, 0.36], [-0.09, -0.2], [0.09, -0.2], [0.14, 0.36]]); CT.stroke();
      rr(-0.1, -0.36, 0.2, 0.16, 0.03); paint(K.glass);
      path([[-0.13, -0.36], [0, -0.48], [0.13, -0.36]]); paint(K.red);
      door(-0.04, 0.24, 0.08, 0.12, K.darkwood);
    },
    signpost(c, s, p) {
      shadow(0.42, 0.2);
      rr(-0.03, -0.3, 0.06, 0.72, 0.02); paint(K.wood);
      path([[-0.26, -0.24], [0.2, -0.24], [0.28, -0.17], [0.2, -0.1], [-0.26, -0.1]]); paint(K.cream);
      path([[0.26, 0.0], [-0.2, 0.0], [-0.28, 0.07], [-0.2, 0.14], [0.26, 0.14]]); paint(K.cream);
      line([[-0.18, -0.17], [0.12, -0.17]], 0.012); line([[-0.12, 0.07], [0.18, 0.07]], 0.012);
      ell(0, 0.4, 0.12, 0.03); paint(K.grass);
    },
    cart(c, s, p, R) {
      shadow(0.4, 0.42);
      puff(0.0, -0.14, 0.18, 7, R); CT.save(); CT.translate(0, X(-0.14)); CT.scale(1.5, 0.8); CT.translate(0, X(0.14)); paint(K.straw); CT.restore();
      rr(-0.36, -0.06, 0.62, 0.22, 0.03); paint(K.wood); line([[-0.36, 0.05], [0.26, 0.05]], 0.01);
      line([[0.26, 0.08], [0.46, 0.18]], 0.024);
      [[-0.22, 0.26], [0.14, 0.26]].forEach(([x, y]) => { ell(x, y, 0.12); paint(K.darkwood); ell(x, y, 0.03); paint(K.gold); [0, 1, 2, 3].forEach((k) => line([[x + Math.cos((k * Math.PI) / 4) * 0.1, y + Math.sin((k * Math.PI) / 4) * 0.1], [x - Math.cos((k * Math.PI) / 4) * 0.1, y - Math.sin((k * Math.PI) / 4) * 0.1]], 0.008)); });
    },
    chest(c, s, p) {
      shadow(0.38, 0.4);
      [[-0.34, 0.32], [0.3, 0.34], [0.36, 0.26]].forEach(([x, y]) => { ell(x, y, 0.05, 0.03); paint(K.gold); });
      rr(-0.3, -0.02, 0.6, 0.34, 0.03); paint(K.wood);
      CT.beginPath(); CT.moveTo(X(-0.3), X(-0.02)); CT.lineTo(X(-0.3), X(-0.12)); CT.bezierCurveTo(X(-0.3), X(-0.34), X(0.3), X(-0.34), X(0.3), X(-0.12)); CT.lineTo(X(0.3), X(-0.02)); CT.closePath(); paint(K.wood);
      [-0.22, 0.22].forEach((x) => { rr(x - 0.03, -0.24, 0.06, 0.56, 0.01); paint(K.gold); });
      rr(-0.06, -0.06, 0.12, 0.12, 0.02); paint(K.gold); ell(0, 0.0, 0.015); paint(K.dark, false);
      shine(-0.12, -0.2, 0.06, 0.025);
    },
    bones(c, s, p) {
      shadow(0.38, 0.4);
      const bone = (x0, y0, x1, y1) => {
        const L = Math.hypot(x1 - x0, y1 - y0);
        CT.save(); CT.translate(X((x0 + x1) / 2), X((y0 + y1) / 2)); CT.rotate(Math.atan2(y1 - y0, x1 - x0));
        [[-L / 2, -0.035], [-L / 2, 0.035], [L / 2, -0.035], [L / 2, 0.035]].forEach(([x, y]) => { ell(x, y, 0.04); paint(K.bone); });
        rr(-L / 2, -0.035, L, 0.07, 0.02); paint(K.bone, false);
        line([[-L / 2 + 0.03, -0.035], [L / 2 - 0.03, -0.035]]); line([[-L / 2 + 0.03, 0.035], [L / 2 - 0.03, 0.035]]);
        CT.restore();
      };
      bone(-0.32, 0.32, 0.3, 0.12); bone(-0.3, 0.12, 0.32, 0.32);
      ell(0, -0.06, 0.2, 0.18); paint(K.bone); rr(-0.11, 0.06, 0.22, 0.12, 0.04); paint(K.bone);
      ell(-0.08, -0.06, 0.05); paint(K.dark); ell(0.08, -0.06, 0.05); paint(K.dark); path([[0, 0.02], [-0.02, 0.06], [0.02, 0.06]]); paint(K.dark);
      [-0.05, 0, 0.05].forEach((x) => line([[x, 0.1], [x, 0.17]], 0.008));
    },

    /* ----- Nature, the second fifty ----- */
    bush(c, s, p, R) {
      shadow(0.34, 0.36);
      puff(-0.15, 0.14, 0.17, 7, R); paint(K.leaf2); puff(0.15, 0.14, 0.16, 7, R); paint(K.leaf2);
      puff(0, 0.04, 0.21, 8, R); paint(K.leaf); shine(-0.08, -0.08, 0.07, 0.035);
      [[-0.14, 0.06], [0.08, -0.04], [0.18, 0.14], [-0.02, 0.16], [-0.24, 0.18]].forEach(([x, y]) => { ell(x, y, 0.03); paint(K.red); });
    },
    deadtree(c, s, p, R) {
      shadow(0.42, 0.28);
      limb([[-0.2, -0.14], [-0.3, -0.3]], 0.035, K.mud); limb([[0.16, -0.2], [0.26, -0.34]], 0.03, K.mud);
      limb([[0, 0.02], [-0.2, -0.14], [-0.14, -0.32]], 0.05, K.mud); limb([[0.01, -0.06], [0.16, -0.2], [0.12, -0.38]], 0.045, K.mud);
      limb([[0, 0.38], [0, 0.04], [-0.02, -0.18], [0.02, -0.4]], 0.1, K.mud);
      limb([[-0.04, 0.38], [-0.16, 0.42]], 0.05, K.mud); limb([[0.04, 0.38], [0.17, 0.42]], 0.05, K.mud);
      ell(-0.01, 0.14, 0.03, 0.045); paint(K.dark);
      ell(0.0, 0.42, 0.2, 0.03); paint(K.grass, false);
    },
    cactus(c, s, p) {
      shadow(0.4, 0.3);
      ell(0, 0.38, 0.3, 0.06); paint(K.sand);
      limb([[-0.06, 0.1], [-0.2, 0.1], [-0.2, -0.12]], 0.09, K.leaf2); limb([[0.06, 0.02], [0.19, 0.02], [0.19, -0.2]], 0.08, K.leaf2);
      limb([[0, 0.36], [0, -0.28]], 0.15, K.leaf2);
      CT.save(); CT.globalAlpha = 0.4; [-0.035, 0.035].forEach((x) => line([[x, 0.3], [x, -0.26]], 0.008)); CT.restore();
      flower(0, -0.37, 0.022, K.pink); flower(0.19, -0.27, 0.016, K.gold);
    },
    grove(c, s, p, R) {
      shadow(0.4, 0.4);
      roundTree(0.0, -0.12, 0.16, R, K.leaf2);
      roundTree(-0.2, 0.06, 0.15, R, K.leaf); roundTree(0.2, 0.08, 0.14, R, K.moss);
      flower(-0.3, 0.36, 0.018, K.pink); flower(0.3, 0.34, 0.016, K.gold); flower(0.22, 0.4, 0.014, K.white);
    },
    jungle(c, s, p, R) {
      shadow(0.4, 0.44);
      puff(-0.2, -0.14, 0.18, 7, R); paint(K.pine); puff(0.22, -0.16, 0.17, 7, R); paint(K.leaf2);
      palm(-0.02, 0.22, 0.52, R);
      line([[-0.28, -0.02], [-0.3, 0.12], [-0.26, 0.2]], 0.012); line([[0.3, -0.04], [0.28, 0.1]], 0.012);
      leafAt(-0.28, 0.26, 0.17, 0.06, -0.5, K.leaf); leafAt(0.28, 0.26, 0.17, 0.06, 0.5, K.leaf);
      leafAt(-0.12, 0.32, 0.15, 0.05, -0.15, K.leaf2); leafAt(0.13, 0.32, 0.15, 0.05, 0.2, K.leaf2);
      flower(-0.22, 0.1, 0.024, K.red); flower(0.24, 0.12, 0.02, K.pink); flower(0.06, 0.38, 0.018, K.gold);
    },
    haunted(c, s, p, R) {
      ell(0, 0.34, 0.44, 0.09); paint(K.purple);
      const dead = (x, k) => {
        limb([[x, -0.04 * k], [x - 0.14 * k, -0.18 * k], [x - 0.2 * k, -0.3 * k]], 0.04, K.dark);
        limb([[x, -0.1 * k], [x + 0.12 * k, -0.26 * k], [x + 0.1 * k, -0.36 * k]], 0.035, K.dark);
        limb([[x, 0.34], [x, -0.1 * k], [x + 0.02, -0.4 * k]], 0.09, K.dark);
      };
      dead(-0.2, 1); dead(0.22, 0.8);
      ell(-0.23, 0.08, 0.016); paint(K.glass, false); ell(-0.17, 0.08, 0.016); paint(K.glass, false);
      const gx = 0.1, gy = 0.06, r = 0.09;
      CT.beginPath(); CT.moveTo(X(gx - r), X(gy + r)); CT.lineTo(X(gx - r), X(gy)); CT.arc(X(gx), X(gy), X(r), Math.PI, 0);
      CT.lineTo(X(gx + r), X(gy + r)); CT.quadraticCurveTo(X(gx + r * 0.66), X(gy + r * 0.6), X(gx + r * 0.33), X(gy + r));
      CT.quadraticCurveTo(X(gx), X(gy + r * 0.6), X(gx - r * 0.33), X(gy + r)); CT.quadraticCurveTo(X(gx - r * 0.66), X(gy + r * 0.6), X(gx - r), X(gy + r)); CT.closePath(); paint(K.white);
      ell(gx - 0.03, gy, 0.014, 0.02); paint(K.dark, false); ell(gx + 0.03, gy, 0.014, 0.02); paint(K.dark, false);
      CT.beginPath(); CT.arc(X(0.38), X(-0.4), X(0.06), 0, Math.PI * 2); paint(K.glass); ell(0.405, -0.42, 0.045); paint(K.purple, false);
    },
    worldtree(c, s, p, R) {
      shadow(0.42, 0.42);
      limb([[-0.06, 0.34], [-0.22, 0.38], [-0.34, 0.42]], 0.05, K.wood); limb([[0.06, 0.34], [0.22, 0.38], [0.34, 0.42]], 0.05, K.wood);
      path([[-0.14, 0.42], [-0.08, 0.06], [-0.07, -0.1], [0.07, -0.1], [0.08, 0.06], [0.14, 0.42]]); paint(K.wood);
      puff(0, -0.12, 0.3, 11, R, 0.12); paint(K.leaf2);
      puff(-0.03, -0.16, 0.19, 8, R); paint(K.leaf); shine(-0.12, -0.28, 0.07, 0.04);
      door(-0.04, 0.26, 0.08, 0.16, K.darkwood); window_(0.03, 0.18, 0.04, 0.04);
      [[-0.2, -0.04], [0.18, -0.24], [0.06, 0.02], [-0.08, -0.34], [0.24, 0.0], [-0.24, -0.24]].forEach(([x, y]) => star(x, y, 0.025, K.glass));
    },
    pond(c, s, p, R) {
      ell(0, 0.12, 0.38, 0.24); paint(K.grass);
      ell(0, 0.12, 0.28, 0.16); paint(K.water); ell(0.02, 0.14, 0.18, 0.09); CT.fillStyle = col(K.sky); CT.fill();
      ell(-0.12, 0.16, 0.06, 0.035); paint(K.leaf2); flower(-0.11, 0.15, 0.014, K.pink);
      ell(0.1, 0.1, 0.06, 0.035); paint(K.white); ell(0.15, 0.05, 0.028); paint(K.white); path([[0.175, 0.045], [0.21, 0.055], [0.175, 0.065]]); paint(K.flame);
      ell(0.155, 0.045, 0.006); paint(K.dark, false);
      [[-0.3, 0.1], [-0.26, 0.06]].forEach(([x, y]) => { line([[x, y + 0.08], [x, y - 0.08]], 0.014); ell(x, y - 0.1, 0.016, 0.04); paint(K.darkwood); });
    },
    peak(c, s, p) {
      shadow(0.38, 0.4);
      peakAt(0, 0.38, 0.38, 0.78, K.stone);
      flag(0, -0.38, 0.1, K.red);
      ell(-0.3, 0.36, 0.06, 0.03); paint(K.leaf); ell(0.3, 0.37, 0.05, 0.025); paint(K.leaf);
    },
    range(c, s, p) {
      shadow(0.38, 0.46);
      peakAt(-0.3, 0.18, 0.18, 0.42, K.stone2); peakAt(0.02, 0.18, 0.2, 0.52, K.stone2); peakAt(0.32, 0.18, 0.17, 0.4, K.stone2);
      peakAt(-0.16, 0.38, 0.22, 0.44, K.stone); peakAt(0.2, 0.38, 0.24, 0.48, K.stone);
    },
    canyon(c, s, p) {
      shadow(0.38, 0.46);
      path([[-0.1, -0.26], [0.08, -0.26], [0.2, 0.38], [-0.18, 0.38]]); paint(K.water); waves(0.24, -0.1, 0.1, 2);
      path([[-0.46, 0.36], [-0.46, -0.18], [-0.32, -0.26], [-0.12, -0.24], [-0.06, -0.06], [-0.14, 0.12], [-0.12, 0.36]]); paint(K.coral);
      path([[0.46, 0.36], [0.46, -0.2], [0.3, -0.28], [0.1, -0.24], [0.08, -0.04], [0.16, 0.16], [0.14, 0.36]]); paint(K.sand2);
      CT.save(); CT.globalAlpha = 0.45; [[-0.44, -0.08, -0.1], [-0.44, 0.06, -0.12], [-0.44, 0.22, -0.13]].forEach(([a, y, b]) => line([[a, y], [b, y]], 0.008));
      [[0.44, -0.08, 0.1], [0.44, 0.08, 0.15], [0.44, 0.24, 0.15]].forEach(([a, y, b]) => line([[a, y], [b, y]], 0.008)); CT.restore();
      ell(-0.36, -0.26, 0.07, 0.03); paint(K.leaf); ell(0.36, -0.28, 0.06, 0.025); paint(K.leaf);
    },
    glacier(c, s, p) {
      ell(0, 0.32, 0.46, 0.1); paint(K.water);
      path([[-0.42, 0.3], [-0.42, -0.06], [-0.26, -0.2], [-0.1, -0.1], [0.06, -0.3], [0.24, -0.14], [0.42, -0.2], [0.42, 0.3]]); paint(K.ice);
      path([[-0.42, -0.06], [-0.26, -0.2], [-0.1, -0.1], [0.06, -0.3], [0.24, -0.14], [0.42, -0.2], [0.42, -0.1], [0.24, -0.04], [0.06, -0.18], [-0.1, 0.0], [-0.26, -0.1], [-0.42, 0.04]]); paint(K.snow);
      CT.save(); CT.strokeStyle = MONO ? CT.strokeStyle : K.deep; [[-0.2, 0.0, 0.26], [0.04, -0.1, 0.24], [0.26, -0.02, 0.24]].forEach(([x, y, b]) => line([[x, y], [x + 0.02, (y + b) / 2], [x - 0.01, b]], 0.01)); CT.restore();
      ell(0.3, 0.37, 0.08, 0.025); paint(K.white); ell(-0.3, 0.38, 0.05, 0.02); paint(K.white);
    },
    hotspring(c, s, p, R) {
      for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; ell(Math.cos(a) * 0.33, 0.16 + Math.sin(a) * 0.17, 0.08, 0.055); paint(k % 2 ? K.stone : K.stone2); }
      ell(0, 0.16, 0.3, 0.15); paint(K.teal); ell(0.02, 0.17, 0.2, 0.09); CT.fillStyle = col(K.crystal); CT.fill();
      CT.save(); CT.globalAlpha = MONO ? 0.5 : 0.85; CT.strokeStyle = MONO ? CT.strokeStyle : K.white; CT.lineWidth = X(0.03);
      [-0.12, 0.02, 0.16].forEach((x) => { CT.beginPath(); CT.moveTo(X(x), X(0.06)); CT.bezierCurveTo(X(x - 0.06), X(-0.04), X(x + 0.06), X(-0.12), X(x), X(-0.24)); CT.stroke(); }); CT.restore();
      flower(-0.34, -0.02, 0.018, K.pink); flower(0.36, 0.0, 0.016, K.white);
    },
    beach(c, s, p, R) {
      rr(-0.46, -0.4, 0.92, 0.5, 0.12); paint(K.water); waves(-0.24, -0.36, 0.3, 3);
      CT.beginPath(); CT.moveTo(X(-0.46), X(0.06)); CT.bezierCurveTo(X(-0.2), X(-0.06), X(0.2), X(0.14), X(0.46), X(-0.02)); CT.lineTo(X(0.46), X(0.32)); CT.quadraticCurveTo(X(0.46), X(0.4), X(0.36), X(0.4)); CT.lineTo(X(-0.36), X(0.4)); CT.quadraticCurveTo(X(-0.46), X(0.4), X(-0.46), X(0.32)); CT.closePath(); paint(K.sand);
      palm(0.24, 0.32, 0.4, R);
      star(-0.18, 0.24, 0.05, K.coral, true);
      CT.beginPath(); CT.moveTo(X(-0.02), X(0.32)); CT.arc(X(0.02), X(0.32), X(0.045), Math.PI, 0); CT.closePath(); paint(K.pink);
      CT.save(); CT.beginPath(); CT.moveTo(X(-0.34), X(0.04)); CT.bezierCurveTo(X(-0.2), X(-0.04), X(0.2), X(0.14), X(0.44), X(0.0)); CT.strokeStyle = MONO ? CT.strokeStyle : K.white; CT.lineWidth = X(0.02); CT.stroke(); CT.restore();
    },

    /* ----- Village, the second fifty ----- */
    hut(c, s, p) {
      shadow(0.4, 0.34);
      rr(-0.22, 0.02, 0.44, 0.36, 0.06); paint(K.mud);
      path([[-0.32, 0.08], [0, -0.36], [0.32, 0.08]]); paint(K.straw);
      CT.save(); CT.globalAlpha = 0.4; [-0.16, -0.06, 0.06, 0.16].forEach((x) => line([[0, -0.32], [x * 1.6, 0.06]], 0.008)); CT.restore();
      line([[-0.06, -0.38], [-0.02, -0.3]], 0.016); line([[0.06, -0.38], [0.02, -0.3]], 0.016);
      door(-0.07, 0.14, 0.14, 0.24, K.darkwood);
      ell(-0.3, 0.36, 0.05, 0.03); paint(K.leaf); flower(0.28, 0.36, 0.018, K.gold);
    },
    bakery(c, s, p) {
      shadow(0.4, 0.42);
      rr(-0.2, -0.36, 0.08, 0.16, 0.02); paint(K.stone2); puff(-0.16, -0.42, 0.045, 5, rng('bread')); paint(K.smoke);
      house(0, 0.38, 0.6, 0.34, K.sand2);
      for (let k = 0; k < 5; k++) { const x = -0.3 + k * 0.12; CT.beginPath(); CT.moveTo(X(x), X(0.06)); CT.lineTo(X(x + 0.12), X(0.06)); CT.lineTo(X(x + 0.12), X(0.12)); CT.quadraticCurveTo(X(x + 0.06), X(0.17), X(x), X(0.12)); CT.closePath(); paint(k % 2 ? K.cream : K.coral); }
      rr(-0.24, 0.18, 0.2, 0.12, 0.03); paint(K.glass); ell(-0.14, 0.26, 0.06, 0.025); paint(K.sand2);
      door(0.06, 0.18, 0.13, 0.2, K.darkwood);
      line([[0.3, -0.04], [0.42, -0.04]], 0.016);
      ell(0.38, 0.04, 0.07, 0.045); paint(K.sand2); [-0.03, 0.0, 0.03].forEach((d) => line([[0.38 + d - 0.012, 0.02], [0.38 + d + 0.012, 0.06]], 0.008));
    },
    shop(c, s, p) {
      shadow(0.4, 0.4);
      house(0, 0.38, 0.54, 0.36, K.teal);
      for (let k = 0; k < 4; k++) { const x = -0.3 + k * 0.15; CT.beginPath(); CT.moveTo(X(x), X(0.02)); CT.lineTo(X(x + 0.15), X(0.02)); CT.lineTo(X(x + 0.15), X(0.1)); CT.quadraticCurveTo(X(x + 0.075), X(0.16), X(x), X(0.1)); CT.closePath(); paint(k % 2 ? K.white : K.teal); }
      rr(-0.22, 0.16, 0.2, 0.14, 0.03); paint(K.glass);
      [[-0.18, 0.26, K.red], [-0.12, 0.25, K.purple], [-0.06, 0.26, K.leaf]].forEach(([x, y, cc]) => { rr(x - 0.02, y - 0.04, 0.04, 0.05, 0.015); paint(cc); });
      door(0.06, 0.16, 0.13, 0.22, K.darkwood);
      line([[0.27, -0.06], [0.4, -0.06]], 0.016); line([[0.37, -0.06], [0.37, -0.03]], 0.01);
      ell(0.37, 0.03, 0.055); paint(K.gold); ell(0.37, 0.03, 0.03); CT.stroke();
    },
    library(c, s, p) {
      shadow(0.42, 0.44);
      rr(-0.38, -0.08, 0.76, 0.46, 0.03); paint(K.cream);
      path([[-0.42, -0.06], [0, -0.32], [0.42, -0.06]]); paint(K.blue);
      [-0.27, 0.27].forEach((x) => { rr(x - 0.05, 0.02, 0.1, 0.18, 0.03); paint(K.glass); });
      door(-0.08, 0.14, 0.16, 0.24, K.darkwood);
      // The open book over the door.
      CT.beginPath(); CT.moveTo(X(0), X(-0.12)); CT.quadraticCurveTo(X(-0.07), X(-0.17), X(-0.14), X(-0.13)); CT.lineTo(X(-0.14), X(-0.03)); CT.quadraticCurveTo(X(-0.07), X(-0.07), X(0), X(-0.02)); CT.closePath(); paint(K.white);
      CT.beginPath(); CT.moveTo(X(0), X(-0.12)); CT.quadraticCurveTo(X(0.07), X(-0.17), X(0.14), X(-0.13)); CT.lineTo(X(0.14), X(-0.03)); CT.quadraticCurveTo(X(0.07), X(-0.07), X(0), X(-0.02)); CT.closePath(); paint(K.white);
      [[-0.32, K.red], [-0.28, K.leaf2], [-0.24, K.purple]].forEach(([x, cc], i) => { rr(x, 0.26 - i * 0.01, 0.04, 0.12 + i * 0.01, 0.008); paint(cc); });
      [[0.22, K.gold], [0.26, K.blue], [0.3, K.coral]].forEach(([x, cc], i) => { rr(x, 0.27 - (i % 2) * 0.02, 0.04, 0.11 + (i % 2) * 0.02, 0.008); paint(cc); });
    },
    guildhall(c, s, p) {
      shadow(0.42, 0.46);
      rr(-0.4, -0.12, 0.8, 0.5, 0.03); paint(K.cream);
      path([[-0.46, -0.1], [-0.3, -0.38], [0.3, -0.38], [0.46, -0.1]]); paint(K.red);
      CT.save(); CT.strokeStyle = MONO ? CT.strokeStyle : K.darkwood; CT.lineWidth = X(0.022);
      line([[-0.4, 0.12], [0.4, 0.12]]); [-0.24, -0.08, 0.08, 0.24].forEach((x) => line([[x, -0.12], [x, 0.38]]));
      line([[-0.4, -0.12], [-0.24, 0.12]]); line([[0.4, -0.12], [0.24, 0.12]]); CT.restore();
      window_(-0.2, -0.06, 0.08, 0.1); window_(0.12, -0.06, 0.08, 0.1); window_(-0.04, -0.06, 0.08, 0.1);
      door(-0.08, 0.16, 0.16, 0.22, K.darkwood); line([[0, 0.2], [0, 0.38]], 0.01);
      [-0.33, 0.33].forEach((x, i) => { path([[x - 0.05, 0.14], [x + 0.05, 0.14], [x + 0.05, 0.32], [x, 0.28], [x - 0.05, 0.32]]); paint(i ? K.blue : K.purple); star(x, 0.2, 0.02, K.gold); });
      ell(0, -0.22, 0.05); paint(K.gold);
    },
    stable(c, s, p, R) {
      shadow(0.4, 0.46);
      rr(-0.4, -0.04, 0.8, 0.42, 0.03); paint(K.wood);
      path([[-0.46, -0.02], [-0.32, -0.26], [0.32, -0.26], [0.46, -0.02]]); paint(K.red);
      [-0.22, 0.04].forEach((x) => { rr(x, 0.08, 0.18, 0.3, 0.02); paint(K.darkwood); rr(x, 0.08, 0.18, 0.12, 0.02); paint(K.dark); line([[x, 0.2], [x + 0.18, 0.38]], 0.012); line([[x + 0.18, 0.2], [x, 0.38]], 0.012); });
      CT.save(); CT.lineWidth = X(0.028); CT.beginPath(); CT.arc(X(0), X(-0.14), X(0.05), Math.PI * 0.1, Math.PI * 0.9, true); CT.strokeStyle = col(K.gold); CT.stroke(); CT.restore();
      puff(0.32, 0.28, 0.08, 6, R); CT.save(); CT.translate(X(0.32), X(0.28)); CT.scale(1.1, 0.8); CT.translate(-X(0.32), -X(0.28)); paint(K.straw); CT.restore();
      puff(-0.13, 0.13, 0.04, 5, R); paint(K.straw);
    },
    farm(c, s, p, R) {
      CT.save(); CT.translate(0, X(0.24)); CT.transform(1, 0, -0.3, 0.42, 0, 0);
      [[-0.46, -0.3, K.straw], [0.02, -0.3, K.leaf], [-0.46, 0.06, K.leaf2], [0.02, 0.06, K.sand2]].forEach(([x, y, cc]) => {
        rr(x, y, 0.44, 0.32, 0.05); paint(cc);
        CT.save(); CT.globalAlpha = 0.35; for (let k = 1; k < 4; k++) line([[x + 0.03, y + k * 0.08], [x + 0.41, y + k * 0.08]]); CT.restore();
      });
      CT.restore();
      mini('barn', 0.2, -0.16, 0.5); mini('house', -0.2, -0.14, 0.44);
      puff(0.42, 0.0, 0.05, 6, R); paint(K.straw);
    },
    watermill(c, s, p) {
      shadow(0.4, 0.46);
      ell(0.14, 0.34, 0.34, 0.08); paint(K.water);
      house(-0.14, 0.36, 0.46, 0.34, K.blue, K.stone);
      window_(-0.26, 0.08, 0.1, 0.1); door(-0.06, 0.18, 0.12, 0.18, K.darkwood);
      const x = 0.26, y = 0.16, r = 0.18;
      ell(x, y, r); paint(K.wood); ell(x, y, r * 0.72); CT.stroke();
      for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; CT.save(); CT.translate(X(x + Math.cos(a) * r), X(y + Math.sin(a) * r)); CT.rotate(a); rr(-0.025, -0.04, 0.05, 0.08, 0.01); paint(K.darkwood); CT.restore(); line([[x, y], [x + Math.cos(a) * r * 0.72, y + Math.sin(a) * r * 0.72]], 0.01); }
      ell(x, y, 0.035); paint(K.stone2);
      CT.save(); CT.globalAlpha = 0.7; CT.strokeStyle = MONO ? CT.strokeStyle : K.white; [0.12, 0.4].forEach((wx) => { CT.beginPath(); CT.moveTo(X(wx), X(0.32)); CT.quadraticCurveTo(X(wx + 0.03), X(0.3), X(wx + 0.06), X(0.33)); CT.stroke(); }); CT.restore();
    },
    hamlet(c, s, p, R) {
      ground(0.24, 0.44, 0.18);
      cottage(-0.2, 0.04, 0.26, K.red); cottage(0.2, 0.06, 0.24, K.blue);
      roundTree(0.34, -0.2, 0.09, R, K.leaf2);
      cottage(0.0, 0.34, 0.28, K.coral);
      flower(-0.3, 0.3, 0.016, K.pink); flower(0.32, 0.3, 0.016, K.gold);
    },
    village(c, s, p, R) {
      ground(0.16, 0.48, 0.28);
      roundTree(-0.38, -0.2, 0.08, R, K.leaf2); roundTree(0.4, -0.18, 0.08, R, K.leaf);
      cottage(-0.24, -0.08, 0.2, K.red);
      // The little chapel at the back.
      rr(0.02, -0.38, 0.08, 0.24, 0.01); paint(K.wall); path([[0.0, -0.37], [0.06, -0.48], [0.12, -0.37]]); paint(K.blue);
      cottage(0.04, -0.06, 0.22, K.blue); cottage(0.28, -0.04, 0.18, K.purple);
      cottage(-0.18, 0.2, 0.22, K.coral); cottage(0.18, 0.22, 0.22, K.red);
      cottage(0.0, 0.42, 0.2, K.teal);
      flower(-0.36, 0.34, 0.016, K.pink); flower(0.36, 0.32, 0.016, K.gold);
    },
    town(c, s, p, R) {
      shadow(0.42, 0.48);
      const tall = (x, b, w, h, roof, wall = K.wall) => {
        house(x, b, w, h, roof, wall);
        for (let y = b - h + 0.04; y < b - 0.12; y += 0.1) [x - w * 0.28, x + w * 0.08].forEach((wx) => window_(wx, y, w * 0.2, 0.06));
        door(x - w * 0.14, b - 0.1, w * 0.28, 0.1, K.darkwood);
      };
      tall(-0.34, 0.08, 0.18, 0.3, K.blue); tall(0.34, 0.08, 0.18, 0.28, K.red);
      // The clock tower.
      rr(-0.07, -0.32, 0.14, 0.42, 0.01); paint(K.stone); path([[-0.1, -0.31], [0, -0.48], [0.1, -0.31]]); paint(K.teal);
      ell(0, -0.22, 0.045); paint(K.white); line([[0, -0.22], [0, -0.25]], 0.008); line([[0, -0.22], [0.02, -0.22]], 0.008);
      tall(-0.16, 0.14, 0.18, 0.32, K.coral, K.cream); tall(0.16, 0.14, 0.18, 0.34, K.purple, K.cream);
      tall(-0.28, 0.4, 0.2, 0.26, K.red); tall(0.0, 0.42, 0.2, 0.28, K.blue, K.cream); tall(0.28, 0.4, 0.2, 0.24, K.coral);
    },
    city(c, s, p, R) {
      shadow(0.42, 0.48);
      // The roofs behind the walls, and the keep above them all.
      [[-0.3, -0.02, 0.16, K.red], [-0.14, -0.06, 0.15, K.blue], [0.14, -0.06, 0.15, K.coral], [0.3, -0.02, 0.16, K.purple]].forEach(([x, b, w, rf]) => house(x, b, w, 0.12, rf));
      towerAt(0, 0.0, 0.16, 0.34, K.blue, K.stone); flag(0, -0.54, 0.08, K.red);
      rr(-0.44, 0.04, 0.88, 0.34, 0.02); paint(K.stone); crenel(-0.44, 0.04, 0.88, 9);
      [-0.38, 0.38].forEach((x) => { towerAt(x, 0.38, 0.14, 0.46, K.red); });
      door(-0.09, 0.16, 0.18, 0.22, K.darkwood); [-0.04, 0.0, 0.04].forEach((x) => line([[x, 0.19], [x, 0.38]], 0.008));
      window_(-0.24, 0.14, 0.06, 0.08); window_(0.18, 0.14, 0.06, 0.08);
    },

    /* ----- Castles and wonders, the second fifty ----- */
    tomb(c, s, p) {
      shadow(0.4, 0.4);
      rr(-0.3, 0.3, 0.6, 0.08, 0.02); paint(K.stone2);
      rr(-0.24, -0.06, 0.48, 0.36, 0.02); paint(K.stone);
      path([[-0.3, -0.04], [0, -0.26], [0.3, -0.04]]); paint(K.stone2);
      [-0.18, 0.18].forEach((x) => { rr(x - 0.03, -0.04, 0.06, 0.34, 0.01); paint(K.cream); });
      door(-0.1, 0.04, 0.2, 0.26, K.dark); ell(0, 0.18, 0.05); paint(K.stone2);
      line([[0.06, -0.02], [0.1, 0.04], [0.08, 0.1]], 0.008);
      ell(-0.24, -0.04, 0.06, 0.03); paint(K.moss); ell(0.22, 0.28, 0.07, 0.03); paint(K.moss);
      rr(0.3, 0.24, 0.04, 0.1, 0.01); paint(K.cream); path([[0.32, 0.16], [0.335, 0.22], [0.32, 0.24], [0.305, 0.22]]); paint(K.flame);
    },
    watchtower(c, s, p) {
      shadow(0.42, 0.3);
      CT.save(); CT.lineWidth = X(0.04); CT.strokeStyle = MONO ? CT.strokeStyle : K.darkwood;
      line([[-0.18, 0.4], [-0.1, -0.06]]); line([[0.18, 0.4], [0.1, -0.06]]); CT.restore();
      [[-0.18, 0.4, -0.1, -0.06], [0.18, 0.4, 0.1, -0.06]].forEach(([a, b, x, y]) => limb([[a, b], [x, y]], 0.035, K.wood));
      line([[-0.16, 0.3], [0.12, 0.06]], 0.016); line([[0.16, 0.3], [-0.12, 0.06]], 0.016);
      rr(-0.2, -0.12, 0.4, 0.08, 0.02); paint(K.wood);
      rr(-0.15, -0.3, 0.3, 0.18, 0.02); paint(K.wall); rr(-0.08, -0.26, 0.16, 0.08, 0.02); paint(K.dark);
      path([[-0.22, -0.28], [0, -0.44], [0.22, -0.28]]); paint(K.red); flag(0, -0.44, 0.08, K.gold);
      [0.36, 0.26, 0.16, 0.06].forEach((y) => line([[0.24, y], [0.3, y]], 0.01)); line([[0.24, 0.4], [0.22, -0.04]], 0.012); line([[0.3, 0.4], [0.28, -0.04]], 0.012);
    },
    wall(c, s, p) {
      shadow(0.4, 0.48);
      rr(-0.46, -0.02, 0.92, 0.38, 0.02); paint(K.stone); crenel(-0.46, -0.02, 0.92, 10);
      CT.save(); CT.globalAlpha = 0.35; [0.1, 0.22].forEach((y, i) => { line([[-0.44, y], [0.44, y]], 0.008); for (let x = -0.4 + i * 0.06; x < 0.44; x += 0.12) line([[x, y], [x, y + 0.12]], 0.008); }); CT.restore();
      towerAt(0, 0.38, 0.2, 0.56, K.blue, K.stone2); flag(0, -0.43, 0.09, K.red);
      door(-0.06, 0.2, 0.12, 0.18, K.darkwood);
      ell(-0.3, 0.38, 0.08, 0.03); paint(K.moss); ell(0.32, 0.38, 0.06, 0.025); paint(K.moss);
    },
    keep(c, s, p) {
      shadow(0.42, 0.34);
      rr(-0.24, -0.24, 0.48, 0.64, 0.02); paint(K.stone); crenel(-0.28, -0.24, 0.56, 5, K.stone);
      rr(-0.28, -0.26, 0.56, 0.04, 0.01); paint(K.stone2);
      [-0.12, 0.12].forEach((x) => { rr(x - 0.015, -0.12, 0.03, 0.1, 0.01); paint(K.dark); });
      window_(-0.05, 0.04, 0.1, 0.1);
      door(-0.08, 0.2, 0.16, 0.2, K.darkwood);
      flag(0.16, -0.36, 0.12, K.red);
      ell(-0.2, 0.4, 0.07, 0.025); paint(K.leaf, false);
    },
    fort(c, s, p) {
      shadow(0.42, 0.48);
      const pal_ = (x0, x1, b, h) => { for (let x = x0; x < x1 - 0.01; x += 0.06) { path([[x, b], [x, b - h], [x + 0.03, b - h - 0.04], [x + 0.06, b - h], [x + 0.06, b]]); paint(K.wood); } };
      [[-0.38, -0.22], [0.38, -0.22]].forEach(([x, top]) => {
        CT.save(); line([[x - 0.06, 0.38], [x - 0.04, top + 0.08]], 0.03); line([[x + 0.06, 0.38], [x + 0.04, top + 0.08]], 0.03); CT.restore();
        rr(x - 0.08, top, 0.16, 0.1, 0.02); paint(K.darkwood); path([[x - 0.1, top + 0.01], [x, top - 0.12], [x + 0.1, top + 0.01]]); paint(K.red);
      });
      pal_(-0.36, 0.36, 0.38, 0.32);
      rr(-0.1, 0.12, 0.2, 0.26, 0.02); paint(K.dark); line([[0, 0.12], [0, 0.38]], 0.01);
      flag(0, -0.04, 0.12, K.gold); rr(-0.36, 0.2, 0.72, 0.03, 0.01); paint(K.darkwood);
    },
    citadel(c, s, p, R) {
      CT.beginPath(); CT.moveTo(X(-0.46), X(0.4)); CT.bezierCurveTo(X(-0.36), X(0.0), X(0.36), X(0.0), X(0.46), X(0.4)); CT.closePath(); paint(K.stone2);
      shine(-0.2, 0.18, 0.08, 0.025);
      towerAt(-0.26, 0.2, 0.1, 0.3, K.red); towerAt(0.26, 0.2, 0.1, 0.3, K.red);
      rr(-0.22, -0.04, 0.44, 0.26, 0.02); paint(K.stone); crenel(-0.22, -0.04, 0.44, 5);
      towerAt(-0.1, -0.02, 0.1, 0.24, K.blue, K.stone); towerAt(0.1, -0.02, 0.1, 0.24, K.blue, K.stone);
      towerAt(0, 0.0, 0.12, 0.34, K.blue); flag(0, -0.49, 0.08, K.gold);
      door(-0.05, 0.12, 0.1, 0.1, K.darkwood);
      line([[-0.04, 0.38], [0.02, 0.3], [-0.03, 0.24]], 0.014);
    },
    palace(c, s, p) {
      shadow(0.42, 0.48);
      rr(-0.42, 0.02, 0.84, 0.36, 0.02); paint(K.cream);
      [-0.36, 0.36].forEach((x) => { rr(x - 0.04, -0.3, 0.08, 0.68, 0.02); paint(K.cream); CT.beginPath(); CT.moveTo(X(x - 0.05), X(-0.3)); CT.quadraticCurveTo(X(x - 0.06), X(-0.4), X(x), X(-0.46)); CT.quadraticCurveTo(X(x + 0.06), X(-0.4), X(x + 0.05), X(-0.3)); CT.closePath(); paint(K.pink); });
      rr(-0.18, -0.12, 0.36, 0.16, 0.02); paint(K.cream);
      CT.beginPath(); CT.moveTo(X(-0.16), X(-0.12)); CT.bezierCurveTo(X(-0.24), X(-0.3), X(-0.04), X(-0.34), X(0), X(-0.46)); CT.bezierCurveTo(X(0.04), X(-0.34), X(0.24), X(-0.3), X(0.16), X(-0.12)); CT.closePath(); paint(K.gold);
      shine(-0.07, -0.24, 0.04, 0.03);
      [-0.24, -0.12, 0.12, 0.24].forEach((x) => door(x - 0.035, 0.12, 0.07, 0.12, K.teal));
      door(-0.07, 0.16, 0.14, 0.22, K.darkwood);
      [-0.08, 0.0, 0.08].forEach((x) => door(x - 0.025, -0.08, 0.05, 0.08, K.teal));
    },
    kingdom(c, s, p, R) {
      peakAt(-0.26, 0.04, 0.22, 0.4, K.stone2); peakAt(0.26, 0.04, 0.22, 0.44, K.stone2);
      ground(0.2, 0.48, 0.24);
      CT.save(); CT.beginPath(); CT.moveTo(X(0.46), X(0.12)); CT.bezierCurveTo(X(0.2), X(0.2), X(0.34), X(0.34), X(0.06), X(0.44)); CT.strokeStyle = col(K.water); CT.lineWidth = X(0.06); CT.stroke(); CT.restore();
      mini('castle', 0, -0.08, 0.5);
      roundTree(-0.38, 0.08, 0.07, R, K.leaf2); roundTree(0.22, 0.12, 0.06, R, K.leaf);
      cottage(-0.22, 0.34, 0.16, K.red); cottage(-0.02, 0.38, 0.16, K.blue); cottage(0.36, 0.3, 0.14, K.coral);
    },
    monastery(c, s, p) {
      CT.beginPath(); CT.moveTo(X(-0.4), X(0.42)); CT.lineTo(X(-0.36), X(0.06)); CT.lineTo(X(-0.24), X(-0.02)); CT.lineTo(X(0.26), X(-0.04)); CT.lineTo(X(0.38), X(0.08)); CT.lineTo(X(0.42), X(0.42)); CT.closePath(); paint(K.stone2);
      shine(-0.24, 0.12, 0.06, 0.02);
      house(-0.12, 0.0, 0.3, 0.16, K.red, K.cream); window_(-0.18, -0.1, 0.05, 0.06); window_(-0.08, -0.1, 0.05, 0.06);
      rr(0.1, -0.36, 0.14, 0.36, 0.01); paint(K.cream); path([[0.07, -0.35], [0.17, -0.48], [0.27, -0.35]]); paint(K.red);
      door(0.135, -0.3, 0.07, 0.09, K.dark); ell(0.17, -0.24, 0.025); paint(K.gold);
      house(0.28, 0.02, 0.14, 0.1, K.coral, K.cream);
      [0.16, 0.22, 0.28, 0.34].forEach((y, i) => { rr(-0.06 + i * 0.03, y - 0.03, 0.14, 0.04, 0.01); paint(K.stone); });
      ell(-0.3, 0.4, 0.06, 0.025); paint(K.leaf); ell(0.32, 0.4, 0.05, 0.02); paint(K.leaf);
    },
    cathedral(c, s, p) {
      shadow(0.42, 0.46);
      house(0, 0.38, 0.44, 0.36, K.blue, K.cream);
      [-0.28, 0.28].forEach((x) => {
        rr(x - 0.09, -0.24, 0.18, 0.62, 0.02); paint(K.cream);
        path([[x - 0.11, -0.23], [x, -0.48], [x + 0.11, -0.23]]); paint(K.blue);
        line([[x, -0.48], [x, -0.52]], 0.012); window_(x - 0.03, -0.14, 0.06, 0.1); window_(x - 0.03, 0.08, 0.06, 0.1);
      });
      ell(0, -0.08, 0.08); paint(K.pink); for (let k = 0; k < 8; k++) { const a = (k * Math.PI) / 4; line([[0, -0.08], [Math.cos(a) * 0.08, -0.08 + Math.sin(a) * 0.08]], 0.006); } ell(0, -0.08, 0.025); paint(K.gold);
      door(-0.08, 0.14, 0.16, 0.24, K.darkwood); line([[0, 0.18], [0, 0.38]], 0.01);
      line([[0, -0.34], [0, -0.42]], 0.014); line([[-0.03, -0.39], [0.03, -0.39]], 0.014);
    },
    observatory(c, s, p) {
      shadow(0.42, 0.42);
      star(-0.32, -0.34, 0.035, K.gold); star(0.36, -0.28, 0.025, K.gold); star(-0.38, -0.12, 0.02, K.glass);
      rr(-0.3, 0.02, 0.6, 0.36, 0.03); paint(K.stone);
      CT.save(); CT.translate(X(0.06), X(-0.12)); CT.rotate(-0.6); rr(-0.04, -0.34, 0.08, 0.3, 0.02); paint(K.gold); rr(-0.05, -0.36, 0.1, 0.05, 0.01); paint(K.darkwood); CT.restore();
      CT.beginPath(); CT.moveTo(X(-0.26), X(0.04)); CT.arc(X(0), X(0.04), X(0.26), Math.PI, 0); CT.closePath(); paint(K.purple);
      CT.save(); CT.beginPath(); CT.moveTo(X(-0.26), X(0.04)); CT.arc(X(0), X(0.04), X(0.26), Math.PI, 0); CT.closePath(); CT.clip(); CT.translate(X(0), X(0.04)); CT.rotate(0.95); rr(-0.03, -0.3, 0.06, 0.3, 0.01); paint(K.dark); CT.restore();
      shine(-0.12, -0.1, 0.05, 0.03);
      door(-0.06, 0.2, 0.12, 0.18, K.darkwood); window_(-0.22, 0.14, 0.07, 0.08); window_(0.15, 0.14, 0.07, 0.08);
    },
    pyramid(c, s, p) {
      shadow(0.4, 0.48);
      path([[-0.46, 0.38], [0, -0.36], [0.46, 0.38]]); paint(K.sand);
      path([[0, -0.36], [0.46, 0.38], [0.12, 0.38]]); paint(K.sand2);
      CT.save(); CT.globalAlpha = 0.4; [-0.12, 0.06, 0.24].forEach((y) => { const w = 0.46 * (y + 0.36) / 0.74; line([[-w, y], [w * 0.26, y]], 0.008); }); CT.restore();
      door(-0.06, 0.2, 0.12, 0.18, K.dark);
      ell(0, -0.36, 0.03); paint(K.gold);
      ell(0.34, -0.3, 0.07); paint(K.flame);
    },
    arena(c, s, p) {
      shadow(0.42, 0.48);
      ell(0, 0.06, 0.46, 0.3); paint(K.cream);
      CT.save(); ell(0, 0.06, 0.46, 0.3); CT.clip();
      for (let k = 0; k < 8; k++) { const x = -0.42 + k * 0.12; door(x, 0.06, 0.07, 0.12, K.dark); door(x + 0.02, 0.22, 0.07, 0.14, K.dark); }
      line([[-0.46, 0.2], [0.46, 0.2]], 0.01); CT.restore();
      ell(0, 0.06, 0.46, 0.3); CT.stroke();
      ell(0, -0.04, 0.36, 0.14); paint(K.stone);
      ell(0, -0.02, 0.26, 0.09); paint(K.sand);
      [-0.36, 0.0, 0.36].forEach((x, i) => flag(x, x ? -0.14 : -0.18, 0.12, [K.red, K.blue, K.red][i]));
    },

    /* ----- Roads and adventure, the second fifty ----- */
    crates(c, s, p) {
      shadow(0.4, 0.42);
      const crate = (x, y, w) => { rr(x, y, w, w, 0.02); paint(K.wood); rr(x + w * 0.1, y + w * 0.1, w * 0.8, w * 0.8, 0.01); CT.stroke(); line([[x + w * 0.12, y + w * 0.12], [x + w * 0.88, y + w * 0.88]], 0.014); };
      crate(-0.4, 0.06, 0.32); crate(-0.08, 0.12, 0.26); crate(-0.3, -0.24, 0.28);
      rr(0.2, -0.02, 0.2, 0.4, 0.08); paint(K.darkwood); [0.06, 0.28].forEach((y) => { rr(0.2, y, 0.2, 0.03, 0.01); paint(K.stone2); }); shine(0.25, 0.04, 0.02, 0.06);
    },
    logs(c, s, p) {
      shadow(0.4, 0.44);
      const log = (x, y, w, r) => { rr(x - w, y - r, w, r * 2, r * 0.3); paint(K.wood); ell(x, y, r * 0.55, r); paint(K.sand); ell(x, y, r * 0.3, r * 0.55); CT.stroke(); };
      log(0.3, 0.28, 0.56, 0.09); log(0.36, 0.1, 0.56, 0.09); log(0.28, -0.08, 0.5, 0.09);
      rr(-0.42, 0.24, 0.2, 0.14, 0.03); paint(K.wood); ell(-0.32, 0.24, 0.1, 0.035); paint(K.sand);
      CT.save(); CT.translate(X(-0.3), X(0.22)); CT.rotate(-0.5); rr(-0.012, -0.24, 0.024, 0.24, 0.01); paint(K.darkwood); path([[-0.012, -0.22], [0.07, -0.26], [0.08, -0.16], [-0.012, -0.17]]); paint(K.stone); CT.restore();
    },
    caravan(c, s, p) {
      shadow(0.4, 0.44);
      rr(-0.36, 0.0, 0.62, 0.16, 0.03); paint(K.wood);
      CT.beginPath(); CT.moveTo(X(-0.34), X(0.0)); CT.bezierCurveTo(X(-0.36), X(-0.38), X(0.26), X(-0.38), X(0.24), X(0.0)); CT.closePath(); paint(K.cream);
      [-0.16, 0.04].forEach((x) => line([[x, 0.0], [x + 0.01, -0.26]], 0.012));
      ell(-0.36, -0.06, 0.03, 0.06); paint(K.dark);
      line([[0.26, 0.1], [0.46, 0.2]], 0.024);
      wheel(-0.22, 0.22, 0.12); wheel(0.12, 0.22, 0.12);
      flag(0.0, -0.28, 0.08, K.red);
    },
    camp(c, s, p, R) {
      ground(0.24, 0.46, 0.18);
      tentAt(-0.22, 0.06, 0.32, K.red); tentAt(0.22, 0.04, 0.3, K.blue);
      tentAt(0.02, -0.08, 0.24, K.leaf2);
      mini('fire', 0.02, 0.24, 0.36);
      [[-0.18, 0.36], [0.24, 0.34]].forEach(([x, y]) => { rr(x - 0.06, y - 0.025, 0.12, 0.05, 0.02); paint(K.wood); });
    },
    gallows(c, s, p) {
      shadow(0.4, 0.4);
      rr(-0.36, 0.22, 0.72, 0.1, 0.02); paint(K.wood); [-0.3, 0.3].forEach((x) => { rr(x - 0.03, 0.3, 0.06, 0.1, 0.01); paint(K.darkwood); });
      rr(-0.22, -0.36, 0.06, 0.6, 0.01); paint(K.wood);
      rr(-0.24, -0.38, 0.44, 0.06, 0.01); paint(K.wood);
      path([[-0.16, -0.2], [-0.02, -0.32], [-0.02, -0.28], [-0.16, -0.16]]); paint(K.darkwood);
      line([[0.12, -0.32], [0.12, -0.08]], 0.012); ell(0.12, -0.03, 0.04, 0.05); CT.stroke();
      [0.24, 0.2, 0.16].forEach((y, i) => { rr(0.2 + i * 0.04, y, 0.16 - i * 0.04, 0.04, 0.005); paint(K.wood); });
      // A crow keeps watch.
      ell(-0.06, -0.42, 0.045, 0.03); paint(K.dark); ell(-0.1, -0.45, 0.022); paint(K.dark); path([[-0.12, -0.45], [-0.15, -0.44], [-0.12, -0.43]]); paint(K.flame, false);
    },
    battlefield(c, s, p) {
      ell(0, 0.28, 0.46, 0.14); paint(K.mud);
      const sword = (x, y, a) => { CT.save(); CT.translate(X(x), X(y)); CT.rotate(a); path([[-0.03, 0], [-0.03, -0.3], [0.03, -0.3], [0.03, 0]]); paint(K.stone); rr(-0.09, -0.33, 0.18, 0.04, 0.015); paint(K.gold); rr(-0.02, -0.43, 0.04, 0.1, 0.01); paint(K.darkwood); ell(0, -0.45, 0.03); paint(K.gold); CT.restore(); };
      flag(-0.28, 0.2, 0.5, K.red); path([[-0.28, -0.3], [-0.1, -0.24], [-0.16, -0.2], [-0.12, -0.14], [-0.28, -0.12]]); paint(K.red);
      sword(0.1, 0.3, -0.16); sword(0.3, 0.3, 0.14);
      ell(-0.06, 0.26, 0.12); paint(K.blue); path([[-0.06, 0.14], [-0.06, 0.38]], false); CT.save(); CT.lineWidth = X(0.03); CT.strokeStyle = col(K.gold); CT.stroke(); CT.restore(); ell(-0.06, 0.26, 0.12); CT.stroke();
      CT.beginPath(); CT.moveTo(X(0.18), X(0.38)); CT.arc(X(0.24), X(0.38), X(0.08), Math.PI, 0); CT.closePath(); paint(K.stone2);
    },
    dragon(c, s, p) {
      shadow(0.4, 0.44);
      [[-0.32, 0.36], [0.3, 0.36], [0.36, 0.3], [-0.26, 0.38], [0.0, 0.4]].forEach(([x, y]) => { ell(x, y, 0.06, 0.03); paint(K.gold); });
      CT.beginPath(); CT.moveTo(X(-0.06), X(0.0)); CT.lineTo(X(-0.36), X(-0.34)); CT.quadraticCurveTo(X(-0.32), X(-0.16), X(-0.42), X(-0.06)); CT.quadraticCurveTo(X(-0.3), X(-0.04), X(-0.3), X(0.06)); CT.closePath(); paint(K.purple);
      limb([[-0.14, 0.26], [-0.3, 0.28], [-0.36, 0.18]], 0.06, K.red); path([[-0.36, 0.1], [-0.4, 0.18], [-0.32, 0.18]]); paint(K.red);
      ell(0, 0.16, 0.2, 0.18); paint(K.red); ell(0.04, 0.2, 0.11, 0.12); paint(K.sand);
      CT.save(); CT.globalAlpha = 0.4; [0.14, 0.2, 0.26].forEach((y) => line([[-0.04, y], [0.12, y]], 0.008)); CT.restore();
      ell(0.12, -0.12, 0.14, 0.12); paint(K.red); ell(0.24, -0.06, 0.08, 0.06); paint(K.red);
      [[0.04, -0.22], [0.14, -0.24]].forEach(([x, y]) => { path([[x - 0.02, y + 0.02], [x - 0.03, y - 0.08], [x + 0.03, y + 0.01]]); paint(K.cream); });
      ell(0.12, -0.12, 0.035); paint(K.white); ell(0.13, -0.12, 0.018); paint(K.dark, false);
      ell(0.27, -0.08, 0.008); paint(K.dark, false); ell(0.04, -0.06, 0.025, 0.015); paint(K.pink, false);
      [[-0.06, 0.32], [0.1, 0.32]].forEach(([x, y]) => { ell(x, y, 0.05, 0.035); paint(K.red); });
      puff(0.36, -0.2, 0.035, 5, rng('puff')); paint(K.smoke);
    },
    ropebridge(c, s, p) {
      rr(-0.46, -0.04, 0.92, 0.44, 0.04); paint(K.dark);
      path([[-0.46, -0.04], [-0.2, -0.04], [-0.16, 0.08], [-0.22, 0.24], [-0.18, 0.4], [-0.46, 0.4]]); paint(K.stone2);
      path([[0.46, -0.04], [0.2, -0.04], [0.18, 0.1], [0.24, 0.26], [0.2, 0.4], [0.46, 0.4]]); paint(K.stone2);
      ell(-0.33, -0.04, 0.13, 0.03); paint(K.grass); ell(0.33, -0.04, 0.13, 0.03); paint(K.grass);
      [-0.24, 0.24].forEach((x) => { rr(x - 0.015, -0.2, 0.03, 0.18, 0.01); paint(K.wood); });
      for (let k = 0; k <= 8; k++) { const t = k / 8, x = -0.22 + t * 0.44, y = -0.04 + Math.sin(t * Math.PI) * 0.12; rr(x - 0.02, y - 0.012, 0.04, 0.05, 0.006); paint(K.wood); }
      CT.beginPath(); CT.moveTo(X(-0.24), X(-0.18)); CT.quadraticCurveTo(X(0), X(0.04), X(0.24), X(-0.18)); CT.stroke();
    },
    quarry(c, s, p) {
      ell(0, 0.1, 0.46, 0.3); paint(K.stone);
      ell(0, 0.14, 0.34, 0.2); paint(K.stone2);
      ell(0, 0.18, 0.2, 0.1); paint(K.mud);
      ell(0, 0.2, 0.08, 0.04); paint(K.dark);
      rr(0.18, -0.26, 0.12, 0.1, 0.01); paint(K.cream); rr(0.26, -0.18, 0.12, 0.1, 0.01); paint(K.cream);
      CT.save(); CT.translate(X(-0.3), X(-0.14)); CT.rotate(0.6); rr(-0.012, -0.12, 0.024, 0.26, 0.01); paint(K.wood); CT.beginPath(); CT.moveTo(X(-0.14), X(-0.08)); CT.quadraticCurveTo(X(0), X(-0.18), X(0.14), X(-0.08)); CT.quadraticCurveTo(X(0), X(-0.13), X(-0.14), X(-0.08)); paint(K.stone2); CT.restore();
    },
    boat(c, s, p) {
      ell(0, 0.2, 0.44, 0.16); paint(K.water); waves(0.3, -0.3, 0.3, 3);
      CT.save(); CT.lineWidth = X(0.02); line([[-0.36, -0.08], [-0.1, 0.16]]); line([[0.36, -0.08], [0.1, 0.16]]); CT.restore();
      ell(-0.36, -0.08, 0.035, 0.02); paint(K.wood); ell(0.36, -0.08, 0.035, 0.02); paint(K.wood);
      CT.beginPath(); CT.moveTo(X(-0.32), X(0.02)); CT.lineTo(X(0.32), X(0.02)); CT.quadraticCurveTo(X(0.26), X(0.2), X(0.12), X(0.2)); CT.lineTo(X(-0.12), X(0.2)); CT.quadraticCurveTo(X(-0.26), X(0.2), X(-0.32), X(0.02)); CT.closePath(); paint(K.coral);
      line([[-0.28, 0.08], [0.28, 0.08]], 0.01); rr(-0.06, 0.0, 0.12, 0.03, 0.01); paint(K.wood);
    },
    shipwreck(c, s, p) {
      ell(0, 0.28, 0.46, 0.13); paint(K.water);
      ell(0.3, 0.3, 0.1, 0.05); paint(K.stone2); ell(-0.32, 0.32, 0.08, 0.04); paint(K.stone2);
      CT.save(); CT.translate(X(-0.02), X(0.16)); CT.rotate(-0.28);
      line([[-0.04, 0.0], [-0.04, -0.46]], 0.026); line([[-0.04, -0.46], [0.04, -0.52]], 0.016);
      path([[-0.04, -0.42], [0.2, -0.38], [0.14, -0.3], [0.22, -0.22], [0.08, -0.18], [0.14, -0.1], [-0.04, -0.1]]); paint(K.cream);
      CT.beginPath(); CT.moveTo(X(-0.38), X(-0.02)); CT.lineTo(X(0.18), X(-0.02)); CT.lineTo(X(0.24), X(0.04)); CT.lineTo(X(0.18), X(0.08)); CT.lineTo(X(0.26), X(0.14)); CT.lineTo(X(-0.22), X(0.18)); CT.quadraticCurveTo(X(-0.36), X(0.16), X(-0.38), X(-0.02)); CT.closePath(); paint(K.darkwood);
      line([[-0.34, 0.06], [0.2, 0.06]], 0.01); [-0.24, -0.08].forEach((x) => { ell(x, 0.12, 0.022); paint(K.dark); });
      CT.restore();
      CT.save(); CT.globalAlpha = MONO ? 0.6 : 0.85; CT.beginPath(); CT.ellipse(0, X(0.33), X(0.44), X(0.08), 0, 0, Math.PI); CT.fillStyle = col(K.water); CT.fill(); CT.restore();
      waves(0.32, -0.3, 0.3, 3);
      ell(0.36, 0.22, 0.03, 0.02); paint(K.gold);
    },
  };

  /* ---------- Places made by the troubadour (world.stamps): strokes in ink, colours dropped inside them ----------
   * A place is { id, name, strokes: [[[x, y], ...], ...], fills: [{ x, y, c }] }, points from 0 to 1 in its square.
   * `c` names a colour of the map (water, leaf, stone...), so a place follows the theme. It is painted once on a
   * canvas of its own (cached for the theme of the moment), then laid on the map like the other drawings. */
  const FILLS = [['water', 'Water'], ['leaf', 'Grass'], ['stone', 'Stone'], ['ground', 'Ground'], ['fire', 'Fire'], ['ambience', 'Teal'], ['events', 'Red'], ['soundbox', 'Blue'], ['music', 'Gold'], ['hole', 'Dark']];
  const RES = 512;
  const custom = new Map();
  const cache = new Map();
  const isCustom = (id) => custom.has(id);
  function register(list) { (list || []).forEach((st) => { if (st && st.id) { custom.set(st.id, st); } }); }
  function forget(id) { custom.delete(id); }
  function rgbOf(c) {
    c = String(c || '').trim();
    let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
    if (m) { let h = m[1]; if (h.length === 3) h = h.split('').map((x) => x + x).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
    m = /color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(c);
    if (m) return [m[1], m[2], m[3]].map((x) => Math.round(Number(x) * 255));
    m = /rgba?\(([^)]+)\)/.exec(c);
    if (m) return m[1].split(/[ ,]+/).slice(0, 3).map(Number);
    return [128, 128, 128];
  }
  function inkLayer(st, ink) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = RES;
    const c = cv.getContext('2d');
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = ink; c.fillStyle = ink;
    (st.strokes || []).forEach((sk) => {
      const pts = Array.isArray(sk) ? sk : sk.p || [];
      c.lineWidth = RES * (Array.isArray(sk) ? 0.022 : sk.w || 0.022);
      if (!pts.length) return;
      if (pts.length === 1) { c.beginPath(); c.arc(pts[0][0] * RES, pts[0][1] * RES, c.lineWidth / 2, 0, Math.PI * 2); c.fill(); return; }
      c.beginPath();
      pts.forEach((q, i) => (i ? c.lineTo(q[0] * RES, q[1] * RES) : c.moveTo(q[0] * RES, q[1] * RES)));
      c.stroke();
    });
    return cv;
  }
  /** The region around a point, bounded by the ink: a mask of RES x RES, or null when it reaches the edge (not closed). */
  function region(alpha, x, y) {
    const sx = Math.max(0, Math.min(RES - 1, Math.round(x * RES))), sy = Math.max(0, Math.min(RES - 1, Math.round(y * RES)));
    const open = (i) => alpha[i] < 110;
    const start = sy * RES + sx;
    if (!open(start)) return null;
    const mask = new Uint8Array(RES * RES);
    const stack = [start];
    mask[start] = 1;
    while (stack.length) {
      const i = stack.pop();
      const px = i % RES, py = (i - px) / RES;
      if (px === 0 || py === 0 || px === RES - 1 || py === RES - 1) return null;
      const n = [i - 1, i + 1, i - RES, i + RES];
      for (const j of n) if (!mask[j] && open(j)) { mask[j] = 1; stack.push(j); }
    }
    return mask;
  }
  function alphaOf(st) {
    const d = inkLayer(st, '#000').getContext('2d').getImageData(0, 0, RES, RES).data;
    const a = new Uint8Array(RES * RES);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    return a;
  }
  /** Drops colour `c` at (x, y): the fills of the place after it, or null when the point is not inside a closed shape. */
  function fillAt(st, x, y, c) {
    const alpha = alphaOf(st);
    const mask = region(alpha, x, y);
    if (!mask) return null;
    const at = (f) => mask[Math.max(0, Math.min(RES - 1, Math.round(f.y * RES))) * RES + Math.max(0, Math.min(RES - 1, Math.round(f.x * RES)))];
    return (st.fills || []).filter((f) => !at(f)).concat([{ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, c }]);
  }
  /** The place painted with the colours of `pal`, as a canvas (cached). */
  function picture(st, pal) {
    const key = `${st.id}|${st.v || 0}|${pal.ink}|${FILLS.map(([k]) => pal[k]).join('|')}`;
    if (cache.has(key)) return cache.get(key);
    const ink = inkLayer(st, pal.ink);
    const out = document.createElement('canvas');
    out.width = out.height = RES;
    const c = out.getContext('2d');
    if ((st.fills || []).length) {
      const alpha = alphaOf(st);
      const img = c.createImageData(RES, RES);
      const d = img.data;
      st.fills.forEach((f) => {
        const mask = region(alpha, f.x, f.y);
        if (!mask) return;
        const [r, g, b] = rgbOf(pal[f.c] || (/^#/.test(f.c) ? f.c : pal.stone));
        // The colour runs under the ink a little, so no seam shows along the lines.
        for (let i = 0; i < mask.length; i++) {
          if (!mask[i]) continue;
          for (const j of [i, i - 1, i + 1, i - RES, i + RES, i - 2, i + 2, i - 2 * RES, i + 2 * RES]) {
            if (j < 0 || j >= mask.length) continue;
            d[j * 4] = r; d[j * 4 + 1] = g; d[j * 4 + 2] = b; d[j * 4 + 3] = 255;
          }
        }
      });
      c.putImageData(img, 0, 0);
    }
    // Colour painted with the brush: over the fills, always under the lines.
    (st.paint || []).forEach((sk) => {
      const pts = sk.p || [];
      if (!pts.length) return;
      const col = pal[sk.c] || (/^#/.test(sk.c) ? sk.c : pal.stone);
      c.strokeStyle = col; c.fillStyle = col; c.lineWidth = RES * (sk.w || 0.06); c.lineJoin = 'round'; c.lineCap = 'round';
      if (pts.length === 1) { c.beginPath(); c.arc(pts[0][0] * RES, pts[0][1] * RES, c.lineWidth / 2, 0, Math.PI * 2); c.fill(); return; }
      c.beginPath(); pts.forEach((q, i) => (i ? c.lineTo(q[0] * RES, q[1] * RES) : c.moveTo(q[0] * RES, q[1] * RES))); c.stroke();
    });
    c.drawImage(ink, 0, 0);
    if (cache.size > 80) cache.clear();
    cache.set(key, out);
    return out;
  }

  function draw(ctx, id, size, pal) {
    if (custom.has(id)) {
      const full = Object.assign({ hole: '#17130F' }, pal);
      ctx.save();
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(picture(custom.get(id), full), -size / 2, -size / 2, size, size);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = pal.ink;
    // Chunky soft outlines, as stickers have.
    ctx.lineWidth = Math.max(1.4, size * 0.026);
    const fn = D[id];
    CT = ctx; S = size; MONO = pal.mono ? pal.monoFill : null;
    if (fn) fn(ctx, size, pal, rng(id));
    else { ctx.beginPath(); ctx.arc(0, 0, size / 2, 0, Math.PI * 2); ctx.stroke(); }
    CT = null; MONO = null;
    ctx.restore();
  }

  global.MapStamps = { LIST, GROUPS, natural, draw, FILLS, register, forget, isCustom, custom: (id) => custom.get(id), fillAt, picture };
})(window);

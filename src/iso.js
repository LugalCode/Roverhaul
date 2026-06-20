// ============================================================
//  iso.js — ISOMETRIC RENDER LAYER (Step 2c — fidelity pass)
//  Optional ¾ isometric render of the biome-1 field + bay, driven by the SAME
//  game state as the vector engine (STATE.expedition). engine.js delegates to
//  ISO.render() when ISO.on; game logic is untouched.
//
//  Biome-1 = OPEN WASTELAND: no drawn path (the rover just traverses dirt and
//  leaves tread-trails behind it). Detailed terrain — varied soil, cracks, lit
//  rocks/boulders, debris, bone, tufts, bioluminescence, hazy distance.
//
//  ── EASY TO ADD ART ── every drawable goes through the ASSET REGISTRY
//  (ISO.assets); today all keys fall back to procedural placeholders. To add art:
//      ISO.registerSprite('rover', 'assets/iso/rover.png', { scale });
// ============================================================
(function () {
  const ISO = {
    on: (typeof localStorage === 'undefined' || localStorage.getItem('rh_iso') !== '0'),   // DEFAULT ON
    assets: {},
  };

  // ── camera / projection (mutable so the bay can use a zoomed, rover-centred shot) ──
  let TILE_W = 26, TILE_H = 14, YS = 31;
  const RCD = 3.0, DPM = 0.62, dNear = -16, dFar = 26;
  const NODE_STOP = 1.35, NODE_FAR = 34;   // node rests this far IN FRONT of the rover; stays in logic out to NODE_FAR
  const NODE_S = 2.25 / (1 + (3.0 + 1.35 + 1.2 * 0.62) * 0.05);   // fixed draw size (×1.5 = +50% resource size); no iso grow-in as they approach
  let W = 0, H = 0, GY = 0, ORX = 0, ORY = 0, HZ = 0, it = 0;
  let camZoom = 1;   // per-biome field zoom (B2 corridor zooms in to feel cramped); rover screen-anchor is zoom-invariant
  function setCam(w, h) { W = w; H = h; const z = camZoom; TILE_W = 26 * z; TILE_H = 14 * z; YS = 31 * z; ORX = W * 0.30 - RCD * TILE_W; ORY = H * 0.66 + RCD * TILE_H; HZ = ORY - dFar * TILE_H; }
  // ── BIOME-2 CORRIDOR geometry/feel knobs (all tunable) ──
  const B2_ZOOM   = 1.25;   // camera zoom for the cramped corridor (1 = same as B1)
  const FIELD_ZOOM = 1.4;   // open-biome zoom — bigger props + pushes the horizon/spawn-line up so things scroll in off-screen
  const CORR_HW   = 3.2;    // corridor half-width: floor spans x ∈ [-HW(back wall), +HW(near rail)]
  const ASM_HW    = 5.0;    // B3 assembly drive-lane half-width
  const ASM_BW    = 7.8;    // B3 back-wall distance (far side, beyond the lane) — set back so it reads as a depth LAYER, not a close corridor wall
  const WALL_H    = 3.6;    // back-wall height (y units)
  const RAIL_H    = 0.72;   // near-side low rail height
  const PANEL     = 1.7;    // wall/floor panel length in depth (scroll-repeat unit)
  const LIGHT_EVERY = 3;    // hang a worklight every N wall panels
  // Bay camera: z=0 → zoomed in, rover dead-centre; z=1 → exactly the field camera (so launch pulls back seamlessly).
  let bayFocusX = 0.5;   // horizontal screen anchor for the room centre (0.5 = middle; docked drawer shifts it left)
  // ── ROOM SYSTEM ── multiple iso ship rooms share the bay's machinery; each has a camera + fixtures + render fn.
  let curRoom = 'bay', roomActive = false;   // roomActive = a navigated ship room (foundry/bridge/…) is on screen
  const ROOM_CAM = {   // per-room framing knobs — smaller scale = zoomed out / more room visible
    bay:     { scale: 42, cd: 3.4, vcen: 0.56 },
    foundry: { scale: 38, cd: 3.2, vcen: 0.55 },
    bridge:  { scale: 38, cd: 3.2, vcen: 0.52 },
    lab:     { scale: 38, cd: 3.2, vcen: 0.55 },
  };
  ISO.enterRoom = n => { curRoom = ROOM_CAM[n] ? n : 'bay'; roomActive = (curRoom !== 'bay'); };
  ISO.exitRoom = () => { curRoom = 'bay'; roomActive = false; };
  ISO.getRoom = () => curRoom;
  function setBayCam(w, h, z) { W = w; H = h;
    const cam = ROOM_CAM[curRoom] || ROOM_CAM.bay;
    const fW = 26, fH = 14, fYS = 31, fORX = W * 0.30 - RCD * fW, fORY = H * 0.66 + RCD * fH;
    const bW = cam.scale, bH = cam.scale * 0.557, bYS = cam.scale * 1.286, bORX = W * bayFocusX - cam.cd * bW, bORY = H * cam.vcen + cam.cd * bH;
    const L = (a, b) => a + (b - a) * z;
    TILE_W = L(bW, fW); TILE_H = L(bH, fH); YS = L(bYS, fYS); ORX = L(bORX, fORX); ORY = L(bORY, fORY); HZ = ORY - dFar * TILE_H;
  }
  function proj(x, d, y) { return { x: ORX + x * TILE_W + d * TILE_W, y: ORY + x * TILE_H - d * TILE_H - y * YS }; }
  const psize = d => 1.5 / (1 + Math.max(0, d) * 0.05);
  // ── WORLD-OBJECT SCALE (true-iso) ──
  //  Discrete world props (rocks/boulders/pebbles/tufts/debris/glows) DON'T grow as they approach — they're
  //  drawn at a FIXED size (the size they have passing the rover). Opt back into perspective by calling psize(d).
  //  edgeFade keeps fixed-size props from popping at the cull edges (they fade in/out at far + near boundaries).
  const PROP_S = 1.5 / (1 + RCD * 0.05);                       // = psize(RCD): size as a prop passes the rover
  const sizeAt = () => PROP_S;
  const edgeFade = d => Math.max(0, Math.min(1, Math.min((dFar - d) / 4, (d - dNear) / 3)));

  // ── palette (Godhusk biome-1) ──
  // ── per-biome palettes (1 = Wasteland; variants reuse biome-1 keys + override environment colours) ──
  const PALETTES = {
    1: {
      sky: ['#3a4030', '#474a36', '#585842'],
      terrNear: '#5c5436', terrMid: '#4e4a30', terrFar: '#42452f',
      soilWarm: '#6a5e36', soilCool: '#474d36', soilDark: '#3a3422',
      crack: 'rgba(18,14,7,', trail: 'rgba(34,27,14,',
      rock: '#4a4632', rockLit: '#7c7252', rockDark: '#2f2c1d', rockSh: 'rgba(6,8,3,0.30)',
      boneL: '#bcb088', boneD: '#8a7e5a', metal: '#564a38', rust: '#7a5638',
      tuft: '#5a6a36', bio: '#84d65a', mesa: '#3c4530',
      rover: '#cdc7b4', roverHi: '#e6e0cc', tread: '#26241a', wheel: '#1b1912', hub: '#6a644e',
      eye: '#ff6a3a', core: '#7ad65a', organic: '#6aa84a', haze: 'rgba(150,158,108,',
      bay: '#3f463a', bayDk: '#2a2f26', bayFloor: '#4a4e40', bayLight: '#f0b860', bayDoor: '#343a30'
    }
  };
  // B2 Exhaust Corridor — enclosed biomech duct: metal plates, rusted pipes, mechanical-flesh sinew, sodium worklights.
  PALETTES[2] = Object.assign({}, PALETTES[1], { sky: ['#241b12', '#2f2316', '#3c2c1a'], terrNear: '#4e3c26', terrMid: '#423320', terrFar: '#36291a', soilWarm: '#5e4226', soilCool: '#48402a', rock: '#443826', rockLit: '#7e6242', rockDark: '#2a2014', mesa: '#2e2216', tuft: '#5a4e28', bio: '#f0b860', organic: '#c08a40', haze: 'rgba(150,120,70,',
    // corridor-specific surfaces (B2 only)
    void: '#0a0907',                                                                 // the unlit space beyond floor/walls
    floorPlate: '#3c3424', floorLit: '#564a32', floorSeam: '#19140c', floorWet: 'rgba(150,170,120,', // tiled deck
    wall: '#37301f', wallLit: '#574a34', wallDk: '#211b10', plateLit: '#6b5d42',     // back-wall plating
    pipe: '#6a5236', pipeLit: '#9c7c4e', pipeDk: '#352818', wire: '#241c12',         // pipes + wire bundles
    flesh: '#6e5048', fleshLit: '#9a6e62', fleshDk: '#3a2824',                       // mechanical-flesh sinew (Scorn/Giger)
    light: '#ffcf7a', lightGlow: 'rgba(255,196,110,', drip: 'rgba(150,170,110,',     // sodium worklights + ceiling ooze
    scene: 'corridor', zoom: 1.25 });                                                // ← opt into the reusable enclosed-corridor template (see renderCorridor). Set scene:'corridor' + a `zoom` on any future biome to reuse it.
  // B3 THE ASSEMBLY — semi-open biomech FLESH FACTORY / spawning ground (Scorn). MUDDIED RED meat, not bright.
  PALETTES[3] = Object.assign({}, PALETTES[1], {
    sky: ['#140a08', '#1b0e0b', '#23130f'], terrNear: '#3a241e', terrMid: '#2c1a15', terrFar: '#22130f',
    haze: 'rgba(92,48,38,', scene: 'assembly', zoom: 1.12, void: '#0c0706',
    floorPlate: '#33211b', floorLit: '#4a3128', floorSeam: '#150a08', floorGrime: '#1c0f0b',
    wall: '#3a201b', wallLit: '#5e362c', wallDk: '#1e0b08', wallStain: '#22100c',
    iron: '#3e2a22', ironLit: '#6a4636', ironDk: '#1d100c',
    flesh: '#7a3f37', fleshLit: '#a8604f', fleshDk: '#3c1d18', sinew: '#5a2e28',
    pod: '#6e3a31', podLit: '#9a5848', podDk: '#2a1310', podHollow: '#140807', membrane: '#b88a6a',
    bone: '#a89070', boneDk: '#6e5a44',
    light: '#c8745a', lightGlow: 'rgba(200,116,90,', drip: 'rgba(150,90,70,', organic: '#8a4a3a', bio: '#c87a5a' });
  // B4 Lightless Vault — pitch-black hive, violet bio-glow (rover lamp lights the near area)
  PALETTES[4] = Object.assign({}, PALETTES[1], { sky: ['#08070e', '#0c0a14', '#12101c'], terrNear: '#1c1824', terrMid: '#15131e', terrFar: '#0f0d16', soilWarm: '#241c30', soilCool: '#1e1c2a',
    // PROPS rendered in HIGH-CONTRAST greyscale so the 1-bit pass reads them as shaded forms (lit face → white
    // dither, shadow face → black) with crisp silhouettes. Ground stays dark (above) so props pop against it.
    rock: '#74747c', rockLit: '#eceef2', rockDark: '#0e0e12', rockSh: 'rgba(0,0,0,0.55)',
    boneL: '#eef0ea', boneD: '#83837e', metal: '#a2a2a8', rust: '#cfcfd4',
    mesa: '#141020', tuft: '#5c5c64', bio: '#d8d8e2', organic: '#9a9aa2', haze: 'rgba(70,55,100,', lamp: 'rgba(150,130,210,' });
  // B5 THE COLOSSUS — an ancient biomech entity fused with the planet over eons. Pulled-back camera, epic
  //  scale: a towering ribcage + a glowing CORE presence, roots merged into the ground. Awe, not action.
  PALETTES[5] = Object.assign({}, PALETTES[1], {
    sky: ['#0a0807', '#110b0a', '#190f0c'], scene: 'colossus', zoom: 1.0, void: '#070504', haze: 'rgba(120,66,46,',
    massFar: '#1b1411', massMid: '#241713', massNear: '#0c0807',
    rib: '#3a2c22', ribLit: '#5e4838', spine: '#46352a',
    core: '#ff8a44', coreHot: '#ffd9a0', coreDim: 'rgba(255,120,60,', ray: 'rgba(255,150,80,',
    root: '#241710', rootLit: '#3a2618',
    ground: '#1a130e', groundLit: '#2c2018', groundSeam: '#0c0806', mote: '#ffcaa0', lamp: 'rgba(255,150,80,' });
  let PAL = PALETTES[1], curBiome = 1;

  let G = null;
  function hexShade(hex, k) { const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; r = Math.min(255, r * k | 0); g = Math.min(255, g * k | 0); b = Math.min(255, b * k | 0); return 'rgb(' + r + ',' + g + ',' + b + ')'; }
  function quad(a, b, c, d, col) { G.fillStyle = col; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.lineTo(c.x, c.y); G.lineTo(d.x, d.y); G.closePath(); G.fill(); }
  function box(x, d, y, sx, sd, sy, base, crown) { const P = proj;
    quad(P(x + sx, d, y), P(x + sx, d + sd, y), P(x + sx, d + sd, y + sy), P(x + sx, d, y + sy), hexShade(base, 0.55));
    quad(P(x, d, y), P(x + sx, d, y), P(x + sx, d, y + sy), P(x, d, y + sy), hexShade(base, 0.8));
    quad(P(x, d, y + sy), P(x + sx, d, y + sy), P(x + sx, d + sd, y + sy), P(x, d + sd, y + sy), hexShade(base, crown ? 1.3 : 1.12));
  }
  function ell(cx, cy, rx, ry, col) { G.fillStyle = col; G.beginPath(); G.ellipse(cx, cy, rx, ry, 0, 0, 7); G.fill(); }
  function tri(a, b, c, col) { G.fillStyle = col; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.lineTo(c.x, c.y); G.closePath(); G.fill(); }
  function lineS(a, b, w, col) { G.strokeStyle = col; G.lineWidth = w; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
  function hash(n) { n = Math.sin(n * 127.1) * 43758.5453; return n - Math.floor(n); }
  function smooth(x, a, b) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  let prevStatus = '', fadeInT = 0; const FADE_IN_DUR = 2.0;   // field fade-in (through fog) after a launch
  const DRIVE_IN = 9;   // depth the rover starts behind its rest spot (off the bottom-left) when entering a biome
  function blob(cx, cy, rad, verts, seed, fill, sq) { sq = sq || 0.62; G.fillStyle = fill; G.beginPath();
    for (let i = 0; i < verts; i++) { const a = i / verts * 6.283, rr = rad * (0.72 + 0.5 * hash(seed + i)); const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * sq; i ? G.lineTo(px, py) : G.moveTo(px, py); }
    G.closePath(); G.fill(); }

  function prop(key, x, d, y, sx, sd, sy, base, opts) { opts = opts || {};
    const a = ISO.assets[key];
    if (a && a.ready) { const anc = proj(x + sx / 2, d + sd / 2, y), sc = a.scale || 1, iw = a.img.width * sc, ih = a.img.height * sc;
      const sm = G.imageSmoothingEnabled; G.imageSmoothingEnabled = false; G.drawImage(a.img, Math.round(anc.x - iw / 2), Math.round(anc.y - ih), Math.round(iw), Math.round(ih)); G.imageSmoothingEnabled = sm; return true; }
    box(x, d, y, sx, sd, sy, base, opts.crown); return false; }

  // ── SCENE MODULES (src/scenes/*.js) ─────────────────────────────────────────
  //  Biome scenes that were inlined here are being split into their own files. iso.js owns the renderer +
  //  shared helpers; each scene file registers `ISO.scenes[name] = fn(scv)` and reads `ISO.rc` (the live render
  //  context). `rc` exposes the stable helpers (always valid — they close over iso.js' camera/G) plus per-frame
  //  state synced by syncRC() just before a scene is dispatched. Add a <script> after iso.js for each scene.
  ISO.scenes = {};
  const rc = ISO.rc = { proj, box, quad, ell, tri, lineS, blob, hash, hexShade, smooth, prop };
  function syncRC() { rc.G = G; rc.W = W; rc.H = H; rc.it = it; rc.PAL = PAL; rc.curBiome = curBiome; rc.camZoom = camZoom; rc.scv = _sc; rc.dNear = dNear; rc.dFar = dFar; rc.RCD = RCD; rc.PANEL = PANEL; rc.HZ = HZ; rc.gY = GY; }

  // ── stable, richly-varied world scatter ──
  let patches = [], cracks = [], pebbles = [], rocks = [], boulders = [], tufts = [], debris = [], glows = [], mesas = [], wrecks = [], seeded = false;
  function seed() { seeded = true; const R = (a, b) => a + Math.random() * (b - a); const off = () => (Math.random() > 0.5 ? 1 : -1) * R(1.5, 15);
    patches = []; for (let i = 0; i < 60; i++) patches.push({ x: R(-16, 16), wd: R(0, 80), r: R(0.9, 3.6), tone: R(-1, 1) });
    cracks = []; for (let i = 0; i < 24; i++) cracks.push({ x: R(-14, 14), wd: R(0, 80), seed: R(0, 99), ang: R(0, 6.28), seg: 3 + (Math.random() * 3 | 0) });
    pebbles = []; for (let i = 0; i < 70; i++) pebbles.push({ x: R(-15, 15), wd: R(0, 80), r: R(0.05, 0.14) });
    rocks = []; for (let i = 0; i < 38; i++) rocks.push({ x: off(), wd: R(0, 80), r: R(0.22, 0.62), seed: R(0, 99) });
    boulders = []; for (let i = 0; i < 10; i++) boulders.push({ x: off(), wd: R(0, 80), r: R(0.85, 1.7), seed: R(0, 99) });
    tufts = []; for (let i = 0; i < 50; i++) tufts.push({ x: R(-15, 15), wd: R(0, 80), big: Math.random() > 0.93 });   // few glowing tufts
    debris = []; for (let i = 0; i < 22; i++) debris.push({ x: off(), wd: R(0, 80), kind: Math.random() > 0.5 ? 'bone' : 'metal', seed: R(0, 99) });
    glows = []; for (let i = 0; i < 5; i++) glows.push({ x: off(), wd: R(0, 80) });   // sparse drifting bio-motes
    mesas = []; for (let i = 0; i < 9; i++) mesas.push({ x: R(-26, 26), r: R(60, 150), h: R(12, 40) });
    // BIOME-4 GRAVEYARD scatter — dead expeditions + a signal boneyard (drawn only in B4 / b4force).
    wrecks = []; const WK = ['mast', 'mast', 'dish', 'deadrover', 'monolith', 'husk', 'mast', 'dish', 'husk'];
    for (let i = 0; i < WK.length; i++) wrecks.push({ x: (Math.random() > 0.5 ? 1 : -1) * R(3, 17), wd: R(0, 80), kind: WK[i], seed: R(0, 99), h: R(0.85, 1.3) });
  }
  const recycle = wd => ((wd - sc()) % 80 + 80) % 80 + dNear;   // wd→screen depth (set per-frame)
  let _sc = 0; function sc() { return _sc; }

  // ── scatter drawers (lit top-left, shadow bottom-right) ──
  function drawPebble(x, d, r) { const p = proj(x, d, 0), s = sizeAt(d), rr = r * 22 * s; ell(p.x + rr * 0.2, p.y + rr * 0.25, rr * 1.0, rr * 0.4, PAL.rockSh); ell(p.x, p.y, rr, rr * 0.7, PAL.rock); ell(p.x - rr * 0.2, p.y - rr * 0.2, rr * 0.5, rr * 0.35, PAL.rockLit); }
  function drawRock(x, d, r, seed) { const p = proj(x, d, 0), s = sizeAt(d), rr = r * 22 * s;
    ell(p.x + rr * 0.22, p.y + rr * 0.32, rr * 1.15, rr * 0.48, PAL.rockSh);
    blob(p.x, p.y, rr, 7, seed, PAL.rock); blob(p.x + rr * 0.12, p.y + rr * 0.16, rr * 0.7, 6, seed + 5, PAL.rockDark);
    blob(p.x - rr * 0.22, p.y - rr * 0.24, rr * 0.55, 6, seed + 9, PAL.rockLit); }
  function drawBoulder(x, d, r, seed) { const p = proj(x, d, 0), s = sizeAt(d), rr = r * 22 * s;
    ell(p.x + rr * 0.25, p.y + rr * 0.35, rr * 1.25, rr * 0.5, PAL.rockSh);
    blob(p.x, p.y, rr, 8, seed, PAL.rock); blob(p.x + rr * 0.14, p.y + rr * 0.18, rr * 0.78, 7, seed + 4, PAL.rockDark);
    blob(p.x - rr * 0.2, p.y - rr * 0.26, rr * 0.62, 7, seed + 8, PAL.rockLit);
    G.strokeStyle = PAL.rockDark; G.lineWidth = Math.max(1, 1.5 * s); G.beginPath(); G.moveTo(p.x - rr * 0.3, p.y - rr * 0.1); G.lineTo(p.x + rr * 0.1, p.y + rr * 0.2); G.stroke();
    G.fillStyle = 'rgba(124,114,82,0.5)'; G.beginPath(); G.ellipse(p.x - rr * 0.18, p.y - rr * 0.34, rr * 0.4, rr * 0.16, -0.3, 0, 7); G.fill(); }
  function drawTuft(x, d, big) { const p = proj(x, d, 0), s = sizeAt(d); G.strokeStyle = hexShade(PAL.tuft, 0.9); G.lineWidth = Math.max(1, 1.6 * s);
    for (let k = -2; k <= 2; k++) { G.beginPath(); G.moveTo(p.x + k * 2 * s, p.y); G.quadraticCurveTo(p.x + k * 3 * s, p.y - 4 * s, p.x + k * 4 * s + 2 * s, p.y - (6 + Math.abs(2 - k)) * s); G.stroke(); }
    if (big) { G.globalAlpha = 0.45 + 0.4 * Math.sin(it * 3 + x); ell(p.x, p.y - 7 * s, 2.4 * s, 2.4 * s, PAL.bio); G.globalAlpha = 1; } }
  function drawDebris(x, d, kind, seed) { const p = proj(x, d, 0), s = sizeAt(d);
    ell(p.x + 3 * s, p.y + 3 * s, 12 * s, 4 * s, PAL.rockSh);
    if (kind === 'bone') { for (let i = 0; i < 3; i++) { const a = hash(seed + i) * 3.14, len = (10 + hash(seed + i * 2) * 10) * s, ox = (hash(seed + i) - 0.5) * 14 * s, oy = (hash(seed + i + 9) - 0.5) * 6 * s;
        G.save(); G.translate(p.x + ox, p.y + oy); G.rotate(a * 0.4 - 0.2); G.fillStyle = PAL.boneD; G.beginPath(); G.ellipse(0, 1.5 * s, len, 2.6 * s, 0, 0, 7); G.fill(); G.fillStyle = PAL.boneL; G.beginPath(); G.ellipse(0, 0, len, 2.2 * s, 0, 0, 7); G.fill();
        ell(-len, 0, 3 * s, 3 * s, PAL.boneL); ell(len, 0, 3 * s, 3 * s, PAL.boneL); G.restore(); } }
    else { for (let i = 0; i < 3; i++) { const px = p.x + (hash(seed + i) - 0.5) * 18 * s, py = p.y + (hash(seed + i + 5) - 0.5) * 8 * s, ss = (5 + hash(seed + i) * 6) * s;
        G.fillStyle = i % 2 ? PAL.rust : PAL.metal; G.beginPath(); G.moveTo(px - ss, py); G.lineTo(px, py - ss * 0.8); G.lineTo(px + ss, py + ss * 0.2); G.lineTo(px, py + ss * 0.7); G.closePath(); G.fill();
        G.strokeStyle = 'rgba(150,134,100,0.4)'; G.lineWidth = 1; G.stroke(); } } }
  // a small bioluminescent MOTE that floats and drifts gently above the ground (sparse; no static stalks)
  function drawGlow(x, d) { const p = proj(x, d, 0), s = sizeAt(d), pu = 0.5 + 0.5 * Math.sin(it * 1.6 + x * 3);
    const cx = p.x + Math.sin(it * 0.5 + x * 2) * 5 * s, cy = p.y - (12 + Math.sin(it * 0.8 + x) * 4) * s;
    G.globalAlpha = 0.08 + 0.08 * pu; ell(cx, cy, 13 * s, 13 * s, PAL.bio); G.globalAlpha = 1;       // soft halo
    G.globalAlpha = 0.45 + 0.4 * pu; ell(cx, cy, 2.6 * s, 2.6 * s, '#bfffa0'); G.globalAlpha = 1; }   // core

  // ── BIOME-4 GRAVEYARD PROPS — signal boneyard: dead rovers, antenna masts, dishes, monoliths, husks.
  //  Built from silhouettes (dark body + thin lit edges) so they read in the 1-bit dead-signal pass.
  function drawMast(x, d, seed, hm) { const s = sizeAt(d), Ht = (6 + hash(seed) * 3) * (hm || 1), lean = (hash(seed + 3) - 0.5) * 0.6;
    const g0 = proj(x, d, 0); ell(g0.x, g0.y + 2 * s, 9 * s, 3 * s, PAL.rockSh);
    const L = [-0.4, 0.4].map(lx => ({ b: proj(x + lx, d, 0), t: proj(x + lean, d, Ht) }));
    G.strokeStyle = PAL.rockDark; G.lineWidth = Math.max(1, 2 * s);
    L.forEach(g => { G.beginPath(); G.moveTo(g.b.x, g.b.y); G.lineTo(g.t.x, g.t.y); G.stroke(); });
    G.lineWidth = Math.max(1, 1.1 * s);                                   // lattice cross-bracing
    const lp = (g, f) => ({ x: g.b.x + (g.t.x - g.b.x) * f, y: g.b.y + (g.t.y - g.b.y) * f });
    for (let k = 1; k < 6; k++) { const f = k / 6, a = lp(L[0], f), b = lp(L[1], f);
      G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke();
      if (k < 5) { const b2 = lp(L[1], f + 1 / 6); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b2.x, b2.y); G.stroke(); } }
    const tp = proj(x + lean, d, Ht); G.strokeStyle = PAL.rockDark; G.lineWidth = Math.max(1, 1.4 * s);   // dead crossbar + beacon
    G.beginPath(); G.moveTo(tp.x - 7 * s, tp.y); G.lineTo(tp.x + 7 * s, tp.y); G.stroke();
    ell(tp.x, tp.y - 2 * s, 2.2 * s, 2.2 * s, PAL.rockLit); }
  function drawDish(x, d, seed) { const s = sizeAt(d), Ht = 3 + hash(seed), lean = (hash(seed + 2) - 0.5) * 0.5;
    const b = proj(x, d, 0); ell(b.x, b.y + 2 * s, 8 * s, 3 * s, PAL.rockSh);
    const top = proj(x + lean, d, Ht); lineS(b, top, Math.max(1, 2.2 * s), PAL.rockDark);
    G.save(); G.translate(top.x, top.y); G.rotate(-0.5);
    G.fillStyle = PAL.rockDark; G.beginPath(); G.ellipse(0, 0, 9 * s, 5 * s, 0, 0, 7); G.fill();
    G.fillStyle = PAL.rockLit; G.beginPath(); G.ellipse(1 * s, -0.5 * s, 6.4 * s, 3.3 * s, 0, 0, 7); G.fill();
    G.strokeStyle = PAL.rockDark; G.lineWidth = Math.max(1, 1.2 * s); G.beginPath(); G.moveTo(0, 0); G.lineTo(3 * s, -6 * s); G.stroke();
    ell(3 * s, -6 * s, 1.5 * s, 1.5 * s, PAL.rockLit); G.restore(); }
  function drawMonolith(x, d, seed) { const s = sizeAt(d), Ht = 4 + hash(seed) * 2.5;
    box(x - 0.35, d, 0, 0.7, 0.5, Ht, PAL.rockDark);
    const f = proj(x, d, Ht * 0.5); G.globalAlpha = 0.10 + 0.10 * Math.sin(it * 9 + x * 5);   // static shimmer on the slab face
    G.fillStyle = PAL.rockLit; for (let i = 0; i < 7; i++) G.fillRect(f.x - 7 * s, f.y - 22 * s + i * 6 * s, 14 * s, 1.3 * s);
    G.globalAlpha = 1; }
  function drawDeadRover(x, d, seed) { const s = sizeAt(d), g0 = proj(x, d, 0); ell(g0.x + 3 * s, g0.y + 3 * s, 17 * s, 5 * s, PAL.rockSh);
    box(x - 0.8, d, 0, 1.6, 1.1, 0.65, PAL.rockDark);                       // sunk hull
    box(x - 0.4, d + 0.2, 0.65, 0.8, 0.6, 0.4, PAL.rock);                   // cocked cabin
    const a0 = proj(x + 0.4, d + 0.3, 1.0), a1 = proj(x + 1.0, d + 0.3, 2.5); lineS(a0, a1, Math.max(1, 1.4 * s), PAL.rockDark);   // snapped antenna
    for (const wx of [-0.7, 0.7]) { const wp = proj(x + wx, d + 0.95, 0.1); ell(wp.x, wp.y, 3.2 * s, 2 * s, PAL.rockDark); ell(wp.x, wp.y, 1.4 * s, 0.9 * s, PAL.rockLit); } }
  function drawHusk(x, d, seed) { const s = sizeAt(d), g0 = proj(x, d, 0); ell(g0.x, g0.y + 2 * s, 5 * s, 2 * s, PAL.rockSh);
    const Ht = 2 + hash(seed) * 0.8, lean = (hash(seed + 1) - 0.5) * 0.7;
    const hip = proj(x, d, Ht * 0.45), head = proj(x + lean, d, Ht), arm = proj(x + lean - 0.6, d, Ht * 0.55);
    G.lineCap = 'round'; lineS(g0, hip, Math.max(1, 2.4 * s), PAL.rockDark); lineS(hip, head, Math.max(1, 2.6 * s), PAL.rockDark);
    lineS(hip, arm, Math.max(1, 1.4 * s), PAL.rockDark); G.lineCap = 'butt';
    ell(head.x, head.y, 2.2 * s, 2.6 * s, PAL.rock); }
  function drawWreck(o, sd) { const k = o.kind;
    if (k === 'mast') return drawMast(o.x, sd, o.seed, o.h);
    if (k === 'dish') return drawDish(o.x, sd, o.seed);
    if (k === 'monolith') return drawMonolith(o.x, sd, o.seed);
    if (k === 'deadrover') return drawDeadRover(o.x, sd, o.seed);
    return drawHusk(o.x, sd, o.seed); }

  // ── resource node SHAPE — drawn per obsShape (heap/shard/crystal/cyst/node) instead of a plain cube ──
  function nodeShape(def, sd) {
    const b4 = (curBiome === 4 || (window.ISO && ISO.b4force));   // B4: render nodes mid-GREY so the cone doesn't blow them to a white blob; facet shading + edges stay
    // B4 base = a green-BIASED grey (G>R). The post-pass detects that bias as "this is a node" and renders it
    // from its own albedo with NO cone light — so the node keeps its shading even inside the beam (not blown white).
    const c = b4 ? '#5f725f' : def.color, shp = def.obsShape, p = proj(0, sd, 0), s = NODE_S;   // FIXED size (no iso grow-in) — position still tracks depth
    const lit = hexShade(c, 1.45), mid = c, dk = hexShade(c, 0.56);
    const rare = def.tier === 'exotic' || (def.weight > 0 && def.weight <= 10), organic = def.category === 'Organic Matter', lum = (rare || organic) && !b4;   // skip the pulsing glow in B4 (it reads as blinding)
    const pu = 0.5 + 0.5 * Math.sin(it * (organic ? 3.2 : 2.0) + sd);
    G.strokeStyle = 'rgba(8,9,5,0.55)'; G.lineWidth = Math.max(1, 2 * s);   // dark rim helps it pop off the terrain
    if (shp === 'heap') {                                   // craggy ORE-ROCK — a pile of angular mineral chunks (reads as rock, not a puddle)
      ell(p.x, p.y + 4 * s, 23 * s, 8 * s, 'rgba(8,9,5,0.30)');   // contact shadow
      [[-0.06, 0.05, 0.95, 2], [0.07, 0.01, 0.82, 11], [-0.01, -0.05, 1.25, 23], [0.05, 0.08, 0.6, 37]].forEach(([ox, od, sc2, se], i) => {
        const q = proj(ox, sd + od, 0), r = 13 * s * sc2, lift = r * 0.55;
        blob(q.x, q.y - lift * 0.25, r, 6, se, hexShade(c, 0.42), 0.8);            // shadowed sides + dark rim mass
        blob(q.x - r * 0.16, q.y - lift, r * 0.74, 6, se + 3, dk, 0.72);           // mid body
        blob(q.x - r * 0.26, q.y - lift * 1.4, r * 0.46, 5, se + 7, i % 2 ? lit : mid, 0.7);   // lit top facet (catches the light)
        for (let k = 0; k < 2; k++) { const a = hash(se + k * 4) * 6.28; ell(q.x + Math.cos(a) * r * 0.38, q.y - lift + Math.sin(a) * r * 0.28, 1.7 * s, 1.7 * s, lit); }   // ore glints in the rock
      });
    } else if (shp === 'shard' || shp === 'crystal') {      // faceted crystal
      const hh = (shp === 'crystal' ? 56 : 42) * s, bw = 14 * s;
      G.fillStyle = dk; G.beginPath(); G.moveTo(p.x - bw, p.y); G.lineTo(p.x - bw * 0.3, p.y - hh); G.lineTo(p.x + bw, p.y - hh * 0.32); G.lineTo(p.x + bw * 0.4, p.y + 1); G.closePath(); G.fill(); G.stroke();
      G.fillStyle = mid; G.beginPath(); G.moveTo(p.x - bw * 0.3, p.y - hh); G.lineTo(p.x + bw, p.y - hh * 0.32); G.lineTo(p.x + bw * 0.1, p.y - hh * 0.1); G.closePath(); G.fill();
      G.fillStyle = lit; G.beginPath(); G.moveTo(p.x - bw, p.y); G.lineTo(p.x - bw * 0.3, p.y - hh); G.lineTo(p.x - bw * 0.05, p.y - hh * 0.5); G.closePath(); G.fill();
      if (lum) { G.globalAlpha = 0.3 + 0.45 * pu; ell(p.x, p.y - hh * 0.5, 8 * s, 9 * s, lit); G.globalAlpha = 1; }
    } else if (shp === 'cyst') {                            // organic pod
      ell(p.x, p.y - 9 * s, 18 * s, 14 * s, dk); G.beginPath(); G.ellipse(p.x, p.y - 9 * s, 18 * s, 14 * s, 0, 0, 7); G.stroke();
      G.strokeStyle = hexShade(c, 1.2); G.lineWidth = Math.max(1, 1.4 * s); G.beginPath(); G.moveTo(p.x - 12 * s, p.y - 6 * s); G.quadraticCurveTo(p.x, p.y - 26 * s, p.x + 12 * s, p.y - 6 * s); G.stroke();
      G.globalAlpha = 0.45 + 0.45 * pu; ell(p.x, p.y - 12 * s, 8 * s * (0.8 + 0.2 * pu), 8 * s, lit); G.globalAlpha = 1;
    } else {                                                 // rounded node lump
      ell(p.x, p.y - 2 * s, 18 * s, 13 * s, dk); G.beginPath(); G.ellipse(p.x, p.y - 2 * s, 18 * s, 13 * s, 0, 0, 7); G.stroke();
      ell(p.x - 3 * s, p.y - 6 * s, 9 * s, 7 * s, mid);
      if (lum) { for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28 + it * 0.6; G.globalAlpha = 0.5; ell(p.x + Math.cos(a) * 14 * s, p.y - 4 * s + Math.sin(a) * 8 * s, 2.2 * s, 2.2 * s, lit); } G.globalAlpha = 1; ell(p.x, p.y - 5 * s, 5 * s, 5 * s, lit); }
    }
  }
  function drawNode(def, sd, harvest, harvesting, list) { const s = 0.7, h = 0.7 + (def.weight <= 8 ? 0.4 : 0.1);
    // Nodes spawn off-screen at the upper-RIGHT (iso "forward" = up-right) and scroll in toward the rover.
    // Fade in over the last stretch as they cross the right/top edge so they don't pop into view.
    const p0 = proj(0, sd, 0);
    const fade = Math.max(0, Math.min(1, Math.min((W - p0.x) / 90, p0.y / 90)));
    if (fade <= 0.001) return;
    list.push({ d: sd, f: () => { G.globalAlpha = fade; const sp = proj(0, sd + 0.35, 0); G.globalAlpha = 0.32 * fade; ell(sp.x, sp.y, 24 * NODE_S, 9 * NODE_S, '#000'); G.globalAlpha = fade;
      if (ISO.assets[def.id] && ISO.assets[def.id].ready) prop(def.id, -s / 2, sd, 0, s, s, h, def.color, {});
      else nodeShape(def, sd);
      if (harvesting) { const p0 = proj(-0.9, sd, h + 1.1), bw = 44; G.fillStyle = '#0c0b06'; G.fillRect(p0.x - 2, p0.y - 2, bw + 4, 8); G.fillStyle = '#2a2618'; G.fillRect(p0.x, p0.y, bw, 4); G.fillStyle = hexShade(def.color, 1.25); G.fillRect(p0.x, p0.y, bw * Math.max(0, Math.min(1, harvest)), 4); } G.globalAlpha = 1; } }); }
  // Map a hostile's screen-space (game-logic) position into iso space. Lateral is WIDENED (±4.5) so the
  // drones roam the whole field, not just the rail. Shared by drawEnemy + the rover's lock-on targeting.
  function enemyPos(en) {
    const depth = Math.max(RCD - 1, Math.min(dFar - 2, RCD + ((en.x - (typeof ROVERX === 'number' ? ROVERX : 150)) / (typeof PX === 'number' ? PX : 12)) * DPM));
    const latLim = (PAL.scene === 'corridor') ? CORR_HW - 0.7 : (PAL.scene === 'assembly') ? ASM_HW - 1.0 : 4.5;   // keep drones inside the walls in enclosed scenes
    const lat = Math.max(-latLim, Math.min(latLim, (en.y - H * 0.5) / 52));
    return { lat, depth };
  }
  // Hostile = a hovering BIOMECH CAMERA DRONE: dark organic-metal hull, a glowing lens-eye with a slit
  // pupil, segmented limbs + a sensor antenna. Reads as "of the world", not a free-floating glow orb.
  function drawEnemy(en, list) {
    const { lat, depth } = enemyPos(en);
    list.push({ d: depth + 0.01, f: () => {
      if (en.dead) { const fd = Math.max(0, en.deathTimer / 0.5), dr = (1 - fd) * 20, c = proj(lat, depth, 1.5); G.globalAlpha = fd; G.strokeStyle = `hsl(${en.escaped ? 200 : en.hue},90%,68%)`; G.lineWidth = 2; G.beginPath(); G.arc(c.x, c.y, dr, 0, 7); G.stroke(); G.globalAlpha = 1; return; }
      const hue = en.hue, r = 18, gp = proj(lat, depth, 0), c = proj(lat, depth, 1.5 + 0.16 * Math.sin(it * 2 + en.pulse));
      G.globalAlpha = 0.30; ell(gp.x, gp.y, r * 1.1, r * 0.42, '#060804'); G.globalAlpha = 1;                  // contact shadow
      G.save(); G.globalCompositeOperation = 'lighter';                                                       // big AMBER halo — glow + survives the B4 1-bit pass
      const hg = G.createRadialGradient(c.x, c.y, 1, c.x, c.y, r * 2.6); hg.addColorStop(0, `hsla(${hue},100%,66%,${0.45 + 0.2 * Math.sin(it * 5 + en.pulse)})`); hg.addColorStop(0.5, `hsla(${hue},100%,52%,0.18)`); hg.addColorStop(1, `hsla(${hue},100%,50%,0)`);
      G.fillStyle = hg; G.fillRect(c.x - r * 2.6, c.y - r * 2.6, r * 5.2, r * 5.2); G.restore();
      G.strokeStyle = '#23271a'; G.lineWidth = 2;                                                            // segmented limbs (under) + sensor antenna (up)
      for (const sgn of [-1, 1]) { G.beginPath(); G.moveTo(c.x + sgn * r * 0.55, c.y + r * 0.38); G.quadraticCurveTo(c.x + sgn * r * 1.0, c.y + r * 0.9, c.x + sgn * r * 0.72, c.y + r * 1.35); G.stroke(); }
      G.beginPath(); G.moveTo(c.x, c.y - r * 0.8); G.lineTo(c.x + r * 0.12, c.y - r * 1.5); G.stroke();
      ell(c.x + r * 0.12, c.y - r * 1.5, 1.8, 1.8, `hsl(${hue},90%,62%)`);
      ell(c.x, c.y + r * 0.26, r * 0.95, r * 0.5, '#191c12');                                                // hull underside (shaded)
      ell(c.x, c.y, r, r * 0.9, '#2c3024');                                                                  // hull
      ell(c.x - r * 0.26, c.y - r * 0.3, r * 0.42, r * 0.26, '#3c4232');                                     // top highlight
      G.strokeStyle = '#171a10'; G.lineWidth = 1.4; G.beginPath(); G.ellipse(c.x, c.y, r * 0.96, r * 0.84, 0, 0.5, 2.64); G.stroke();   // plate seam
      const lr = r * 0.62, pu = 0.85 + 0.15 * Math.sin(it * 5 + en.pulse);                                   // CAMERA LENS / eye
      ell(c.x, c.y, lr, lr * 0.95, '#101208');
      G.strokeStyle = '#3a4030'; G.lineWidth = 1.5; G.beginPath(); G.ellipse(c.x, c.y, lr, lr * 0.95, 0, 0, 7); G.stroke();
      G.save(); G.shadowBlur = 16; G.shadowColor = `hsl(${hue},95%,58%)`;
      const grd = G.createRadialGradient(c.x - lr * 0.2, c.y - lr * 0.2, 0, c.x, c.y, lr * 0.82 * pu);
      grd.addColorStop(0, `hsl(${hue},100%,82%)`); grd.addColorStop(0.55, `hsl(${hue},88%,46%)`); grd.addColorStop(1, '#0a0a06');
      G.fillStyle = grd; G.beginPath(); G.ellipse(c.x, c.y, lr * 0.78, lr * 0.74, 0, 0, 7); G.fill(); G.shadowBlur = 0; G.restore();
      G.fillStyle = '#0a0a06'; G.fillRect(c.x - 1.2, c.y - lr * 0.55, 2.4, lr * 1.1);                        // pupil slit
      ell(c.x - lr * 0.28, c.y - lr * 0.28, 1.8, 1.8, 'rgba(255,255,255,0.85)');                             // glint
      // ── HP BAR (only after a hit; fades out as hitTimer runs down) ──
      if (en.hitTimer > 0 && en.maxHp) {
        const frac = Math.max(0, Math.min(1, en.hp / en.maxHp)), a = Math.min(1, en.hitTimer / 0.5);
        const bw = r * 2.0, bh = 3.2, bx = c.x - bw / 2, by = c.y - r * 1.9;
        G.globalAlpha = a;
        G.fillStyle = 'rgba(8,9,6,0.85)'; G.fillRect(bx - 1, by - 1, bw + 2, bh + 2);                        // backing
        G.fillStyle = frac > 0.5 ? '#9be08a' : frac > 0.25 ? '#e0c25a' : '#e06a4a';                          // green→amber→red
        G.fillRect(bx, by, bw * frac, bh);
        G.strokeStyle = 'rgba(0,0,0,0.6)'; G.lineWidth = 1; G.strokeRect(bx - 0.5, by - 0.5, bw + 1, bh + 1);
        G.globalAlpha = 1;
      }
    } });
  }
  // faint exhaust puff trailing a drone (low alpha, drifts up + expands → reads as smoke, not a glow)
  function drawSmoke() { for (const s of smoke) { const a = Math.max(0, s.life / s.max); G.globalAlpha = a * 0.22; ell(s.x, s.y, s.r, s.r * 0.8, '#6b6f62'); } G.globalAlpha = 1; }   // soft pale haze (reads against the olive ground)
  // ── ROVER ───────────────────────────────────────────────────────────────────
  //  Requested silhouette: rectangular armoured body on two tracks, a GREEN BATTERY
  //  PACK on the rear, a boxed EYE on a front pole, a TOP-MOUNTED ROTATING RADAR
  //  DISH, a front DRILL and a small auto-turret. Animated sub-parts: tracks roll
  //  with travel (scv), radar sweeps, battery pulses, the drill spins/shakes while
  //  harvesting, the turret tracks the nearest hostile and muzzle-flashes on fire.
  let roverFx = { harvest: 0, fire: 0, tgt: null };   // set each frame by renderField
  let roverDOff = 0;   // depth shift for recall (pull back, -ve) / descend (drive forward, +ve)
  let drillExt = 0;    // 0 = drill retracted inside the nose, 1 = fully extended (eased in ISO.tick)
  let shards = [];     // resource destruction debris (screen-space particles; spawned by ISO.shatter)
  let reticle = null;  // lagging red targeting crosshair that trails the nearest hostile (fighter-jet lock-on)
  let beam = null;     // transient laser bolt fired at a hostile ON CLICK (the turret only TRACKS otherwise)
  let dust = [];       // soil plume kicked up behind the tracks while driving (tinted to the biome palette)
  let drips = [];      // B2 corridor: ceiling ooze drops (fall, then splash) + slow steam wisps
  let smoke = [];      // faint exhaust/smoke puffs trailing the hostile drones (screen-space, low alpha)
  // ── DRIVE SHAKE / TERRAIN BOB ─ the field jolts & bobs while the rover is moving, scaling
  //  with speed so faster runs feel rougher (uneven ground). Tunable knobs:
  const SHAKE_REF = 6.0;   // depth-units/sec that counts as "full" intensity (lower = easier to max out)
  const SHAKE_MAX = 3.2;   // px — peak horizontal jitter at full speed
  const BOB_MAX   = 4.0;   // px — peak vertical bob (the up/down "rolling over terrain" motion)
  let _lastDt = 0, _prevSc = null, _driveSpeed = 0;   // smoothed instantaneous scroll speed

  function trackUnit(latOuter, latWheel, cd, len, scv, ps) {
    box(latOuter, cd, -0.16, 0.30, len, 0.54, PAL.tread, false);                        // tread frame
    const links = 7; for (let i = 0; i < links; i++) { const f = ((i / links) + (scv * 0.35 % 1)) % 1, wd = cd + 0.1 + f * (len - 0.2);
      lineS(proj(latOuter, wd, 0.40), proj(latOuter + 0.30, wd, 0.40), 1.4 * ps, hexShade(PAL.tread, 1.5)); }   // moving track links
    for (let i = 0; i < 4; i++) { const wd = cd + 0.34 + i * ((len - 0.62) / 3), wp = proj(latWheel, wd, 0.02), wr = 7 * ps;
      ell(wp.x, wp.y, wr, wr * 0.92, PAL.wheel); ell(wp.x, wp.y, wr * 0.55, wr * 0.5, PAL.hub);
      const a = scv * 2.2 + i * 1.3; lineS(wp, { x: wp.x + Math.cos(a) * wr * 0.7, y: wp.y + Math.sin(a) * wr * 0.6 }, 1.4 * ps, '#0a0906'); }
  }

  // rover drawn at an arbitrary depth (shared by the field list + the bay rollout)
  function roverBoxes(cd, scv) {
    const len = 2.4, fx = roverFx, ps = TILE_W / 26;
    const sp = proj(0, cd + len / 2, 0); G.globalAlpha = 0.30; ell(sp.x, sp.y + 4 * ps, 34 * ps, 11 * ps, '#000'); G.globalAlpha = 1;
    if (ISO.assets.rover && ISO.assets.rover.ready) { prop('rover', -1.0, cd, 0, 2.0, len, 1.0, PAL.rover, {}); return; }

    trackUnit(-1.06, -0.92, cd, len, scv, ps);                                          // FAR track (behind body)

    // ── REAR GREEN BATTERY PACK (chunky module bolted to the back of the hull) ──
    const bd = cd - 0.44, bpul = 0.55 + 0.45 * Math.sin(it * 3);
    box(-0.52, bd, 0.14, 1.04, 0.52, 0.62, hexShade(PAL.core, 0.85), false);                 // housing
    for (let i = 0; i < 3; i++) box(-0.40 + i * 0.34, bd + 0.10, 0.74, 0.20, 0.24, 0.12, PAL.core, true);   // cell caps on top
    for (let i = 0; i < 5; i++) { const rx = -0.44 + i * 0.20; lineS(proj(rx, bd, 0.18), proj(rx, bd, 0.70), 1.2 * ps, hexShade(PAL.core, 0.45)); }   // cell ribs (rear face)
    const bf = proj(0.0, bd, 0.42); G.globalAlpha = 0.5 * bpul; ell(bf.x, bf.y, 12 * ps, 4 * ps, '#dfffc8'); G.globalAlpha = 1;   // emissive charge vent
    ell(bf.x, bf.y, 9 * ps, 2 * ps, '#bfffa0');

    // ── ARMOURED RECTANGULAR BODY ──
    box(-0.86, cd, 0.02, 1.72, len, 0.20, hexShade(PAL.rover, 0.62), false);            // dark skirt
    box(-0.84, cd, 0.20, 1.68, len, 0.66, PAL.rover, false);                            // main hull
    for (let i = 1; i < 4; i++) lineS(proj(-0.84, cd + len * i / 4, 0.86), proj(0.84, cd + len * i / 4, 0.86), 1 * ps, hexShade(PAL.rover, 0.7));   // panel seams
    box(-0.5, cd + 0.62, 0.86, 1.0, 0.95, 0.34, PAL.roverHi, true);                     // raised equipment deck

    // ── TOP ROTATING RADAR DISH ──
    const mX = 0.0, mD = cd + 1.05, mTop = 1.62, rot = it * 1.3, rr = 0.46;
    box(mX - 0.06, mD - 0.06, 1.20, 0.12, 0.12, 0.42, hexShade(PAL.rover, 0.65), false);   // mast
    const mp = proj(mX, mD, mTop), dh = proj(mX + Math.sin(rot) * rr, mD + Math.cos(rot) * rr, mTop + 0.06);
    lineS(mp, dh, 2 * ps, hexShade(PAL.rover, 0.55));                                   // support strut
    const fw = (9 + 5 * Math.cos(rot)) * ps;                                            // foreshorten with rotation
    ell(dh.x, dh.y, Math.abs(fw) + 2 * ps, 7 * ps, hexShade(PAL.rover, 0.55));          // dish back
    ell(dh.x, dh.y - 1, Math.abs(fw), 5.5 * ps, hexShade(PAL.rover, 1.18));             // dish face
    ell(dh.x, dh.y, 1.6 * ps, 1.6 * ps, PAL.eye);                                       // feed horn

    // ── FRONT SENSOR POLE + BOXED EYE ──
    box(-0.16, cd + len - 0.30, 0.86, 0.32, 0.30, 0.52, hexShade(PAL.rover, 0.85), false);   // neck
    const ey = proj(0.0, cd + len - 0.05, 1.34), es = 4 * ps;
    G.fillStyle = '#141008'; G.fillRect(ey.x - es - 1, ey.y - es - 1, es * 2 + 2, es * 2 + 2);
    G.save(); G.shadowBlur = 8 * ps; G.shadowColor = PAL.eye; G.fillStyle = PAL.eye; G.fillRect(ey.x - es, ey.y - es, es * 2, es * 2); G.shadowBlur = 0; G.restore();

    // ── FRONT DRILL (big auger out the FRONT FACE of the hull; telescopes further out while harvesting) ──
    const ext = drillExt, dSpin = it * (ext > 0.05 ? 26 : 4), dShake = ext > 0.4 ? Math.sin(it * 55) * 1.7 * ps * ext : 0;
    const dy = 0.16;                                                                        // axis height: low on the front face (reads as the body's nose, not the deck)
    box(-0.32, cd + len - 0.06, -0.02, 0.64, 0.20, 0.46, hexShade(PAL.hub, 1.0), false);    // chunky drill housing bolted to the front
    const baseD = cd + len + 0.04 + ext * 0.45, tipD = cd + len + 0.60 + ext * 0.95;         // bit base AT the front face, tip reaches forward to the ore
    const db = proj(0.0, baseD, dy), dt = proj(0.0, tipD, dy), br = 14 * ps;
    G.save(); G.translate(dShake, 0);
    lineS(proj(0.0, cd + len - 0.02, dy), db, 10 * ps, hexShade(PAL.hub, 0.85));             // shaft from the housing
    tri({ x: db.x - br, y: db.y - br * 0.75 }, { x: db.x + br, y: db.y - br * 0.2 }, dt, '#9a948a');   // cone (lit)
    tri({ x: db.x - br, y: db.y - br * 0.75 }, { x: db.x, y: db.y + br * 0.6 }, dt, '#54504a');         // cone (shade)
    for (let i = 0; i < 4; i++) { const f = (i / 4 + (dSpin % 1)) % 1, p = { x: db.x + (dt.x - db.x) * f, y: db.y - br * 0.45 + (dt.y - (db.y - br * 0.45)) * f }; ell(p.x, p.y, br * 0.34 * (1 - f * 0.55), br * 0.22, '#d8d3c8'); }   // spiral flighting
    G.restore();
    if (ext > 0.5) for (let i = 0; i < 5; i++) { const a = Math.random() * 6.28, r = Math.random() * 9 * ps; ell(dt.x + Math.cos(a) * r, dt.y + Math.sin(a) * r, 1.6 * ps, 1.6 * ps, i % 2 ? '#ffd27a' : '#fff2c0'); }

    // ── TOP AUTO-TURRET (barrel just TRACKS the nearest hostile; the red reticle conveys the lock-on.
    //    No tracer/muzzle-flash — a fake "laser" reads as shooting when it isn't). ──
    const tD = cd + 0.55, tc = proj(0.0, tD, 1.06);
    box(-0.2, tD, 0.88, 0.4, 0.4, 0.22, hexShade(PAL.rover, 0.8), false);               // turret ring
    let bang = -0.5; if (fx.tgt) { const tp = proj(fx.tgt.lat, fx.tgt.depth, 1.4); bang = Math.atan2(tp.y - tc.y, tp.x - tc.x); }
    const bl = 16 * ps, muz = { x: tc.x + Math.cos(bang) * bl, y: tc.y + Math.sin(bang) * bl };
    lineS(tc, muz, 3 * ps, hexShade(PAL.rover, 0.5));                                    // barrel (aims at the target)

    trackUnit(0.76, 0.92, cd, len, scv, ps);                                            // NEAR track (in front of body)
  }
  function drawRover(list, scv) { const o = roverDOff; list.push({ d: RCD + 0.2 + o, f: () => roverBoxes(RCD - 1.1 + o, scv) }); }
  rc.roverBoxes = roverBoxes;   // expose the ISO rover for split scenes (e.g. B5 colossus places it on the catwalk)

  // ── DETAILED BAY INTERIOR (its own enclosed environment; first thing the player sees) ──
  let bayCv = null, bayG = null;
  function blink(p, col, ph, r) { const on = 0.45 + 0.55 * Math.sin(it * 4 + ph); G.globalAlpha = 0.4 + 0.6 * on; G.fillStyle = col; G.fillRect(p.x - 2, p.y - 2, 4, 4); G.globalAlpha = 0.28 * on; G.beginPath(); G.arc(p.x, p.y, (r || 8), 0, 7); G.fill(); G.globalAlpha = 1; }
  function lamp(p, w, hgt, warm) { const grd = G.createLinearGradient(p.x, p.y, p.x, p.y + hgt); grd.addColorStop(0, warm ? 'rgba(245,200,110,0.18)' : 'rgba(150,180,170,0.14)'); grd.addColorStop(1, 'rgba(245,200,110,0)'); G.fillStyle = grd; G.beginPath(); G.moveTo(p.x - 3, p.y); G.lineTo(p.x + 3, p.y); G.lineTo(p.x + w, p.y + hgt); G.lineTo(p.x - w, p.y + hgt); G.closePath(); G.fill(); G.fillStyle = warm ? '#ffdf9a' : '#bfe0d6'; G.fillRect(p.x - 3, p.y - 2, 6, 3); }
  function crate(x, d, s) { box(x, d, 0, s, s, s, '#5a4e34', false); const c = proj(x, d, s * 0.5), cr = s * TILE_W * 0.5;
    G.strokeStyle = 'rgba(20,16,8,0.6)'; G.lineWidth = 1.5; const a = proj(x, d, 0), b = proj(x + s, d, s); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); const a2 = proj(x + s, d, 0), b2 = proj(x, d, s); G.beginPath(); G.moveTo(a2.x, a2.y); G.lineTo(b2.x, b2.y); G.stroke();
    G.fillStyle = '#caa033'; const lp = proj(x + s * 0.5, d, s * 0.8); G.fillRect(lp.x - 4, lp.y - 3, 8, 3); }
  function barrel(x, d) { box(x, d, 0, 0.5, 0.5, 0.9, '#6a5230', false); const t = proj(x + 0.25, d + 0.25, 0.9); ell(t.x, t.y, 7, 3.4, '#8a6e44'); G.strokeStyle = '#3a2c18'; G.lineWidth = 1; for (const yy of [0.25, 0.6]) { const r0 = proj(x, d, yy), r1 = proj(x + 0.5, d, yy); G.beginPath(); G.moveTo(r0.x, r0.y); G.lineTo(r1.x, r1.y); G.stroke(); } }

  // ── BAY INTERACTIVITY (room-as-navigation) ──────────────────────────────────
  //  Each fixture in the bay is a clickable hotspot. Screen polygons are recomputed every bay
  //  render (they ride the live bay camera). rooms.js does hit-testing, tooltips, and id→action;
  //  iso.js only owns the in-world hover glow so highlights stay "of the world", not flat CSS.
  let bayHotspots = [], bayHoverId = null, bayInteractive = false, tutHotspotId = null;
  ISO.debugBay = false;   // rooms.js binds a key to this → outlines every hotspot for hand-tuning
  const BWD = RCD + 4;    // back-wall depth — MUST mirror wd1 inside renderBay
  //  box = [x0,x1, d0,d1, y0,y1] world bounds · pad = screen px padding · g* = ground-glow anchor/size
  const BAY_FIX = [
    { id: 'rover',    tag: 'ROVER',    label: 'ROVER — outfit & upgrade',          box: [-0.8, 3.7, RCD - 3.3, RCD + 0.3, 0, 2.4], pad: 6, gx: 1.45, gd: RCD - 1.5, grx: 52, gry: 21, glow: '235,225,200' },
    { id: 'door',     tag: 'DEPLOY',   label: 'DEPLOYMENT BAY — launch expedition', box: [-0.45, 3.35, BWD - 0.1, BWD + 0.1, 0, 3.9],  pad: 6, gx: 1.45, gd: BWD - 0.7, grx: 38, gry: 10, glow: '202,160,51' },
    { id: 'cargo',    tag: 'CARGO',    label: 'CARGO — stores & manifest',          box: [-7.0, -2.8, BWD - 3.0, BWD + 0.1, 0, 3.2], pad: 6, gx: -5.0, gd: BWD - 1.4, grx: 36, gry: 15, glow: '140,180,120' },
    { id: 'interior', tag: '◀ EXIT',   label: 'EXIT — back to ship',                box: [-7.04, -6.96, RCD - 3.6, RCD - 1.2, 0, 4.2], pad: 8, gx: -6.7, gd: RCD - 2.4, grx: 14, gry: 26, glow: '90,200,130' },
    { id: 'terminal', tag: 'TERMINAL', label: 'TERMINAL — ship log & comms',        box: [5.6, 9.2, BWD - 0.2, BWD + 0.1, 0, 4.0],  pad: 6, gx: 7.4, gd: BWD - 0.8, grx: 30, gry: 14, glow: '120,200,210' },
  ];
  // FOUNDRY (Refinery + Alloy Forge). Same fixture format as BAY_FIX. fbd = back wall depth = RCD+4.
  const FOUNDRY_FIX = [
    { id: 'forge',    tag: 'FORGE',    label: 'ALLOY FORGE — smelt alloys',     box: [0.6, 5.4, RCD + 3.8, RCD + 4.1, 0, 4.6],  pad: 6, gx: 3.0,  gd: RCD + 3.0, grx: 50, gry: 18, glow: '255,150,60' },
    { id: 'refinery', tag: 'REFINERY', label: 'REFINERY — process raw ore',     box: [-7.0, -2.6, RCD + 1.4, RCD + 4.1, 0, 3.4], pad: 6, gx: -5.2, gd: RCD + 2.6, grx: 40, gry: 16, glow: '120,200,170' },
    { id: 'interior', tag: '◀ EXIT',   label: 'EXIT — back to ship',            box: [-7.04, -6.96, RCD - 3.5, RCD - 1.1, 0, 4.2], pad: 8, gx: -6.7, gd: RCD - 2.3, grx: 14, gry: 26, glow: '90,200,130' },
  ];
  // BRIDGE (Command + Archives + Objectives). Back is a big cockpit WINDOW, not a wall.
  const BRIDGE_FIX = [
    { id: 'objectives', tag: 'OBJECTIVES', label: 'OBJECTIVES — mission directives', box: [-1.5, 4.7, RCD + 2.5, RCD + 3.2, 0, 3.0], pad: 6, gx: 1.5,  gd: RCD + 2.4, grx: 48, gry: 18, glow: '120,200,255' },
    { id: 'archives',   tag: 'ARCHIVES',   label: "ARCHIVES — captain's logs",       box: [-2.2, 4.1, RCD - 4.7, RCD - 1.7, 0, 3.0], pad: 6, gx: 0.5, gd: RCD - 3.3, grx: 50, gry: 19, glow: '180,140,255' },
    { id: 'interior',   tag: '◀ EXIT',     label: 'EXIT — back to ship',             box: [-7.04, -6.96, RCD - 3.5, RCD - 1.1, 0, 4.2], pad: 8, gx: -6.7, gd: RCD - 2.3, grx: 14, gry: 26, glow: '90,200,130' },
  ];
  // LAB (Research / tech tree). Central holo-projector + specimen pods.
  const LAB_FIX = [
    { id: 'research', tag: 'RESEARCH', label: 'RESEARCH — tech tree',     box: [-1.6, 3.6, RCD - 2.4, RCD + 0.6, 0, 5.2], pad: 6, gx: 1.0, gd: RCD - 0.4, grx: 50, gry: 20, glow: '120,230,200' },
    { id: 'interior', tag: '◀ EXIT',   label: 'EXIT — back to ship',      box: [-7.04, -6.96, RCD - 3.5, RCD - 1.1, 0, 4.2], pad: 8, gx: -6.7, gd: RCD - 2.3, grx: 14, gry: 26, glow: '90,200,130' },
  ];
  const ROOM_FIX = { bay: BAY_FIX, foundry: FOUNDRY_FIX, bridge: BRIDGE_FIX, lab: LAB_FIX };
  const ROOM_RENDER = { bay: renderBay, foundry: renderFoundry, bridge: renderBridge, lab: renderLab };   // render fns are hoisted function declarations
  function computeBayHotspots() {
    bayHotspots = (ROOM_FIX[curRoom] || BAY_FIX).map((f, i) => {
      const [x0, x1, d0, d1, y0, y1] = f.box; let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
      for (const x of [x0, x1]) for (const d of [d0, d1]) for (const y of [y0, y1]) {
        const p = proj(x, d, y); if (p.x < mnx) mnx = p.x; if (p.x > mxx) mxx = p.x; if (p.y < mny) mny = p.y; if (p.y > mxy) mxy = p.y;
      }
      const pad = f.pad || 0, g = proj(f.gx, f.gd, 0);
      return { id: f.id, tag: f.tag, label: f.label, ph: i * 1.7, x0: mnx - pad, y0: mny - pad, x1: mxx + pad, y1: mxy + pad, gcx: g.x, gcy: g.y, grx: f.grx, gry: f.gry, glow: f.glow };
    });
  }
  // Every interactable carries an always-on pulsing beacon + label so the room reads as clickable;
  // the hovered one brightens, gets a ground wash + bbox rim, and a fuller DOM tooltip (rooms.js).
  function drawBayInteract() {
    for (const h of bayHotspots) {
      // `tut` = the tutorial's current target fixture: it gets the full focused treatment (ground wash,
      // rim, ripple) even without hover, plus an extra outward call-to-action ring, so the step's
      // clickbox visibly pulses in the room. `emph` = render with the focused styling (hover OR tut).
      const on = h.id === bayHoverId, tut = h.id === tutHotspotId, emph = on || tut;
      const pulse = 0.5 + 0.5 * Math.sin(it * 2.4 + h.ph);
      const col = tut ? 'rgb(95,207,107)' : 'rgb(' + h.glow + ')';   // tutorial target pulses the main-UI green
      G.save();
      if (on && !tut) {   // hover-only ground wash + silhouette rim + ripple (tut gets its own, stronger version below)
        const gp = 0.5 + 0.5 * Math.sin(it * 3);
        G.globalAlpha = 0.18 + 0.18 * gp; ell(h.gcx, h.gcy, h.grx, h.gry, col);
        G.globalAlpha = 0.10 + 0.10 * gp; ell(h.gcx, h.gcy, h.grx * 1.5, h.gry * 1.5, col);
        const pr = (it * 0.55) % 1;   // outward ripple around the object
        G.globalAlpha = (1 - pr) * 0.5; G.strokeStyle = col; G.lineWidth = 2.5;
        G.beginPath(); G.ellipse(h.gcx, h.gcy, h.grx * (0.5 + pr), h.gry * (0.5 + pr), 0, 0, 7); G.stroke();
        G.globalAlpha = 0.32 + 0.32 * gp; G.lineWidth = 2; G.beginPath(); G.rect(h.x0, h.y0, h.x1 - h.x0, h.y1 - h.y0); G.stroke();
      }
      if (tut) {   // STRONG green call-to-action — matches the main-UI .tut-pulse weight/colour
        const gp = 0.5 + 0.5 * Math.sin(it * 3);
        G.globalAlpha = 0.34 + 0.30 * gp; ell(h.gcx, h.gcy, h.grx, h.gry, col);            // bright ground wash
        G.globalAlpha = 0.18 + 0.18 * gp; ell(h.gcx, h.gcy, h.grx * 1.7, h.gry * 1.7, col);
        G.globalAlpha = 0.7 + 0.3 * gp; G.strokeStyle = col; G.lineWidth = 3.5;            // bold bbox rim
        G.beginPath(); G.rect(h.x0, h.y0, h.x1 - h.x0, h.y1 - h.y0); G.stroke();
        for (const off of [0, 0.5]) {                                                       // two staggered outward ripples
          const tr = (it * 0.5 + off) % 1;
          G.globalAlpha = (1 - tr) * 0.9; G.lineWidth = 3.5;
          G.beginPath(); G.ellipse(h.gcx, h.gcy, h.grx * (0.5 + tr * 1.25), h.gry * (0.5 + tr * 1.25), 0, 0, 7); G.stroke();
        }
      }
      // beacon: pulsing ring + diamond pip at the fixture's ground anchor
      const r = (emph ? 11 : 7) + pulse * 2.5;
      G.globalAlpha = emph ? 0.95 : 0.4 + 0.3 * pulse; G.strokeStyle = col; G.lineWidth = emph ? 2.5 : 1.4;
      G.beginPath(); G.arc(h.gcx, h.gcy, r, 0, 7); G.stroke();
      G.globalAlpha = emph ? 1 : 0.55 + 0.25 * pulse; G.fillStyle = col;
      G.beginPath(); G.moveTo(h.gcx, h.gcy - 4.5); G.lineTo(h.gcx + 4.5, h.gcy); G.lineTo(h.gcx, h.gcy + 4.5); G.lineTo(h.gcx - 4.5, h.gcy); G.closePath(); G.fill();
      // label chip — large, and CLAMPED inside the canvas so tall fixtures' labels never fly off the top/sides
      const fs = emph ? 17 : 14; G.font = (emph ? 'bold ' : '') + fs + 'px "Share Tech Mono", monospace'; G.textAlign = 'center'; G.textBaseline = 'middle';
      const tw = G.measureText(h.tag).width, padX = 11, padY = 6, chW = tw + padX * 2, chH = fs + padY * 2;
      const lx = Math.max(chW / 2 + 8, Math.min(W - chW / 2 - 8, h.gcx));
      const ly = Math.max(chH / 2 + 8, h.y0 - 6 - chH / 2);   // whole chip stays below the top edge
      if (emph) { G.globalAlpha = 0.45; G.strokeStyle = col; G.lineWidth = 1; G.beginPath(); G.moveTo(lx, ly + chH / 2); G.lineTo(h.gcx, Math.max(ly + chH / 2, h.gcy - r)); G.stroke(); }   // leader to the object
      G.globalAlpha = emph ? 0.94 : 0.55 + 0.2 * pulse; G.fillStyle = 'rgba(8,10,6,0.9)'; G.fillRect(lx - chW / 2, ly - chH / 2, chW, chH);
      G.globalAlpha = emph ? 1 : 0.85; G.strokeStyle = col; G.lineWidth = emph ? 1.6 : 1; G.strokeRect(lx - chW / 2, ly - chH / 2, chW, chH);
      G.globalAlpha = 1; G.fillStyle = emph ? '#eef0dc' : col; G.fillText(h.tag, lx, ly + 1);
      G.restore();
    }
    if (ISO.debugBay) { G.save(); G.strokeStyle = '#ff00aa'; G.fillStyle = '#ff00aa'; G.lineWidth = 1; G.font = '10px monospace'; G.textAlign = 'left';
      for (const h of bayHotspots) { G.strokeRect(h.x0, h.y0, h.x1 - h.x0, h.y1 - h.y0); G.fillText(h.id, h.x0 + 2, h.y0 + 11); } G.restore(); }
  }
  ISO.bayHotspots = () => bayInteractive ? bayHotspots : [];
  ISO.bayActive = () => bayInteractive;
  ISO.setBayHover = id => { bayHoverId = id; };
  // Tutorial: force a fixture in the CURRENT room to pulse as the step's target (null clears). The id
  // only lights up while its room is on screen — it's matched against this room's hotspots each frame.
  ISO.setTutHotspot = id => { tutHotspotId = id; };
  ISO.setBayFocus = f => { bayFocusX = f; };   // 0.5 = centred; ~0.22 keeps the rover left of the docked drawer

  // ── workshop prop helpers (used to fill the bay floor) ──
  function shelf(x, d, w, dp, h, items) { box(x, d, 0, w, dp, h, '#363b2e', false);
    G.strokeStyle = 'rgba(16,18,12,0.6)'; G.lineWidth = 2;
    for (let i = 1; i < 3; i++) { const sy = h * i / 3, a = proj(x, d, sy), b = proj(x, d + dp, sy); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
    if (items) for (let i = 0; i < 4; i++) { const lvl = ((i % 2) + 1) / 3 * h + 0.04, px = x + 0.12 + (i % 2) * (w * 0.5), p = proj(px, d + dp * 0.4, lvl); G.fillStyle = i % 2 ? '#5a4e34' : '#6a5230'; G.fillRect(p.x - 4, p.y - 7, 9, 7); } }
  function spool(x, d) { box(x, d, 0, 0.7, 0.7, 0.7, '#2e2a1c', false); const t = proj(x + 0.35, d + 0.35, 0.7); ell(t.x, t.y, 11, 5, '#3a3420'); ell(t.x, t.y, 5, 2.4, '#1a160e'); }
  function enginePart(x, d) { box(x, d, 0, 1.0, 0.8, 0.65, '#454a3c', false); box(x + 0.18, d + 0.22, 0.65, 0.32, 0.32, 0.4, '#2e342a', false); const p = proj(x + 0.5, d + 0.4, 0.45); G.fillStyle = '#caa033'; G.fillRect(p.x - 3, p.y - 3, 6, 3); }
  function tirestack(x, d, n) { for (let i = 0; i < n; i++) { const c = proj(x, d, 0.18 * i + 0.09); ell(c.x, c.y, 13, 5.5, '#201d15'); ell(c.x, c.y, 6, 2.6, '#100e08'); } }
  function floorTools(x, d) { const p = proj(x, d, 0.02); G.globalAlpha = 0.9; G.fillStyle = '#5a5240'; G.fillRect(p.x - 7, p.y - 2, 14, 3); G.fillStyle = '#3a342a'; G.fillRect(p.x - 2, p.y - 6, 4, 9); G.globalAlpha = 1; }

  function renderBay(rollT, doorP, scv) {
    // ── ROOM = TWO far walls only: LEFT (x=wxL) + BACK (d=wd1), meeting at the back-left corner.
    //  No right/front wall is drawn (camera sees in). Floor stretches right to wxR (off-screen) so there's no void.
    const wxL = -7, wxR = 13, wd1 = RCD + 4, wallH = 13, dW = 0.4;   // wxL=left wall & corner · wxR=floor/back-wall right end (off-screen) · wd1=back wall depth
    const fxL = wxL, fxR = wxR, fd0 = RCD - 13, dFront = RCD - 7;    // fd0 = floor foreground (off-screen bottom)
    const ROVER_X = 1.45, ROVER_D = RCD - 1.5, doorC = ROVER_X;      // door centred between cargo (right edge ~-2.7) & terminal (left edge 5.6); rover aligns to the door
    const bgg = G.createLinearGradient(0, 0, 0, H); bgg.addColorStop(0, '#0b0a06'); bgg.addColorStop(0.5, '#16150e'); bgg.addColorStop(1, '#1d1c13'); G.fillStyle = bgg; G.fillRect(0, 0, W, H);

    // ── FLOOR (metal plating) — quad spans well beyond the frame on left/right/bottom ──
    quad(proj(fxL, fd0, 0), proj(fxR, fd0, 0), proj(fxR, wd1, 0), proj(fxL, wd1, 0), '#41463b');
    G.strokeStyle = 'rgba(18,20,14,0.5)'; G.lineWidth = 1;
    for (let gx = Math.ceil(wxL); gx <= wxR; gx++) { const a = proj(gx, fd0, 0.01), b = proj(gx, wd1, 0.01); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
    for (let gd = Math.ceil(fd0); gd < wd1; gd++) { const a = proj(fxL, gd, 0.01), b = proj(fxR, gd, 0.01); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
    for (let i = 0; i < 22; i++) { const p = proj(wxL + 0.5 + hash(i) * (wxR - wxL - 1), fd0 + 1 + hash(i + 3) * (wd1 - fd0 - 2), 0.02); G.globalAlpha = 0.2; ell(p.x, p.y, 18, 7, '#262a1c'); G.globalAlpha = 1; }
    const pud = proj(-3.4, RCD - 3.0, 0.02); G.globalAlpha = 0.5; ell(pud.x, pud.y, 34, 11, '#2b3331'); G.globalAlpha = 0.16; ell(pud.x - 6, pud.y - 2, 18, 5, '#a6b6a6'); G.globalAlpha = 1;
    { const c = proj(ROVER_X, ROVER_D, 0.02); G.globalAlpha = 0.17; ell(c.x, c.y, 112, 42, '#f0c060'); G.globalAlpha = 1; }   // hero spotlight pool, centred on the rover
    for (const [lx, ld] of [[-5, RCD + 3], [7.2, RCD + 2]]) { const c = proj(lx, ld, 0.02); G.globalAlpha = 0.07; ell(c.x, c.y, 70, 26, '#f0c060'); G.globalAlpha = 1; }   // dim ambient pools by the walls
    for (let i = 0; i < 5; i++) { const d = wd1 - 0.5, x = doorC - 1.8 + i * 0.9, a = proj(x, d, 0.03), b = proj(x + 0.45, d, 0.03), c = proj(x + 0.22, d - 0.6, 0.03); G.fillStyle = i % 2 ? '#caa033' : '#1c1a12'; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.lineTo(c.x, c.y); G.closePath(); G.fill(); }

    // ── LEFT WALL (tall, runs the full floor depth → off-frame top & bottom-left) ──
    box(wxL, fd0, 0, dW, wd1 - fd0, wallH, '#454c3e', false);
    { const a = proj(wxL + dW, fd0, wallH), b = proj(wxL + dW, wd1, wallH); G.strokeStyle = '#6a7256'; G.lineWidth = 2; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
    // ── LEFT-WALL greebling: panel grid, recessed panels, bolt rows, hazard base stripe ──
    { const fx = wxL + dW;   // wall face plane (x), runs along depth d and height y
      for (const [d0, y0, dd, yh] of [[RCD - 7, 6.5, 2.6, 4.0], [RCD - 0.5, 2.6, 2.2, 3.4], [RCD + 3, 8, 2.4, 3.6]])   // recessed panels
        quad(proj(fx, d0, y0), proj(fx, d0 + dd, y0), proj(fx, d0 + dd, y0 + yh), proj(fx, d0, y0 + yh), '#373d31');
      G.strokeStyle = 'rgba(22,26,18,0.55)'; G.lineWidth = 1;
      for (let d = Math.ceil(fd0); d < wd1; d += 3) { const a = proj(fx, d, 0.3), b = proj(fx, d, wallH - 0.5); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }   // vertical seams
      for (const y of [2.4, 5.8, 9.6, 13.4]) { const a = proj(fx, fd0, y), b = proj(fx, wd1, y); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }   // horizontal bands
      G.fillStyle = '#20251b'; for (let d = Math.ceil(fd0) + 1; d < wd1; d += 3) for (const y of [1.2, 4.8, 8.6, 12.4]) { const p = proj(fx, d, y); G.fillRect(p.x - 1, p.y - 1, 2, 2); }   // bolt dots
      for (let d = Math.ceil(fd0); d < wd1; d += 0.9) { const c = ((Math.round(d / 0.9)) % 2) === 0, a = proj(fx, d, 0.15), b = proj(fx, d + 0.9, 0.15), b2 = proj(fx, d + 0.9, 0.75), a2 = proj(fx, d, 0.75); G.fillStyle = c ? '#a98a26' : '#191710'; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.lineTo(b2.x, b2.y); G.lineTo(a2.x, a2.y); G.closePath(); G.fill(); }   // hazard base stripe
    }
    box(wxL + dW, RCD - 8, 0.8, 0.2, 16, 0.26, '#2a2e22', false);                              // pipe along wall (long)
    box(wxL + dW, RCD - 8, 5.6, 0.2, 16, 0.26, '#2a2e22', false);                              // upper pipe
    // CORRIDOR doorway (the EXIT / back-to-ship door) — front of the left wall (visible front-left corner)
    { const cd0 = RCD - 3.6, cw = 2.4, ch = 4.2; const o0 = proj(wxL + 0.02, cd0, 0), o1 = proj(wxL + 0.02, cd0 + cw, 0), o2 = proj(wxL + 0.02, cd0 + cw, ch), o3 = proj(wxL + 0.02, cd0, ch);
      const cg = G.createLinearGradient(0, o3.y, 0, o0.y); cg.addColorStop(0, '#20241a'); cg.addColorStop(1, '#10130c'); G.fillStyle = cg; G.beginPath(); G.moveTo(o0.x, o0.y); G.lineTo(o1.x, o1.y); G.lineTo(o2.x, o2.y); G.lineTo(o3.x, o3.y); G.closePath(); G.fill();
      G.globalAlpha = 0.5; ell((o0.x + o1.x) / 2, (o0.y + o3.y) / 2, 8, 26, '#5a5236'); G.globalAlpha = 1;
      box(wxL + dW, cd0 - 0.2, 0, 0.12, 0.25, ch + 0.3, '#2a2e22', false); box(wxL + dW, cd0 + cw, 0, 0.12, 0.25, ch + 0.3, '#2a2e22', false); box(wxL + dW, cd0 - 0.2, ch, 0.12, cw + 0.45, 0.3, '#2a2e22', false); }

    // ── BACK WALL (d=wd1) — the down-RIGHT far wall; spans wide right (off-frame); carries CARGO/DEPLOY/TERMINAL ──
    const dL = doorC - 1.9, dR = doorC + 1.9, dTop = 3.9;   // deploy-door opening (aligned to the rover)
    box(wxL, wd1, 0, (dL - wxL), dW, wallH, '#434a3c', false);
    box(dR, wd1, 0, (fxR - dR), dW, wallH, '#434a3c', false);
    box(dL, wd1, dTop, dR - dL, dW, wallH - dTop, '#434a3c', false);
    { const a = proj(wxL, wd1, wallH), b = proj(fxR, wd1, wallH); G.strokeStyle = '#6a7256'; G.lineWidth = 2; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
    // ── BACK-WALL greebling: panel grid, recessed panels, bolts (skip the door opening) ──
    { const fy = wd1;        // wall face plane (depth), runs along lateral x and height y
      const seam = x => Math.abs(x - doorC) > 2.1;
      for (const [x0, y0, xw, yh] of [[doorC + 2.6, 5, 2.4, 5.5], [doorC + 5.2, 2.6, 2.0, 8], [-6.2, 4.5, 3.2, 6]])   // recessed panels (flanking the door)
        quad(proj(x0, fy, y0), proj(x0 + xw, fy, y0), proj(x0 + xw, fy, y0 + yh), proj(x0, fy, y0 + yh), '#373d31');
      G.strokeStyle = 'rgba(22,26,18,0.55)'; G.lineWidth = 1;
      for (let x = Math.ceil(wxL); x < fxR; x += 3) { if (!seam(x)) continue; const a = proj(x, fy, 0.3), b = proj(x, fy, wallH - 0.5); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }   // vertical seams
      for (const y of [4.6, 8.2, 11.6, 14.4]) { const a = proj(wxL, fy, y), b = proj(fxR, fy, y); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }   // horizontal bands
      G.fillStyle = '#20251b'; for (let x = Math.ceil(wxL); x < fxR; x += 3) { if (!seam(x)) continue; for (const y of [3, 6.5, 10, 13.5]) { const p = proj(x, fy, y); G.fillRect(p.x - 1, p.y - 1, 2, 2); } }   // bolts
      blink(proj(doorC + 6, fy, 9.5), '#9cf06a', 0.9, 7); blink(proj(-5.5, fy, 10.5), '#ff5a3a', 2.1, 8);
    }
    const ox0 = proj(dL + 0.1, wd1 + 0.02, 0), ox1 = proj(dR - 0.1, wd1 + 0.02, 0), oy1 = proj(dR - 0.1, wd1 + 0.02, dTop), oy0 = proj(dL + 0.1, wd1 + 0.02, dTop);
    const exg = G.createLinearGradient(0, oy0.y, 0, ox0.y); exg.addColorStop(0, '#5a6048'); exg.addColorStop(0.6, '#6f6f52'); exg.addColorStop(1, '#4a4632'); G.fillStyle = exg; G.beginPath(); G.moveTo(ox0.x, ox0.y); G.lineTo(ox1.x, ox1.y); G.lineTo(oy1.x, oy1.y); G.lineTo(oy0.x, oy0.y); G.closePath(); G.fill();
    G.globalAlpha = 0.5; ell((ox0.x + ox1.x) / 2, ox0.y - 7, Math.abs(ox1.x - ox0.x) * 0.4, 6, '#3c4530'); G.globalAlpha = 1;
    if (doorP < 0.98) { const dh = dTop * (1 - doorP); box(dL, wd1 - 0.04, dTop - dh, dR - dL, 0.16, dh, PAL.bayDoor, false);
      const s0 = proj(dL + 0.1, wd1 - 0.04, dTop - dh + 0.1), s1 = proj(dR - 0.1, wd1 - 0.04, dTop - dh + 0.1); G.strokeStyle = '#caa033'; G.lineWidth = 3; G.setLineDash([8, 6]); G.beginPath(); G.moveTo(s0.x, s0.y); G.lineTo(s1.x, s1.y); G.stroke(); G.setLineDash([]); }
    blink(proj(dL - 0.1, wd1, dTop + 0.3), '#ff5a3a', it, 9); blink(proj(dR + 0.1, wd1, dTop + 0.3), '#ff5a3a', it + 1, 9);
    box(wxL + dW, wd1 - 2.4, 0.7, 0.9, 0.25, 1.6, '#3c4234', false);                           // tool rack (left wall, near corner)

    // ── CARGO — L of stacking shelves in the back-LEFT corner (where the two walls meet) (CARGO interactable) ──
    shelf(-6.6, wd1 - 1.3, 3.9, 1.1, 3.0, true);                  // run A: along the BACK wall
    shelf(wxL + 0.4, wd1 - 2.8, 1.1, 2.4, 3.0, true);             // run B: along the LEFT wall (meets A at the corner)
    crate(-4.2, wd1 - 2.0, 1.1); crate(-4.1, wd1 - 2.3, 0.9); barrel(-3.0, wd1 - 1.4);   // boxes in front of the shelves
    blink(proj(-3.0, wd1 - 1.1, 3.1), '#9cf06a', 0.7, 7);

    // ── TERMINAL — WIDE screen on the BACK wall, right of the deploy door + console at its base (TERMINAL interactable) ──
    { const fy = wd1, tx0 = 5.6, tx1 = 9.2;
      quad(proj(tx0, fy - 0.03, 1.7), proj(tx1, fy - 0.03, 1.7), proj(tx1, fy - 0.03, 4.0), proj(tx0, fy - 0.03, 4.0), '#0c1410');   // screen
      G.lineWidth = 2; G.strokeStyle = '#3fae6a'; for (let i = 0; i < 7; i++) { const yy = 1.95 + i * 0.3, ln = 0.5 + hash(i + (it * 0.2 | 0)) * (tx1 - tx0 - 1.0), a = proj(tx0 + 0.4, fy - 0.05, yy), b = proj(tx0 + 0.4 + ln, fy - 0.05, yy); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }   // scrolling rows
      G.strokeStyle = '#2a2e22'; const z0 = proj(tx0, fy - 0.03, 1.7), z1 = proj(tx1, fy - 0.03, 1.7), z2 = proj(tx1, fy - 0.03, 4.0), z3 = proj(tx0, fy - 0.03, 4.0); G.beginPath(); G.moveTo(z0.x, z0.y); G.lineTo(z1.x, z1.y); G.lineTo(z2.x, z2.y); G.lineTo(z3.x, z3.y); G.closePath(); G.stroke();   // bezel
      box(tx0, fy - 1.0, 0, tx1 - tx0, 0.8, 1.1, '#3a4032', false);   // console at the base, in front of the wall
      for (let i = 0; i < 7; i++) { const p = proj(tx0 + 0.5 + i * ((tx1 - tx0 - 1.0) / 6), fy - 0.6, 1.12); G.fillStyle = (i % 3) ? '#caa033' : '#9cf06a'; G.fillRect(p.x - 2, p.y - 2, 5, 3); }   // console buttons
      blink(proj(tx1 - 0.3, fy, 4.1), '#9cf06a', 0.4, 7); }

    // ── PROPS — kept sparse, against the two walls + a little on the open right floor ──
    barrel(wxL + 0.7, RCD - 2.0); tirestack(wxL + 1.4, RCD - 0.4, 4); crate(-5.8, wd1 - 1.0, 1.0);   // by the LEFT wall / cargo corner
    spool(6.2, RCD + 0.3); enginePart(7.8, RCD + 1.9); floorTools(6.6, RCD - 1.3); floorTools(8.6, RCD + 0.6);   // open RIGHT floor (clear of rover & terminal)

    // ── SERVICE TABLE ("workbench") the rover is parked on at standby ──
    //  A raised flat-top table (legs + slab) that extends well past the rover on every side. Fades + lowers
    //  the rover to the floor as launch begins, so it then rolls off toward the door.
    //  TUNING: TBL_H = table height · TBL_FADE = how far into rollT it's gone · tx0/tx1/td0/td1 = top extents.
    const TBL_H = 0.7, TBL_FADE = 0.14, ST = 0.2;
    const tx0 = ROVER_X - 2.5, tx1 = ROVER_X + 2.5, td0 = ROVER_D - 2.0, td1 = ROVER_D + 2.0;   // table centred on the rover (ROVER_D)
    const benchF = Math.max(0, 1 - rollT / TBL_FADE);               // 1 at standby → 0 once rolling out
    if (benchF > 0.01) {
      G.save(); G.globalAlpha = benchF;
      for (const lx of [tx0 + 0.18, tx1 - 0.4]) for (const ld of [td0 + 0.18, td1 - 0.4]) box(lx, ld, 0, 0.22, 0.22, TBL_H - ST, '#20241b', false);   // four legs
      { const a = proj(tx0 + 0.29, td0 + 0.29, 0.12), b = proj(tx1 - 0.29, td1 - 0.29, 0.12); G.strokeStyle = '#262b1f'; G.lineWidth = 3; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }   // cross-brace under the top
      box(tx0, td0, TBL_H - ST, tx1 - tx0, td1 - td0, ST, '#3c4232', true);                 // table top slab
      G.strokeStyle = 'rgba(20,24,16,0.55)'; G.lineWidth = 1;                               // top-surface plating seams
      for (const gx of [-1.1, 0, 1.1]) { const a = proj(ROVER_X + gx, td0, TBL_H), b = proj(ROVER_X + gx, td1, TBL_H); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
      const e0 = proj(tx0, td1, TBL_H), e1 = proj(tx1, td1, TBL_H); G.strokeStyle = '#caa033'; G.lineWidth = 2; G.setLineDash([8, 5]); G.beginPath(); G.moveTo(e0.x, e0.y); G.lineTo(e1.x, e1.y); G.stroke(); G.setLineDash([]);   // amber front edge
      blink(proj(tx0 + 0.3, td0 + 0.3, TBL_H + 0.05), '#9cf06a', 0.3, 6); blink(proj(tx1 - 0.3, td0 + 0.3, TBL_H + 0.05), '#9cf06a', 1.1, 6);   // corner status pips
      G.restore();
    }
    // ── ROVER (centrepiece; sits on the table at standby, rolls out through the door) ──
    const lift = TBL_H * YS * benchF;   // raise the rover onto the table top; drops with the table fade
    G.save(); G.translate(ROVER_X * TILE_W, ROVER_X * TILE_H - lift);   // shift to the floor-centre rover position
    roverBoxes((ROVER_D - 1.2) + rollT * 7.0, scv);   // -1.2 so the rover BODY centres on ROVER_D; rolls back to the door on launch
    G.restore();

    // ── FOREGROUND framing (near camera → fills the bottom corners off-frame) ──
    box(wxL + 0.6, dFront, 0, 0.6, 3.0, 0.7, '#2c3026', false);             // floor conduit (front-left)
    barrel(-5.6, dFront + 1.0);
    crate(6.0, dFront + 1.2, 1.4); crate(6.1, dFront + 1.3, 1.1);           // crates (front-right)
    box(7.0, dFront + 0.4, 0, 0.7, 0.7, 0.5, '#4a4030', false);             // toolbox

    // ── OVERHEAD (gantry beams span the full width → off-frame; lamps, struts, hoist, cables) ──
    for (const gd of [RCD - 4, RCD + 0.5, wd1 - 1.5]) box(wxL + 0.2, gd, wallH - 0.5, fxR - wxL - 0.4, 0.4, 0.45, '#2c3026', false);
    for (const sd of [RCD - 3, RCD + 2.5]) { const a = proj(wxL + dW, sd, wallH * 0.5), b = proj(wxL + 2.4, sd, wallH - 0.5); G.strokeStyle = '#2a2e22'; G.lineWidth = 4; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
    { const lp0 = proj(ROVER_X, ROVER_D, wallH - 0.6); box(ROVER_X - 0.25, ROVER_D - 0.25, wallH - 0.7, 0.5, 0.5, 0.3, '#22261d', false); lamp(lp0, 56, (wallH - 0.6) * YS * 0.95, true); }   // spotlight lamp over the rover
    { const hp = proj(3.2, RCD - 3, wallH - 0.45); G.strokeStyle = '#1a1c14'; G.lineWidth = 2; G.beginPath(); G.moveTo(hp.x, hp.y); G.lineTo(hp.x, hp.y + 50); G.stroke(); box(2.9, RCD - 3.3, wallH - 1.9, 0.6, 0.6, 0.5, '#3a3e30', false); }   // chain hoist
    for (let i = 0; i < 5; i++) { const cx = -4 + i * 2, a = proj(cx, RCD + 1.5, wallH - 0.45); G.strokeStyle = 'rgba(14,16,10,0.8)'; G.lineWidth = 1.5; G.beginPath(); G.moveTo(a.x, a.y); G.quadraticCurveTo(a.x + 9, a.y + 28, a.x + 3, a.y + 46); G.stroke(); }

    // ── ambient warm wash + vignette ──
    G.fillStyle = 'rgba(240,180,90,0.05)'; G.fillRect(0, 0, W, H);
    const vg = G.createRadialGradient(W / 2, H * 0.48, H * 0.3, W / 2, H * 0.54, H * 1.02); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(6,8,4,0.5)'); G.fillStyle = vg; G.fillRect(0, 0, W, H);
    if (bayInteractive) drawBayInteract();   // hover glow + (debug) hotspot outlines, drawn last so they sit on top
  }

  // ── FOUNDRY ROOM (Refinery + Alloy Forge) — same blueprint as the bay: two far walls, floor stretches right ──
  function renderFoundry(rollT, doorP, scv) {
    const wxL = -7, wxR = 13, fbd = RCD + 4, fd0 = RCD - 13, WH = 13, dW = 0.4;
    const bgg = G.createLinearGradient(0, 0, 0, H); bgg.addColorStop(0, '#0c0805'); bgg.addColorStop(0.5, '#15100a'); bgg.addColorStop(1, '#1c150d'); G.fillStyle = bgg; G.fillRect(0, 0, W, H);
    // FLOOR
    quad(proj(wxL, fd0, 0), proj(wxR, fd0, 0), proj(wxR, fbd, 0), proj(wxL, fbd, 0), '#3e3a30');
    G.strokeStyle = 'rgba(16,14,8,0.5)'; G.lineWidth = 1;
    for (let gx = Math.ceil(wxL); gx <= wxR; gx++) { const a = proj(gx, fd0, 0.01), b = proj(gx, fbd, 0.01); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
    for (let gd = Math.ceil(fd0); gd < fbd; gd++) { const a = proj(wxL, gd, 0.01), b = proj(wxR, gd, 0.01); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
    for (let i = 0; i < 16; i++) { const p = proj(wxL + 1 + hash(i) * (wxR - wxL - 2), fd0 + 1 + hash(i + 5) * (fbd - fd0 - 2), 0.02); G.globalAlpha = 0.16; ell(p.x, p.y, 16, 6, '#1a140c'); G.globalAlpha = 1; }   // soot
    { const c = proj(3, fbd - 1.4, 0.02); G.globalAlpha = 0.16 + 0.05 * Math.sin(it * 3); ell(c.x, c.y, 120, 46, '#ff8a30'); G.globalAlpha = 1; }   // furnace ember pool
    { G.strokeStyle = 'rgba(255,130,40,' + (0.45 + 0.2 * Math.sin(it * 4)) + ')'; G.lineWidth = 6; const a = proj(2.2, fbd - 1.3, 0.03), b = proj(-3.2, fbd - 1.3, 0.03); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); G.strokeStyle = '#ffd890'; G.lineWidth = 2; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }   // molten channel furnace→refinery
    // ── LEFT WALL ──
    box(wxL, fd0, 0, dW, fbd - fd0, WH, '#3c382c', false);
    { const a = proj(wxL + dW, fd0, WH), b = proj(wxL + dW, fbd, WH); G.strokeStyle = '#5e5a40'; G.lineWidth = 2; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
    { const fx = wxL + dW; G.strokeStyle = 'rgba(20,16,10,0.55)'; G.lineWidth = 1;
      for (let d = Math.ceil(fd0); d < fbd; d += 3) { const a = proj(fx, d, 0.3), b = proj(fx, d, WH - 0.5); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
      for (const y of [2.4, 5.8, 9.6]) { const a = proj(fx, fd0, y), b = proj(fx, fbd, y); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
      for (let d = Math.ceil(fd0); d < fbd; d += 0.9) { const c = ((Math.round(d / 0.9)) % 2) === 0, a = proj(fx, d, 0.15), b = proj(fx, d + 0.9, 0.15), b2 = proj(fx, d + 0.9, 0.7), a2 = proj(fx, d, 0.7); G.fillStyle = c ? '#9a7a26' : '#171208'; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.lineTo(b2.x, b2.y); G.lineTo(a2.x, a2.y); G.closePath(); G.fill(); } }
    box(wxL + dW, fd0, 6.0, 0.2, fbd - fd0, 0.26, '#241e14', false);   // pipe along the left wall
    // EXIT door (front of the left wall)
    { const cd0 = RCD - 3.5, cw = 2.4, ch = 4.2, fx = wxL + 0.02; const o0 = proj(fx, cd0, 0), o1 = proj(fx, cd0 + cw, 0), o2 = proj(fx, cd0 + cw, ch), o3 = proj(fx, cd0, ch);
      const cg = G.createLinearGradient(0, o3.y, 0, o0.y); cg.addColorStop(0, '#201a12'); cg.addColorStop(1, '#0e0a06'); G.fillStyle = cg; G.beginPath(); G.moveTo(o0.x, o0.y); G.lineTo(o1.x, o1.y); G.lineTo(o2.x, o2.y); G.lineTo(o3.x, o3.y); G.closePath(); G.fill();
      box(wxL + dW, cd0 - 0.2, 0, 0.12, 0.25, ch + 0.3, '#241e14', false); box(wxL + dW, cd0 + cw, 0, 0.12, 0.25, ch + 0.3, '#241e14', false); box(wxL + dW, cd0 - 0.2, ch, 0.12, cw + 0.45, 0.3, '#241e14', false); }
    // ── BACK WALL (solid; furnace mounted on it) ──
    box(wxL, fbd, 0, wxR - wxL, dW, WH, '#3a362a', false);
    { const a = proj(wxL, fbd, WH), b = proj(wxR, fbd, WH); G.strokeStyle = '#5e5a40'; G.lineWidth = 2; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
    { const fy = fbd; G.strokeStyle = 'rgba(20,16,10,0.55)'; G.lineWidth = 1;
      for (let x = Math.ceil(wxL); x < wxR; x += 3) { const a = proj(x, fy, 0.3), b = proj(x, fy, WH - 0.5); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
      for (const y of [3.5, 7, 10.5]) { const a = proj(wxL, fy, y), b = proj(wxR, fy, y); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); } }
    // ── FURNACE / FORGE (back wall centre) ──
    { const fx0 = 0.6, fx1 = 5.4, fy = fbd, pulse = 0.6 + 0.4 * Math.sin(it * 3.5);
      box(fx0, fy - 1.0, 0, fx1 - fx0, 1.0, 5.0, '#2e2a20', false);   // furnace body
      const m0 = proj(fx0 + 0.5, fy - 1.02, 0.4), m1 = proj(fx1 - 0.5, fy - 1.02, 0.4), m2 = proj(fx1 - 0.5, fy - 1.02, 2.6), m3 = proj(fx0 + 0.5, fy - 1.02, 2.6);
      const fg = G.createLinearGradient(0, m2.y, 0, m0.y); fg.addColorStop(0, 'rgba(255,90,20,' + pulse + ')'); fg.addColorStop(0.6, 'rgba(255,180,60,' + pulse + ')'); fg.addColorStop(1, '#fff0c0'); G.fillStyle = fg; G.beginPath(); G.moveTo(m0.x, m0.y); G.lineTo(m1.x, m1.y); G.lineTo(m2.x, m2.y); G.lineTo(m3.x, m3.y); G.closePath(); G.fill();   // glowing mouth
      box(fx0 + 0.3, fy - 0.8, 5.0, 0.7, 0.7, WH - 5.0, '#262218', false); box(fx1 - 1.0, fy - 0.8, 5.0, 0.6, 0.6, WH - 5.0, '#262218', false);   // exhaust stacks
      for (let i = 0; i < 7; i++) { const ph = ((it * 0.7 + i * 0.9) % 1.6) / 1.6, ep = proj(fx0 + 1 + (i % 4), fy - 0.9, 2.6 + ph * 4.5); G.globalAlpha = (1 - ph) * 0.7; G.fillStyle = i % 2 ? '#ffb040' : '#ff6020'; G.fillRect(ep.x, ep.y, 2.5, 2.5); G.globalAlpha = 1; }   // rising embers
      blink(proj(fx0 + 0.2, fy, 3.2), '#ff5a3a', 0.0, 7); blink(proj(fx1 - 0.2, fy, 3.2), '#9cf06a', 1.0, 6); }
    // ── REFINERY vats (back-left) ──
    { for (const [vx, vd] of [[-6.2, fbd - 1.3], [-4.7, fbd - 1.1], [-5.5, fbd - 2.5]]) {
        box(vx, vd, 0, 1.2, 1.2, 2.2, '#33402f', false);
        const t = proj(vx + 0.6, vd + 0.6, 2.2); G.globalAlpha = 0.65 + 0.2 * Math.sin(it * 2.5 + vx); ell(t.x, t.y, 12, 5, '#7ad6a0'); G.globalAlpha = 1;   // bubbling top
        const ph = ((it * 0.5 + vx) % 1); const bp = proj(vx + 0.6, vd + 0.6, 2.3 + ph); G.globalAlpha = (1 - ph) * 0.3; ell(bp.x, bp.y, 8 - ph * 3, 4, '#bfeccf'); G.globalAlpha = 1; }   // steam
      blink(proj(-5.5, fbd - 1.1, 2.6), '#9cf06a', 0.5, 7); }
    // ── PROPS ──
    for (const [ix, idp] of [[7.0, RCD + 1.5], [8.4, RCD + 0.6]]) { box(ix, idp, 0, 1.4, 0.7, 0.4, '#5a4e34', false); box(ix + 0.1, idp + 0.05, 0.4, 1.2, 0.55, 0.3, '#6a5a3c', false); }   // ingot stacks (right floor)
    barrel(wxL + 0.7, RCD - 1.4); spool(6.2, RCD + 3.2); crate(-3.0, fbd - 1.1, 1.0);
    // ── extra greebling to fill empty space (kept clear of the forge / refinery / exit) ──
    barrel(9.6, RCD + 1.8); tirestack(10.6, RCD + 0.6, 3); crate(8.8, RCD + 2.6, 1.1); barrel(11.0, RCD + 2.4);   // right floor
    box(7.6, fbd - 0.7, 0, 2.2, 0.6, 2.4, '#2e2a20', false);   // control cabinet on the back wall (right of the furnace)
    for (let i = 0; i < 4; i++) { const p = proj(8.0 + i * 0.5, fbd - 0.55, 1.6); G.fillStyle = i % 2 ? '#caa033' : '#9cf06a'; G.fillRect(p.x - 2, p.y - 2, 4, 3); }
    box(wxL + dW, fbd - 6, 3.2, 0.2, 5, 0.3, '#241e14', false);   // upper pipe along the left wall
    crate(4.6, RCD - 2.7, 1.0); spool(-0.6, RCD - 2.9); floorTools(2.0, RCD - 2.2);   // sparse front-floor bits
    box(wxL + 0.2, RCD - 1, WH - 0.5, wxR - wxL - 0.4, 0.4, 0.4, '#26221a', false);   // overhead beam
    for (const [lx, ld] of [[3, fbd - 1.6], [-5, fbd - 1.6]]) { const lp = proj(lx, ld, WH - 0.6); box(lx - 0.25, ld - 0.25, WH - 0.7, 0.5, 0.5, 0.3, '#201c14', false); lamp(lp, 48, (WH - 0.6) * YS * 0.9, true); }
    // warm wash + vignette
    G.fillStyle = 'rgba(255,140,50,0.05)'; G.fillRect(0, 0, W, H);
    const vg = G.createRadialGradient(W / 2, H * 0.46, H * 0.32, W / 2, H * 0.5, H * 1.05); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(6,4,2,0.55)'); G.fillStyle = vg; G.fillRect(0, 0, W, H);
    if (bayInteractive) drawBayInteract();
  }

  // ── BRIDGE ROOM (Command + Archives + Objectives) — back is a cockpit WINDOW; captain's chair + nav console ──
  function renderBridge(rollT, doorP, scv) {
    const wxL = -7, wxR = 13, bbd = RCD + 4, fd0 = RCD - 13, WH = 13, dW = 0.4, winY0 = 2.4;
    // ISO monitor: a screen drawn as a perspective quad (not a flat rect) — a vertical pane at depth d.
    const isoScr = (x0, x1, d, y0, y1, base, lit, rows) => {
      const a = proj(x0, d, y0), b = proj(x1, d, y0), c = proj(x1, d, y1), e = proj(x0, d, y1); quad(a, b, c, e, base);
      G.strokeStyle = lit; G.lineWidth = 2; for (let r = 0; r < rows; r++) { const yy = y0 + 0.2 + (y1 - y0 - 0.35) * r / Math.max(1, rows - 1), ln = x0 + 0.15 + (x1 - x0 - 0.3) * (0.3 + 0.6 * hash(r * 2 + (it * 0.2 | 0))); const p = proj(x0 + 0.15, d - 0.02, yy), q = proj(ln, d - 0.02, yy); G.beginPath(); G.moveTo(p.x, p.y); G.lineTo(q.x, q.y); G.stroke(); }
      G.strokeStyle = '#1a2230'; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.lineTo(c.x, c.y); G.lineTo(e.x, e.y); G.closePath(); G.stroke(); };
    // brighter command-deck bg + floor
    const bgg = G.createLinearGradient(0, 0, 0, H); bgg.addColorStop(0, '#141a24'); bgg.addColorStop(0.5, '#1c2430'); bgg.addColorStop(1, '#252e3c'); G.fillStyle = bgg; G.fillRect(0, 0, W, H);
    quad(proj(wxL, fd0, 0), proj(wxR, fd0, 0), proj(wxR, bbd, 0), proj(wxL, bbd, 0), '#454f60');
    G.strokeStyle = 'rgba(28,36,50,0.55)'; G.lineWidth = 1;
    for (let gx = Math.ceil(wxL); gx <= wxR; gx++) { const a = proj(gx, fd0, 0.01), b = proj(gx, bbd, 0.01); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
    for (let gd = Math.ceil(fd0); gd < bbd; gd++) { const a = proj(wxL, gd, 0.01), b = proj(wxR, gd, 0.01); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
    { const c = proj(0.5, RCD, 0.02); G.globalAlpha = 0.16; ell(c.x, c.y, 150, 56, '#acc8e8'); G.globalAlpha = 1; }   // bright central light pool
    { G.strokeStyle = 'rgba(120,180,230,0.16)'; G.lineWidth = 3; for (const sx of [-2.6, 3.4]) { const a = proj(sx, RCD - 2, 0.03), b = proj(sx, bbd - 1.5, 0.03); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); } }   // floor guide stripes toward the window
    // ── LEFT WALL (lighter) ──
    box(wxL, fd0, 0, dW, bbd - fd0, WH, '#3a4150', false);
    { const a = proj(wxL + dW, fd0, WH), b = proj(wxL + dW, bbd, WH); G.strokeStyle = '#64708a'; G.lineWidth = 2; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
    { const fx = wxL + dW; G.strokeStyle = 'rgba(20,28,42,0.5)'; G.lineWidth = 1;
      for (let d = Math.ceil(fd0); d < bbd; d += 3) { const a = proj(fx, d, 0.3), b = proj(fx, d, WH - 0.5); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
      for (const y of [3, 6.5, 10]) { const a = proj(fx, fd0, y), b = proj(fx, bbd, y); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
      const la = proj(fx, RCD - 6, 4.4), lb = proj(fx, bbd, 4.4); G.strokeStyle = 'rgba(130,190,240,0.5)'; G.lineWidth = 2; G.beginPath(); G.moveTo(la.x, la.y); G.lineTo(lb.x, lb.y); G.stroke(); }   // lit wall strip
    // EXIT door
    { const cd0 = RCD - 3.5, cw = 2.4, ch = 4.2, fx = wxL + 0.02; const o0 = proj(fx, cd0, 0), o1 = proj(fx, cd0 + cw, 0), o2 = proj(fx, cd0 + cw, ch), o3 = proj(fx, cd0, ch);
      const cg = G.createLinearGradient(0, o3.y, 0, o0.y); cg.addColorStop(0, '#2a3650'); cg.addColorStop(1, '#141c2a'); G.fillStyle = cg; G.beginPath(); G.moveTo(o0.x, o0.y); G.lineTo(o1.x, o1.y); G.lineTo(o2.x, o2.y); G.lineTo(o3.x, o3.y); G.closePath(); G.fill();
      box(wxL + dW, cd0 - 0.2, 0, 0.12, 0.25, ch + 0.3, '#2a3344', false); box(wxL + dW, cd0 + cw, 0, 0.12, 0.25, ch + 0.3, '#2a3344', false); box(wxL + dW, cd0 - 0.2, ch, 0.12, cw + 0.45, 0.3, '#2a3344', false); }
    // ── BACK: solid sill + cockpit WINDOW showing the static WASTELAND ──
    box(wxL, bbd, 0, wxR - wxL, dW, winY0, '#3a4150', false);
    { const fy = bbd, w0 = proj(wxL, fy, winY0), w1 = proj(wxR, fy, winY0), w2 = proj(wxR, fy, WH), w3 = proj(wxL, fy, WH);
      const P = (u, v) => ({ x: w0.x + (w1.x - w0.x) * u + (w3.x - w0.x) * v, y: w0.y + (w1.y - w0.y) * u + (w3.y - w0.y) * v });
      G.save(); G.beginPath(); G.moveTo(w0.x, w0.y); G.lineTo(w1.x, w1.y); G.lineTo(w2.x, w2.y); G.lineTo(w3.x, w3.y); G.closePath(); G.clip();
      const yTop = Math.min(w2.y, w3.y), yBot = Math.max(w0.y, w1.y), xL = Math.min(w0.x, w3.x), xR = Math.max(w1.x, w2.x);
      const sg = G.createLinearGradient(0, yTop, 0, yBot); sg.addColorStop(0, '#6b7152'); sg.addColorStop(0.42, '#8a8158'); sg.addColorStop(0.52, '#9c8a5e'); sg.addColorStop(0.6, '#6a5e38'); sg.addColorStop(1, '#52492e'); G.fillStyle = sg; G.fillRect(xL - 4, yTop - 4, xR - xL + 8, yBot - yTop + 8);   // hazy sky → ground
      { const su = P(0.30, 0.60), gg = G.createRadialGradient(su.x, su.y, 4, su.x, su.y, 95); gg.addColorStop(0, 'rgba(245,225,160,0.55)'); gg.addColorStop(1, 'rgba(245,225,160,0)'); G.fillStyle = gg; G.beginPath(); G.arc(su.x, su.y, 95, 0, 7); G.fill(); }   // hazy sun
      G.fillStyle = '#4a4d34'; for (const [mu, mw, mh] of [[0.15, 70, 34], [0.4, 95, 52], [0.62, 60, 30], [0.85, 85, 44]]) { const base = P(mu, 0.5); G.beginPath(); G.moveTo(base.x - mw, base.y); G.quadraticCurveTo(base.x - mw * 0.3, base.y - mh, base.x, base.y - mh); G.quadraticCurveTo(base.x + mw * 0.4, base.y - mh * 0.85, base.x + mw, base.y); G.closePath(); G.fill(); }   // distant mesas
      G.fillStyle = '#4e4630'; for (const [ru, rv, rr] of [[0.25, 0.78, 26], [0.7, 0.84, 32]]) { const r = P(ru, rv); G.beginPath(); G.ellipse(r.x, r.y, rr, rr * 0.5, 0, Math.PI, 0); G.fill(); }   // near rocks
      G.restore(); }
    { const fy = bbd; G.strokeStyle = '#3a4456'; G.lineWidth = 3; for (const mx of [-4, 0, 4, 8]) { const a = proj(mx, fy, winY0), b = proj(mx, fy, WH - 0.3); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
      const s0 = proj(wxL, fy, winY0), s1 = proj(wxR, fy, winY0); G.strokeStyle = '#5a6478'; G.lineWidth = 5; G.beginPath(); G.moveTo(s0.x, s0.y); G.lineTo(s1.x, s1.y); G.stroke();
      const t0 = proj(wxL, fy, WH), t1 = proj(wxR, fy, WH); G.lineWidth = 2; G.beginPath(); G.moveTo(t0.x, t0.y); G.lineTo(t1.x, t1.y); G.stroke(); }
    // ── NAV CONSOLE under the window (OBJECTIVES) with ISO monitors ──
    { box(-1.5, bbd - 1.3, 0, 6.0, 1.0, 1.2, '#39424f', false);
      isoScr(-1.2, 0.6, bbd - 1.32, 1.3, 2.7, '#0a1420', '#5ab0f0', 4);
      isoScr(0.8, 2.6, bbd - 1.32, 1.3, 2.9, '#0a1420', '#7fd0ff', 5);
      isoScr(2.8, 4.4, bbd - 1.32, 1.3, 2.7, '#0a1420', '#5ab0f0', 4);
      blink(proj(-1.3, bbd - 1.3, 1.4), '#7fd4ff', 0.3, 6); blink(proj(4.3, bbd - 1.3, 1.4), '#9cf06a', 1.0, 6); }
    // ── TWO LARGE CAPTAIN CHAIRS facing the window (we see their backs) — ARCHIVES ──
    const chair = (cx, cd) => {
      box(cx + 0.45, cd + 0.5, 0, 0.4, 0.4, 0.55, '#28323f', false);                 // pedestal
      box(cx, cd, 0.55, 1.4, 1.4, 0.4, '#4a566e', false);                            // seat (large)
      box(cx, cd - 0.04, 0.95, 1.4, 0.24, 1.9, '#414c64', false);                    // tall backrest at the FRONT (occupant faces +d, the window)
      box(cx + 0.3, cd - 0.04, 2.85, 0.8, 0.24, 0.55, '#414c64', false);             // headrest
      box(cx - 0.14, cd + 0.15, 0.9, 0.2, 1.1, 0.3, '#3a4458', false); box(cx + 1.34, cd + 0.15, 0.9, 0.2, 1.1, 0.3, '#3a4458', false);   // armrests
      blink(proj(cx + 1.4, cd + 0.4, 0.95), '#b48cff', 0.5 + cx, 5); };
    chair(-1.7, RCD - 3.7); chair(2.3, RCD - 3.7);   // centrepiece: pulled forward (toward camera = down-left) + separated, facing the window
    // ── side console bank (iso screens, NO storage) ──
    box(6.6, bbd - 1.1, 0, 3.2, 0.9, 1.1, '#39424f', false); isoScr(7.0, 9.2, bbd - 1.12, 1.2, 2.4, '#0a1420', '#7fd0ff', 4);
    box(wxL + dW, RCD + 2.4, 0, 0.2, 2.2, 1.1, '#39424f', false);   // thin port wall console (left)
    // ── clean lighting: overhead light strips + soft worklights ──
    for (const ld of [RCD - 3, RCD + 1.5]) { const a = proj(-5, ld, WH - 0.4), b = proj(9, ld, WH - 0.4); G.strokeStyle = 'rgba(150,200,245,0.5)'; G.lineWidth = 4; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
    box(wxL + 0.2, RCD - 1, WH - 0.5, wxR - wxL - 0.4, 0.4, 0.4, '#2a3140', false);
    for (const [lx, ld] of [[0.5, RCD - 1], [-4, RCD + 1]]) { const lp = proj(lx, ld, WH - 0.6); lamp(lp, 52, (WH - 0.6) * YS * 0.9, false); }
    const vg = G.createRadialGradient(W / 2, H * 0.46, H * 0.4, W / 2, H * 0.5, H * 1.1); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(6,10,16,0.4)'); G.fillStyle = vg; G.fillRect(0, 0, W, H);
    if (bayInteractive) drawBayInteract();
  }

  // ── LAB ROOM (Research) — central holographic tech-tree projector + glowing specimen pods ──
  function renderLab(rollT, doorP, scv) {
    const wxL = -7, wxR = 13, lbd = RCD + 4, fd0 = RCD - 13, WH = 13, dW = 0.4;
    const bgg = G.createLinearGradient(0, 0, 0, H); bgg.addColorStop(0, '#06100e'); bgg.addColorStop(0.5, '#0b1715'); bgg.addColorStop(1, '#10201d'); G.fillStyle = bgg; G.fillRect(0, 0, W, H);
    // FLOOR
    quad(proj(wxL, fd0, 0), proj(wxR, fd0, 0), proj(wxR, lbd, 0), proj(wxL, lbd, 0), '#33433f');
    G.strokeStyle = 'rgba(14,26,24,0.5)'; G.lineWidth = 1;
    for (let gx = Math.ceil(wxL); gx <= wxR; gx++) { const a = proj(gx, fd0, 0.01), b = proj(gx, lbd, 0.01); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
    for (let gd = Math.ceil(fd0); gd < lbd; gd++) { const a = proj(wxL, gd, 0.01), b = proj(wxR, gd, 0.01); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
    { const c = proj(1.0, RCD - 0.4, 0.02); G.globalAlpha = 0.16 + 0.05 * Math.sin(it * 2.5); ell(c.x, c.y, 130, 50, '#5fe0c0'); G.globalAlpha = 1; }   // holo light pool
    // ── LEFT WALL ──
    box(wxL, fd0, 0, dW, lbd - fd0, WH, '#2c3a37', false);
    { const a = proj(wxL + dW, fd0, WH), b = proj(wxL + dW, lbd, WH); G.strokeStyle = '#4e6660'; G.lineWidth = 2; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
    { const fx = wxL + dW; G.strokeStyle = 'rgba(16,26,24,0.55)'; G.lineWidth = 1;
      for (let d = Math.ceil(fd0); d < lbd; d += 3) { const a = proj(fx, d, 0.3), b = proj(fx, d, WH - 0.5); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
      for (const y of [3, 6.5, 10]) { const a = proj(fx, fd0, y), b = proj(fx, lbd, y); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
      const la = proj(fx, RCD - 6, 4.2), lb = proj(fx, lbd, 4.2); G.strokeStyle = 'rgba(120,230,200,0.4)'; G.lineWidth = 2; G.beginPath(); G.moveTo(la.x, la.y); G.lineTo(lb.x, lb.y); G.stroke(); }
    // EXIT door (front of the left wall)
    { const cd0 = RCD - 3.5, cw = 2.4, ch = 4.2, fx = wxL + 0.02; const o0 = proj(fx, cd0, 0), o1 = proj(fx, cd0 + cw, 0), o2 = proj(fx, cd0 + cw, ch), o3 = proj(fx, cd0, ch);
      const cg = G.createLinearGradient(0, o3.y, 0, o0.y); cg.addColorStop(0, '#16241f'); cg.addColorStop(1, '#0a120f'); G.fillStyle = cg; G.beginPath(); G.moveTo(o0.x, o0.y); G.lineTo(o1.x, o1.y); G.lineTo(o2.x, o2.y); G.lineTo(o3.x, o3.y); G.closePath(); G.fill();
      box(wxL + dW, cd0 - 0.2, 0, 0.12, 0.25, ch + 0.3, '#243430', false); box(wxL + dW, cd0 + cw, 0, 0.12, 0.25, ch + 0.3, '#243430', false); box(wxL + dW, cd0 - 0.2, ch, 0.12, cw + 0.45, 0.3, '#243430', false); }
    // ── BACK WALL ──
    box(wxL, lbd, 0, wxR - wxL, dW, WH, '#2a3835', false);
    { const a = proj(wxL, lbd, WH), b = proj(wxR, lbd, WH); G.strokeStyle = '#4e6660'; G.lineWidth = 2; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
    { const fy = lbd; G.strokeStyle = 'rgba(16,26,24,0.55)'; G.lineWidth = 1;
      for (let x = Math.ceil(wxL); x < wxR; x += 3) { const a = proj(x, fy, 0.3), b = proj(x, fy, WH - 0.5); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }
      for (const y of [3.5, 7, 10.5]) { const a = proj(wxL, fy, y), b = proj(wxR, fy, y); G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); } }
    // ── SPECIMEN PODS along the back wall (glowing, flavour) ──
    for (const px of [-5.5, -3.8, 4.2, 6.0, 7.8]) { box(px, lbd - 0.95, 0, 0.9, 0.9, 2.7, '#1c2c2a', false);
      const sp = proj(px + 0.45, lbd - 0.5, 1.4); G.globalAlpha = 0.22; ell(sp.x, sp.y, 9, 16, '#7fe0c8'); G.globalAlpha = 1;   // fluid glow
      const t = proj(px + 0.45, lbd - 0.5, 2.7); G.globalAlpha = 0.55 + 0.2 * Math.sin(it * 2 + px); ell(t.x, t.y, 8, 4, '#9fffe0'); G.globalAlpha = 1;   // top cap
      const fl = proj(px + 0.45, lbd - 0.5, 1.2 + 0.3 * Math.sin(it * 1.5 + px)); G.globalAlpha = 0.6; ell(fl.x, fl.y, 4, 5, '#3a7a6a'); G.globalAlpha = 1; }   // floating specimen
    // ── HOLOGRAPHIC TECH-TREE PROJECTOR (RESEARCH) — centrepiece ──
    { const cx = 1.0, cd = RCD - 0.4;
      box(cx - 0.8, cd - 0.8, 0, 1.6, 1.6, 0.6, '#243634', false);                            // projector base
      const e = proj(cx, cd, 0.62); G.globalAlpha = 0.5 + 0.3 * Math.sin(it * 3); ell(e.x, e.y, 26, 12, '#7fffd8'); G.globalAlpha = 1;   // emitter
      const nodes = [[0, 2.0], [-1.1, 3.0], [1.1, 3.1], [-1.5, 4.1], [0.2, 4.3], [1.5, 4.0], [0, 5.1]];
      const link = (a, b) => { const p = proj(cx + nodes[a][0], cd, nodes[a][1]), q = proj(cx + nodes[b][0], cd, nodes[b][1]); G.beginPath(); G.moveTo(p.x, p.y); G.lineTo(q.x, q.y); G.stroke(); };
      G.save(); G.globalAlpha = 0.45 + 0.18 * Math.sin(it * 2); G.strokeStyle = '#5fe0c0'; G.lineWidth = 1.5;
      [[0, 1], [0, 2], [1, 3], [1, 4], [2, 5], [4, 6]].forEach(([a, b]) => link(a, b)); G.restore();
      nodes.forEach((n, i) => { const p = proj(cx + n[0], cd, n[1]), pu = 0.5 + 0.5 * Math.sin(it * 3 + i); G.globalAlpha = (0.45 + 0.4 * pu) * (0.6 + 0.2 * Math.sin(it * 2)); G.fillStyle = '#9fffe0'; G.beginPath(); G.arc(p.x, p.y, 3 + pu, 0, 7); G.fill(); }); G.globalAlpha = 1; }
    // ── lab benches + props (kept clear of the holo, exit, pods) ──
    box(6.8, RCD + 1.6, 0, 2.6, 0.9, 1.0, '#26342f', false);   // bench (right floor)
    box(wxL + dW, RCD + 2.2, 0.9, 1.4, 1.6, 1.1, '#26342f', false);   // wall console (left, behind exit)
    barrel(8.8, RCD + 0.4); spool(5.4, RCD - 2.4); crate(-3.0, RCD - 2.8, 0.9);
    box(wxL + 0.2, RCD - 1, WH - 0.5, wxR - wxL - 0.4, 0.4, 0.4, '#1e2a27', false);   // overhead beam
    for (const [lx, ld] of [[1.0, RCD - 0.4], [-4, RCD + 1]]) { const lp = proj(lx, ld, WH - 0.6); lamp(lp, 48, (WH - 0.6) * YS * 0.9, false); }
    const vg = G.createRadialGradient(W / 2, H * 0.46, H * 0.36, W / 2, H * 0.5, H * 1.08); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(3,8,7,0.5)'); G.fillStyle = vg; G.fillRect(0, 0, W, H);
    if (bayInteractive) drawBayInteract();
  }

  // ── RESOURCE DESTRUCTION (shatter burst when a node is depleted/smashed) ──
  //  Called from game.js clearObstacle(). Screen-space particles spawned at the node's stop position
  //  (the camera doesn't pan, so a fixed screen origin stays correct frame-to-frame).
  ISO.shatter = function (color, smashed) {
    const o = proj(0, RCD + NODE_STOP + 1.2 * DPM, 0.5), n = smashed ? 24 : 15, col = color || '#caa24a';
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = (smashed ? 130 : 80) * (0.4 + Math.random());
      shards.push({ x: o.x + (Math.random() - 0.5) * 14, y: o.y - 6 + (Math.random() - 0.5) * 12,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (60 + Math.random() * 90),   // burst out + upward kick
        life: 0.5 + Math.random() * 0.45, max: 0.95, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 14,
        size: (smashed ? 3.4 : 2.6) * (0.7 + Math.random()), col: i % 3 === 0 ? hexShade(col, 1.4) : (i % 3 === 1 ? col : hexShade(col, 0.6)) });
    }
  };
  function updateShards(dt) {
    for (let i = shards.length - 1; i >= 0; i--) { const s = shards[i];
      s.vy += 540 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt; s.life -= dt;
      if (s.life <= 0) shards.splice(i, 1); }
  }
  // red lock-on reticle that LAGS slightly behind the target as it moves (the lag lives in renderField's lerp)
  function drawReticle(rt) {
    const R = 24, a = Math.max(0, Math.min(1, rt.a)), rot = it * 1.4, pu = 0.85 + 0.15 * Math.sin(it * 7);
    G.save(); G.globalAlpha = a; G.strokeStyle = '#ff3b30'; G.lineWidth = 2; G.shadowBlur = 6; G.shadowColor = '#ff3b30';
    G.beginPath(); G.arc(rt.x, rt.y, R * pu, 0, 6.283); G.stroke();                                   // outer ring
    for (let i = 0; i < 4; i++) { const ang = rot + i * Math.PI / 2, c = Math.cos(ang), s = Math.sin(ang);   // rotating bracket ticks
      G.beginPath(); G.moveTo(rt.x + c * (R * pu - 4), rt.y + s * (R * pu - 4)); G.lineTo(rt.x + c * (R * pu + 6), rt.y + s * (R * pu + 6)); G.stroke(); }
    G.lineWidth = 1; G.globalAlpha = a * 0.85;                                                        // centre crosshair + dot
    G.beginPath(); G.moveTo(rt.x - 5, rt.y); G.lineTo(rt.x + 5, rt.y); G.moveTo(rt.x, rt.y - 5); G.lineTo(rt.x, rt.y + 5); G.stroke();
    G.shadowBlur = 0; G.fillStyle = '#ff6a5a'; G.fillRect(rt.x - 1.2, rt.y - 1.2, 2.4, 2.4); G.restore();
  }
  function drawShards() {
    for (const s of shards) { const a = Math.max(0, Math.min(1, s.life / s.max));
      G.save(); G.globalAlpha = a; G.translate(s.x, s.y); G.rotate(s.rot); G.fillStyle = s.col;
      G.fillRect(-s.size, -s.size * 0.6, s.size * 2, s.size * 1.2); G.restore(); }
    G.globalAlpha = 1;
  }

  // ── PUBLIC API ──
  ISO.tick = dt => { it += dt; _lastDt = dt; if (fadeInT > 0) fadeInT = Math.max(0, fadeInT - dt);
    drillExt += ((roverFx.harvest ? 1 : 0) - drillExt) * Math.min(1, dt * 5);   // drill telescopes out while harvesting
    if (shards.length) updateShards(dt);
    if (smoke.length) for (let i = smoke.length - 1; i >= 0; i--) { const s = smoke[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.r += s.grow * dt; s.vy *= 0.96; s.life -= dt; if (s.life <= 0) smoke.splice(i, 1); }
    if (beam) { beam.life -= dt; if (beam.life <= 0) beam = null; }
    if (dust.length) for (let i = dust.length - 1; i >= 0; i--) { const d = dust[i]; d.x += d.vx * dt; d.y += d.vy * dt; d.r += d.grow * dt; d.vy *= 0.95; d.vx *= 0.96; d.life -= dt; if (d.life <= 0) dust.splice(i, 1); }
    if (drips.length) for (let i = drips.length - 1; i >= 0; i--) { const d = drips[i];
      if (d.kind === 'steam') { d.x += d.vx * dt; d.y += d.vy * dt; d.r += d.grow * dt; d.life -= dt; if (d.life <= 0) drips.splice(i, 1); continue; }
      d.vy += 520 * dt; d.y += d.vy * dt;                                    // ooze drop accelerates downward
      if (d.y >= d.floorY) { d.kind = 'splash'; d.life = 0.35; d.r = 1; d.vy = 0; d.y = d.floorY; }
      if (d.kind === 'splash') { d.r += 26 * dt; d.life -= dt; if (d.life <= 0) drips.splice(i, 1); } } };
  // fire a laser bolt from the rover's turret at a hostile — called by tryShootEnemy ON CLICK.
  ISO.fireBeam = function (en) { if (en) beam = { en, life: 0.16, max: 0.16 }; };
  function drawBeam() {
    if (!beam || beam.en.dead) return;
    const t = Math.max(0, beam.life / beam.max);                       // 1 → 0 over the bolt's lifetime
    const tc = proj(0, RCD - 0.55, 1.06);                              // turret muzzle (matches roverBoxes turret)
    const ep = enemyPos(beam.en), tp = proj(ep.lat, ep.depth, 1.4);
    G.save(); G.shadowBlur = 10; G.shadowColor = '#aef9ff';
    G.strokeStyle = `rgba(120,240,255,${0.35 + 0.55 * t})`; G.lineWidth = 4.5 * t + 1.5;
    G.beginPath(); G.moveTo(tc.x, tc.y); G.lineTo(tp.x, tp.y); G.stroke();
    G.strokeStyle = `rgba(255,255,255,${0.6 * t})`; G.lineWidth = 1.4; G.beginPath(); G.moveTo(tc.x, tc.y); G.lineTo(tp.x, tp.y); G.stroke();
    G.shadowBlur = 0; G.globalAlpha = 0.5 + 0.5 * t; ell(tc.x, tc.y, 5 * t + 2, 5 * t + 2, '#eaffff'); G.globalAlpha = 1;   // muzzle flash
    G.restore();
  }
  // soil plume: spawn behind the two tracks while driving, tinted to the current biome's near-soil colour.
  function spawnDust(intensity) {
    const n = Math.random() < intensity * 0.9 ? (Math.random() < intensity ? 2 : 1) : 0;
    const col = PAL.soilWarm || PAL.terrNear || '#7a6a44';
    for (let i = 0; i < n; i++) { const tx = (Math.random() < 0.5 ? -1 : 1) * (0.86 + Math.random() * 0.22);   // behind a track (±~0.92)
      const p = proj(tx, RCD - 0.7 - Math.random() * 0.3, 0.05);
      dust.push({ x: p.x + (Math.random() - 0.5) * 6, y: p.y + 2, vx: tx * (6 + Math.random() * 10), vy: -8 - Math.random() * 10 * intensity,
        r: 3 + Math.random() * 3, grow: 10 + Math.random() * 8, life: 0.5 + Math.random() * 0.5, max: 1.0, col }); }
  }
  function drawDust() {
    for (const d of dust) { G.globalAlpha = 0.32 * (d.life / d.max); ell(d.x, d.y, d.r, d.r * 0.7, d.col); }
    G.globalAlpha = 1;
  }
  ISO.registerSprite = function (key, url, opts) { const img = new Image(), a = Object.assign({ img, ready: false, scale: 1, anchorY: 1 }, opts || {}); img.onload = () => { a.ready = true; }; img.src = url; ISO.assets[key] = a; return a; };

  // ── BIOME-2 EXHAUST CORRIDOR ───────────────────────────────────────────────
  // Enclosed biomech duct: a tiled metal deck + a tall BACK WALL (far side) carrying
  // pipes / wire / mechanical-flesh sinew + flickering sodium worklights, framed by a
  // LOW near-side rail on the camera side. Drips fall from the ceiling; steam wisps off
  // the floor. Everything scrolls in depth with the rover (scv); knobs are up top.
  function corridorLight(k) {                                  // worklight flicker intensity on panel k → 0..1
    let lf = 0.72 + 0.28 * Math.sin(it * 21 + k * 7.1);
    if (hash(Math.floor(it * 11) + k * 3) < 0.10) lf *= 0.22;  // brief stutter blackout
    return Math.max(0, Math.min(1, lf));
  }
  function drawDrips() {
    for (const d of drips) {
      if (d.kind === 'steam') { G.globalAlpha = 0.10 * Math.max(0, d.life / d.max); ell(d.x, d.y, d.r, d.r * 0.8, '#8a8c72'); continue; }
      if (d.kind === 'splash') { const a = Math.max(0, d.life / 0.35); G.globalAlpha = 0.45 * a; G.strokeStyle = PAL.drip + (0.5 * a) + ')'; G.lineWidth = 1.4; G.beginPath(); G.ellipse(d.x, d.y, d.r, d.r * 0.4, 0, 0, 7); G.stroke(); continue; }
      G.globalAlpha = 0.85; G.strokeStyle = PAL.drip + '0.5)'; G.lineWidth = 1.6; G.beginPath(); G.moveTo(d.x, d.y - 6); G.lineTo(d.x, d.y); G.stroke();   // falling ooze streak
      ell(d.x, d.y, 1.8, 2.6, PAL.drip + '0.9)');
    }
    G.globalAlpha = 1;
  }
  function renderCorridor(scv) {
    const HW = CORR_HW, P = proj, z = camZoom;
    G.fillStyle = PAL.void; G.fillRect(0, 0, W, H);
    const k0 = Math.floor((scv + dNear) / PANEL) - 1, k1 = Math.ceil((scv + dFar) / PANEL) + 1;

    // ── BACK WALL (far side, x=-HW) — base face + AO/bounce bands ──
    const w_bN = P(-HW, dNear, 0), w_bF = P(-HW, dFar, 0), w_tN = P(-HW, dNear, WALL_H), w_tF = P(-HW, dFar, WALL_H);
    quad(w_bN, w_bF, w_tF, w_tN, PAL.wall);
    quad(P(-HW, dNear, WALL_H * 0.6), P(-HW, dFar, WALL_H * 0.6), w_tF, w_tN, hexShade(PAL.wall, 0.6));            // ceiling-AO darkening (upper)
    quad(w_bN, w_bF, P(-HW, dFar, 0.7), P(-HW, dNear, 0.7), hexShade(PAL.wall, 1.18));                            // floor-bounce light (lower)

    // continuous longitudinal pipes running the corridor length
    const pipes = [{ y: 2.7, r: 5, c: PAL.pipe, cl: PAL.pipeLit }, { y: 1.15, r: 4, c: PAL.pipeDk, cl: PAL.pipe }];
    pipes.forEach(pp => { const a = P(-HW, dNear, pp.y), b = P(-HW, dFar, pp.y);
      G.lineCap = 'round'; G.lineWidth = pp.r * z * 2; G.strokeStyle = pp.c; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke();
      G.lineWidth = pp.r * z; G.strokeStyle = pp.cl; G.beginPath(); G.moveTo(a.x, a.y - pp.r * 0.55 * z); G.lineTo(b.x, b.y - pp.r * 0.55 * z); G.stroke(); G.lineCap = 'butt'; });
    // sagging wire bundle just under the upper pipe
    { const a = P(-HW, dNear, 2.35), b = P(-HW, dFar, 2.35); G.strokeStyle = PAL.wire; G.lineWidth = 2 * z; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); }

    // per-panel wall detailing
    for (let k = k0; k <= k1; k++) {
      const d0 = k * PANEL - scv; if (d0 < dNear - PANEL || d0 > dFar + PANEL) continue;
      const h = hash(k * 1.73);
      lineS(P(-HW, d0, 0), P(-HW, d0, WALL_H), 1.4 * z, PAL.wallDk);                                              // vertical panel seam
      pipes.forEach(pp => { const bp = P(-HW, d0, pp.y); ell(bp.x, bp.y, 3.2 * z, 4.6 * z, PAL.pipeDk); });        // pipe brackets at the seam
      if (h < 0.30) {                                                                                            // mechanical-flesh patch
        const fp = P(-HW, d0 + PANEL * 0.5, 0.9 + h * 4);
        blob(fp.x, fp.y, (10 + h * 16) * z, 7, k * 9, PAL.flesh, 0.92);
        blob(fp.x + 2, fp.y + 2, (6 + h * 9) * z, 6, k * 9 + 3, PAL.fleshDk, 0.92);
        blob(fp.x - 2, fp.y - 3, (3 + h * 5) * z, 5, k * 9 + 7, PAL.fleshLit, 0.92);
      } else if (h < 0.5) {                                                                                      // recessed louvered vent
        const va = P(-HW, d0 + PANEL * 0.22, 1.3), vb = P(-HW, d0 + PANEL * 0.78, 2.3);
        G.fillStyle = PAL.wallDk; G.fillRect(Math.min(va.x, vb.x), Math.min(va.y, vb.y), Math.abs(vb.x - va.x), Math.abs(vb.y - va.y));
        for (let s = 0; s < 4; s++) { const ly = 1.45 + s * 0.24, la = P(-HW, d0 + PANEL * 0.22, ly), lb = P(-HW, d0 + PANEL * 0.78, ly); lineS(la, lb, 1.3 * z, hexShade(PAL.wall, 0.9)); }
      }
      if (((k % LIGHT_EVERY) + LIGHT_EVERY) % LIGHT_EVERY === 0) {                                                // flickering worklight
        const lf = corridorLight(k), lc = d0 + PANEL * 0.5, fix = P(-HW, lc, WALL_H * 0.92);
        box(-HW, lc - 0.2, WALL_H * 0.84, 0.1, 0.4, 0.34, PAL.wallDk, false);                                     // housing
        G.save(); G.globalAlpha = 0.4 + 0.6 * lf; G.shadowBlur = 14 * lf; G.shadowColor = PAL.light; ell(fix.x, fix.y, 6 * z, 3 * z, PAL.light); G.shadowBlur = 0; G.restore();
        const gl = G.createRadialGradient(fix.x, fix.y, 2, fix.x, fix.y, 80 * z); gl.addColorStop(0, PAL.lightGlow + (0.5 * lf) + ')'); gl.addColorStop(1, PAL.lightGlow + '0)'); G.fillStyle = gl; G.fillRect(fix.x - 90 * z, fix.y - 90 * z, 180 * z, 180 * z);
        const fpz = P(-HW * 0.2, lc, 0); const pg = G.createRadialGradient(fpz.x, fpz.y, 4, fpz.x, fpz.y, 90 * z); pg.addColorStop(0, PAL.lightGlow + (0.22 * lf) + ')'); pg.addColorStop(1, PAL.lightGlow + '0)'); G.fillStyle = pg; G.beginPath(); G.ellipse(fpz.x, fpz.y, 86 * z, 36 * z, 0, 0, 7); G.fill();
        if (Math.random() < 0.013) { const dx = P(-HW + 0.3, lc, 2.7); drips.push({ kind: 'drop', x: dx.x, y: dx.y, vy: 0, floorY: P(-HW + 0.3, lc, 0).y, max: 1 }); }
      }
    }

    // ── FLOOR (x ∈ [-HW, +HW]) ──
    quad(P(-HW, dNear, 0), P(-HW, dFar, 0), P(HW, dFar, 0), P(HW, dNear, 0), PAL.floorPlate);
    for (let xx = -HW + 0.9; xx < HW; xx += 1.1) lineS(P(xx, dNear, 0), P(xx, dFar, 0), 1 * z, PAL.floorSeam);     // longitudinal seams
    lineS(P(-HW, dNear, 0), P(-HW, dFar, 0), 1.6 * z, PAL.floorSeam); lineS(P(HW, dNear, 0), P(HW, dFar, 0), 1.6 * z, PAL.floorSeam);
    for (let k = k0; k <= k1; k++) { const d0 = k * PANEL - scv; if (d0 < dNear || d0 > dFar) continue;
      lineS(P(-HW, d0, 0), P(HW, d0, 0), 1 * z, PAL.floorSeam);                                                   // transverse plate seams
      if (((k % 2) + 2) % 2 === 0) quad(P(-HW, d0, 0), P(-HW, d0 + PANEL, 0), P(0.2, d0 + PANEL, 0), P(0.2, d0, 0), hexShade(PAL.floorPlate, 1.08)); }   // alt lit plate (left half)

    // ── NEAR RAIL (low wall, x=+HW) — drawn as background so the rover overlays it (readability) ──
    const r_bN = P(HW, dNear, 0), r_bF = P(HW, dFar, 0);
    quad(r_bN, r_bF, P(HW, dFar, RAIL_H), P(HW, dNear, RAIL_H), PAL.wall);
    quad(r_bN, r_bF, P(HW, dFar, RAIL_H * 0.45), P(HW, dNear, RAIL_H * 0.45), hexShade(PAL.wall, 1.16));
    lineS(P(HW, dNear, RAIL_H), P(HW, dFar, RAIL_H), 3 * z, PAL.pipe);                                            // top handrail pipe
    for (let k = k0; k <= k1; k++) { const d0 = k * PANEL - scv; if (d0 < dNear || d0 > dFar) continue; lineS(P(HW, d0, 0), P(HW, d0, RAIL_H), 1.6 * z, PAL.pipeDk); }   // rail posts

    // ── overhead cross-beams (enclosing ceiling hint) ──
    for (let k = k0; k <= k1; k++) { if (((k % (LIGHT_EVERY * 2)) + LIGHT_EVERY * 2) % (LIGHT_EVERY * 2) !== 0) continue; const d0 = k * PANEL - scv; if (d0 < dNear || d0 > dFar) continue;
      lineS(P(-HW, d0, WALL_H), P(HW * 0.55, d0, WALL_H * 1.03), 3.5 * z, PAL.wallDk); }

    // occasional steam wisp off a floor vent
    if (Math.random() < 0.02) { const sx = P(-HW * 0.3 + Math.random() * HW, dNear + Math.random() * (dFar - dNear), 0); drips.push({ kind: 'steam', x: sx.x, y: sx.y, vx: (Math.random() - 0.5) * 6, vy: -10 - Math.random() * 8, r: 4, grow: 8, life: 1.2 + Math.random(), max: 2.2 }); }

    // cramped vignette (heavier than B1) — drawn in the BG so the rover stays bright on top
    const vg = G.createRadialGradient(W / 2, H * 0.5, H * 0.2, W / 2, H * 0.55, H * 0.92); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.66)'); G.fillStyle = vg; G.fillRect(0, 0, W, H);
  }

  // ── BIOME-3 THE ASSEMBLY ────────────────────────────────────────────────────
  //  Semi-open biomech FLESH FACTORY (Scorn "The Assembly"): a wide drive-lane between two SIDE ROWS of
  //  machine-flesh modules (sacs, pistons, bone organ-pipes) on low iron plinths — walls present but with
  //  GAPS and NO ceiling (open overhead) so it never reads as a hallway. Looming dark machinery in the haze
  //  behind, sinew strands dangling from above. More detail than B1, less enclosed than B2. Scrolls on scv.
  // a birthing POD on the back wall — emptied ones split open with a dark hollow (something hatched out).
  function drawPod(wx, d, y, seed, emptied) {
    const P = proj, z = camZoom, c = P(wx, d, y), rx = 16 * z, ry = 22 * z;
    ell(c.x + 2 * z, c.y + 2 * z, rx * 1.3, ry * 1.22, PAL.podDk);                 // socket recess
    if (emptied) {
      ell(c.x, c.y, rx * 0.96, ry * 1.0, PAL.podHollow);                           // dark hollow interior
      G.strokeStyle = PAL.podLit; G.lineWidth = 2.4 * z; G.lineCap = 'round';       // two peeled-open shell halves
      G.beginPath(); G.ellipse(c.x - rx * 0.5, c.y, rx * 0.6, ry * 0.96, -0.35, -0.5, 3.4); G.stroke();
      G.beginPath(); G.ellipse(c.x + rx * 0.5, c.y, rx * 0.6, ry * 0.96, 0.35, 2.9, 6.8); G.stroke();
      G.lineCap = 'butt';
      G.strokeStyle = PAL.membrane; G.lineWidth = 1.3 * z;                          // torn membrane strands across the opening
      for (let i = 0; i < 3; i++) { const yy = c.y - ry * 0.5 + i * ry * 0.5; G.beginPath(); G.moveTo(c.x - rx * 0.5, yy); G.lineTo(c.x + rx * 0.4, yy + (hash(seed + i) - 0.5) * 6 * z); G.stroke(); }
      lineS(P(wx, d, y - ry / 26), P(wx, d, y - 0.7), 1.4 * z, PAL.membrane);       // ooze drip from the lip
    } else {
      const pu = 0.5 + 0.5 * Math.sin(it * 1.1 + seed), s = 1 + 0.06 * pu;           // intact pods breathe/pulse lightly
      blob(c.x, c.y, rx * s, 9, seed, PAL.pod, ry / rx);
      blob(c.x + 2 * z, c.y + 3 * z, rx * 0.6, 7, seed + 3, PAL.podDk, ry / rx);
      blob(c.x - 3 * z, c.y - 4 * z, rx * 0.42, 6, seed + 7, PAL.podLit, ry / rx);
      G.globalAlpha = 0.08 + 0.14 * pu; ell(c.x, c.y, rx * 0.5, ry * 0.5, PAL.podLit); G.globalAlpha = 1;   // faint inner glow on the pulse
      lineS({ x: c.x, y: c.y - ry }, { x: c.x, y: c.y + ry }, 1.4 * z, PAL.podDk);   // suture seam (will split)
    }
  }
  function renderAssembly(scv) {
    const HW = ASM_HW, BW = ASM_BW, WH = 4.4, P = proj, z = camZoom;
    G.fillStyle = PAL.void; G.fillRect(0, 0, W, H);
    const k0 = Math.floor((scv + dNear) / PANEL) - 1, k1 = Math.ceil((scv + dFar) / PANEL) + 1;

    // ── deep haze + looming far-machinery silhouettes peeking ABOVE the back wall ──
    const hb = G.createLinearGradient(0, HZ - 90, 0, HZ + 80); hb.addColorStop(0, PAL.haze + '0)'); hb.addColorStop(0.5, PAL.haze + '0.5)'); hb.addColorStop(1, PAL.haze + '0)');
    G.fillStyle = hb; G.fillRect(0, HZ - 90, W, 170);
    for (let k = k0; k <= k1; k++) { if (((k % 3) + 3) % 3 !== 0) continue; const d0 = k * PANEL - scv; if (d0 < dFar * 0.4) continue;
      const bx = -(BW + 1.5 + hash(k * 3) * 2.0), b0 = P(bx, d0, WH), bt = P(bx, d0, WH + 1.8 + hash(k * 7) * 2.6);
      G.globalAlpha = 0.45; G.fillStyle = hexShade(PAL.void, 2.6); G.fillRect(b0.x - 11 * z, bt.y, 22 * z, b0.y - bt.y); G.globalAlpha = 1; }

    // ── BACK WALL (far side, x=-BW) — greebled flesh-factory SPAWNING wall with emptied pods ──
    const wbN = P(-BW, dNear, 0), wbF = P(-BW, dFar, 0), wtN = P(-BW, dNear, WH), wtF = P(-BW, dFar, WH);
    quad(wbN, wbF, wtF, wtN, PAL.wall);                                                            // base face
    quad(P(-BW, dNear, WH * 0.6), P(-BW, dFar, WH * 0.6), wtF, wtN, hexShade(PAL.wall, 0.6));      // upper AO
    quad(wbN, wbF, P(-BW, dFar, 0.9), P(-BW, dNear, 0.9), hexShade(PAL.wall, 1.2));                // floor bounce
    [{ y: 3.5, r: 5, c: PAL.iron, cl: PAL.ironLit }, { y: 1.5, r: 3.4, c: PAL.fleshDk, cl: PAL.flesh }].forEach(pp => {   // longitudinal greeble conduits
      const a = P(-BW, dNear, pp.y), b = P(-BW, dFar, pp.y); G.lineCap = 'round'; G.lineWidth = pp.r * z * 2; G.strokeStyle = pp.c; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke();
      G.lineWidth = pp.r * z; G.strokeStyle = pp.cl; G.beginPath(); G.moveTo(a.x, a.y - pp.r * 0.5 * z); G.lineTo(b.x, b.y - pp.r * 0.5 * z); G.stroke(); G.lineCap = 'butt'; });
    for (let k = k0; k <= k1; k++) { const d0 = k * PANEL - scv; if (d0 < dNear - PANEL || d0 > dFar + PANEL) continue;
      const h = hash(k * 1.73), cd = d0 + PANEL * 0.5;
      lineS(P(-BW, d0, 0), P(-BW, d0, WH), 1.3 * z, PAL.wallDk);                                   // vertical panel seam
      if (hash(k * 4.4) < 0.45) { const sd = d0 + (hash(k) - 0.4) * PANEL; G.globalAlpha = 0.32;    // age stain weeping down the wall
        lineS(P(-BW, sd, WH * (0.6 + hash(k * 2) * 0.35)), P(-BW, sd, 0.15), (2 + hash(k * 5) * 3) * z, PAL.wallStain); G.globalAlpha = 1; }
      if (h < 0.34) {                                                                              // recessed greeble box / vent
        const va = P(-BW, d0 + PANEL * 0.2, 2.5), vb = P(-BW, d0 + PANEL * 0.8, 3.4);
        G.fillStyle = PAL.wallDk; G.fillRect(Math.min(va.x, vb.x), Math.min(va.y, vb.y), Math.abs(vb.x - va.x), Math.abs(vb.y - va.y));
        for (let s = 0; s < 3; s++) { const ly = 2.65 + s * 0.28, la = P(-BW, d0 + PANEL * 0.2, ly), lb = P(-BW, d0 + PANEL * 0.8, ly); lineS(la, lb, 1.2 * z, hexShade(PAL.wall, 0.85)); }
      }
      if (((k % 2) + 2) % 2 === 0) drawPod(-BW, cd, 1.7 + hash(k * 4) * 1.3, k * 13, hash(k * 9) < 0.58);   // fewer (every other panel), bigger; ~58% emptied/hatched
    }

    // ── FLOOR — extends from the BACK WALL base (-BW) to the near edge (+HW): no black gap to the wall ──
    quad(P(-BW, dNear, 0), P(-BW, dFar, 0), P(HW, dFar, 0), P(HW, dNear, 0), PAL.floorPlate);
    quad(P(-BW, dNear, 0), P(-BW, dFar, 0), P(-HW, dFar, 0), P(-HW, dNear, 0), hexShade(PAL.floorPlate, 0.82));   // darker terrace strip under the wall/sacs
    for (let xx = -BW + 1.0; xx < HW; xx += 1.2) lineS(P(xx, dNear, 0), P(xx, dFar, 0), 1 * z, PAL.floorSeam);
    lineS(P(-HW, dNear, 0), P(-HW, dFar, 0), 1.6 * z, PAL.floorSeam); lineS(P(HW, dNear, 0), P(HW, dFar, 0), 1.8 * z, PAL.floorSeam);
    for (let k = k0; k <= k1; k++) { const d0 = k * PANEL - scv; if (d0 < dNear || d0 > dFar) continue;
      lineS(P(-HW, d0, 0), P(HW, d0, 0), 1 * z, PAL.floorSeam);
      if (((k % 2) + 2) % 2 === 0) quad(P(-1.5, d0, 0), P(-1.5, d0 + PANEL, 0), P(1.5, d0 + PANEL, 0), P(1.5, d0, 0), hexShade(PAL.floorPlate, 1.04));   // central track (dulled)
      const h = hash(k * 5.1); if (h < 0.24) { const pp = P((h - 0.5) * 6, d0 + PANEL * 0.5, 0); G.globalAlpha = 0.5; ell(pp.x, pp.y, 16 * z, 6 * z, PAL.fleshDk); G.globalAlpha = 0.3; ell(pp.x, pp.y, 9 * z, 3.4 * z, PAL.flesh); G.globalAlpha = 1; }   // organic seep
      // ── AGE GRIME: stains, grease streaks, hairline cracks — this place is millennia old, not a showroom ──
      for (let i = 0; i < 2; i++) { const hh = hash(k * 7.3 + i * 3.1); if (hh < 0.6) { const gx = (hash(k * 3 + i) - 0.5) * 2 * (HW - 0.4), gp = P(gx, d0 + hash(k + i) * PANEL, 0);
        G.globalAlpha = 0.14 + 0.16 * hh; ell(gp.x, gp.y, (10 + hh * 22) * z, (4 + hh * 8) * z, PAL.floorGrime); G.globalAlpha = 1; } }
      if (hash(k * 5.7) < 0.32) { const sx = (hash(k * 2) - 0.5) * 2 * (HW - 1); G.globalAlpha = 0.2; lineS(P(sx, d0, 0), P(sx, d0 + PANEL, 0), 3 * z, PAL.floorGrime); G.globalAlpha = 1; }   // grease streak
      if (hash(k * 9.1) < 0.24) { let cx = (hash(k * 4) - 0.5) * 2 * (HW - 1), cd = d0 + hash(k) * PANEL, p = P(cx, cd, 0);   // hairline crack
        G.strokeStyle = PAL.floorSeam; G.globalAlpha = 0.55; G.lineWidth = 1; G.beginPath(); G.moveTo(p.x, p.y); for (let s = 0; s < 4; s++) { cx += (hash(cx + s) - 0.5) * 0.5; cd += 0.4; const q = P(cx, cd, 0); G.lineTo(q.x, q.y); } G.stroke(); G.globalAlpha = 1; }
    }

    // ── MID TERRACE flesh sacs (between lane edge and back wall) — depth layer, thinned out ──
    for (let k = k0; k <= k1; k++) { const d0 = k * PANEL - scv; if (d0 < dNear || d0 > dFar) continue; const h = hash(k * 2.3 + 4);
      if (h < 0.45) { const tx = -HW - 0.4 - h * 1.4, cd = d0 + PANEL * 0.5, pu = 0.5 + 0.5 * Math.sin(it * 1.4 + k), fy = 0.6 + 0.4 * pu, fp = P(tx, cd, fy);
        blob(fp.x, fp.y, (12 + 5 * pu) * z, 7, k * 9, PAL.flesh, 0.9); blob(fp.x + 2, fp.y + 3, (7 + 3 * pu) * z, 6, k * 9 + 3, PAL.fleshDk, 0.9); blob(fp.x - 2, fp.y - 3, (4 + 2 * pu) * z, 5, k * 9 + 7, PAL.fleshLit, 0.9); } }

    // ── NEAR low edge (+HW) — short fleshy plinth, sparse nubs (kept LOW so it stays semi-open) ──
    quad(P(HW, dNear, 0), P(HW, dFar, 0), P(HW, dFar, 0.55), P(HW, dNear, 0.55), PAL.iron);
    lineS(P(HW, dNear, 0.55), P(HW, dFar, 0.55), 1.5 * z, PAL.fleshDk);
    for (let k = k0; k <= k1; k++) { const d0 = k * PANEL - scv; if (d0 < dNear || d0 > dFar) continue;
      lineS(P(HW, d0, 0), P(HW, d0, 0.55), 1.4 * z, PAL.ironDk);
      if (hash(k * 3.7 + 2) < 0.3) { const np = P(HW, d0 + PANEL * 0.5, 0.55); blob(np.x, np.y, 6 * z, 6, k * 5, PAL.flesh, 0.8); } }

    // ── sinew strands dangling from above (foreground, no ceiling) ──
    for (let k = k0; k <= k1; k++) { const d0 = k * PANEL - scv; if (d0 < dNear || d0 > dFar) continue; const h = hash(k * 2.7 + 1);
      if (h < 0.4) { const hx = (h - 0.5) * 2 * HW * 0.8, top = P(hx, d0, WH * 1.7 + 1), bot = P(hx, d0, WH * 0.8 + 0.4 + hash(k) * 0.8);
        G.strokeStyle = PAL.sinew; G.lineWidth = 1.6 * z; G.beginPath(); G.moveTo(top.x, top.y); G.lineTo(bot.x + Math.sin(it * 0.6 + k) * 3, bot.y); G.stroke(); ell(bot.x, bot.y, 2.4 * z, 3 * z, PAL.fleshDk); } }

    // ── OVERHEAD roofing struts (indoors volume, sparse — not a closed ceiling) + hanging machinery / hooks ──
    for (let k = k0; k <= k1; k++) { if (((k % 4) + 4) % 4 !== 0) continue; const d0 = k * PANEL - scv; if (d0 < dNear || d0 > dFar) continue;
      lineS(P(-BW, d0, WH + 0.3), P(HW * 0.4, d0, WH + 0.7), 3.5 * z, PAL.wallDk);                              // cross strut spanning overhead
      const h = hash(k * 6.1), hx = -BW + (BW + HW * 0.4) * h, topY = WH + 0.45;
      if (h < 0.30) {                                                                                          // hanging machine on a chain
        const bot = topY - 1.0 + 0.15 * Math.sin(it * 1.2 + k); lineS(P(hx, d0, topY), P(hx, d0, bot + 0.5), 1.6 * z, PAL.ironDk);
        box(hx - 0.35, d0 - 0.18, bot, 0.7, 0.36, 0.5, PAL.iron, false);
      } else if (h < 0.62) {                                                                                   // dangling hook
        const bot = topY - 0.8, hp = P(hx, d0, bot); lineS(P(hx, d0, topY), hp, 1.6 * z, PAL.ironDk);
        G.strokeStyle = PAL.ironLit; G.lineWidth = 2.2 * z; G.beginPath(); G.arc(hp.x, hp.y, 4 * z, -1.0, 2.4); G.stroke();
      } }

    // ── NEAR foreground parallax: dark posts + a slack cable sweeping past the camera-side edge ──
    for (let k = k0; k <= k1; k++) { const d0 = k * PANEL - scv; if (d0 < dNear || d0 > dNear + 11) continue;
      if (hash(k * 8.3 + 5) < 0.5) { const fx = HW + 0.7 + hash(k) * 0.6, a = P(fx, d0, 0), b = P(fx, d0, WH * 1.5 + 1);
        G.strokeStyle = hexShade(PAL.void, 2.0); G.lineWidth = 6 * z; G.lineCap = 'round'; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.stroke(); G.lineCap = 'butt';
        const cy = P(fx, d0, WH * 0.7); G.strokeStyle = PAL.sinew; G.lineWidth = 2 * z; G.beginPath(); G.moveTo(b.x, b.y * 0.5 + a.y * 0.5); G.quadraticCurveTo(b.x - 16 * z, cy.y, b.x, cy.y); G.stroke(); } }

    // ── light vignette (lighter than the corridor — semi-open) ──
    const vg = G.createRadialGradient(W / 2, H * 0.5, H * 0.3, W / 2, H * 0.56, H * 0.95); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,5,4,0.52)'); G.fillStyle = vg; G.fillRect(0, 0, W, H);
  }

  // the open-wasteland field scene (with rover unless the bay is covering it)
  function renderField(state, scv, drawTheRover) {
    const exp = state.exp, titleMode = state.titleMode;
    const corridor = PAL.scene === 'corridor' && !titleMode;   // reusable enclosed-corridor template (B2 today; any palette can opt in via scene:'corridor')
    const assembly = PAL.scene === 'assembly' && !titleMode;   // B3 semi-open flesh-factory (walls w/ gaps, open overhead)
    const colossus = PAL.scene === 'colossus' && !titleMode;   // B5 epic ancient-entity backdrop + iso ground strip
    const b4mono = (ISO.b4force === false) ? false : (ISO.b4force === true || curBiome === 4);   // B4 1-bit pass active → enemies drawn as a light-grey overlay AFTER it (see ISO.render), not dithered in-field
    if (corridor || assembly || colossus) syncRC();            // refresh the render context for split scene modules
    if (corridor) { renderCorridor(scv); }
    else if (assembly) { renderAssembly(scv); }
    else if (colossus && ISO.scenes.colossus) { ISO.scenes.colossus(scv); }
    else {
    // Distant hazy ground fills the top — no heavy dark sky band; the CRT vignette darkens the edges instead.
    const ter = G.createLinearGradient(0, 0, 0, H); ter.addColorStop(0, PAL.terrFar); ter.addColorStop(Math.max(0, HZ / H) * 0.6, PAL.terrFar); ter.addColorStop(Math.min(1, (HZ / H) * 0.6 + 0.45), PAL.terrMid); ter.addColorStop(1, PAL.terrNear); G.fillStyle = ter; G.fillRect(0, 0, W, H);
    mesas.forEach(m => { const p = proj(m.x, dFar, 0); G.fillStyle = PAL.mesa; G.beginPath(); G.moveTo(p.x - m.r, p.y); G.quadraticCurveTo(p.x - m.r * 0.4, p.y - m.h, p.x, p.y - m.h); G.quadraticCurveTo(p.x + m.r * 0.5, p.y - m.h * 0.9, p.x + m.r, p.y); G.closePath(); G.fill(); });
    // soft horizon haze (fades in/out — no hard "banner" bar)
    const hb = G.createLinearGradient(0, HZ - 22, 0, HZ + 34); hb.addColorStop(0, PAL.haze + '0)'); hb.addColorStop(0.5, PAL.haze + '0.22)'); hb.addColorStop(1, PAL.haze + '0)'); G.fillStyle = hb; G.fillRect(0, HZ - 22, W, 56);
    // dark biomes (B4 vault / B5 core) — a pool of light around the rover; the rest stays near-black
    if (PAL.lamp) { const rp = proj(0, RCD, 1.0), lg = G.createRadialGradient(rp.x, rp.y, 16, rp.x, rp.y, W * 0.4); lg.addColorStop(0, PAL.lamp + '0.22)'); lg.addColorStop(0.5, PAL.lamp + '0.08)'); lg.addColorStop(1, 'rgba(0,0,0,0)'); G.fillStyle = lg; G.fillRect(0, 0, W, H); }
    patches.forEach(pt => { const sd = recycle(pt.wd); if (sd <= dNear || sd >= dFar) return; const p = proj(pt.x, sd, 0), s = psize(sd), col = pt.tone > 0 ? PAL.soilWarm : PAL.soilCool; G.globalAlpha = 0.18 + 0.12 * Math.abs(pt.tone); ell(p.x, p.y, pt.r * 26 * s, pt.r * 11 * s, col); G.globalAlpha = 1; });
    cracks.forEach(ck => { const sd = recycle(ck.wd); if (sd <= dNear || sd >= dFar) return; let p = proj(ck.x, sd, 0); const s = psize(sd); G.strokeStyle = PAL.crack + '0.5)'; G.lineWidth = Math.max(1, 1.4 * s); G.beginPath(); G.moveTo(p.x, p.y); let cx = ck.x, cd = sd; for (let k = 0; k < ck.seg; k++) { cx += Math.cos(ck.ang + k) * 0.6; cd += Math.sin(ck.ang + k) * 0.6; const q = proj(cx, cd, 0); G.lineTo(q.x, q.y); } G.stroke(); });
    // tread-trail
    const k0 = Math.ceil((scv + dNear) / 0.45), k1 = Math.floor((scv + RCD - 0.3) / 0.45);
    for (let k = k0; k <= k1; k++) { const d = k * 0.45 - scv, a = Math.max(0, (d - dNear) / (RCD - dNear)), s = psize(d); for (const tx of [-0.92, 0.92]) { const p = proj(tx, d, 0.02); G.globalAlpha = 0.26 * a; G.fillStyle = PAL.trail + '1)'; G.fillRect(p.x - 4.5 * s, p.y - 2 * s, 9 * s, 3 * s); } } G.globalAlpha = 1;   // ruts line up under the rover's two tracks (±0.92)
    }
    // props + entities
    const list = [];
    if (!corridor && !assembly && !colossus) {
    pebbles.forEach(o => { const sd = recycle(o.wd); if (sd > dNear && sd < dFar) list.push({ d: sd, fade: 1, f: () => drawPebble(o.x, sd, o.r) }); });
    rocks.forEach(o => { const sd = recycle(o.wd); if (sd > dNear && sd < dFar) list.push({ d: sd, fade: 1, f: () => drawRock(o.x, sd, o.r, o.seed) }); });
    boulders.forEach(o => { const sd = recycle(o.wd); if (sd > dNear && sd < dFar) list.push({ d: sd, fade: 1, f: () => drawBoulder(o.x, sd, o.r, o.seed) }); });
    tufts.forEach(o => { const sd = recycle(o.wd); if (sd > dNear && sd < dFar) list.push({ d: sd, fade: 1, f: () => drawTuft(o.x, sd, o.big) }); });
    debris.forEach(o => { const sd = recycle(o.wd); if (sd > dNear && sd < dFar) list.push({ d: sd, fade: 1, f: () => drawDebris(o.x, sd, o.kind, o.seed) }); });
    glows.forEach(o => { const sd = recycle(o.wd); if (sd > dNear && sd < dFar) list.push({ d: sd, fade: 1, f: () => drawGlow(o.x, sd) }); });
    if (curBiome === 4 || ISO.b4force) wrecks.forEach(o => { const sd = recycle(o.wd); if (sd > dNear && sd < dFar) list.push({ d: sd, fade: 1, f: () => drawWreck(o, sd) }); });   // B4 graveyard props
    }
    if (state.sceneWorld && !colossus) { if (exp.obstacle) { const ma = Math.max(0, exp.nextObstacleDist - exp.distance), sd = RCD + NODE_STOP + ma * DPM; if (sd < NODE_FAR) drawNode(exp.obstacle.def, sd, Math.max(0, Math.min(1, 1 - exp.obstacle.timeLeft / exp.obstacle.maxTime)), exp.status === 'HARVESTING', list); } (exp.enemies || []).forEach(en => {
      if (!en.dead && Math.random() < 0.13) { const ep = enemyPos(en), sp = proj(ep.lat, ep.depth, 1.2);   // emit a faint exhaust puff (lingers → wispy trail)
        smoke.push({ x: sp.x + (Math.random() - 0.5) * 4, y: sp.y + 3, vx: (Math.random() - 0.5) * 4, vy: -5 - Math.random() * 4, r: 2.5 + Math.random() * 2, grow: 4 + Math.random() * 3.5, life: 1.0 + Math.random() * 0.7, max: 1.7 }); }
      if (!b4mono) drawEnemy(en, list); }); }   // B4: skip here, drawn light-grey over the 1-bit pass instead
    // rover animation state — drill while harvesting, turret tracks the nearest hostile
    roverFx.harvest = (state.sceneWorld && exp.status === 'HARVESTING') ? 1 : 0;
    let best = null, bDist = 1e9;
    if (state.sceneWorld) (exp.enemies || []).forEach(en => { if (en.dead) return;
      const { lat, depth } = enemyPos(en), dd = Math.abs(lat) + Math.abs(depth - RCD);
      if (dd < bDist) { bDist = dd; best = { lat, depth }; } });
    roverFx.tgt = best;
    roverFx.fire = best ? (((it * 2) % 1) < 0.16 ? 1 : Math.max(0, roverFx.fire - 0.12)) : 0;
    // lock-on reticle — eases toward the target so it trails slightly BEHIND a moving hostile
    if (best) { const tp = proj(best.lat, best.depth, 1.4);
      if (!reticle) reticle = { x: tp.x, y: tp.y, a: 0 };
      reticle.x += (tp.x - reticle.x) * 0.12; reticle.y += (tp.y - reticle.y) * 0.12; reticle.a = Math.min(1, reticle.a + 0.09); }
    else if (reticle) { reticle.a -= 0.07; if (reticle.a <= 0) reticle = null; }
    if (smoke.length) drawSmoke();   // exhaust trails sit UNDER the drones/props
    if (drawTheRover && state.sceneWorld && exp.status === 'DRIVING') spawnDust(Math.min(1, _driveSpeed / SHAKE_REF));   // kick up biome-tinted soil while rolling
    if (dust.length) drawDust();     // dust sits behind/under the rover
    if (drawTheRover && !colossus) drawRover(list, scv);   // B5 orbit draws its own placeholder rover at the ring front
    list.sort((a, b) => b.d - a.d).forEach(o => { if (o.fade) { G.globalAlpha = edgeFade(o.d); o.f(); G.globalAlpha = 1; } else o.f(); });   // fixed-size props fade in/out at the cull edges
    if (state.sceneWorld && exp.status === 'HARVESTING' && exp.obstacle) { const ma = Math.max(0, exp.nextObstacleDist - exp.distance), sd = RCD + NODE_STOP + ma * DPM, tip = proj(0.2, RCD + 1.3, 0.55), tgt = proj(0, sd - 0.1, 0.4 + 0.3 * Math.sin(it * 30)); G.save(); G.shadowBlur = 8; G.shadowColor = exp.obstacle.def.color; G.strokeStyle = exp.obstacle.def.color; G.lineWidth = 3 + Math.random() * 2; G.beginPath(); G.moveTo(tip.x, tip.y); G.lineTo(tgt.x, tgt.y); G.stroke(); G.strokeStyle = 'rgba(255,255,255,0.7)'; G.lineWidth = 1; G.beginPath(); G.moveTo(tip.x, tip.y); G.lineTo(tgt.x, tgt.y); G.stroke(); G.shadowBlur = 0; G.restore(); }
    if (shards.length) drawShards();
    if (beam) drawBeam();
    if ((corridor || assembly) && drips.length) drawDrips();   // ceiling ooze + steam sit over the corridor/assembly
    if (reticle && reticle.a > 0.01 && !b4mono && !colossus) drawReticle(reticle);   // B4 grey-overlay + B5 colossus draw their own reticle
    if (!corridor && !assembly && !colossus) { const dh = G.createLinearGradient(0, HZ, 0, HZ + (H - HZ) * 0.55); dh.addColorStop(0, PAL.haze + '0.30)'); dh.addColorStop(1, PAL.haze + '0)'); G.fillStyle = dh; G.fillRect(0, HZ, W, (H - HZ) * 0.55); }
    if (!assembly && !colossus) { const vg = G.createRadialGradient(W / 2, H * 0.52, H * 0.32, W / 2, H * 0.56, H * 0.96); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,14,6,0.40)'); G.fillStyle = vg; G.fillRect(0, 0, W, H); }
  }

  // ── BIOME-4 MONOCHROME (1-BIT GAME-BOY) RENDER PASS ─────────────────────────
  //  A from-scratch screen-space pass that turns the field into atmospheric 1-bit art:
  //    1. downscale the colour field to a small buffer (chunky pixels = the look)
  //    2. luminance → strong contrast → FOG-OF-WAR visibility (rover light is the ONLY source)
  //    3. ordered (Bayer 8x8) dither + quantise to a STRICT 5-tone palette → printed-monochrome density
  //  Visibility hierarchy: light CONE (brightest) › rover RADIUS (medium) › ambient floor (near-black).
  //  `clarity` 1=fresh → 0=deep dims the ambient/cone so it gets lonelier the deeper you go.
  //  Toggle ISO.b4force=true to preview anywhere; ISO.b4clarity (0..1) pins clarity for tuning.
  const B4 = {
    // Values dialed in via the Dev Tools live preview (2026-06-09 tuning pass). All still slider-adjustable.
    pixel: 2.0,        // screen px per dither dot — buffer width derived from canvas W so dot size stays CONSTANT at any window size (no more "worse when larger"). higher = chunkier + cheaper.
    ref: 40, floor: 0.5,     // depth→clarity ramp (metres of scv for clarity 1→floor)
    contrast: 1.55,    // brightness contrast (printed look = punchy, but not so hard it crushes to solid black)
    bias: 0.11,        // brightness offset after contrast
    surfBase: 0.14,    // surface reflectance floor — lit ground shows even where albedo≈0 (cone REVEALS terrain)
    surfGain: 1.5,     // how much real albedo adds on top (rover/props/nodes pop toward white)
    minB: 0.13,        // GLOBAL brightness floor — nothing ever goes solid #000; darkest = dense dither w/ white poking through
    texNoise: 0.18,    // STABLE spatial stipple — breaks the Bayer grid into organic printed grain (the edge-crop look)
    ambient: 0.8,      // BASE light everywhere — world stays dim-READABLE (rocks visible, just dark); cone adds on top
    selfLit: 1.5,      // distant bright surfaces (resource nodes/props) self-illuminate a little, lit or not
    roverLit: 0,       // the ROVER is always rendered this bright (white/light-grey) regardless of the cone
    roverLen: 5,       // rover footprint half-length (world depth units) — region that gets force-lit
    roverWid: 0.5,     // rover footprint half-width (world x units)
    roverThresh: 0.24, // only force-light pixels brighter than this inside the footprint (the rover sprite, not the dark ground under it)
    coneFront: 4,      // apex sits this far AHEAD of the rover centre (= the rover's front), world depth units
    coneBack: 3,       // gentle back-spill so the rover body is front-lit — replaces the old circular glow
    coneRange: 15,     // cone reach forward (world depth units) = teardrop LENGTH
    coneBaseW: 1.3,    // cone half-width at the apex (world x units) = teardrop NECK width at the rover
    coneSpread: 0.45,  // widening per depth unit = how fat the teardrop bulges toward the far end
    conePeak: 0,       // where the BRIGHTEST belly sits along the cone (0 = at rover neck … 1 = far tip)
    coneNeck: 0,       // how much dimmer the neck (at the rover) is vs the belly peak
    coneBright: 1.2,   // cone brightness ABOVE ambient (gentler now that ambient is readable)
    grain: 0.3,        // temporal CRT shimmer (on top of stable texNoise)
    // INK OUTLINES — screen-space edge pass: darkens brightness discontinuities so world objects (rocks, nodes,
    // rover, wrecks) get crisp black lines and read as distinct from the flat dithered ground.
    edgeOn: 1,         // 1 = outlines on, 0 = off
    edgeThresh: 0.32,  // brightness step that counts as an object edge (lower = more lines, incl. faint terrain)
    edgeStrength: 0.55,// how black the outline goes (0..1)
    nodeBase: 0.18,    // resource NODES are light-independent: brightness = nodeBase + albedo×nodeGain (fixed greyscale, lit or not)
    nodeGain: 0.95,    // how much the node's own facet shading spreads its greys
  };
  ISO.B4 = B4; ISO.b4force = null; ISO.b4clarity = null;   // b4force: true=force on · false=force OFF (even in biome 4) · null=auto (on in biome 4)
  // Strict palette + 8x8 Bayer ordered-dither matrix (finer "printed" density than 4x4).
  const B4_LEVELS = [0x00, 0x22, 0x55, 0xAA, 0xFF];   // #000 #222 #555 #AAA #FFF — the ONLY tones output
  const BAYER8 = [ 0,32,8,40,2,34,10,42, 48,16,56,24,50,18,58,26, 12,44,4,36,14,46,6,38, 60,28,52,20,62,30,54,22,
                   3,35,11,43,1,33,9,41, 51,19,59,27,49,17,57,25, 15,47,7,39,13,45,5,37, 63,31,55,23,61,29,53,21 ].map(v => (v + 0.5) / 64);
  let b4Cv = null, b4G = null, b4Noise = null, b4Lum = null;
  // stable 64x64 random tile → organic stipple (breaks the regular Bayer grid into printed-style grain)
  function b4NoiseTile() { if (b4Noise) return b4Noise; b4Noise = new Float32Array(4096); for (let i = 0; i < 4096; i++) b4Noise[i] = Math.random(); return b4Noise; }
  function b4Clarity(scv) {
    if (ISO.b4clarity != null) return Math.max(0, Math.min(1, ISO.b4clarity));
    return Math.max(B4.floor, Math.min(1, 1 - Math.abs(scv) / B4.ref));
  }
  function post1bit(ctx, clarity) {
    const bw = Math.max(120, Math.min(1400, Math.round(W / (B4.pixel || 2)))), bh = Math.max(1, Math.round(bw * H / W));
    if (!b4Cv) b4Cv = document.createElement('canvas');
    if (b4Cv.width !== bw || b4Cv.height !== bh) { b4Cv.width = bw; b4Cv.height = bh; b4G = b4Cv.getContext('2d'); }
    b4G.imageSmoothingEnabled = true; b4G.clearRect(0, 0, bw, bh);
    b4G.drawImage(ctx.canvas, 0, 0, W, H, 0, 0, bw, bh);   // downscale the freshly-drawn colour field
    const img = b4G.getImageData(0, 0, bw, bh), d = img.data;
    // ISO GROUND-PLANE HEADLIGHT CONE. Build the iso ground basis (buffer px per world unit) so the cone
    // is measured in WORLD coords → it lies flat on the ground in iso (not a screen-space triangle), and
    // emits from the FRONT of the rover. Rounded forward end (elliptical falloff), no circular glow.
    const sX = bw / W, sY = bh / H;
    const o = proj(0, RCD, 0), fpt = proj(0, RCD + 1, 0), lpt = proj(1, RCD, 0);
    const fX = (fpt.x - o.x) * sX, fY = (fpt.y - o.y) * sY;   // screen delta per +1 world DEPTH
    const lX = (lpt.x - o.x) * sX, lY = (lpt.y - o.y) * sY;   // screen delta per +1 world X (lateral)
    const det = (fX * lY - lX * fY) || 1;
    const apA = proj(0, RCD + B4.coneFront, 0);               // apex on the ground at the rover's FRONT
    const apx = apA.x * sX, apy = apA.y * sY;
    const range = B4.coneRange, baseW = B4.coneBaseW, splay = B4.coneSpread, back = B4.coneBack, cBright = B4.coneBright;
    const peak = B4.conePeak, neck = B4.coneNeck;
    const amb = B4.ambient * (0.4 + 0.6 * clarity), grain = B4.grain;
    const ct = B4.contrast, bias = B4.bias;
    const surfBase = B4.surfBase, surfGain = B4.surfGain, minB = B4.minB, selfLit = B4.selfLit;
    const coneFront = B4.coneFront, roverLit = B4.roverLit, roverLen = B4.roverLen, roverWid = B4.roverWid, roverThresh = B4.roverThresh;
    const nodeBase = B4.nodeBase, nodeGain = B4.nodeGain;
    const NZ = b4NoiseTile(), texNoise = B4.texNoise;
    const edgeOn = B4.edgeOn, edgeThresh = B4.edgeThresh, edgeStrength = B4.edgeStrength;
    if (!b4Lum || b4Lum.length < bw * bh) b4Lum = new Float32Array(bw * bh);
    const LUM = b4Lum;
    // PASS A — compute the CLEAN lit brightness (no dither/noise yet) into LUM, so edge-detection runs on the
    // smooth lighting, not the noisy dithered output.
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const p = y * bw + x, i = p * 4;
      const albedo = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;   // surface reflectance (terrain is near-black here)
      let b;
      if (d[i + 1] - d[i] > 6) {                                             // NODE (green-biased tag) — render light-INDEPENDENT: fixed greyscale, keeps its shading inside the beam
        b = nodeBase + albedo * nodeGain;
      } else {
        // FOG OF WAR — light is the only source. Decompose pixel into WORLD ground coords from the apex.
        const dx = x - apx, dy = y - apy;
        const along = (dx * lY - lX * dy) / det;    // world depth forward from the apex (rover front)
        const lat = (fX * dy - dx * fY) / det;      // world lateral offset
        let cone = 0;
        if (along < range && along > -back) {
          const w = baseW + (along > 0 ? along : 0) * splay;     // cone half-width (widens going forward)
          const latN = (lat < 0 ? -lat : lat) / w;               // 0 centre → 1 edge
          if (latN < 1) {
            let aE;
            if (along >= 0) { const aN = along / range;                                  // brightest pool sits in the BELLY (peak), fading round to the tip
              aE = aN < peak ? (1 - neck) + neck * (aN / peak)                           // neck (at rover) ramps up to the belly peak
                             : Math.sqrt(Math.max(0, 1 - ((aN - peak) / (1 - peak)) * ((aN - peak) / (1 - peak)))); }  // rounded fade to far end
            else aE = 1 + along / back;                                                  // back-spill onto the rover
            const r = Math.sqrt(latN * latN + (1 - aE) * (1 - aE));                      // euclidean → curved contours, no straight cut-off
            if (r < 1) { const c = 1 - r; cone = c * c * (3 - 2 * c); }                  // smoothstep → gradual soft falloff
          }
        }
        const light = amb + Math.min(1, cone * cBright);
        b = light * (surfBase + albedo * surfGain);                          // light REVEALS the surface (not multiply-then-crush)
        b += Math.max(0, albedo - 0.55) * selfLit;                           // distant bright props self-show, lit or not
        const ra = along + coneFront;                                        // 0 ≈ rover centre — force-light the rover footprint
        if (albedo > roverThresh) { const rr = Math.sqrt(ra * ra / (roverLen * roverLen) + lat * lat / (roverWid * roverWid));
          if (rr < 1) b = Math.max(b, roverLit * (0.7 + 0.3 * albedo)); }
      }
      b = (b - 0.5) * ct + 0.5 + bias;                                       // contrast after lighting
      LUM[p] = b < 0 ? 0 : b > 1 ? 1 : b;
    }
    // PASS B — INK OUTLINES (edge-detect on LUM) + noise + floor + Bayer dither → strict 5-tone output.
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const p = y * bw + x, i = p * 4;
      let b = LUM[p];
      if (edgeOn) {                                                          // darken brightness discontinuities → black ink line around objects
        let e = 0; const c = b;
        if (x > 0)        { const dd = c - LUM[p - 1];  const a = dd < 0 ? -dd : dd; if (a > e) e = a; }
        if (x + 1 < bw)   { const dd = c - LUM[p + 1];  const a = dd < 0 ? -dd : dd; if (a > e) e = a; }
        if (y > 0)        { const dd = c - LUM[p - bw]; const a = dd < 0 ? -dd : dd; if (a > e) e = a; }
        if (y + 1 < bh)   { const dd = c - LUM[p + bw]; const a = dd < 0 ? -dd : dd; if (a > e) e = a; }
        if (e > edgeThresh) b *= (1 - edgeStrength);
      }
      b += (NZ[(y & 63) * 64 + (x & 63)] - 0.5) * texNoise;                  // stable organic stipple (printed grain)
      if (grain > 0) b += (Math.random() - 0.5) * grain;                     // tiny temporal CRT shimmer on top
      b = b < 0 ? 0 : b > 1 ? 1 : b;
      b = minB + (1 - minB) * b;                                             // floor → darkest = dense dither, never solid black
      const by = BAYER8[(y & 7) * 8 + (x & 7)];
      const v = b * 4; let lo = v | 0; if (lo > 4) lo = 4; const idx = lo + ((v - lo > by && lo < 4) ? 1 : 0);
      const o = B4_LEVELS[idx]; d[i] = d[i + 1] = d[i + 2] = o;
    }
    b4G.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;                                       // nearest-neighbour upscale = blocky pixels
    ctx.drawImage(b4Cv, 0, 0, bw, bh, 0, 0, W, H);                           // full replace — strictly monochrome
    ctx.imageSmoothingEnabled = true;
  }

  // B4 hostiles drawn LIGHT-GREY over the 1-bit pass — the static is purely aesthetic, so enemies always read
  //  against the black and never get crushed/missed (gameplay > overlay). Positioned via the same iso projection.
  function drawB4Enemies(ctx, exp, shX, shY) {
    if (!exp || !exp.enemies || !exp.enemies.length) return;
    const prevG = G; G = ctx; ctx.save(); ctx.translate(Math.round(shX), Math.round(shY));
    let best = null, bd = 1e9;
    for (const en of exp.enemies) {
      if (en.dead) { const fd = Math.max(0, en.deathTimer / 0.5); if (fd > 0) { const ep = enemyPos(en), c = proj(ep.lat, ep.depth, 1.5); ctx.save(); ctx.globalAlpha = fd; ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c.x, c.y, (1 - fd) * 24, 0, 7); ctx.stroke(); ctx.restore(); } continue; }
      const ep = enemyPos(en), c = proj(ep.lat, ep.depth, 1.5 + 0.16 * Math.sin(it * 2 + en.pulse)), r = 15;
      ell(c.x, c.y + r * 0.26, r * 0.95, r * 0.5, '#8a8a8a');                  // shaded underside
      ell(c.x, c.y, r, r * 0.9, '#cfcfcf'); ell(c.x - r * 0.26, c.y - r * 0.3, r * 0.42, r * 0.26, '#f2f2f2');   // hull + highlight
      ell(c.x, c.y, r * 0.6, r * 0.58, '#3a3a3a'); ell(c.x, c.y, r * 0.34, r * 0.32, '#ffffff');                 // dark lens + bright core
      ell(c.x - r * 0.12, c.y - r * 0.12, 1.8, 1.8, '#101010');               // pupil
      if (en.hitTimer > 0 && en.maxHp) { const frac = Math.max(0, Math.min(1, en.hp / en.maxHp)), a = Math.min(1, en.hitTimer / 0.5), bw = r * 2.0, bh = 3.2, bx = c.x - bw / 2, by = c.y - r * 1.9;
        ctx.globalAlpha = a; ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2); ctx.fillStyle = frac > 0.5 ? '#e8e8e8' : frac > 0.25 ? '#9a9a9a' : '#5a5a5a'; ctx.fillRect(bx, by, bw * frac, bh); ctx.globalAlpha = 1; }
      const dd = Math.abs(ep.lat) + Math.abs(ep.depth - RCD); if (dd < bd) { bd = dd; best = c; }
    }
    if (best) { const R = 22, rot = it * 1.4, pu = 0.85 + 0.15 * Math.sin(it * 7); ctx.save(); ctx.strokeStyle = '#ff5a4a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(best.x, best.y, R * pu, 0, 6.283); ctx.stroke();
      for (let i = 0; i < 4; i++) { const ang = rot + i * Math.PI / 2, cc = Math.cos(ang), ss = Math.sin(ang); ctx.beginPath(); ctx.moveTo(best.x + cc * (R * pu - 4), best.y + ss * (R * pu - 4)); ctx.lineTo(best.x + cc * (R * pu + 6), best.y + ss * (R * pu + 6)); ctx.stroke(); } ctx.restore(); }
    ctx.restore(); G = prevG;
  }

  ISO.render = function (ctx, w, h, gY, state) {
    const exp = state.exp, titleMode = state.titleMode;
    curBiome = (typeof currentBiome === 'function' && currentBiome()) ? currentBiome().no : 1;
    if (ISO.forceBiome) curBiome = ISO.forceBiome;   // DEV: preview any biome's scene/palette without grinding to it (set ISO.forceBiome=3, null to clear)
    PAL = PALETTES[curBiome] || PALETTES[1];   // field palette per biome
    camZoom = (!titleMode && (PAL.scene === 'corridor' || PAL.scene === 'assembly' || PAL.scene === 'colossus')) ? (PAL.zoom || B2_ZOOM) : FIELD_ZOOM;   // scene biomes set their own zoom; open biomes use FIELD_ZOOM; must be set BEFORE setCam
    setCam(w, h); GY = gY; if (!seeded) seed();
    _sc = (typeof scrollWorld === 'number' ? scrollWorld : 0) / (typeof PX === 'number' ? PX : 12) * DPM; const scv = _sc;

    // ── TRANSITION (no zoom change): the bay fades to BLACK as the rover rolls out; the
    //  wasteland then fades IN through fog. A full-black bridge means the next scene is never
    //  live while the previous one is still fading.
    let bayA = 0, doorP = 0, rollT = 0, blackV = 0, fogV = 0; const st = exp.status; roverDOff = 0;
    if (!titleMode) {
      if (st === 'STANDBY') { bayA = 1; doorP = 0.10; rollT = 0; }
      else if (st === 'LAUNCHING') { const lp = state.launchP || 0; bayA = 1; doorP = Math.min(1, lp / 0.28); rollT = Math.min(1, Math.max(0, (lp - 0.08) / 0.78)); blackV = smooth(lp, 0.5, 1.0); }
      else if (st === 'RECALLING') { const rp = state.recallP || 0;
        if (rp < 0.5) { bayA = 0; roverDOff = -smooth(rp, 0.0, 0.42) * 20; blackV = smooth(rp, 0.34, 0.5); }   // rover hauled BACK off the bottom, then field fades to black
        else { bayA = 1; doorP = 1; rollT = 1 - smooth(rp, 0.5, 0.92); blackV = 1 - smooth(rp, 0.55, 0.95); } }   // bay fades in from black
      else if (st === 'DESCENDING') { const dp = state.descP || 0; bayA = 0;             // breach to a deeper biome
        if (dp < 0.5) roverDOff = smooth(dp, 0.0, 0.46) * 24;                             // rover drives FORWARD up the track, off the top
        else roverDOff = -DRIVE_IN * (1 - smooth(dp, 0.55, 1.0));                         // then DRIVES IN from the bottom-left into the new biome
        blackV = dp < 0.5 ? smooth(dp, 0.30, 0.5) : 1 - smooth(dp, 0.5, 0.72);            // full black at the midpoint (biome swaps under it)
        fogV = dp > 0.5 ? blackV * 0.45 : 0; }                                           // emerge through fog into the new biome
    }
    if (prevStatus === 'LAUNCHING' && st !== 'LAUNCHING' && state.sceneWorld) fadeInT = FADE_IN_DUR;   // just emerged into the waste
    prevStatus = st;
    if (fadeInT > 0) { const f = Math.min(1, fadeInT / FADE_IN_DUR); blackV = Math.max(blackV, f * f); fogV = Math.max(fogV, f);
      if (st === 'DRIVING' || st === 'HARVESTING') roverDOff = -DRIVE_IN * f; }           // after launch, the rover DRIVES IN from the bottom-left rather than fading in place

    // ── speed-driven shake/bob: measure instantaneous scroll speed and jolt the field while
    //  the rover is actually driving in the wasteland (not in the bay / mid-transition / harvesting stop).
    const rawSpeed = (_prevSc != null && _lastDt > 0) ? Math.abs(scv - _prevSc) / _lastDt : 0;
    _prevSc = scv; _driveSpeed += (rawSpeed - _driveSpeed) * Math.min(1, _lastDt * 8);   // smooth out frame jitter
    const driving = !titleMode && state.sceneWorld && bayA < 0.55 && (st === 'DRIVING' || st === 'HARVESTING');
    const intensity = driving ? Math.min(1, _driveSpeed / SHAKE_REF) : 0;
    let shX = 0, shY = 0;
    if (intensity > 0.001) {
      shX = (Math.sin(it * 47) * 0.6 + Math.sin(it * 83) * 0.4) * SHAKE_MAX * intensity;   // layered sines → organic, no per-frame strobe
      shY = (Math.sin(it * 6.2) + Math.sin(it * 9.7) * 0.4) / 1.4 * BOB_MAX * intensity;    // slower up/down roll over uneven ground
    }
    // BIOME-4 dead-signal jostle: rover lurches harder the deeper/worse the signal (independent of speed)
    const b4want = ISO.b4force === false ? false : (ISO.b4force === true || curBiome === 4);
    const b4on = b4want && !titleMode && state.sceneWorld && bayA < 0.55;
    if (b4on) { const j = 1 - b4Clarity(scv);
      shX += (Math.sin(it * 5.1) * 1.4 + Math.sin(it * 11.3) * 0.8) * j;
      shY += (Math.sin(it * 3.3) + Math.sin(it * 7.1) * 0.5) * 2.2 * j;
    }
    // FIELD underneath (its rover shown unless the opaque bay covers it). A navigated ship room replaces the
    // field entirely, so skip the field render when one is active — the two scenes never draw together.
    G = ctx;
    if (!roomActive) { ctx.save(); ctx.translate(Math.round(shX), Math.round(shY)); renderField(state, scv, bayA < 0.55); ctx.restore();
      if (b4on) { post1bit(ctx, b4Clarity(scv)); drawB4Enemies(ctx, state.exp, shX, shY); } }   // crush field to 1-bit, then draw hostiles in light grey OVER it (always visible)
    // BAY interior — its own ZOOMED, rover-centred camera (NO zoom change; the black bridge hides the cut).
    // The bay is the SHIP, so it always uses the biome-1 palette regardless of which biome the field is.
    if (roomActive || bayA > 0.01) {   // a ship interior room fills the screen (bay at standby, or a navigated room)
      PAL = PALETTES[1];
      if (!bayCv) bayCv = document.createElement('canvas');
      if (bayCv.width !== W || bayCv.height !== H) { bayCv.width = W; bayCv.height = H; bayG = bayCv.getContext('2d'); }
      setBayCam(W, H, 0);
      bayInteractive = roomActive || (st === 'STANDBY');   // navigated rooms are always interactive; bay only when parked
      computeBayHotspots();                  // recompute under the live room camera, before the room draws its hover glow
      const prev = G; G = bayG; bayG.clearRect(0, 0, W, H); (ROOM_RENDER[curRoom] || renderBay)(rollT, doorP, scv); G = prev;
      setCam(W, H);
      ctx.drawImage(bayCv, 0, 0);   // opaque (fully covers the field)
    }
    // BLACK then FOG transition overlay
    if (blackV > 0.001) { ctx.fillStyle = 'rgba(8,9,6,' + Math.min(1, blackV) + ')'; ctx.fillRect(0, 0, W, H); }
    if (fogV > 0.001) { ctx.fillStyle = 'rgba(150,158,108,' + (fogV * 0.55) + ')'; ctx.fillRect(0, 0, W, H); }
    G = null;
  };

  // DEV preview: press B to force the biome-4 1-bit pass in any biome; Shift+B / Shift+B again steps clarity.
  window.addEventListener('keydown', e => {
    if (/^(input|textarea)$/i.test((document.activeElement || {}).tagName || '')) return;
    if (e.key === 'b' || e.key === 'B') {
      if (e.shiftKey) { ISO.b4clarity = ISO.b4clarity == null ? 1 : (ISO.b4clarity <= 0.05 ? null : Math.max(0, ISO.b4clarity - 0.2)); }
      else { ISO.b4force = ISO.b4force === true ? false : (ISO.b4force === false ? null : true); ISO.b4clarity = null; }   // cycle: auto → ON → OFF → auto
    }
  });

  window.ISO = ISO;
})();

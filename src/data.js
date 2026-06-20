// ============================================================
//  data.js — ROVERHAUL v0.8
//  Edit this file to add/change resources, alloys, upgrades,
//  and game config values. Nothing else needs to change.
// ============================================================

// ── BIG-NUMBER FORMATTING ───────────────────────────────────
// Compact K/M/B/T… display so large idle-game readouts stay legible.
// Defined here (first file loaded) so every module can use it.
//   < 1000        → plain integer ("742")
//   1000+         → suffixed with up to 2 decimals ("1.25K", "3.4M", "12B")
// Pass `dec` to force decimals on small numbers (rates), e.g. fmtNum(0.42, 2).
function fmtNum(n, dec) {
  if (n == null || isNaN(n)) return '0';
  const neg = n < 0; n = Math.abs(n);
  if (dec != null && n < 1000) return (neg ? '-' : '') + n.toFixed(dec);
  if (n < 1000) return (neg ? '-' : '') + Math.floor(n).toString();
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp'];
  let u = 0, v = n;
  while (v >= 1000 && u < units.length - 1) { v /= 1000; u++; }
  const s = v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.floor(v).toString();
  return (neg ? '-' : '') + s + units[u];
}

// ── RESOURCE TABLE ──────────────────────────────────────────
// Each entry = one gatherable node in the world.
//   id         Unique key. No spaces.
//   name       Display name shown everywhere in the UI.
//   category   Groups resources in Cargo Bay. Any string.
//   tier       'raw' | 'refined' | 'alloy' | 'exotic' | 'biomech'
//   color      Hex colour — used for the obstacle and cargo bar.
//   drillTime  Seconds to harvest (0 = output-only, not spawnable).
//   yieldMin   Minimum units gained per harvest.
//   yieldMax   Maximum units gained per harvest.
//   weight     Spawn frequency. Higher = appears more often. 0 = disabled.
//   refinesTo  { id, ratio } — ratio of this makes 1 of id. null = no refine.
//   obsShape   Canvas shape: 'heap' | 'cyst' | 'crystal' | 'shard' | 'node'
//
// RARITY LADDER: the raw ores below run common → rare (weight high → low).
// Rarer ore drills slower, yields less, and refines at a steeper ratio, but
// feeds higher-tier upgrades. This is the spine of the progression curve.
// ── ADD A RESOURCE: copy any row and change the fields. ──────
let RT = [
  // ── RAW ORES (common → rare) ────────────────────────────
  {id:'iron',      name:'Iron Scrap',        category:'Raw Ore',          tier:'raw',    color:'#7a8fa6', drillTime:2.2, yieldMin:5, yieldMax:9,  weight:34, refinesTo:{id:'r_iron',    ratio:3},  obsShape:'heap'   },
  {id:'copper',    name:'Copper Scrap',      category:'Raw Ore',          tier:'raw',    color:'#c87a00', drillTime:2.6, yieldMin:4, yieldMax:7,  weight:27, refinesTo:{id:'r_copper',  ratio:3},  obsShape:'heap'   },
  {id:'alum',      name:'Aluminium Salvage', category:'Raw Ore',          tier:'raw',    color:'#aabfcc', drillTime:2.4, yieldMin:4, yieldMax:7,  weight:21, refinesTo:{id:'r_alum',    ratio:3},  obsShape:'heap'   },
  {id:'steel',     name:'Ferrous Slag',      category:'Raw Ore',          tier:'raw',    color:'#8899aa', drillTime:3.2, yieldMin:3, yieldMax:5,  weight:15, refinesTo:{id:'r_steel',   ratio:6},  obsShape:'shard'  },
  {id:'titanium',  name:'Titanium Ore',      category:'Raw Ore',          tier:'raw',    color:'#9aa3ad', drillTime:3.8, yieldMin:2, yieldMax:4,  weight:10, refinesTo:{id:'r_titanium',ratio:7},  obsShape:'shard'  },
  {id:'nickel',    name:'Nickel Ore',        category:'Raw Ore',          tier:'raw',    color:'#8a9a7a', drillTime:4.4, yieldMin:2, yieldMax:4,  weight:6,  refinesTo:{id:'r_nickel',  ratio:8},  obsShape:'node'   },
  {id:'tungsten',  name:'Tungsten Ore',      category:'Raw Ore',          tier:'raw',    color:'#55504a', drillTime:5.2, yieldMin:1, yieldMax:3,  weight:3,  refinesTo:{id:'r_tungsten',ratio:10}, obsShape:'crystal'},
  // ── REFINED METALS (output only — drillTime:0, weight:0) ─
  {id:'r_iron',    name:'Refined Iron',      category:'Refined Metals',   tier:'refined',color:'#aeb8c2', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                      obsShape:'heap'   },
  {id:'r_copper',  name:'Tempered Copper',   category:'Refined Metals',   tier:'refined',color:'#e0913f', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                      obsShape:'heap'   },
  {id:'r_alum',    name:'Ind. Aluminium',    category:'Refined Metals',   tier:'refined',color:'#cce4ff', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                      obsShape:'heap'   },
  {id:'r_steel',   name:'Structural Steel',  category:'Refined Metals',   tier:'refined',color:'#aaccff', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                      obsShape:'heap'   },
  {id:'r_titanium',name:'Refined Titanium',  category:'Refined Metals',   tier:'refined',color:'#d8dde2', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                      obsShape:'shard'  },
  {id:'r_nickel',  name:'Refined Nickel',    category:'Refined Metals',   tier:'refined',color:'#b8c0a8', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                      obsShape:'node'   },
  {id:'r_tungsten',name:'Refined Tungsten',  category:'Refined Metals',   tier:'refined',color:'#8b94a0', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                      obsShape:'crystal'},
  // ── ALLOYS (forged from two metals — see ALLOYS below) ──
  // Each is a unique metal in its own right, required by higher upgrade tiers.
  {id:'bronze',    name:'Bronze',            category:'Alloys',           tier:'alloy',  color:'#cd7f32', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                      obsShape:'node'   },
  {id:'duralumin', name:'Duralumin',         category:'Alloys',           tier:'alloy',  color:'#c9d4dd', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                      obsShape:'node'   },
  {id:'chromoly',  name:'Chromoly Steel',    category:'Alloys',           tier:'alloy',  color:'#7d8a99', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                      obsShape:'node'   },
  {id:'titanal',   name:'Titanal',           category:'Alloys',           tier:'alloy',  color:'#aeb8c4', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                      obsShape:'node'   },
  {id:'inconel',   name:'Inconel',           category:'Alloys',           tier:'alloy',  color:'#9fb89a', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                      obsShape:'node'   },
  {id:'carbide',   name:'Tungsten Carbide',  category:'Alloys',           tier:'alloy',  color:'#5b6b78', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                      obsShape:'crystal'},
  // ── ORGANIC MATTER (separate line — fuels automation) ───
  {id:'biomatter', name:'Raw Biomatter',     category:'Organic Matter',   tier:'raw',    color:'#39e65b', drillTime:3.0, yieldMin:3, yieldMax:7,  weight:16, refinesTo:{id:'biofuel',  ratio:8},  obsShape:'cyst'   },
  {id:'spore',     name:'Spore Cluster',     category:'Organic Matter',   tier:'raw',    color:'#a3e635', drillTime:2.4, yieldMin:4, yieldMax:8,  weight:10, refinesTo:{id:'biofuel',  ratio:12}, obsShape:'cyst'   },
  {id:'biofuel',   name:'Bio-Fuel Cell',     category:'Refined Organics', tier:'refined',color:'#4ade80', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                      obsShape:'cyst'   },
  // ── TIER 2: EXOTIC (weight:0 = locked, enable when ready) ─
  {id:'void_ore',  name:'Void Ore',          category:'Exotic Minerals',  tier:'exotic', color:'#c084fc', drillTime:6.0, yieldMin:1, yieldMax:3,  weight:5,  refinesTo:{id:'void_alloy',ratio:5},  obsShape:'crystal'},
  {id:'void_alloy',name:'Void Alloy',        category:'Exotic Refined',   tier:'exotic', color:'#a855f7', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                      obsShape:'crystal'},
  // ── BIOME EXPANSION (first pass) — each only spawns in its biome's pool (see biomes.js) ──
  // Biome 2 · The Rubblechoke
  {id:'cobalt',     name:'Cobalt Ore',       category:'Raw Ore',          tier:'raw',    color:'#4f7fc4', drillTime:4.0, yieldMin:4, yieldMax:7,  weight:12, refinesTo:{id:'r_cobalt',   ratio:7},  obsShape:'shard'  },
  {id:'manganese',  name:'Manganese Nodule', category:'Raw Ore',          tier:'raw',    color:'#9b8fb0', drillTime:4.6, yieldMin:3, yieldMax:6,  weight:9,  refinesTo:{id:'r_manganese',ratio:8},  obsShape:'node'   },
  {id:'graphite',   name:'Graphite Seam',    category:'Raw Ore',          tier:'raw',    color:'#55555e', drillTime:3.4, yieldMin:5, yieldMax:8,  weight:14, refinesTo:{id:'r_graphite', ratio:6},  obsShape:'heap'   },
  {id:'myco',       name:'Mycelial Mass',    category:'Organic Matter',   tier:'raw',    color:'#7ac46a', drillTime:2.8, yieldMin:4, yieldMax:8,  weight:11, refinesTo:{id:'biofuel',    ratio:10}, obsShape:'cyst'   },
  {id:'r_cobalt',   name:'Refined Cobalt',   category:'Refined Metals',   tier:'refined',color:'#6f9fe0', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                       obsShape:'shard'  },
  {id:'r_manganese',name:'Refined Manganese',category:'Refined Metals',   tier:'refined',color:'#b8accc', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                       obsShape:'node'   },
  {id:'r_graphite', name:'Refined Graphite', category:'Refined Metals',   tier:'refined',color:'#76767e', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                       obsShape:'heap'   },
  // Biome 3 · The Ashen Reaches
  {id:'chromite',   name:'Chromite',         category:'Raw Ore',          tier:'raw',    color:'#7fae9a', drillTime:4.8, yieldMin:3, yieldMax:5,  weight:8,  refinesTo:{id:'r_chromium', ratio:8},  obsShape:'shard'  },
  {id:'vanadium',   name:'Vanadinite',       category:'Raw Ore',          tier:'raw',    color:'#c4583f', drillTime:5.4, yieldMin:2, yieldMax:4,  weight:6,  refinesTo:{id:'r_vanadium', ratio:9},  obsShape:'crystal'},
  {id:'iridium',    name:'Iridium Fleck',    category:'Raw Ore',          tier:'raw',    color:'#d2d7dc', drillTime:6.2, yieldMin:1, yieldMax:3,  weight:3,  refinesTo:{id:'r_iridium',  ratio:12}, obsShape:'crystal'},
  {id:'r_chromium', name:'Refined Chromium', category:'Refined Metals',   tier:'refined',color:'#a8d8c4', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                       obsShape:'shard'  },
  {id:'r_vanadium', name:'Refined Vanadium', category:'Refined Metals',   tier:'refined',color:'#e08a72', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                       obsShape:'crystal'},
  {id:'r_iridium',  name:'Refined Iridium',  category:'Refined Metals',   tier:'refined',color:'#e8edf2', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                       obsShape:'crystal'},
  // Biome 4 · The Lightless Vault
  {id:'luminite',   name:'Luminite Crystal', category:'Exotic Minerals',  tier:'exotic', color:'#a9e0ff', drillTime:6.5, yieldMin:1, yieldMax:3,  weight:4,  refinesTo:{id:'r_luminite', ratio:6},  obsShape:'crystal'},
  {id:'r_luminite', name:'Refined Luminite', category:'Exotic Refined',   tier:'exotic', color:'#c9f0ff', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                       obsShape:'crystal'},
  // Biome 5 · The Hollow Core
  {id:'corestuff',  name:'Core Resonance',   category:'Exotic Minerals',  tier:'exotic', color:'#ff8a4c', drillTime:7.0, yieldMin:1, yieldMax:2,  weight:2,  refinesTo:null,                       obsShape:'crystal'},
  // New alloys (forged like the rest — recipes appended to ALLOYS below)
  {id:'kovar',          name:'Kovar',           category:'Alloys', tier:'alloy', color:'#5e7fa0', drillTime:0,yieldMin:0,yieldMax:0,weight:0,refinesTo:null,obsShape:'node'   },
  {id:'mangalloy',      name:'Hadfield Steel',  category:'Alloys', tier:'alloy', color:'#9aa0a8', drillTime:0,yieldMin:0,yieldMax:0,weight:0,refinesTo:null,obsShape:'node'   },
  {id:'stellite',       name:'Stellite',        category:'Alloys', tier:'alloy', color:'#8fb0a0', drillTime:0,yieldMin:0,yieldMax:0,weight:0,refinesTo:null,obsShape:'node'   },
  {id:'vanadium_steel', name:'Vanadium Steel',  category:'Alloys', tier:'alloy', color:'#b06a55', drillTime:0,yieldMin:0,yieldMax:0,weight:0,refinesTo:null,obsShape:'node'   },
  {id:'iridiplate',     name:'Iridium Plate',   category:'Alloys', tier:'alloy', color:'#cdd2d8', drillTime:0,yieldMin:0,yieldMax:0,weight:0,refinesTo:null,obsShape:'node'   },
  {id:'voidsteel',      name:'Void Steel',      category:'Alloys', tier:'alloy', color:'#8a6fae', drillTime:0,yieldMin:0,yieldMax:0,weight:0,refinesTo:null,obsShape:'crystal'},
  {id:'lumalloy',       name:'Lumalloy',        category:'Alloys', tier:'alloy', color:'#9fd0e0', drillTime:0,yieldMin:0,yieldMax:0,weight:0,refinesTo:null,obsShape:'node'   },
  // ── ENEMY DROPS (never spawned as nodes) ────────────────
  {id:'organite',  name:'Organite',          category:'Enemy Drops',      tier:'biomech',color:'#f97316', drillTime:0,   yieldMin:0, yieldMax:0,  weight:0,  refinesTo:null,                      obsShape:'node'   },
];


// ── ALLOY RECIPES ────────────────────────────────────────────
// Each recipe fuses TWO refined metals into a new, uniquely-named alloy.
// These alloys are consumed by the higher tiers of the upgrade tree.
//   id      Output resource id (must exist in RT above, or auto-added).
//   inputA  Refined metal id of first ingredient.
//   inputB  Refined metal id of second ingredient.
//   qtyA    How many of inputA are consumed.
//   qtyB    How many of inputB are consumed.
//   yields  How many of the output are produced.
// Ordered low → high tier (commoner metals first).
// ── ADD A RECIPE: copy any row and change the fields. ────────
let ALLOYS = [
  {id:'bronze',    inputA:'r_copper',   inputB:'r_iron',     qtyA:2, qtyB:2, yields:1},
  {id:'duralumin', inputA:'r_alum',     inputB:'r_copper',   qtyA:3, qtyB:3, yields:1},
  {id:'chromoly',  inputA:'r_steel',    inputB:'r_iron',     qtyA:3, qtyB:3, yields:1},
  {id:'titanal',   inputA:'r_titanium', inputB:'r_alum',     qtyA:3, qtyB:2, yields:1},
  {id:'inconel',   inputA:'r_nickel',   inputB:'r_titanium', qtyA:3, qtyB:2, yields:1},
  {id:'carbide',   inputA:'r_tungsten', inputB:'r_nickel',   qtyA:3, qtyB:2, yields:1},
  // Biome-expansion alloys (first pass)
  {id:'kovar',          inputA:'r_cobalt',    inputB:'r_nickel',    qtyA:3, qtyB:2, yields:1},
  {id:'mangalloy',      inputA:'r_manganese', inputB:'r_steel',     qtyA:3, qtyB:3, yields:1},
  {id:'stellite',       inputA:'r_chromium',  inputB:'r_cobalt',    qtyA:3, qtyB:2, yields:1},
  {id:'vanadium_steel', inputA:'r_vanadium',  inputB:'r_steel',     qtyA:3, qtyB:3, yields:1},
  {id:'iridiplate',     inputA:'r_iridium',   inputB:'r_titanium',  qtyA:2, qtyB:2, yields:1},
  {id:'voidsteel',      inputA:'void_alloy',  inputB:'r_iridium',   qtyA:2, qtyB:2, yields:1},
  {id:'lumalloy',       inputA:'r_luminite',  inputB:'r_chromium',  qtyA:2, qtyB:3, yields:1},
  {id:'cermet',         inputA:'r_graphite',  inputB:'r_steel',     qtyA:3, qtyB:3, yields:1},   // gives B2 graphite a permanent home (ECONOMY_PLAN §3)
];

// Auto-adds alloy output entries to RT if they don't exist yet (e.g. recipes
// added live in Dev Tools). Pre-defined alloys above are left untouched.
function syncAlloyOutputs() {
  ALLOYS.forEach(a => {
    if (!RT.find(r => r.id === a.id)) {
      const na = RT.find(r => r.id === a.inputA)?.name || a.inputA;
      const nb = RT.find(r => r.id === a.inputB)?.name || a.inputB;
      RT.push({
        id:a.id, name:`${na}-${nb} Alloy`, category:'Alloys',
        tier:'alloy', color:'#ffd700', drillTime:0,
        yieldMin:0, yieldMax:0, weight:0, refinesTo:null, obsShape:'node'
      });
    }
  });
}


// ── UPGRADE CONFIG ───────────────────────────────────────────
// Every upgrade in the Rover Hangar. Costs are BANDED: each upgrade
// climbs through ordered cost "bands". Within a band the quantity rises
// a little per level; crossing into the next band switches to a rarer /
// higher-tier material at a reset-low quantity. Past the last band, the
// final band keeps scaling forever (idle-friendly).
//   name      Display name on the upgrade card.
//   desc      One-line description.
//   statFn    Function(level) → current stat string shown on card.
//   nextFn    Function(level) → next level stat string shown on card.
//   locked    true = starts at level 0, first purchase is an UNLOCK.
//   costPlan  [ { levels:N, mats:[id,...] }, ... ]  ← bands now only choose the MATERIAL
//             (and, for the drill, the smash tier). The QUANTITY is GEOMETRIC across the
//             whole upgrade: qty(level) = round(costBase · costGrowth^(level-1)).
//   costBase  starting quantity at level 1.
//   costGrowth per-level cost multiplier (idle-game exponential; ~1.15–1.18). This is the
//             spine of the curve: costs compound so late upgrades cost K/M/B while stats
//             (and the multiplicative yield) compound to match. (Validated in tools/econ_sim.py —
//             linear costs were degenerate: the cheapest stat ran away and deep biomes stalled.)
//             Stats are kept in lock-step with the G.* getters in game.js.
let UPGCFG = {
  treads:  {
    name:'Locomotion System', desc:'Increases rover speed.', locked:false,
    statFn:l=>`${(4.0+(l-1)*0.40).toFixed(2)} m/s`, nextFn:l=>`${(4.0+l*0.40).toFixed(2)} m/s`,
    costBase:3, costGrowth:1.12,
    // ladder climbs the alloy tiers so every biome's ore feeds Locomotion (ECONOMY_PLAN §2)
    costPlan:[ {levels:10, mats:['r_iron','r_copper']}, {levels:15, mats:['bronze']}, {levels:15, mats:['mangalloy']}, {levels:15, mats:['stellite']}, {levels:99, mats:['voidsteel']} ],
  },
  laser:   {
    name:'Resource Extractor', desc:'Speeds up extraction. Once built from an alloy, smashes straight through any ore below that alloy’s tier.', locked:false,
    statFn:l=>`${(1+(l-1)*0.18).toFixed(2)}× drill`, nextFn:l=>`${(1+l*0.18).toFixed(2)}× drill`,
    // Band material sets the SMASH tier (see game.js canSmash): refined = none,
    // then climbs the alloy ladder so the drill smashes progressively rarer ore.
    costBase:3, costGrowth:1.135,
    costPlan:[
      {levels:10, mats:['r_copper','r_alum']}, // L1–10 refined → no smashing
      {levels:6,  mats:['bronze']},            // L11+ → smash iron, copper
      {levels:6,  mats:['duralumin']},         //      → + aluminium
      {levels:6,  mats:['chromoly']},          //      → + steel
      {levels:6,  mats:['titanal']},           //      → + titanium
      {levels:6,  mats:['inconel']},           //      → + nickel
      {levels:99, mats:['carbide']},           //      → + tungsten (all ore)
    ],
  },
  cargo:   {
    name:'Cargo Compactor', desc:'More resources gathered per node (compounding).', locked:false,
    // MULTIPLICATIVE yield (×1.07/level) — the compounding "numbers go up" stat. Lock-step with G.yieldMult.
    statFn:l=>`×${Math.pow(1.07,l-1).toFixed(2)} yield`, nextFn:l=>`×${Math.pow(1.07,l).toFixed(2)} yield`,
    costBase:3, costGrowth:1.115,
    // climbs into the late alloys so chromium/iridium/luminite (+graphite via cermet) stay relevant (ECONOMY_PLAN §2/§3)
    costPlan:[ {levels:10, mats:['r_iron','r_alum']}, {levels:15, mats:['chromoly']}, {levels:15, mats:['cermet']}, {levels:15, mats:['iridiplate']}, {levels:99, mats:['lumalloy']} ],
  },
  battery: {
    name:'Power Core', desc:'Extends expedition range (EP).', locked:false,
    statFn:l=>`${180+(l-1)*70} EP`, nextFn:l=>`${180+l*70} EP`,
    costBase:5, costGrowth:1.13,
    // climbs into cobalt/iridium/void alloys so B2–B4 ore feeds the Power Core (ECONOMY_PLAN §2)
    costPlan:[ {levels:10, mats:['r_iron','r_steel']}, {levels:15, mats:['chromoly']}, {levels:15, mats:['kovar']}, {levels:15, mats:['iridiplate']}, {levels:99, mats:['voidsteel']} ],
  },
  boost:   {
    name:'Boost Thrusters', desc:'SPACE: speed surge (magnitude & duration).', locked:false,
    statFn:l=>`+${Math.round((0.3+softLevel(l-1,15,0.4)*0.04)*100)}% · ${(4+softLevel(l-1,12,0.4)*0.5).toFixed(1)}s`,
    nextFn:l=>`+${Math.round((0.3+softLevel(l,15,0.4)*0.04)*100)}% · ${(4+softLevel(l,12,0.4)*0.5).toFixed(1)}s`,
    costBase:5, costGrowth:1.12,
    costPlan:[ {levels:10, mats:['r_copper','r_steel']}, {levels:99, mats:['titanal']} ],
  },
  boost_cd:{
    name:'Thruster Recharge', desc:'Reduces boost cooldown toward full uptime.', locked:false,
    statFn:l=>`${(Math.max(6,28-softLevel(l-1,15,0.4)*1.2)).toFixed(1)}s`, nextFn:l=>`${(Math.max(6,28-softLevel(l,15,0.4)*1.2)).toFixed(1)}s`,
    costBase:5, costGrowth:1.12,
    costPlan:[ {levels:10, mats:['r_alum','r_steel']}, {levels:99, mats:['titanal']} ],
  },
  weapon:  {
    name:'Turret Cannon', desc:'Damage per shot fired at hostiles.', locked:false,
    statFn:l=>`${8+(l-1)*4} dmg`, nextFn:l=>`${8+l*4} dmg`,
    costBase:4, costGrowth:1.13,
    costPlan:[ {levels:10, mats:['r_steel','r_titanium']}, {levels:99, mats:['inconel']} ],
  },
  w_speed: {
    name:'Weapon Cooldown', desc:'Reduces turret refire delay.', locked:true,
    statFn:l=>`${Math.max(0.22,0.5-l*0.015).toFixed(2)}s`, nextFn:l=>`${Math.max(0.22,0.5-(l+1)*0.015).toFixed(2)}s`,
    costBase:4, costGrowth:1.13,
    costPlan:[ {levels:10, mats:['r_titanium','r_nickel']}, {levels:99, mats:['carbide']} ],
  },
  drone:   {
    name:'Salvage Drones', desc:'Periodically ferries gathered cargo home mid-expedition.', locked:false,
    statFn:l=> l<1 ? 'Locked' : `delivers every ${Math.max(15,180-(l-1)*5)}s`, nextFn:l=>`delivers every ${Math.max(15,180-l*5)}s`,
    costBase:4, costGrowth:1.12,
    costPlan:[ {levels:10, mats:['r_alum','r_copper']}, {levels:99, mats:['duralumin']} ],
  },
};

// ── TUTORIAL GATE COSTS ──────────────────────────────────────
// The Refinery and Rover Hangar both start LOCKED on a fresh save and are
// unlocked, in sequence, during the onboarding loop (see game.js tutorial).
//   Refinery unlock — paid in RAW ore (auto-granted after the first expedition).
//   Hangar unlock   — paid in REFINED metal (the player makes it in the Refinery).
let REFINERY_UNLOCK = [{ id:'iron', qty:18 }, { id:'copper', qty:12 }];
let HANGAR_UNLOCK   = [{ id:'r_iron', qty:3 }, { id:'r_copper', qty:3 }];

// ── UPGRADE COST RESOLVER ────────────────────────────────────
// Returns the material cost for taking `key` to a given absolute `level`.
// → [ { id, qty }, ... ].  Used by both game logic and the UI.
// QUANTITY is GEOMETRIC in the absolute level (costBase·costGrowth^(level-1)); the cost
// PLAN bands only choose which MATERIAL (and, for the drill, the smash tier). Prestige
// "Compression" scales every cost down via prestigeCostMult() (game.js; 1 if no prestige).
function upgradeCost(key, level) {
  const cfg = UPGCFG[key];
  const mult = (typeof prestigeCostMult === 'function') ? prestigeCostMult() : 1;
  const qty = Math.max(1, Math.round(cfg.costBase * Math.pow(cfg.costGrowth, level - 1) * mult));
  // pick the band material for this absolute level
  let start = 1, mats = cfg.costPlan[cfg.costPlan.length - 1].mats;
  for (const band of cfg.costPlan) { if (level < start + band.levels) { mats = band.mats; break; } start += band.levels; }
  return mats.map(id => ({ id, qty }));
}


// ── GAME CONFIG ──────────────────────────────────────────────
// All numeric balancing values in one place.
// These are also editable live in the Dev Tools panel in-game.
let CFG = {
  powerDrainDriving:  0.30,  // EP drained per second while driving
  powerDrainDrilling: 0.05,  // EP drained per second while drilling
  obstacleMinGap:     28,    // minimum metres between obstacles
  obstacleMaxGap:     12,    // random metres added on top of minimum
  descendMinDist:     450,   // metres the rover must travel in the current biome (this run) before it may descend — you EXPLORE each biome, not skip it; faster treads cross it quicker; prestige 'Descent Vector' shrinks it
  enemySpawnMin:      50,    // minimum seconds between hostile spawn events
  enemySpawnRange:    20,    // random seconds added on top (≈ once a minute)
  enemyLifetime:      10,    // seconds a hostile lingers on screen before leaving
  enemyMaxActive:     4,     // max hostiles on screen at once
  enemyBaseHp:        15,    // minimum enemy HP
  enemyHpRange:       20,    // random HP added on top of base
  enemyWander:        1.8,   // steering rate — how briskly orbs chase their drift target
  organiteDrop:       2,     // minimum Organite dropped per kill
  organiteDropRange:  4,     // random Organite added on top
  recallTime:         4.0,   // seconds for rover to return on recall
  offlineEfficiency:  0.30,   // "rover ran at 30%" while you were away (capped trickle)
  offlineCapHours:    4,      // max real hours of offline accumulation credited at once
  accelTime:          1.4,    // seconds for the rover to ramp to full speed after a stop (less jarring start-stop)
  runOverhead:        8,      // est. dead-time per run (recall + relaunch + redeploy click). Used by the
                              // best-value metric so Power Core (longer runs → less overhead drag) is valued.
  // ── PRESTIGE payout (cores = coreK · sqrt(cycleScore / coreDiv) · affinity) ──
  // Tuned in tools/econ_sim.py: a first jettison at the Hollow Core (~8M refined-equiv produced on the
  // shorter H2 curve) pays ~20 cores. Lower coreDiv / raise coreK = more cores per cycle.
  coreDiv:            2e4,
  coreK:              1.0,
};

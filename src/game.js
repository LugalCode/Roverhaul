// ============================================================
//  game.js — ROVERHAUL v0.7
//  Game state, logic, tick loop, save/load.
//  Depends on: data.js (RT, ALLOYS, UPGCFG, CFG)
//  Depends on: engine.js (canvas, scrollWorld, spawnSparks)
// ============================================================

// ── STATE ────────────────────────────────────────────────────
const STATE = {
  inv: {},
  // treads/laser/battery start at 0 (the rover still functions, just weaker) and
  // are "unlocked" to Lvl 1 after the first run — see grantStarterMaterials().
  upgrades: { treads:0, laser:0, cargo:1, battery:0, weapon:1, w_speed:0, boost:1, boost_cd:1, drone:1 },   // drone L1 free: start refining mid-run from the first deploy (see ECONOMY_PLAN §4)
  automation: { autoMetal:false, autoBiomatter:false, refineLevel:0 },
  expedition: {
    active:false, status:'STANDBY', distance:0, power:0,
    cargo:{}, obstacle:null, nextObstacleDist:0, recallT:0,
    activeDrills:[], enemies:[], weaponCooldown:0, nextEnemyIn:0,
    boostActive:false, boostTimeLeft:0, boostCdLeft:0,
    launchT:0, launchDur:2.6, elapsed:0,
  },
  uptime:0, totalDistance:0,
  biome:1,               // current biome (1..N) — drives the spawn pool + scene (see biomes.js)
  autoMetalAcc:0, autoBiomatterAcc:0,
  milestones: { m100:false, m300:false, m600:false }, // legacy; archive gating now lives in STATE.archives
  archives: {},          // archiveId -> true once unlocked (see window.ARCHIVES / lore.js)
  maxBiome: 1,           // furthest biome reached (used by archive 'biome' unlocks)
  objectives: {},        // objectiveId/flag -> true (used by archive 'objective' unlocks)
  discovered: {},        // resourceId -> true once ever held (drip-feeds the Cargo Bay)
  unlocks: {},           // techtree nodeId -> true once researched (see techtree.js)
  flags: {},             // misc unlocked flags from tech-tree grants (e.g. autoCollect)
  mastery: {},           // resourceId -> cumulative units gathered (drives Mastery levels; persists through prestige)
  // ── PRESTIGE ("Jettison") ── the meta layer. Reset the cycle (inv/upgrades/research/biome)
  // for CORES, spent on a permanent tree of run-economy multipliers + Head Start + Compression.
  prestige: {
    cores: 0,            // unspent cores
    totalEarned: 0,      // lifetime cores earned (for display / future gates)
    count: 0,            // number of jettisons performed
    score: 0,            // refined-equivalent produced THIS cycle (drives the next core payout)
    cycleMaxBiome: 1,    // deepest biome reached this cycle (gates whether a jettison is worthwhile)
    tree: {},            // nodeId -> level purchased
  },
  lastSeen: 0,           // epoch ms of last activity — drives offline/away progress
  version: 10,           // save schema version (bump + migrate when the save shape changes)
  // First-run onboarding flags — each fires its hint/highlight once, ever, per save.
  tutorial: {
    deployedOnce:false,     // gates the first-expedition "boost charges from 0" intro
    usedBoost:false,        // stops the PRESS SPACE prompt + boost-gauge glow
    seenEnemy:false,        // stops the left-click-to-fire hint
    seenRock:false,         // stops the click-to-drill hint
    expeditionDone:false,   // first recall complete → base-loop funnel turns on
    refineryUnlocked:false, // Refinery starts locked; unlocked with auto-granted raw ore
    refinedOnce:false,      // processed at least one batch in the Refinery
    hangarUnlocked:false,   // Rover Hangar starts locked; unlocked with refined metal
    upgradedOnce:false,     // funnel complete → all highlights off
    forgeIntroDone:false,   // Alloy Forge intro (revealed + guided on first alloy-cost upgrade)
    // ── deeper-loop onboarding (one-shot teaching beats; see ui.js computeObjective + updateTutorial) ──
    seenDrone:false, seenDescend:false, seenOrganite:false, seenB4:false, seenB5:false, seenPrestige:false,
  },
};

function initInv() {
  RT.forEach(r => { if (STATE.inv[r.id] === undefined) STATE.inv[r.id] = 0; });
}

// ── DERIVED GETTERS ──────────────────────────────────────────
// Diminishing-returns level curve: linear up to `knee`, then keeps climbing at
// `frac` of the original rate forever (no hard plateau). Lets a stat's CAP be
// "raised & re-curved" so post-knee purchases still help — just less each step.
// Shared by game.js getters AND data.js card formulas (must stay in lock-step).
function softLevel(x, knee, frac) { return x <= knee ? x : knee + (x - knee) * frac; }

// NOTE: these stat formulas MUST stay in lock-step with the statFn/nextFn
// strings in data.js (UPGCFG). Change one, change the other.
const G = {
  // NOTE: treads/laser/battery use `?? 1` (not `|| 1`) so Lvl 0 is a real,
  // slightly-weaker state (the rover works pre-unlock) rather than == Lvl 1.
  baseSpeed:  () => (4.0 + ((STATE.upgrades.treads ?? 1) - 1) * 0.40) * prestigeMult('speed'),
  speed:      () => G.baseSpeed() * (STATE.expedition.boostActive ? 1 + G.boostMag() : 1),
  boostMag:   () => 0.3 + softLevel((STATE.upgrades.boost || 1) - 1, 15, 0.4) * 0.04,  // +30% → +90% at L16, then +1.6%/lvl
  boostDur:   () => 4   + softLevel((STATE.upgrades.boost || 1) - 1, 12, 0.4) * 0.5,   // 4s → 10s at L13, then +0.2s/lvl
  boostCd:    () => Math.max(6, 28 - softLevel((STATE.upgrades.boost_cd || 1) - 1, 15, 0.4) * 1.2), // 28s → 10s, then toward a 6s floor
  maxPower:   () => (180 + ((STATE.upgrades.battery ?? 1) - 1) * 70) * prestigeMult('ep'),
  drillMult:  () => (1.0 + ((STATE.upgrades.laser ?? 1) - 1) * 0.18) * prestigeMult('drill'),
  // MULTIPLICATIVE yield (×1.07/level, compounding) × global Mastery × prestige Yield Matrix.
  yieldMult:  () => Math.pow(1.07, (STATE.upgrades.cargo||1) - 1) * prestigeMult('yield') * researchYieldMult(),
  // Global bonus from total Mastery levels across all resources (+1% yield per level).
  masteryYieldMult: () => 1 + totalMasteryLevels() * 0.01,
  totalCargo: () => Object.values(STATE.expedition.cargo).reduce((a,b) => a+b, 0),
  biofuel:    () => STATE.inv.biofuel || 0,
  // Banded material cost for the NEXT level of an upgrade (current+1, or unlock at 1).
  upCostMats: k  => upgradeCost(k, (STATE.upgrades[k] || 0) + 1),
  upCanAfford:k  => G.upCostMats(k).every(m => (STATE.inv[m.id] || 0) >= m.qty),
  wDmg:       () => 8 + (Math.max(1, STATE.upgrades.weapon||1) - 1) * 4,
  wCooldown:  () => Math.max(0.22, 0.5 - (STATE.upgrades.w_speed||0) * 0.015),
  // Automation cadence — biomass-bought Refinery Speed shortens the auto cycle 5s→1s.
  // Automation cadence — each Refinery-Speed level multiplies the cycle by ~0.93,
  // so it shrinks 5s → toward a 0.25s floor over MANY levels (a constant upgrade sink),
  // instead of hitting 1s after only 4 cheap buys.
  autoInterval:  () => Math.max(researchRefineFloor(), 5 * Math.pow(0.93, STATE.automation.refineLevel || 0)),
  // Salvage-drone delivery interval (seconds); 0 = not owned.
  // Salvage-drone delivery interval (s). Starts slow (~3 min) and shaves 5s/level so
  // it stays a long-term upgrade sink rather than maxing out almost immediately.
  droneInterval: () => (STATE.upgrades.drone || 0) >= 1 ? Math.max(15, 180 - ((STATE.upgrades.drone) - 1) * 5) : 0,
};

// After the first run, guarantee the player can afford to UNLOCK (Lvl 1 of)
// Locomotion, Resource Extractor, and Power Core — even if they got unlucky on
// drops — so they always reach the core upgrade loop. Tops up (never removes).
function grantStarterMaterials() {
  const need = {};
  ['treads', 'laser', 'battery'].forEach(k => {
    upgradeCost(k, 1).forEach(m => { need[m.id] = (need[m.id] || 0) + m.qty; });
  });
  Object.entries(need).forEach(([id, q]) => { STATE.inv[id] = Math.max(STATE.inv[id] || 0, q); });
}

// Tops up the inventory so every entry in `list` is at least its qty (never removes).
function topUpInv(list) {
  list.forEach(({ id, qty }) => { STATE.inv[id] = Math.max(STATE.inv[id] || 0, qty); });
}

// First expedition home: guarantee enough RAW ore to unlock the Refinery (+ a little
// to spare), even if the run was unlucky on drops.
function grantRefineryUnlockMats() {
  topUpInv([{ id:'iron', qty:20 }, { id:'copper', qty:14 }]);
}

// After unlocking the Refinery: guarantee enough RAW ore to refine the batch of
// metal needed to then unlock the Hangar (3× Refined Iron + 3× Tempered Copper).
function grantProcessMats() {
  topUpInv([{ id:'iron', qty:16 }, { id:'copper', qty:20 }]);
}

// ── OBSTACLE / ENEMY SPAWNING ────────────────────────────────
// ── MASTERY ───────────────────────────────────────────────────
// Gathering a resource accrues cumulative units as its Mastery XP. Level = floor(sqrt(xp/20)),
// so each level needs progressively more (20·L² total) — never caps, always a next checkpoint.
// Per-resource mastery speeds up drilling THAT resource (+3%/level); total levels give a small
// global yield bonus (G.masteryYieldMult). Mastery is knowledge — it persists through prestige.
function masteryLevel(id) { return Math.floor(Math.sqrt((STATE.mastery[id] || 0) / 20)); }
function masteryXpInfo(id) {
  const xp = STATE.mastery[id] || 0, L = Math.floor(Math.sqrt(xp / 20));
  const cur = 20 * L * L, next = 20 * (L + 1) * (L + 1);
  return { level: L, xp, into: xp - cur, span: next - cur, next, prog: (xp - cur) / (next - cur) };
}
function totalMasteryLevels() { let s = 0; for (const id in (STATE.mastery || {})) s += masteryLevel(id); return s; }
function addMastery(id, amt) { if (!STATE.mastery) STATE.mastery = {}; STATE.mastery[id] = (STATE.mastery[id] || 0) + amt; }

// ── PRESTIGE TREE / CORES ─────────────────────────────────────
// Permanent meta upgrades bought with Cores (earned by jettisoning a cycle). Validated
// in tools/econ_sim.py: income multipliers alone don't accelerate re-descent (the geometric
// upgrade walls dominate) — Head Start (re-enter deep) + Compression (cheaper rebuilds) are
// what make each cycle meaningfully faster. Costs are geometric in cores.
//   effect   what the node does (see prestigeMult / the apply sites).
//   base/growth  core cost = round(base · growth^level). max = level cap (optional).
//   per      per-level magnitude (for the mult/▢ nodes).
//   tiers    discrete core costs (Head Start: lvl1→B2, lvl2→B3, lvl3→B4).
const PRESTIGE_TREE = [
  { id:'yield',    name:'Yield Matrix',     icon:'⬡', effect:'yield', per:0.20, base:2, growth:1.55,
    desc:'+20% global resource yield per level (compounds with everything).' },
  { id:'drill',    name:'Drill Resonance',  icon:'⛏', effect:'drill', per:0.18, base:2, growth:1.55,
    desc:'+18% extraction speed per level.' },
  { id:'speed',    name:'Locomotion Cache', icon:'⚙', effect:'speed', per:0.15, base:2, growth:1.5,
    desc:'+15% rover speed per level.' },
  { id:'ep',       name:'Core Capacity',    icon:'▮', effect:'ep',    per:0.20, base:2, growth:1.55,
    desc:'+20% expedition power (run length) per level.' },
  { id:'refine',   name:'Refinery Doctrine',icon:'🔩', effect:'refine', per:1, base:3, growth:1.7, max:12,
    desc:'+1 refine throughput per level (smelt more per cycle).' },
  { id:'compress', name:'Compression',      icon:'🗜', effect:'compress', per:0.07, base:4, growth:1.7, max:12,
    desc:'All Hangar upgrade costs ×0.93 per level — cheaper rebuilds.' },
  { id:'salvage',  name:'Salvage Instinct', icon:'📡', effect:'salvage', per:0.10, base:3, growth:1.8, max:7,
    desc:'+10% offline efficiency per level (toward full-rate idle).' },
  { id:'affinity', name:'Core Affinity',    icon:'✦', effect:'affinity', per:0.10, base:5, growth:1.6,
    desc:'+10% Cores earned from every jettison, per level.' },
  { id:'headstart',name:'Head Start',       icon:'🚀', effect:'headstart', tiers:[8,30,100],
    desc:'Re-enter the descent already breached deeper: L1→Rubblechoke, L2→Ashen Reaches, L3→Lightless Vault.' },
  { id:'descent',  name:'Descent Vector',    icon:'🧭', effect:'descent', per:0.08, base:4, growth:1.55, max:8,
    desc:'−8% distance you must travel in each biome before you can descend, per level (floor 40%).' },
];
function prestigeNode(id) { return PRESTIGE_TREE.find(n => n.id === id); }
function prestigeLevel(id) { return (STATE.prestige && STATE.prestige.tree && STATE.prestige.tree[id]) || 0; }
// Core cost for the NEXT level of a node (or Infinity if maxed).
function prestigeNodeCost(node) {
  const lvl = prestigeLevel(node.id);
  if (node.tiers) return lvl < node.tiers.length ? node.tiers[lvl] : Infinity;
  if (node.max && lvl >= node.max) return Infinity;
  return Math.round(node.base * Math.pow(node.growth, lvl));
}
// Aggregate multipliers / effects from the tree (1.0 / 0 baselines if unspent).
function prestigeMult(kind) {
  const n = PRESTIGE_TREE.find(x => x.effect === kind); if (!n) return 1;
  return 1 + prestigeLevel(n.id) * n.per;
}
function prestigeCostMult() { return Math.pow(1 - 0.07, prestigeLevel('compress')); }   // Compression: 0.93^lvl
function prestigeRefineBatch() { return prestigeLevel('refine'); }                       // extra units/refine-cycle
function prestigeStartBiome() { return 1 + prestigeLevel('headstart'); }                 // head-start re-entry depth
function prestigeOfflineEff() { return Math.min(1, (CFG.offlineEfficiency || 0.3) + prestigeLevel('salvage') * 0.10); }
function prestigeCoresMult() { return 1 + prestigeLevel('affinity') * 0.10; }
function prestigeDescendMult() { return Math.max(0.4, 1 - prestigeLevel('descent') * 0.08); }   // Descent Vector: shrinks the per-biome travel gate, floor 40%

// ── RESEARCH (tech-tree) live grants — owned nodes contribute numeric grants read at point-of-use.
//    yieldPct → +resource yield · coresPct → +cores · refineFloor → faster auto-refine cap. (See ECONOMY_PLAN §5.)
function researchGrantSum(key) { let v = 0; (window.TECHTREE || []).forEach(n => { if (STATE.unlocks && STATE.unlocks[n.id] && n.grants && typeof n.grants[key] === 'number') v += n.grants[key]; }); return v; }
function researchYieldMult() { return 1 + researchGrantSum('yieldPct'); }       // Organite Infusion etc.
function researchCoresMult() { return 1 + researchGrantSum('coresPct'); }       // Core Tap
function researchRefineFloor() { let f = 0.25; (window.TECHTREE || []).forEach(n => { if (STATE.unlocks && STATE.unlocks[n.id] && n.grants && typeof n.grants.refineFloor === 'number') f = Math.min(f, n.grants.refineFloor); }); return f; }   // Overdrive Refinery

// Cores a jettison would pay out right now, from this cycle's score (√-damped, classic
// prestige curve). CFG.coreDiv / coreK are the tuning knobs.
function coresForScore(score) {
  const div = CFG.coreDiv || 2e5, k = CFG.coreK || 1;
  return Math.floor(k * Math.sqrt(Math.max(0, score) / div) * prestigeCoresMult() * researchCoresMult());
}
function coresAvailable() { return coresForScore((STATE.prestige && STATE.prestige.score) || 0); }
// May the player jettison? Must have reached the Hollow Core THIS cycle and stand to gain ≥1 core.
function canPrestige() { return (STATE.prestige.cycleMaxBiome || 1) >= 5 && coresAvailable() >= 1; }

// Buy one level of a prestige node (spends cores).
function buyPrestigeNode(id) {
  const n = prestigeNode(id); if (!n) return false;
  const cost = prestigeNodeCost(n);
  if (!isFinite(cost) || STATE.prestige.cores < cost) { if (window.SFX) SFX.denied(); return false; }
  STATE.prestige.cores -= cost;
  STATE.prestige.tree[id] = prestigeLevel(id) + 1;
  if (id === 'headstart') reapplyHeadStart();   // pre-grant breach research up to the new depth
  if (window.SFX) SFX.upgrade();
  addLog(`PRESTIGE: ${n.name} → Lvl ${prestigeLevel(id)}.`, 'xl');
  saveGame();
  return true;
}
// Head Start pre-researches the breach nodes up to the head-start depth so descents work immediately.
function reapplyHeadStart() {
  const depth = prestigeStartBiome();   // 1 = none, 2 = B2 breached, …
  if (!STATE.unlocks) STATE.unlocks = {};
  const breachId = { 2:'breach_b2', 3:'breach_b3', 4:'breach_b4', 5:'breach_b5' };
  for (let b = 2; b <= depth; b++) if (breachId[b]) STATE.unlocks[breachId[b]] = true;
  if (typeof reapplyTechGrants === 'function') reapplyTechGrants();
}

// Perform a jettison: pay out cores, then RESET the cycle (keep mastery/archives/prestige/tutorial).
function doPrestige() {
  if (!canPrestige()) { if (window.SFX) SFX.denied(); return false; }
  const gained = coresAvailable();
  STATE.prestige.cores += gained;
  STATE.prestige.totalEarned = (STATE.prestige.totalEarned || 0) + gained;
  STATE.prestige.count = (STATE.prestige.count || 0) + 1;
  STATE.prestige.score = 0;
  STATE.prestige.cycleMaxBiome = 1;
  // RESET the cycle
  STATE.inv = {}; initInv();
  STATE.upgrades = { treads:1, laser:1, cargo:1, battery:1, weapon:1, w_speed:0, boost:1, boost_cd:1, drone:1 };   // drone L1 free (ECONOMY_PLAN §4)
  STATE.automation = { autoMetal:false, autoBiomatter:false, refineLevel:0 };
  STATE.unlocks = {}; STATE.flags = {};
  STATE.biome = 1; STATE.maxBiome = Math.max(STATE.maxBiome || 1, prestigeStartBiome());   // furthest-EVER never decreases
  STATE.expedition.active = false; STATE.expedition.status = 'STANDBY';
  STATE.expedition.cargo = {}; STATE.expedition.obstacle = null; STATE.expedition.enemies = [];
  reapplyHeadStart();   // re-grant breach research up to the head-start depth
  if (window.SFX) SFX.milestone();
  addLog(`JETTISON COMPLETE: +${gained} Cores. The cycle resets — descend again, faster.`, 'xl');
  saveGame();
  return true;
}

// Resource ids spawnable in the current biome (see biomes.js). Falls back to "all".
function biomePool() {
  const b = (typeof currentBiome === 'function') ? currentBiome() : null;
  return (b && Array.isArray(b.resourceIds)) ? b.resourceIds : null;
}
// Within a biome, MEMBERSHIP is authoritative: anything listed spawns. Its RT
// `weight` is just relative frequency; if 0 (e.g. exotics disabled globally, or an
// old save persisted weight 0) we fall back to a default so it still appears.
function nodeWeight(r, ids) { return r.weight > 0 ? r.weight : (ids && ids.includes(r.id) ? 8 : 0); }
function pickNode() {
  const ids = biomePool();
  let pool = RT.filter(r => r.drillTime > 0 && (ids ? ids.includes(r.id) : r.weight > 0));
  if (!pool.length) pool = RT.filter(r => r.weight > 0 && r.drillTime > 0);   // safety fallback
  if (!pool.length) return RT[0];
  let tot = pool.reduce((a,r) => a + nodeWeight(r, ids), 0), rng = Math.random() * tot;
  for (const r of pool) { rng -= nodeWeight(r, ids); if (rng <= 0) return r; }
  return pool[pool.length - 1];
}

function spawnObstacle() {
  const def = pickNode();
  // Mastery makes a familiar resource faster to drill (+3% speed per mastery level of it).
  const bt = def.drillTime / G.drillMult() / (1 + masteryLevel(def.id) * 0.03);
  STATE.expedition.obstacle = { def, maxTime:bt, timeLeft:bt };
}

// Furthest biome actually unlocked by RESEARCH (owned tech nodes), independent of dev-tools travel
// (which bumps STATE.maxBiome). The breach to biome N+1 must be researched to descend there.
function researchedBiomeCap() {
  let cap = 1;
  (window.TECHTREE || []).forEach(n => {
    if (STATE.unlocks && STATE.unlocks[n.id] && n.grants && n.grants.unlockBiome)
      cap = Math.max(cap, n.grants.unlockBiome);
  });
  return cap;
}
// Distance still required in THIS biome this run before the rover may descend.
function descendDistLeft() {
  const e = STATE.expedition;
  return Math.max(0, (CFG.descendMinDist || 0) * prestigeDescendMult() - (e.distance - (e.biomeStartDist || 0)));
}
// Can the rover descend deeper right now? (in the field, the breach is RESEARCHED, and we've pushed
// at least CFG.descendMinDist into the current biome this run — exploration has to extend each time).
function canDescend() {
  const e = STATE.expedition;
  if (!e.active || (e.status !== 'DRIVING' && e.status !== 'HARVESTING')) return false;
  if (researchedBiomeCap() <= (STATE.biome || 1)) return false;   // next biome not researched
  if (descendDistLeft() > 0) return false;                        // haven't travelled far enough yet
  return true;
}
// DESCEND mid-expedition into the next (already-researched) biome — the "wall → upgrade →
// research → go deeper" payoff. Redeploying from the ship still starts at biome 1.
function descendBiome() {
  if (!canDescend()) { if (window.SFX) SFX.denied(); return; }
  const e = STATE.expedition;
  e.descFrom = STATE.biome || 1;
  e.descTo   = (STATE.biome || 1) + 1;
  e.status = 'DESCENDING';            // plays a drive-into-the-entrance transition (see tick + engine)
  e.descT = 0; e.descDur = 2.4; e.descSwitched = false;
  e.boostActive = false; e.boostTimeLeft = 0;
  if (window.SFX) SFX.deploy();
  addLog(`DESCENT: Breaching toward ${(window.BIOMES.find(b => b.no === e.descTo) || {}).name || 'the depths'}…`, 'el');
}

// Travel to / set the active biome. Used by the Dev Tools biome buttons (unrestricted).
// Re-rolls the current node so the new pool takes effect immediately.
function setBiome(n) {
  const list = (typeof window !== 'undefined' && window.BIOMES) ? window.BIOMES : [];
  const b = list.find(x => x.no === n);
  if (!b) return;
  STATE.biome = n;
  if (n > (STATE.maxBiome || 1)) STATE.maxBiome = n;
  // refresh the live node so the new biome's pool/visuals apply without a redeploy
  if (STATE.expedition.active && STATE.expedition.obstacle) spawnObstacle();
  addLog(`BIOME: Now in ${b.name}.`, 'xl');
  saveGame();
}

// Hostiles are luminescent orbs that wander the play area for a while.
// They live in SCREEN space (x/y), not world space — they don't scroll past.
function spawnEnemy() {
  const fromLeft = Math.random() < 0.5;
  const bScale = 1 + ((STATE.biome || 1) - 1) * 0.6;                            // HP scales per biome (B1×1 → B5×3.4)
  const hp = Math.round((CFG.enemyBaseHp + Math.floor(Math.random() * CFG.enemyHpRange)) * bScale);   // roll once so the HP bar starts full
  STATE.expedition.enemies.push({
    x:  fromLeft ? -40 : canvas.width + 40,
    y:  40 + Math.random() * (canvas.height - 80),    // roam the FULL field height (maps to iso lateral spread)
    tx: 100 + Math.random() * (canvas.width - 200),   // current drift target
    ty: 40  + Math.random() * (canvas.height - 80),
    hp, maxHp: hp, hitTimer: 0,                        // hitTimer > 0 → show the HP bar (set on each hit)
    speed: 0.8 + Math.random() * 0.8,                 // per-orb steering multiplier
    retargetIn: 0.5 + Math.random() * 1.5,
    life: CFG.enemyLifetime,
    bob:   Math.random() * Math.PI * 2,
    pulse: Math.random() * Math.PI * 2,
    hue:   28 + Math.floor(Math.random() * 20),       // glowing AMBER (warm hostile, reads against the green room + B4 static)
    dead: false, deathTimer: 0, escaped: false,
  });
  addLog("ALERT: Hostile lifeform detected.", "dl");
}

// Spawns on a random timer and drifts each orb toward a roaming target.
function updateEnemies(dt) {
  const exp = STATE.expedition;
  exp.nextEnemyIn -= dt;
  const livingCount = exp.enemies.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
  if (exp.nextEnemyIn <= 0) {
    if (livingCount < CFG.enemyMaxActive) spawnEnemy();
    exp.nextEnemyIn = CFG.enemySpawnMin + Math.random() * CFG.enemySpawnRange;
  }
  for (const en of exp.enemies) {
    if (en.dead) { en.deathTimer -= dt; continue; }
    if (en.hitTimer > 0) en.hitTimer -= dt;   // HP bar lingers a moment after the last hit, then fades
    en.life -= dt;
    if (en.life <= 0) { en.dead = true; en.deathTimer = 0.5; en.escaped = true; continue; }
    en.retargetIn -= dt;
    if (en.retargetIn <= 0) {
      en.tx = 60 + Math.random() * (canvas.width  - 120);
      en.ty = 40 + Math.random() * (canvas.height - 80);
      en.retargetIn = 1.2 + Math.random() * 2.2;
    }
    const k = Math.min(1, dt * CFG.enemyWander * en.speed);
    en.x += (en.tx - en.x) * k;
    en.y += (en.ty - en.y) * k + Math.sin(aT * 2 + en.bob) * 0.5;
  }
  exp.enemies = exp.enemies.filter(en => !(en.dead && en.deathTimer <= 0));
}

// ── ROVER COMMANDS ────────────────────────────────────────────
function deployRover() {
  if (STATE.expedition.active) return;
  // First-run gate: after the first dock, require the player to complete the core
  // loop (refine → unlock hangar → apply 1 upgrade) before redeploying. One-time.
  if (STATE.tutorial.expeditionDone && !STATE.tutorial.upgradedOnce) {
    SFX.denied();
    addLog("SETUP: Bring all three core systems online — Locomotion, Resource Extractor AND Power Core — in the Rover Hangar before redeploying.", "dl");
    return;
  }
  // Restarting a run always begins in biome 1 (the crash site). Deeper biomes are
  // reached by progressing within a run (or jumped to via Dev Tools for testing).
  STATE.biome = 1;
  const exp = STATE.expedition;
  exp.active = true;
  exp.status = 'LAUNCHING';           // play the bay-launch animation before driving
  exp.launchT = 0;
  exp.distance = 0;
  exp.biomeStartDist = 0;             // distance at which the current biome began (for the descend gate)
  exp.elapsed = 0;                    // reset expedition timer
  exp.power = G.maxPower();
  exp.cargo = {};
  exp.shipped = {};                   // resources drones have ferried home this run (kept in the run tally, not wiped)
  exp.enemies = [];
  exp.weaponCooldown = 0;
  exp.boostActive = false; exp.boostTimeLeft = 0;
  exp.accel = 0; exp.curSpeed = 0;    // start from a standstill and ramp up
  exp.droneTimer = 0;                 // salvage-drone delivery clock
  // First expedition ever: start the thruster gauge empty so the player watches
  // it charge, then gets prompted to press SPACE. Afterwards it's ready on deploy.
  exp.boostCdLeft = STATE.tutorial.deployedOnce ? 0 : G.boostCd();
  const firstEver = !STATE.tutorial.deployedOnce;
  if (!STATE.tutorial.deployedOnce) { STATE.tutorial.deployedOnce = true; saveGame(); }
  exp.nextObstacleDist = CFG.obstacleMinGap + Math.random() * 10;
  scrollWorld = 0;
  spawnObstacle();
  exp.nextEnemyIn = 2 + Math.random() * 3;
  SFX.deploy();
  if (firstEver) addLog("ORDERS: A supply crate was thrown clear in the crash. Range out and recover what you can.", "el");
  addLog("LAUNCH: Bay doors opening. Rover rolling out.", "el");
}

// SPACE — brief speed surge. Only while driving, when charged and not already boosting.
function activateBoost() {
  const exp = STATE.expedition;
  if (!exp.active || exp.status !== 'DRIVING') return;
  if (exp.boostActive || exp.boostCdLeft > 0) return;
  exp.boostActive = true;
  exp.boostTimeLeft = G.boostDur();
  exp.boostCdLeft   = G.boostCd();   // counts down concurrently with the surge
  if (!STATE.tutorial.usedBoost) { STATE.tutorial.usedBoost = true; saveGame(); }
  SFX.boost();
  addLog(`THRUSTERS: +${Math.round(G.boostMag()*100)}% surge engaged.`, "el");
}

function recallRover() {
  const exp = STATE.expedition;
  if (!exp.active || exp.status === 'RECALLING' || exp.status === 'LAUNCHING' || exp.status === 'DESCENDING') return;
  exp.status = 'RECALLING';
  exp.recallT = 0;
  exp.boostActive = false; exp.boostTimeLeft = 0;
  SFX.recall();
  addLog("RECALL: Retrieval winch engaged — hauling rover home.", "dl");
}

// ── DRILL SMASH-THROUGH (progression-tiered, not a time threshold) ────────────
// The drill auto-smashes any ore node BELOW the alloy tier its CURRENT level is
// built from. A material's tier = the rarest ore in its lineage; e.g. the drill
// built from Bronze (Copper+Iron) smashes iron & copper, and the trend climbs
// the alloy ladder as the drill is upgraded.
function metalOreRanks() {
  // Rank spawnable METAL ores by rarity (common→rare = 0..N). Organics excluded.
  const ores = RT.filter(r => r.weight > 0 && r.drillTime > 0 && r.refinesTo && r.refinesTo.id !== 'biofuel')
                 .slice().sort((a, b) => b.weight - a.weight);
  const m = {}; ores.forEach((r, i) => { m[r.id] = i; });
  return m;
}
function materialOreRank(id, ranks) {
  const ore = RT.find(r => r.refinesTo && r.refinesTo.id === id);   // refined metal → its ore
  if (ore) return ranks[ore.id] ?? -1;
  const rec = ALLOYS.find(a => a.id === id);                        // alloy → rarest component
  if (rec) return Math.max(materialOreRank(rec.inputA, ranks), materialOreRank(rec.inputB, ranks));
  return -1;
}
function drillSmashRank(ranks) {
  const lvl = STATE.upgrades.laser || 0;
  if (lvl < 1) return -1;                                           // drill not built yet
  let best = -1;
  upgradeCost('laser', lvl).forEach(m => {
    if (ALLOYS.some(a => a.id === m.id)) best = Math.max(best, materialOreRank(m.id, ranks)); // only alloys grant smashing
  });
  return best;
}
function canSmash(def) {
  if (!def) return false;
  const ranks = metalOreRanks();
  const nodeRank = ranks[def.id];
  if (nodeRank === undefined) return false;                         // organics/exotics never auto-smashed
  return nodeRank <= drillSmashRank(ranks);
}

function clearObstacle(smashed = false) {
  const obs = STATE.expedition.obstacle; if (!obs) return;
  const def = obs.def;
  const base = def.yieldMin + Math.floor(Math.random() * (def.yieldMax - def.yieldMin + 1));
  const qty = Math.max(1, Math.round(base * G.yieldMult() * G.masteryYieldMult()));   // Cargo Compactor + global Mastery
  STATE.expedition.cargo[def.id] = (STATE.expedition.cargo[def.id] || 0) + qty;
  // prestige cycle score = refined-equivalent produced (drives the next Cores payout)
  if (STATE.prestige) STATE.prestige.score += qty / ((def.refinesTo && def.refinesTo.ratio) || 1);
  const beforeLvl = masteryLevel(def.id);
  addMastery(def.id, qty);                                     // gathering builds this resource's Mastery
  if (masteryLevel(def.id) > beforeLvl) addLog(`MASTERY: ${def.name} reached Lvl ${masteryLevel(def.id)}.`, "xl");
  if (typeof spawnShatter === 'function') spawnShatter(def.color, smashed);   // debris pop (vector renderer)
  if (window.ISO && ISO.on && ISO.shatter) ISO.shatter(def.color, smashed);   // debris pop (iso renderer)
  SFX.harvest();
  addLog(`${smashed ? 'SMASH' : 'HARVEST'}: ${def.name} ${smashed ? 'pulverised' : 'cleared'}. +${qty}.`, "hl");
  STATE.expedition.obstacle = null;
  STATE.expedition.status = 'DRIVING';
  if (!smashed) STATE.expedition.accel = 0.18;   // full stop → re-accelerate; smashing keeps momentum
  STATE.expedition.nextObstacleDist = STATE.expedition.distance + (CFG.obstacleMinGap + Math.random() * CFG.obstacleMaxGap);
  spawnObstacle();
}

// ── CLICK-TO-FIRE ─────────────────────────────────────────────
// Clicking anywhere in the wasteland fires the turret at the hostile
// nearest the click. Returns true if the click is "claimed" by combat
// (a hostile exists), so the caller knows not to also boost the drill.
function tryShootEnemy(clickX, clickY) {
  const exp = STATE.expedition;
  const hasLiving = exp.enemies.some(e => !e.dead);
  if (!hasLiving) return false;            // no target → let drill-boost handle it
  if (exp.weaponCooldown > 0) return true; // claimed, but turret still cooling down

  let best = null, bestDist = Infinity;
  exp.enemies.forEach(en => {
    if (en.dead) return;
    const dx = clickX - en.x, dy = clickY - en.y;
    const d = dx*dx + dy*dy;
    if (d < bestDist) { bestDist = d; best = en; }
  });
  if (!best) return true;
  best.hp -= G.wDmg();
  best.hitTimer = 2.2;   // reveal the HP bar (and refresh its linger) on every hit
  exp.weaponCooldown = G.wCooldown();
  if (!STATE.tutorial.seenEnemy) { STATE.tutorial.seenEnemy = true; saveGame(); }
  fireBeam(best.x, best.y);
  if (window.ISO && ISO.on && ISO.fireBeam) ISO.fireBeam(best);   // iso turret actually fires the laser at the clicked hostile
  spawnSparks(best.x, best.y, '#aef9ff', 9);
  SFX.enemyHit();
  if (best.hp <= 0) {
    best.dead = true; best.deathTimer = 0.5;
    const bScale = 1 + ((STATE.biome || 1) - 1) * 0.7;                          // reward scales per biome (deeper hostiles pay more)
    const drop = Math.round((CFG.organiteDrop + Math.floor(Math.random() * CFG.organiteDropRange)) * bScale);
    exp.cargo['organite'] = (exp.cargo['organite'] || 0) + drop;
    SFX.enemyDown();
    addLog(`HOSTILE DOWN: +${drop} Organite harvested.`, "xl");
    if (!STATE.tutorial.seenOrganite) { STATE.tutorial.seenOrganite = true; addLog("ORGANITE: spend it in RESEARCH (Organite Infusion) for a permanent yield boost — optional, rewards active play.", "el"); saveGame(); }
  }
  return true;
}

// ── TICK (called every frame) ─────────────────────────────────
function tick(dt) {
  STATE.uptime += dt;
  if (STATE.expedition.active) STATE.expedition.elapsed += dt;

  // Automation — paused until the Refinery is brought online (so the tutorial's
  // granted raw ore isn't auto-smelted before it can be spent on the unlock).
  const autoIv = G.autoInterval();   // biomass-upgraded cadence (5s → 1s)
  if (STATE.tutorial.refineryUnlocked && STATE.automation.autoMetal) {
    STATE.autoMetalAcc += dt;
    if (STATE.autoMetalAcc >= autoIv) {
      STATE.autoMetalAcc -= autoIv;
      const batch = 1 + prestigeRefineBatch();   // Refinery Doctrine smelts more per cycle (keeps up at volume)
      RT.filter(r => r.refinesTo && r.weight > 0).forEach(r => {
        const h = STATE.inv[r.id] || 0, rat = r.refinesTo.ratio, n = Math.min(batch, Math.floor(h / rat));
        if (n > 0) { STATE.inv[r.id] -= n * rat; STATE.inv[r.refinesTo.id] = (STATE.inv[r.refinesTo.id] || 0) + n; }
      });
    }
  }
  if (STATE.tutorial.refineryUnlocked && STATE.automation.autoBiomatter) {
    STATE.autoBiomatterAcc += dt;
    if (STATE.autoBiomatterAcc >= autoIv) {
      STATE.autoBiomatterAcc -= autoIv;
      const batch = 1 + prestigeRefineBatch();
      RT.filter(r => r.category === 'Organic Matter' && r.refinesTo).forEach(r => {
        const h = STATE.inv[r.id] || 0, rat = r.refinesTo.ratio, n = Math.min(batch, Math.floor(h / rat));
        if (n > 0) { STATE.inv[r.id] -= n * rat; STATE.inv[r.refinesTo.id] = (STATE.inv[r.refinesTo.id] || 0) + n; }
      });
    }
  }

  // Objective + archive unlocks — evaluated every frame so refining/upgrading while
  // docked can complete goals too (achievements first, since archives can gate on them).
  checkAchievements();
  checkArchiveUnlocks();

  if (!STATE.expedition.active) return;
  const exp = STATE.expedition;

  // Boost timers — surge duration + concurrent recharge cooldown
  if (exp.boostActive) {
    exp.boostTimeLeft -= dt;
    if (exp.boostTimeLeft <= 0) { exp.boostActive = false; exp.boostTimeLeft = 0; }
  }
  if (exp.boostCdLeft > 0) exp.boostCdLeft -= dt;

  // Salvage drones — periodically ferry the current run's cargo back to the ship
  // mid-expedition (eases the "resources only apply on return" friction).
  const droneIv = G.droneInterval();
  if (droneIv > 0 && (exp.status === 'DRIVING' || exp.status === 'HARVESTING')) {
    exp.droneTimer = (exp.droneTimer || 0) + dt;
    if (exp.droneTimer >= droneIv) {
      exp.droneTimer = 0;
      // Organite (combat drops) only ferried once the Auto-Collect node is researched.
      const autoCollect = STATE.flags && STATE.flags.autoCollect;
      const entries = Object.entries(exp.cargo).filter(([id, q]) => q > 0 && (id !== 'organite' || autoCollect));
      if (entries.length) {
        let total = 0;
        if (!exp.shipped) exp.shipped = {};
        entries.forEach(([id, q]) => { STATE.inv[id] = (STATE.inv[id] || 0) + q; total += q; exp.shipped[id] = (exp.shipped[id] || 0) + q; exp.cargo[id] = 0; });
        addLog(`DRONE: ${total} units ferried home.`, "sl");
        saveGame();
      }
    }
  }

  // Combat layer — turret cooldown + roaming hostiles (only once out in the field)
  if (exp.weaponCooldown > 0) exp.weaponCooldown -= dt;
  if (exp.status === 'DRIVING' || exp.status === 'HARVESTING') updateEnemies(dt);

  if (exp.status === 'LAUNCHING') {
    exp.launchT += dt;
    if (exp.launchT >= exp.launchDur) {
      exp.status = 'DRIVING';
      addLog("DEPLOY: Rover clear of bay — entering the wasteland.", "el");
    }

  } else if (exp.status === 'DRIVING') {
    // Acceleration ramp — ease up to full speed after a stop/launch (less jarring).
    exp.accel = Math.min(1, (exp.accel || 0) + dt / CFG.accelTime);
    exp.curSpeed = G.speed() * exp.accel;
    exp.distance += exp.curSpeed * dt;
    STATE.totalDistance += exp.curSpeed * dt;
    exp.power -= CFG.powerDrainDriving * dt;
    if (exp.power <= 0) { exp.power = 0; addLog("ALARM: Power depleted. Recall.", "dl"); recallRover(); return; }

    if (exp.distance >= exp.nextObstacleDist - 1.2) {
      // Smash straight through any ore below the drill's alloy tier; tougher ore
      // (at/above the drill's current build-alloy) still forces a HARVESTING stop.
      if (exp.obstacle && canSmash(exp.obstacle.def)) {
        clearObstacle(true);
      } else {
        exp.status = 'HARVESTING';
        exp.curSpeed = 0;
        addLog(`SCAN: ${exp.obstacle?.def.name || 'Obstacle'} detected.`, "hl");
      }
    }

  } else if (exp.status === 'HARVESTING') {
    if (exp.obstacle) {
      exp.power -= CFG.powerDrainDrilling * dt;
      if (exp.power <= 0) { exp.power = 0; recallRover(); return; }
      exp.obstacle.timeLeft -= dt;
      if (exp.obstacle.timeLeft <= 0) clearObstacle();
    }

  } else if (exp.status === 'DESCENDING') {
    // Drive-into-the-entrance transition. At the midpoint (under full black) the biome
    // actually switches; then the rover drives back in from the left into the new area.
    exp.descT += dt;
    const p = exp.descT / exp.descDur;
    if (!exp.descSwitched && p >= 0.5) {
      exp.descSwitched = true;
      STATE.biome = exp.descTo;
      if (exp.descTo > (STATE.maxBiome || 1)) STATE.maxBiome = exp.descTo;
      if (STATE.prestige && exp.descTo > (STATE.prestige.cycleMaxBiome || 1)) STATE.prestige.cycleMaxBiome = exp.descTo;
      exp.biomeStartDist = exp.distance;       // reset the per-biome distance gate for the new biome
      exp.obstacle = null;
      exp.nextObstacleDist = exp.distance + (CFG.obstacleMinGap + Math.random() * 10);
      spawnObstacle();
      scrollWorld = 0;                       // reset world scroll for the new biome (engine global)
      addLog(`DESCENT: Now in ${currentBiome().name}.`, 'xl');
    }
    if (exp.descT >= exp.descDur) {
      exp.status = 'DRIVING';
      exp.accel = 0.18;                      // ease back up to speed
      saveGame();
    }

  } else if (exp.status === 'RECALLING') {
    // Reverse of the launch sequence: winched off-screen left, fade, reverse into the bay.
    exp.recallT += dt;
    if (exp.recallT >= CFG.recallTime) {
      Object.entries(exp.cargo).forEach(([id,q]) => { STATE.inv[id] = (STATE.inv[id] || 0) + q; });
      const sum = Object.entries(exp.cargo).filter(([,q]) => q > 0)
        .map(([id,q]) => { const r = RT.find(x => x.id === id); return `${r?.name||id}×${q}`; }).join(', ');
      exp.active = false; exp.status = 'STANDBY'; exp.distance = 0;
      exp.cargo = {}; exp.obstacle = null; exp.enemies = [];
      if (!STATE.tutorial.expeditionDone) {   // first return home → kick off the base-loop funnel
        STATE.tutorial.expeditionDone = true;
        grantRefineryUnlockMats();
        addLog("SALVAGE: Recovered the supply crate thrown clear in the crash — raw ore enough to bring the Refinery online.", "el");
        addLog("TUTORIAL: Open SHIP UTILITIES and UNLOCK the REFINERY to start processing the recovered ore.", "el");
      }
      addLog(`DOCK: ${sum || 'No cargo.'}`, "xl");
      saveGame();
    }
  }
}

// ── ARCHIVES / LORE ───────────────────────────────────────────
// Is an archive entry's unlock condition currently satisfied?
// Unknown / not-yet-built systems (biome>1, artefact, objective) stay locked safely.
function archiveUnlocked(a) {
  const u = (a && a.unlock) || { type: 'always' };
  switch (u.type) {
    case 'always':    return true;
    case 'distance':  return STATE.totalDistance >= (u.value || 0);
    case 'biome':     return (STATE.maxBiome || 1) >= (u.value || 1);
    case 'artefact':  return (STATE.inv[u.value] || 0) > 0;
    case 'objective': return !!(STATE.objectives && STATE.objectives[u.value]);
    default:          return false;
  }
}

// Fire newly-satisfied unlocks once; persist them and reveal in the panel.
function checkArchiveUnlocks() {
  if (typeof ARCHIVES === 'undefined') return;
  if (!STATE.archives) STATE.archives = {};
  for (const a of ARCHIVES) {
    const always = a.unlock && a.unlock.type === 'always';
    if (always || STATE.archives[a.id]) continue;
    if (archiveUnlocked(a)) {
      STATE.archives[a.id] = true;
      if (typeof revealArchive === 'function') revealArchive(a.id);
      SFX.milestone();
      addLog('ARCHIVE UNLOCKED: ' + (a.label || a.title || a.id), 'xl');
      saveGame();
    }
  }
}

// ── OBJECTIVES / ACHIEVEMENTS ─────────────────────────────────
// Data-driven from window.ACHIEVEMENTS (see achievements.js / achievement_editor.html).
// Completion is stored in STATE.objectives[id] — which doubles as the flag an Archive
// entry can gate on via { unlock:{ type:'objective', value:'<id>' } }.
function achievementProgress(a) {
  const c = (a && a.condition) || { type: 'flag' };
  let cur = 0, goal = 1;
  switch (c.type) {
    case 'total_distance': cur = STATE.totalDistance || 0; goal = c.value || 1; break;
    case 'upgrade_level':  cur = STATE.upgrades[c.key] || 0; goal = c.value || 1; break;
    case 'resource':       cur = STATE.inv[c.id] || 0; goal = c.value || 1; break;
    case 'resource_tier': {
      const ids = RT.filter(r => r.tier === c.tier).map(r => r.id);
      cur = ids.reduce((m, id) => Math.max(m, STATE.inv[id] || 0), 0); goal = c.value || 1; break;
    }
    case 'flag':           cur = (STATE.objectives && STATE.objectives[c.value]) ? 1 : 0; goal = 1; break;
    default:               cur = 0; goal = 1;
  }
  return { cur, goal, done: cur >= goal };
}
function achievementMet(a) { return achievementProgress(a).done; }

// Fire newly-satisfied objectives once; grant rewards, persist, log, reveal in panel.
function checkAchievements() {
  if (typeof ACHIEVEMENTS === 'undefined') return;
  if (!STATE.objectives) STATE.objectives = {};
  for (const a of ACHIEVEMENTS) {
    if (STATE.objectives[a.id]) continue;          // 'flag' condition uses a different key, so no self-trigger
    if (a.condition && a.condition.type === 'flag' && a.condition.value === a.id) continue;
    if (achievementMet(a)) {
      STATE.objectives[a.id] = true;
      let rewardNote = '';
      if (Array.isArray(a.reward)) {
        a.reward.forEach(r => { if (r && r.id) STATE.inv[r.id] = (STATE.inv[r.id] || 0) + (r.qty || 0); });
        if (a.reward.length) rewardNote = ' — reward claimed';
      }
      SFX.milestone();
      addLog('OBJECTIVE COMPLETE: ' + (a.name || a.id) + rewardNote, 'xl');
      if (typeof revealAchievement === 'function') revealAchievement(a.id);
      saveGame();
    }
  }
}

// ── OFFLINE / AWAY PROGRESS ───────────────────────────────────
// Idle games must keep progressing while the tab is backgrounded or closed.
// rAF is throttled/paused in hidden tabs, so we DON'T simulate — instead we
// credit a closed-form *expected* yield over the real elapsed time, capped and
// scaled by CFG.offlineEfficiency (the "rover ran at ~30%" trickle). Design
// rules (see DESIGN_DIRECTION.md): node resources only (no combat/Organite),
// expected-value not RNG, and always worse than an active run.

// Expected units/sec for each spawnable resource at the rover's CURRENT stats.
// Pure function of RT / CFG / G — also reusable as a live "yield/sec" readout.
function expectedYieldRates() {
  const ids = biomePool();
  const pool = RT.filter(r => r.weight > 0 && r.drillTime > 0 && (!ids || ids.includes(r.id)));
  const sumW = pool.reduce((s, r) => s + r.weight, 0);
  if (!sumW) return {};
  const avgGap = CFG.obstacleMinGap + CFG.obstacleMaxGap / 2;
  const driveT = avgGap / G.baseSpeed();
  const drillT = pool.reduce((s, r) => s + (r.weight / sumW) * (r.drillTime / G.drillMult()), 0);
  const cycleT = driveT + drillT;
  const rates = {};
  if (cycleT <= 0) return rates;
  for (const r of pool) {
    const p = r.weight / sumW;
    const avgYield = (r.yieldMin + r.yieldMax) / 2;
    rates[r.id] = (1 / cycleT) * p * avgYield * G.yieldMult();
  }
  return rates;
}

// ── ECONOMY MODEL (shared by offline, telemetry, and the best-value indicator) ──
// Expected expedition length in seconds at current stats (Power Core EP ÷ blended drain).
function expectedRunSeconds() {
  const ids = biomePool();
  const p = RT.filter(r => r.weight > 0 && r.drillTime > 0 && (!ids || ids.includes(r.id)));
  const sumW = p.reduce((s, r) => s + r.weight, 0); if (!sumW) return 0;
  const avgGap = CFG.obstacleMinGap + CFG.obstacleMaxGap / 2;
  const driveT = avgGap / G.baseSpeed();
  const drillT = p.reduce((s, r) => s + (r.weight / sumW) * (r.drillTime / G.drillMult()), 0);
  const cycleT = driveT + drillT; if (cycleT <= 0) return 0;
  const eff = (driveT * CFG.powerDrainDriving + drillT * CFG.powerDrainDrilling) / cycleT;
  return eff > 0 ? G.maxPower() / eff : 0;
}
function expectedUnitsPerRun() {
  const rates = expectedYieldRates();
  const total = Object.values(rates).reduce((a, b) => a + b, 0);
  return total * expectedRunSeconds();
}
// Refined metal produced per run, by refined id (raw/run ÷ refine ratio).
function expectedRefinedPerRun() {
  const rates = expectedYieldRates(), T = expectedRunSeconds(), out = {};
  RT.forEach(r => { if (r.refinesTo && rates[r.id]) out[r.refinesTo.id] = (out[r.refinesTo.id] || 0) + rates[r.id] * T / r.refinesTo.ratio; });
  return out;
}
// Runs needed to afford a cost list, resolving alloys through their recipe inputs.
function runsToAffordCost(cost, rpr) {
  rpr = rpr || expectedRefinedPerRun(); let worst = 0;
  for (const c of cost) {
    const r = RT.find(x => x.id === c.id);
    if (r && r.tier === 'alloy') {
      const rec = ALLOYS.find(a => a.id === c.id); if (!rec) { worst = Infinity; continue; }
      const ra = rpr[rec.inputA] || 0, rb = rpr[rec.inputB] || 0;
      worst = Math.max(worst, ra ? c.qty * rec.qtyA / ra : Infinity, rb ? c.qty * rec.qtyB / rb : Infinity);
    } else { const rate = rpr[c.id] || 0; worst = Math.max(worst, rate ? c.qty / rate : Infinity); }
  }
  return worst;
}
// Throughput = expected units gathered per SECOND (independent of run length, so Power
// Core / battery doesn't distort it — that's a run-length/idle convenience, not throughput).
function expectedThroughput() { const r = expectedYieldRates(); return Object.values(r).reduce((a, b) => a + b, 0); }

// Average speed multiplier from the Boost Thrusters, assuming the player uses boost on
// cooldown. Boost adds +mag% for boostDur out of every boostCd seconds (concurrent), so
// uptime = min(1, dur/cd). This lets Boost Thrusters + Thruster Recharge register as real
// throughput gains (faster driving → more nodes/sec).
function boostSpeedFactor() {
  const mag = G.boostMag(), dur = G.boostDur(), cd = G.boostCd();
  return 1 + mag * Math.min(1, dur / Math.max(0.001, cd));
}
// Throughput INCLUDING boost (effective driving speed). Used only for the best-value
// indicator — offline/telemetry deliberately stay boost-free.
function expectedThroughputBoosted() {
  const ids = biomePool();
  const p = RT.filter(r => r.weight > 0 && r.drillTime > 0 && (!ids || ids.includes(r.id)));
  const sumW = p.reduce((s, r) => s + r.weight, 0); if (!sumW) return 0;
  const avgGap = CFG.obstacleMinGap + CFG.obstacleMaxGap / 2;
  const driveT = avgGap / (G.baseSpeed() * boostSpeedFactor());
  const drillT = p.reduce((s, r) => s + (r.weight / sumW) * (r.drillTime / G.drillMult()), 0);
  const cycleT = driveT + drillT; if (cycleT <= 0) return 0;
  let tot = 0;
  p.forEach(r => { const pr = r.weight / sumW, avgY = (r.yieldMin + r.yieldMax) / 2; tot += (1 / cycleT) * pr * avgY * G.yieldMult() * G.masteryYieldMult(); });
  return tot;
}
// Effective gather rate per REAL second, accounting for run dead-time (recall+relaunch+redeploy).
// = throughput × duty-cycle, where duty = runActive / (runActive + overhead). This is the metric
// that values Power Core correctly: a bigger battery lengthens runs, amortising the fixed overhead
// (big early, tapering as runs grow) — without making battery always-best the way "per run" would.
function expectedPerRealSec() {
  const tput = expectedThroughputBoosted();        // units / active second (boost-aware)
  const T = expectedRunSeconds();                  // active run length (Power Core dependent)
  if (T <= 0) return 0;
  const ov = CFG.runOverhead || 8;
  return tput * (T / (T + ov));
}
// The best-value upgrade you can AFFORD RIGHT NOW — most extra resources-per-real-hour per run spent.
// Now INCLUDES Power Core (battery): the per-real-second metric captures its run-length benefit via
// reduced overhead drag. Combat/drones still excluded (not gather economy). Returns { key, value } or null.
function bestValueUpgrade() {
  const keys = ['treads', 'laser', 'cargo', 'battery', 'boost', 'boost_cd'];
  const rpr = expectedRefinedPerRun(), before = expectedPerRealSec();
  let best = null, bestV = -1;
  keys.forEach(key => {
    if (UPGCFG[key] && UPGCFG[key].locked && (STATE.upgrades[key] || 0) === 0) return;
    if (!G.upCanAfford(key)) return;                       // only what you can buy now
    const lvl = STATE.upgrades[key] || 0, cost = upgradeCost(key, lvl + 1);
    const runs = runsToAffordCost(cost, rpr);
    const denom = (isFinite(runs) && runs > 0) ? runs : 1;  // affordable here; guard div-by-0
    const save = STATE.upgrades[key]; STATE.upgrades[key] = lvl + 1;
    const after = expectedPerRealSec(); STATE.upgrades[key] = save;
    const v = (after - before) / denom;
    if (v > bestV) { bestV = v; best = key; }
  });
  return best ? { key: best, value: bestV } : null;
}

// Credit capped offline gains based on STATE.lastSeen. Returns a summary
// { elapsed, cappedElapsed, efficiency, gains } or null if nothing to award.
function applyOfflineProgress() {
  // Only once the player has finished the first expedition (understands the loop).
  if (!STATE.tutorial || !STATE.tutorial.expeditionDone) { STATE.lastSeen = Date.now(); return null; }
  if (!STATE.lastSeen) { STATE.lastSeen = Date.now(); return null; }
  const now = Date.now();
  const rawElapsed = (now - STATE.lastSeen) / 1000;            // real seconds away
  STATE.lastSeen = now;
  if (rawElapsed < 60) return null;                            // ignore trivial gaps
  const capped = Math.min(rawElapsed, CFG.offlineCapHours * 3600);
  const rates = expectedYieldRates();
  const eff = (typeof prestigeOfflineEff === 'function') ? prestigeOfflineEff() : CFG.offlineEfficiency;
  const gains = {};
  let any = false;
  for (const id in rates) {
    const amt = Math.floor(rates[id] * capped * eff);
    if (amt > 0) { STATE.inv[id] = (STATE.inv[id] || 0) + amt; gains[id] = amt; any = true; }
  }
  // Offline auto-refining — if the Refinery is online and the auto-toggles are on, the
  // refinery keeps smelting the raw ore (incl. what was just credited) at FULL efficiency,
  // bounded only by auto-refine speed: cycles = away-time ÷ autoInterval. Each cycle smelts
  // one batch per eligible resource, so the closed form is min(cycles, floor(held/ratio)).
  const refined = {};
  if (STATE.tutorial && STATE.tutorial.refineryUnlocked) {
    const cycles = Math.floor(capped / G.autoInterval());
    const smelt = pool => {
      pool.forEach(r => {
        const rat = r.refinesTo.ratio, held = STATE.inv[r.id] || 0;
        const n = Math.min(cycles, Math.floor(held / rat));
        if (n > 0) {
          STATE.inv[r.id] = held - n * rat;
          const oid = r.refinesTo.id;
          STATE.inv[oid] = (STATE.inv[oid] || 0) + n;
          refined[oid] = (refined[oid] || 0) + n; any = true;
        }
      });
    };
    if (cycles > 0 && STATE.automation.autoMetal)     smelt(RT.filter(r => r.refinesTo && r.weight > 0));
    if (cycles > 0 && STATE.automation.autoBiomatter) smelt(RT.filter(r => r.category === 'Organic Matter' && r.refinesTo));
  }
  if (!any) return null;
  saveGame();
  return { elapsed: rawElapsed, cappedElapsed: capped, efficiency: eff, gains, refined };
}

// ── SAVE / LOAD ───────────────────────────────────────────────
let _wiping = false;   // set true by a hard reset so teardown saves (visibilitychange/pagehide) can't re-persist the wiped STATE
function saveGame() {
  if (_wiping) return;   // a wipe is in progress — do NOT write the in-memory (still-full) STATE back over the cleared save
  localStorage.setItem('rhv8', JSON.stringify({
    inv: STATE.inv, upgrades: STATE.upgrades, automation: STATE.automation,
    tutorial: STATE.tutorial,
    uptime: STATE.uptime, totalDistance: STATE.totalDistance, biome: STATE.biome,
    archives: STATE.archives, maxBiome: STATE.maxBiome, objectives: STATE.objectives, discovered: STATE.discovered,
    unlocks: STATE.unlocks, flags: STATE.flags, mastery: STATE.mastery, prestige: STATE.prestige,
    lastSeen: Date.now(), version: STATE.version,
    rt: RT.map(r => ({ id:r.id, drillTime:r.drillTime, yieldMin:r.yieldMin, yieldMax:r.yieldMax, weight:r.weight })),
    alloys: ALLOYS, cfg: CFG,
    // dev-tunable curve params (persist like rt/alloys/cfg do)
    upgTune: Object.fromEntries(Object.entries(UPGCFG).map(([k, c]) => [k, { costBase: c.costBase, costGrowth: c.costGrowth }])),
    breachTune: (window.TECHTREE || []).filter(n => n.grants && n.grants.unlockBiome)
      .map(n => ({ id: n.id, cost: n.cost, requires: n.requires })),
  }));
}

function loadGame() {
  try {
    const d = JSON.parse(localStorage.getItem('rhv8')); if (!d) return;
    if (d.inv)       Object.assign(STATE.inv, d.inv);
    if (d.upgrades)  Object.assign(STATE.upgrades, d.upgrades);
    if (d.automation)Object.assign(STATE.automation, d.automation);
    if (d.tutorial)  {
      Object.assign(STATE.tutorial, d.tutorial);
      // Migrate pre-gate saves: anyone already past onboarding keeps Refinery + Hangar open.
      if (d.tutorial.refineryUnlocked === undefined) {
        const veteran = d.tutorial.expeditionDone || d.tutorial.refinedOnce || d.tutorial.upgradedOnce;
        STATE.tutorial.refineryUnlocked = !!veteran;
        STATE.tutorial.hangarUnlocked   = !!veteran;
      }
    }
    // Only merge CFG keys that still exist (drops legacy distance-based enemy keys)
    if (d.cfg)       Object.keys(CFG).forEach(k => { if (d.cfg[k] !== undefined) CFG[k] = d.cfg[k]; });
    // Combat is always available now — migrate pre-rework saves where weapon was locked at 0
    if (!STATE.upgrades.weapon) STATE.upgrades.weapon = 1;
    STATE.uptime = d.uptime || 0;
    STATE.totalDistance = d.totalDistance || 0;
    if (d.biome) STATE.biome = d.biome;
    if (d.archives)   Object.assign(STATE.archives, d.archives);
    if (d.maxBiome)   STATE.maxBiome = d.maxBiome;
    if (d.objectives) Object.assign(STATE.objectives, d.objectives);
    if (d.discovered) Object.assign(STATE.discovered, d.discovered);
    // Back-compat: a pre-drip-feed save reveals everything already held so nothing vanishes.
    else { RT.forEach(r => { if ((STATE.inv[r.id] || 0) > 0) STATE.discovered[r.id] = true; }); }
    if (d.prestige)   Object.assign(STATE.prestige, d.prestige);   // cores + meta tree (v10+)
    if (d.unlocks) Object.assign(STATE.unlocks, d.unlocks);
    if (d.flags)   Object.assign(STATE.flags, d.flags);
    if (d.mastery) Object.assign(STATE.mastery, d.mastery);
    if (typeof reapplyTechGrants === 'function') reapplyTechGrants();   // restore maxBiome/flags from research
    if (typeof reapplyHeadStart === 'function') reapplyHeadStart();     // re-grant head-start breaches (prestige)
    STATE.lastSeen = d.lastSeen || 0;   // 0 → applyOfflineProgress seeds it, no false credit
    STATE.version  = d.version  || 8;   // pre-versioning saves are treated as v8
    if (d.rt) d.rt.forEach(s => { const r = RT.find(x => x.id === s.id); if (r) { r.drillTime=s.drillTime; r.yieldMin=s.yieldMin; r.yieldMax=s.yieldMax; r.weight=s.weight; } });
    // Merge saved/dev-edited recipes by id — but KEEP new default recipes that a
    // pre-expansion save wouldn't contain (so biome alloys survive old saves).
    if (d.alloys) d.alloys.forEach(sa => { const i = ALLOYS.findIndex(a => a.id === sa.id); if (i >= 0) ALLOYS[i] = sa; else ALLOYS.push(sa); });
    // dev-tuned curve params override code defaults (same pattern as rt/alloys/cfg)
    if (d.upgTune) Object.entries(d.upgTune).forEach(([k, t]) => { if (UPGCFG[k]) { if (t.costBase != null) UPGCFG[k].costBase = t.costBase; if (t.costGrowth != null) UPGCFG[k].costGrowth = t.costGrowth; } });
    if (d.breachTune) d.breachTune.forEach(bt => { const n = (window.TECHTREE || []).find(x => x.id === bt.id); if (n) { if (bt.cost) n.cost = bt.cost; if (bt.requires) n.requires = bt.requires; } });
  } catch(e) { console.warn('Load failed'); }
}

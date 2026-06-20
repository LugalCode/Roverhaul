// ============================================================
//  techtree.js — ROVERHAUL staged-unlock / research spine (FIRST PASS — engine layer)
//  Data + node logic. The node `requires` reuse the SAME condition vocabulary as
//  achievements (see achievementProgress in game.js) + a new 'unlock' type (another
//  node already researched). Activating a node pays its `cost` and applies `grants`.
//
//  This file is the engine + data only; the Research UI panel + the in-run "descend"
//  travel that consume it are wired separately. Safe to load inert.
//
//  Node shape:
//    id, name, desc, icon, category   ('biome' | 'automation' | 'rover' | 'facility')
//    requires [ {type, ...} ]  ALL must hold for the node to be AVAILABLE. Types:
//        {type:'upgrade_level', key, value}  STATE.upgrades[key] >= value
//        {type:'resource', id, value}        STATE.inv[id] >= value
//        {type:'resource_tier', tier, value} any resource of tier held >= value
//        {type:'total_distance', value}      lifetime metres >= value
//        {type:'unlock', value}              node <value> already researched
//    cost  [ {id, qty} ]  spent once on activation.
//    grants { unlockBiome:N | flag:'name' | revealUpgrade:'key' }
// ── ADD A NODE: copy any entry and change the fields. ──
window.TECHTREE = [
  // Breach costs are tuned in tools/econ_sim.py for a B2≈1h, B3≈20h, B4≈1.6d, B5≈3.6d ACTIVE
  // curve (idle compresses ~30-40%). Each deep gate also demands BULK early refined metal —
  // the "early resources stay useful" sink that keeps iron/copper/steel relevant to the end.
  { id:'breach_b2', name:'Breach the Rubble', icon:'⛏️', category:'biome',
    desc:'Build the drill from an alloy and reinforce the mine-mouth to breach into the Rubblechoke.',
    requires:[{type:'upgrade_level', key:'laser', value:10}, {type:'upgrade_level', key:'treads', value:8}],
    cost:[{id:'bronze', qty:10}, {id:'r_iron', qty:80}], grants:{ unlockBiome:2 } },
  { id:'auto_collect', name:'Auto-Collect', icon:'🧲', category:'automation',
    desc:'Salvage drones also recover enemy Organite, not just node cargo.',
    requires:[{type:'unlock', value:'breach_b2'}],
    cost:[{id:'biofuel', qty:30}], grants:{ flag:'autoCollect' } },
  { id:'breach_b3', name:'Cross the Scree', icon:'🛤️', category:'biome',
    desc:'Reinforce the tracks with Hadfield Steel and over-drive the extractor to cross the broken scree into the Ashen Reaches.',
    requires:[{type:'upgrade_level', key:'treads', value:14}, {type:'upgrade_level', key:'laser', value:15}, {type:'upgrade_level', key:'cargo', value:9}, {type:'unlock', value:'breach_b2'}],
    cost:[{id:'mangalloy', qty:6}, {id:'r_copper', qty:52}, {id:'r_iron', qty:52}], grants:{ unlockBiome:3 } },
  { id:'breach_b4', name:'Lighting Rig', icon:'💡', category:'biome',
    desc:'Fit a Kovar lighting rig — and the Power Core to run it — to pierce the dark of the Lightless Vault.',
    requires:[{type:'unlock', value:'breach_b3'}, {type:'upgrade_level', key:'battery', value:19}, {type:'upgrade_level', key:'laser', value:23}, {type:'upgrade_level', key:'treads', value:21}, {type:'upgrade_level', key:'cargo', value:17}],
    cost:[{id:'kovar', qty:38}, {id:'r_steel', qty:880}, {id:'r_iron', qty:1050}], grants:{ unlockBiome:4 } },
  { id:'breach_b5', name:'Hull Plating', icon:'🛡️', category:'biome',
    desc:'Plate the hull with Void Steel, bank the cargo, and overcharge the Power Core to survive the descent to the Hollow Core.',
    requires:[{type:'unlock', value:'breach_b4'}, {type:'upgrade_level', key:'battery', value:33}, {type:'upgrade_level', key:'laser', value:34}, {type:'upgrade_level', key:'cargo', value:26}, {type:'upgrade_level', key:'treads', value:30}],
    cost:[{id:'voidsteel', qty:66}, {id:'r_iron', qty:7200}, {id:'r_copper', qty:7200}], grants:{ unlockBiome:5 } },

  // ── RESOURCE SINKS (optional — never gate a biome; they're the spend-spree between walls). ECONOMY_PLAN §5. ──
  { id:'overdrive_refine', name:'Overdrive Refinery', icon:'🔥', category:'automation',
    desc:'Push the smelters past their safe cadence — auto-refine runs faster than the buyable cap.',
    requires:[{type:'unlock', value:'breach_b3'}],
    cost:[{id:'biofuel', qty:120}], grants:{ refineFloor:0.15 } },
  // Organite Infusion — spend enemy drops for a small, permanent yield boost. NOT required to progress;
  // pure reward for active combat. Tiered (one-time each) for now; can become a repeatable spend later.
  { id:'organite_infuse_1', name:'Organite Infusion I', icon:'🧬', category:'rover',
    desc:'Lace the cargo intake with refined Organite. +4% to all resources gathered.',
    requires:[{type:'unlock', value:'breach_b2'}],
    cost:[{id:'organite', qty:40}], grants:{ yieldPct:0.04 } },
  { id:'organite_infuse_2', name:'Organite Infusion II', icon:'🧬', category:'rover',
    desc:'Deeper Organite saturation. +4% to all resources gathered (stacks).',
    requires:[{type:'unlock', value:'organite_infuse_1'}],
    cost:[{id:'organite', qty:120}, {id:'inconel', qty:4}], grants:{ yieldPct:0.04 } },
  { id:'organite_infuse_3', name:'Organite Infusion III', icon:'🧬', category:'rover',
    desc:'Full biomech symbiosis. +5% to all resources gathered (stacks).',
    requires:[{type:'unlock', value:'organite_infuse_2'}],
    cost:[{id:'organite', qty:320}, {id:'iridiplate', qty:4}], grants:{ yieldPct:0.05 } },
  { id:'core_tap', name:'Core Tap', icon:'🔆', category:'facility',
    desc:'Siphon a Core Resonance into the jettison rig — every jettison pays +15% Cores.',
    requires:[{type:'unlock', value:'breach_b5'}],
    cost:[{id:'corestuff', qty:8}], grants:{ coresPct:0.15 } },
];

// ── NODE LOGIC (pure-ish; reads STATE) ───────────────────────
function techRequiresMet(node) {
  return (node.requires || []).every(r => {
    if (r.type === 'unlock') return !!(STATE.unlocks && STATE.unlocks[r.value]);
    return (typeof achievementProgress === 'function') ? achievementProgress({ condition: r }).done : false;
  });
}
function techCanAfford(node) { return (node.cost || []).every(c => (STATE.inv[c.id] || 0) >= c.qty); }
// 'owned' | 'available' | 'locked'
function techNodeState(node) {
  if (STATE.unlocks && STATE.unlocks[node.id]) return 'owned';
  return techRequiresMet(node) ? 'available' : 'locked';
}
function applyTechGrants(node) {
  const g = node.grants || {};
  if (g.unlockBiome && (STATE.maxBiome || 1) < g.unlockBiome) STATE.maxBiome = g.unlockBiome;
  if (g.flag) { STATE.flags = STATE.flags || {}; STATE.flags[g.flag] = true; }
  if (g.revealUpgrade && typeof UPGCFG !== 'undefined' && UPGCFG[g.revealUpgrade]) UPGCFG[g.revealUpgrade].locked = false;
}
// Research a node: validate, pay cost, apply grants, persist. Returns true on success.
function activateNode(id) {
  const n = (window.TECHTREE || []).find(x => x.id === id);
  if (!n || (STATE.unlocks && STATE.unlocks[id])) return false;
  if (techNodeState(n) !== 'available') { if (window.SFX) SFX.denied(); return false; }
  if (!techCanAfford(n)) {
    if (window.SFX) SFX.denied();
    const miss = (n.cost || []).filter(c => (STATE.inv[c.id] || 0) < c.qty).map(c => (RT.find(r => r.id === c.id) || {}).name || c.id);
    if (typeof addLog === 'function') addLog('RESEARCH: insufficient materials — ' + miss.join(', '), 'dl');
    return false;
  }
  (n.cost || []).forEach(c => { STATE.inv[c.id] = (STATE.inv[c.id] || 0) - c.qty; });
  if (!STATE.unlocks) STATE.unlocks = {};
  STATE.unlocks[id] = true;
  applyTechGrants(n);
  if (window.SFX) SFX.upgrade();
  if (typeof addLog === 'function') addLog('RESEARCH COMPLETE: ' + n.name + '.', 'xl');
  if (typeof saveGame === 'function') saveGame();
  return true;
}
// Re-apply all owned nodes' grants (call after loadGame so maxBiome/flags reflect research).
function reapplyTechGrants() {
  (window.TECHTREE || []).forEach(n => { if (STATE.unlocks && STATE.unlocks[n.id]) applyTechGrants(n); });
}

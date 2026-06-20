// ROVERHAUL — objectives / achievements.
// This file is DATA, not code. Edit it with achievement_editor.html (double-click
// it open), or by hand. The game reads window.ACHIEVEMENTS to build the Objectives
// panel and to drive completion checks each frame (see checkAchievements in game.js).
//
// Entry shape:
//   id         unique slug (no spaces). Used internally + written to STATE.objectives
//              on completion — so an Archive entry with unlock {type:'objective',
//              value:'<this id>'} will unlock when this objective completes.
//   name       title shown on the objective card.
//   desc       one-line description of the goal.
//   icon       any emoji/character shown on the card.
//   secret     true = name/desc hidden as "???" until completed (a surprise goal).
//   reward     optional [{id, qty}, ...] resources granted once on completion.
//   condition  how it's measured + completed. One of:
//                { type:'total_distance', value:1000 }            lifetime metres travelled >= value
//                { type:'upgrade_level',  key:'laser', value:11 } STATE.upgrades[key] >= value
//                { type:'resource',       id:'r_iron', value:500 } current STATE.inv[id] >= value
//                { type:'resource_tier',  tier:'alloy', value:1 } any resource of that tier held >= value
//                                                                  (tiers: raw|refined|alloy|exotic|biomech)
//                { type:'flag',           value:'some_flag' }      STATE.objectives['some_flag'] is set
//                                                                  (set elsewhere in code; for scripted events)
//
// ── ADD AN OBJECTIVE: copy any entry and change the fields. ──
window.ACHIEVEMENTS = [
  { id:'first_tracks', name:'First Tracks', desc:'Travel 100 m on a single rover.', icon:'🐾',
    condition:{ type:'total_distance', value:100 } },
  { id:'trailblazer', name:'Trailblazer', desc:'Travel 1,000 m total.', icon:'🛤️',
    condition:{ type:'total_distance', value:1000 } },
  { id:'long_hauler', name:'Long Hauler', desc:'Travel 10,000 m total.', icon:'🌌',
    condition:{ type:'total_distance', value:10000 }, reward:[{ id:'biofuel', qty:25 }] },
  { id:'first_smelt', name:'First Smelt', desc:'Refine your first metal.', icon:'🔩',
    condition:{ type:'resource', id:'r_iron', value:1 } },
  { id:'first_alloy', name:'Alloy Smith', desc:'Forge your first alloy.', icon:'⚗️',
    condition:{ type:'resource_tier', tier:'alloy', value:1 }, reward:[{ id:'r_iron', qty:20 }, { id:'r_copper', qty:20 }] },
  { id:'pulverizer', name:'Pulverizer', desc:'Build the Resource Extractor from an alloy (Lvl 11) to smash through weak ore.', icon:'💥',
    condition:{ type:'upgrade_level', key:'laser', value:11 } },
  { id:'high_voltage', name:'High Voltage', desc:'Take the Power Core to Lvl 10.', icon:'🔋',
    condition:{ type:'upgrade_level', key:'battery', value:10 } },
  { id:'speed_demon', name:'Speed Demon', desc:'Take Locomotion to Lvl 10.', icon:'⚡',
    condition:{ type:'upgrade_level', key:'treads', value:10 } },
  { id:'drone_fleet', name:'Drone Fleet', desc:'Upgrade Salvage Drones to Lvl 5.', icon:'🛰️',
    condition:{ type:'upgrade_level', key:'drone', value:5 } },
  { id:'iron_baron', name:'Iron Baron', desc:'Stockpile 1,000 Refined Iron.', icon:'🏦',
    condition:{ type:'resource', id:'r_iron', value:1000 } },
];

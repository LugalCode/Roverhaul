// ROVERHAUL — lore / archive entries.
// This file is DATA, not code. Edit it with archive_editor.html (double-click it open),
// or by hand if you like. The game reads window.ARCHIVES to build the Archives panel.
//
// Entry shape:
//   id        unique slug (no spaces). Used internally + as the unlock-tracking key.
//   label     short text shown in the Archives sidebar list (e.g. "300m // Flesh").
//   title     heading shown when the entry is opened.
//   timestamp small line under the title (a time, a depth, a tag — free text).
//   body      the lore. Blank lines start new paragraphs. *wrap in asterisks* for emphasis.
//   unlock    how it becomes readable in-game. One of:
//               { type:'always' }                     always available
//               { type:'distance',  value:300 }       total distance travelled >= value (metres)
//               { type:'biome',     value:2 }          player has reached biome >= value
//               { type:'artefact',  value:'art_id' }   player holds at least one of resource art_id
//               { type:'objective', value:'obj_id' }   objective/flag obj_id is set
//             (biome / artefact / objective stay locked until those systems exist — safe to author now.)

window.ARCHIVES = [
  {
    id: 'sys_boot',
    label: 'System Log',
    title: 'SYSTEM BOOT',
    timestamp: '00:00:00',
    body: 'Colony vessel *Sovereign-9* suffered hull fracture. Deploy the rover. Gather materials. Upgrade. Survive.',
    unlock: { type: 'always' }
  },
  {
    id: 'ruins_100',
    label: '100m // Ruins',
    title: 'RUSTED OUTSKIRTS',
    timestamp: '100m',
    body: 'Metal appears grown rather than built. Muscle fibre grain in industrial alloys. Something made this place.',
    unlock: { type: 'distance', value: 100 }
  },
  {
    id: 'flesh_300',
    label: '300m // Flesh',
    title: 'FLESH FUSIONS',
    timestamp: '300m',
    body: 'Biology and machine indistinguishable. Synthetic nerve pathways decomposed into soil.',
    unlock: { type: 'distance', value: 300 }
  },
  {
    id: 'towers_600',
    label: '600m // Towers',
    title: 'MEGASTRUCTURE',
    timestamp: '600m',
    body: 'Towers pulse with bioluminescent currents. Archives encrypted. Push deeper.',
    unlock: { type: 'distance', value: 600 }
  }
];

// ROVERHAUL — ambient music tracks.
// Drop your audio files into the  assets/music/  folder, then list them here
// (paths relative to index.html). Supported: .mp3, .ogg, .wav, .m4a.
//
//   - One track  → it loops forever.
//   - Several    → they play as a sequential playlist that loops.
//   - Empty list → the game falls back to the built-in procedural drone.
//
// The in-game Options "Ambient Music" toggle + "Music Volume" slider control
// these exactly like the procedural music (routed through the same audio bus,
// so global Mute affects them too).

window.MUSIC_TRACKS = [
  'assets/music/scorn-cleansing.mp3',
];

// ============================================================
//  audio.js — ROVERHAUL v0.8
//  Procedural sound system. Web Audio API only — no external files.
//  Exposes a global `SFX` object. Load AFTER engine.js, BEFORE ui.js.
//  Industrial / clunky palette: filtered noise thunks, metal clangs,
//  low square "machine" tones. All synthesized at runtime.
// ============================================================

const SFX = (() => {
  let ctx = null;
  let master = null;
  let muted = false;
  let noiseBuf = null;

  // ── LAZY INIT (browsers require a user gesture before audio) ──
  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    // pre-bake a second of white noise for clunk/hiss textures
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  // ── LOW-LEVEL VOICES ─────────────────────────────────────────
  // A pitched oscillator with an attack/decay envelope.
  function tone(freq, t0, dur, { type = 'square', gain = 0.3, glide = 0, attack = 0.005 } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  // A burst of filtered noise — the core of every "clunk" and "hiss".
  function noise(t0, dur, { type = 'bandpass', freq = 1200, q = 1, gain = 0.3, attack = 0.002, sweep = 0 } = {}) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  // Guarded scheduler — every public sound routes through here.
  function play(fn) {
    if (muted) return;
    ensure();
    if (!ctx) return;
    fn(ctx.currentTime);
  }

  // ── UI: INDUSTRIAL CLUNKS ────────────────────────────────────
  // Heavy mechanical thunk for hub/panel navigation.
  const uiClick = () => play(t => {
    noise(t, 0.07, { type: 'lowpass', freq: 600, q: 1, gain: 0.35, sweep: 0.4 });
    tone(90, t, 0.09, { type: 'square', gain: 0.22, glide: 0.6 });
    tone(150, t + 0.015, 0.05, { type: 'triangle', gain: 0.12 });
  });

  // Lighter tick for hover / secondary controls.
  const uiHover = () => play(t => {
    noise(t, 0.03, { type: 'bandpass', freq: 2600, q: 3, gain: 0.08 });
  });

  // Two-stage latch for view toggle (WASTELAND / BASE OPS).
  const uiToggle = () => play(t => {
    noise(t, 0.05, { type: 'lowpass', freq: 800, q: 1, gain: 0.3, sweep: 0.5 });
    tone(120, t, 0.06, { type: 'square', gain: 0.18 });
    tone(220, t + 0.06, 0.05, { type: 'square', gain: 0.16 });
  });

  // Dull denied buzz for "can't afford / locked".
  const denied = () => play(t => {
    tone(70, t, 0.18, { type: 'sawtooth', gain: 0.22, glide: 0.85 });
    noise(t, 0.18, { type: 'lowpass', freq: 300, q: 1, gain: 0.12 });
  });

  // ── GAME EVENTS ──────────────────────────────────────────────
  // Rover deploy — heavy motor spin-up.
  const deploy = () => play(t => {
    tone(60, t, 0.5, { type: 'sawtooth', gain: 0.28, glide: 3.5, attack: 0.08 });
    noise(t, 0.5, { type: 'lowpass', freq: 400, q: 1, gain: 0.18, sweep: 2.5 });
    tone(180, t + 0.35, 0.12, { type: 'square', gain: 0.14 });
  });

  // Recall — retraction whirr that drops in pitch.
  const recall = () => play(t => {
    tone(420, t, 0.45, { type: 'sawtooth', gain: 0.2, glide: 0.25, attack: 0.05 });
    noise(t, 0.45, { type: 'bandpass', freq: 1800, q: 2, gain: 0.12, sweep: 0.3 });
  });

  // Harvest complete — drill stops, satisfying metal clunk + chime.
  const harvest = () => play(t => {
    noise(t, 0.08, { type: 'lowpass', freq: 700, q: 1, gain: 0.3, sweep: 0.4 });
    tone(330, t + 0.03, 0.18, { type: 'triangle', gain: 0.2 });
    tone(495, t + 0.05, 0.16, { type: 'sine', gain: 0.14 });
  });

  // Manual drill boost click on an obstacle — short servo tick.
  const drillBoost = () => play(t => {
    noise(t, 0.04, { type: 'bandpass', freq: 1600, q: 4, gain: 0.18 });
    tone(260, t, 0.05, { type: 'square', gain: 0.12 });
  });

  // Upgrade purchased — ratcheting power-up.
  const upgrade = () => play(t => {
    [0, 0.06, 0.12].forEach((d, i) => tone(220 + i * 110, t + d, 0.1, { type: 'square', gain: 0.16 }));
    noise(t + 0.12, 0.1, { type: 'highpass', freq: 1200, q: 1, gain: 0.1 });
  });

  // Forge — big metallic clang.
  const forge = () => play(t => {
    noise(t, 0.18, { type: 'bandpass', freq: 2200, q: 0.7, gain: 0.3, sweep: 0.5 });
    tone(160, t, 0.25, { type: 'sawtooth', gain: 0.2, glide: 0.7 });
    tone(640, t, 0.2, { type: 'triangle', gain: 0.12, glide: 0.8 });
  });

  // Refine — pneumatic hiss + thunk.
  const refine = () => play(t => {
    noise(t, 0.22, { type: 'highpass', freq: 3000, q: 0.5, gain: 0.14, sweep: 0.6 });
    tone(110, t + 0.12, 0.1, { type: 'square', gain: 0.16 });
  });

  // Weapon hit on enemy — sharp zap.
  const enemyHit = () => play(t => {
    tone(900, t, 0.1, { type: 'square', gain: 0.18, glide: 0.4 });
    noise(t, 0.08, { type: 'bandpass', freq: 3200, q: 2, gain: 0.12, sweep: 0.5 });
  });

  // Enemy destroyed — low explosive thud.
  const enemyDown = () => play(t => {
    tone(80, t, 0.3, { type: 'sawtooth', gain: 0.28, glide: 0.4 });
    noise(t, 0.3, { type: 'lowpass', freq: 900, q: 1, gain: 0.22, sweep: 0.25 });
  });

  // Boost thrusters — rising whoosh with a low rocket rumble.
  const boost = () => play(t => {
    tone(120, t, 0.5, { type: 'sawtooth', gain: 0.26, glide: 4.0, attack: 0.04 });
    noise(t, 0.5, { type: 'bandpass', freq: 500, q: 0.8, gain: 0.22, sweep: 4.5 });
    tone(70, t, 0.45, { type: 'square', gain: 0.16, glide: 1.5 });
  });

  // Milestone / archive unlock — ascending chime.
  const milestone = () => play(t => {
    [392, 523, 659, 784].forEach((f, i) => tone(f, t + i * 0.09, 0.3, { type: 'triangle', gain: 0.16 }));
  });

  // ── AMBIENT MUSIC ────────────────────────────────────────────
  // Subtle Scorn-esque dark drone: detuned low oscillators through a slowly
  // sweeping lowpass, gentle tremolo, and sparse breathy swells. Very low gain.
  // Routes through its own bus (musicGain) so it has an independent toggle but
  // is still silenced by the global mute (musicGain → master).
  const MUSIC_VOL = 0.055;      // base bed level (before the user volume stage) — halved so music isn't jarring on first open
  let music = null;             // active-music handle, or null when stopped
  let musicGain = null;         // bed gain (fade-in + tremolo live here)
  let musicVolGain = null;      // user volume stage (driven by the in-game slider)
  let userMusicVol = 0.7;       // multiplier set by setMusicVolume(); persists across restarts

  function softSwell(t) {       // a slow, soft organic "breath" over the drone
    if (!ctx || !musicGain) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle';
    const f = [196.0, 220.0, 261.6, 293.7][Math.floor(Math.random() * 4)];
    o.frequency.value = f;
    o.detune.value = (Math.random() - 0.5) * 14;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(MUSIC_VOL * 0.45, t + 1.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 6.0);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 6.2);
  }

  function startMusic() {
    ensure();
    if (!ctx || music) return;
    // user volume stage (slider) sits between the bed and the master bus
    musicVolGain = ctx.createGain();
    musicVolGain.gain.value = userMusicVol;
    musicVolGain.connect(master);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.0001;
    musicGain.connect(musicVolGain);

    // If the player supplied audio files (music.js → window.MUSIC_TRACKS), play
    // those instead of the procedural drone. Same bus, so toggle/slider/mute all apply.
    const tracks = (typeof window !== 'undefined' && Array.isArray(window.MUSIC_TRACKS)) ? window.MUSIC_TRACKS : [];
    if (tracks.length) { startFileMusic(tracks); return; }

    musicGain.gain.exponentialRampToValueAtTime(MUSIC_VOL, ctx.currentTime + 3.0); // slow fade-in

    // Drone bed → lowpass with a very slow LFO sweep on the cutoff. Cutoff kept
    // high enough (~520Hz, sweeping up to ~900Hz) that the mid content survives
    // small speakers — pure sub-bass is inaudible on laptops.
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; lp.Q.value = 3;
    lp.connect(musicGain);
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.045;
    const lfoG = ctx.createGain(); lfoG.gain.value = 380;
    lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();

    // Minor-ish stack lifted an octave into an audible register (A2, E3, A3, C4),
    // detuned for an uneasy beating. Still dark, but reproducible on any speaker.
    const freqs = [110.0, 164.81, 220.0, 261.63];
    const oscs = freqs.map((f, i) => {
      const o = ctx.createOscillator(); o.type = i < 2 ? 'sine' : 'triangle';
      o.frequency.value = f; o.detune.value = (i - 1.5) * 7;
      const g = ctx.createGain(); g.gain.value = i < 2 ? 0.5 : 0.2;
      o.connect(g); g.connect(lp); o.start();
      return o;
    });

    // Gentle tremolo breathing the whole bed in and out.
    const trem = ctx.createOscillator(); trem.type = 'sine'; trem.frequency.value = 0.07;
    const tremG = ctx.createGain(); tremG.gain.value = MUSIC_VOL * 0.4;
    trem.connect(tremG); tremG.connect(musicGain.gain); trem.start();

    // Sparse swells every ~12–22s.
    const interval = setInterval(() => {
      if (muted || !music) return;
      softSwell(ctx.currentTime + 0.1);
    }, 12000 + Math.random() * 10000);

    music = { mode: 'proc', oscs, lfo, trem, interval };
  }

  // Play supplied audio files through the music bus. One track loops; several
  // play as a looping sequential playlist.
  function startFileMusic(tracks) {
    let idx = 0;
    const el = new Audio();
    el.loop = tracks.length === 1;
    el.src = tracks[idx];
    el.addEventListener('ended', () => {
      if (tracks.length <= 1) return;                 // single track: native loop handles it
      idx = (idx + 1) % tracks.length; el.src = tracks[idx]; el.play().catch(() => {});
    });
    // file:// origins taint media routed through Web Audio (Chrome silences it),
    // so when running off disk we play the element DIRECTLY and control level via
    // el.volume; over http we route through the music bus for slider+mute integration.
    const direct = (typeof location !== 'undefined' && location.protocol === 'file:');
    if (direct) {
      el.volume = Math.min(1, userMusicVol * 0.5);
      el.muted = muted;
      music = { mode: 'file', el, direct: true };
    } else {
      musicGain.gain.exponentialRampToValueAtTime(1.0, ctx.currentTime + 2.0); // fade in; slider sets level
      const srcNode = ctx.createMediaElementSource(el);
      srcNode.connect(musicGain);
      music = { mode: 'file', el, srcNode, direct: false };
    }
    el.play().catch(err => console.warn('Music playback blocked (needs a user gesture):', err));
  }

  function stopMusic() {
    if (!music || !ctx) return;
    const m = music; music = null;
    const t = ctx.currentTime;
    if (musicGain) musicGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    if (m.mode === 'file') {
      setTimeout(() => { try { m.el.pause(); m.srcNode.disconnect(); } catch (e) {} }, 1600);
    } else {
      clearInterval(m.interval);
      [...m.oscs, m.lfo, m.trem].forEach(o => { try { o.stop(t + 1.7); } catch (e) {} });
    }
  }
  const isMusicOn = () => !!music;
  // Pause/resume for tab visibility — so music doesn't keep playing when the
  // page is backgrounded (file mode pauses the element; procedural ducks to 0).
  function pauseMusic() {
    if (!music || !ctx) return;
    if (music.mode === 'file') { try { music.el.pause(); } catch (e) {} }
    else if (musicGain) musicGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
    music.paused = true;
  }
  function resumeMusic() {
    if (!music || !ctx || !music.paused) return;
    if (music.mode === 'file') { try { music.el.play().catch(() => {}); } catch (e) {} }
    else if (musicGain) musicGain.gain.setTargetAtTime(MUSIC_VOL, ctx.currentTime, 0.3);
    music.paused = false;
  }
  // Live music volume — `mult` is a gain multiplier on the bed (0 = silent).
  // Works before start (stored) and after (ramped live). The UI maps its 0–100%
  // slider onto a useful multiplier range.
  function setMusicVolume(mult) {
    userMusicVol = mult;
    if (musicVolGain && ctx) musicVolGain.gain.setTargetAtTime(mult, ctx.currentTime, 0.05);
    if (music && music.direct && music.el) music.el.volume = Math.min(1, mult * 0.5); // file:// direct mode
  }

  // ── MUTE CONTROL ─────────────────────────────────────────────
  function setMuted(m) {
    muted = m;
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.02);
    if (music && music.direct && music.el) music.el.muted = m;  // file:// direct mode bypasses master
    return muted;
  }
  const toggleMute = () => setMuted(!muted);
  const isMuted = () => muted;

  return {
    uiClick, uiHover, uiToggle, denied,
    deploy, recall, harvest, drillBoost, upgrade, forge, refine,
    enemyHit, enemyDown, milestone, boost,
    toggleMute, setMuted, isMuted, ensure,
    startMusic, stopMusic, isMusicOn, setMusicVolume, pauseMusic, resumeMusic,
  };
})();

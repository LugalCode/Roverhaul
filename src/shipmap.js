/* ROVERHAUL — Ship Cross-Section deck map.
 * Renders a two-deck industrial cross-section that acts as the landing view of
 * the SHIP UTILITIES screen. Clicking a lit compartment opens that facility's
 * panel (delegated to window.enterDeckRoom, defined in ui.js).
 *
 * Self-contained: own rAF loop that only paints while the canvas is on-screen.
 * Resolution-independent (layout is computed from canvas size each frame), so it
 * just needs the backing store sized to the element. Art is vector placeholder —
 * swap individual room `machines()` cases for sprites later without touching logic.
 */
(function () {
  const SM = window.ShipMap = {};
  // Multiple mount points (the full deck map on the Ship Utilities page + a compact shortcut "pill" in the
  // wasteland footer) share one renderer. `bind(inst)` points the module render context at an instance.
  let g, W = 1, H = 1, hot = null, sel = null, t = 0, tutKey = null; const instances = [];

  // facility rooms → target. Most open a base panel (`panel`); DEPLOYMENT BAY uses panel:'FIELD',
  // which ui.js' enterDeckRoom routes to the live wasteland/deploy view instead of a panel.
  const ROOMS = {
    bridge:   { name: 'COMMAND BRIDGE', panel: 'pob', icon: '🎯', glow: '#7fd4ff' },
    research: { name: 'RESEARCH LAB',   panel: 'ptr', icon: '🧬', glow: '#74e0b0' },
    archive:  { name: 'ARCHIVES',       panel: 'par', icon: '📖', glow: '#b58cff' },
    eng:      { name: 'ENGINEERING',    panel: 'pdv', icon: '⚙️', glow: '#9fe34b' },
    deploy:   { name: 'DEPLOYMENT BAY', panel: 'FIELD', icon: '🚀', glow: '#9bd14a' },
    hangar:   { name: 'ROVER HANGAR',   panel: 'ph',  icon: '🛠', glow: '#cf6a2a' },
    cargo:    { name: 'CARGO HOLD',     panel: 'pca', icon: '📦', glow: '#d9b25a' },
    refinery: { name: 'REFINERY',       panel: 'prf', icon: '🔩', glow: '#e0913a' },
    forge:    { name: 'ALLOY FORGE',    panel: 'paf', icon: '⚗️', glow: '#ff7a2a' },
  };
  // two-deck layout: [key, col, deck, widthMul]. cols span ~5.3; decks 0(upper)/1(lower).
  // Lower deck = the working "guts": the DEPLOYMENT BAY (rover launches to the surface) sits at the
  // front-lower next to the hangar where the rover is serviced.
  const LAYOUT = [
    ['bridge', 0, 0, 1.0],
    ['research', 1.05, 0, 1.05], ['archive', 2.1, 0, 1.05], ['eng', 3.15, 0, 1.05],
    ['deploy', 0, 1, 1.0], ['hangar', 1.05, 1, 1.0], ['cargo', 2.1, 1, 1.0], ['refinery', 3.15, 1, 1.0], ['forge', 4.2, 1, 1.0],
  ];

  let rects = [];   // computed clickable {key, x, y, w, h}

  // ── helpers ──
  function hex(h) { const c = h.replace('#', ''); const n = parseInt(c.length === 3 ? c.split('').map(x => x + x).join('') : c, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hexA(h, a) { const p = hex(h); return `rgba(${p[0]},${p[1]},${p[2]},${a})`; }
  function mix(a, b, k) { const pa = hex(a), pb = hex(b); return `rgb(${Math.round(pa[0] + (pb[0] - pa[0]) * k)},${Math.round(pa[1] + (pb[1] - pa[1]) * k)},${Math.round(pa[2] + (pb[2] - pa[2]) * k)})`; }
  function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  function hullPath(x, y, w, h) {
    const p = new Path2D();
    p.moveTo(x + w * 0.015, y + h * 0.42);
    p.lineTo(x + w * 0.09, y + h * 0.17);
    p.lineTo(x + w * 0.29, y + h * 0.06);
    p.lineTo(x + w * 0.85, y + h * 0.04);
    p.lineTo(x + w * 0.95, y + h * 0.12);
    p.lineTo(x + w * 0.986, y + h * 0.30);
    p.lineTo(x + w * 1.00, y + h * 0.55);
    p.lineTo(x + w * 0.97, y + h * 0.80);
    p.lineTo(x + w * 0.80, y + h * 0.95);
    p.lineTo(x + w * 0.22, y + h * 0.97);
    p.lineTo(x + w * 0.08, y + h * 0.83);
    p.lineTo(x + w * 0.00, y + h * 0.58);
    p.closePath();
    return p;
  }

  function compute() {
    rects = [];
    const HX = W * 0.045, HY = H * 0.13, HW = W * 0.91, HH = H * 0.66;
    const inx = HX + HW * 0.085, inw = HW * 0.86;
    const cols = 5.3, cellW = inw / cols;
    const iny = HY + HH * 0.20, inh = HH * 0.60, deckH = inh / 2;
    for (const r of LAYOUT) {
      const key = r[0], col = r[1], deck = r[2], wMul = r[3] || 1;
      const x = inx + col * cellW, w = cellW * wMul - cellW * 0.06;
      const y = iny + deck * deckH, h = deckH - deckH * 0.10;
      rects.push({ key, x, y, w, h });
    }
    return { HX, HY, HW, HH };
  }

  function machines(key, x, y, w, h, col) {
    if (key === 'deploy') {
      // open DROP-HATCH in the floor with surface light spilling up + the rover poised on launch rails
      const hx = x + w * 0.5, hy = y + h * 0.76;
      const rg = g.createRadialGradient(hx, hy, 2, hx, hy, w * 0.42);
      rg.addColorStop(0, 'rgba(150,190,110,.5)'); rg.addColorStop(1, 'rgba(120,160,90,0)');
      g.fillStyle = rg; g.fillRect(x, y + h * 0.42, w, h * 0.58);
      g.fillStyle = '#0a0d07'; g.beginPath(); g.ellipse(hx, hy, w * 0.33, h * 0.12, 0, 0, 7); g.fill();            // hatch void
      g.fillStyle = 'rgba(170,205,125,.4)'; g.beginPath(); g.ellipse(hx, hy, w * 0.26, h * 0.085, 0, 0, 7); g.fill(); // light below
      g.strokeStyle = '#3a4030'; g.lineWidth = 2;                                                                  // launch rails converging into the hatch
      g.beginPath(); g.moveTo(x + w * 0.24, y + h * 0.48); g.lineTo(hx - w * 0.13, hy); g.moveTo(x + w * 0.76, y + h * 0.48); g.lineTo(hx + w * 0.13, hy); g.stroke();
      g.fillStyle = '#3a4030'; g.fillRect(hx - w * 0.18, y + h * 0.47, w * 0.36, h * 0.16);                        // rover body on the rails
      g.fillStyle = '#9bd14a'; g.fillRect(hx - w * 0.045, y + h * 0.43, w * 0.09, h * 0.06);                       // rover core light
      g.fillStyle = '#15170f'; g.fillRect(hx - w * 0.14, y + h * 0.61, w * 0.06, h * 0.05); g.fillRect(hx + w * 0.08, y + h * 0.61, w * 0.06, h * 0.05);
      g.fillStyle = '#caa033'; for (let i = 0; i < 3; i++) { g.fillRect(x + w * (0.1 + i * 0.05), y + h * 0.62, w * 0.025, h * 0.14); g.fillRect(x + w * (0.875 - i * 0.05), y + h * 0.62, w * 0.025, h * 0.14); }  // hazard chevrons
    } else if (key === 'forge') {
      const cx = x + w * 0.5, cy = y + h * 0.62, rg = g.createRadialGradient(cx, cy, 2, cx, cy, w * 0.42);
      rg.addColorStop(0, 'rgba(255,150,50,.9)'); rg.addColorStop(1, 'rgba(255,120,30,0)'); g.fillStyle = rg; g.fillRect(x, y, w, h);
      g.fillStyle = '#1a140c'; g.fillRect(x + w * 0.36, y + h * 0.5, w * 0.28, h * 0.45); g.fillRect(x + w * 0.34, y + h * 0.2, w * 0.06, h * 0.6);
      g.fillStyle = 'rgba(255,180,90,.8)'; g.fillRect(x + w * 0.42, y + h * 0.66, w * 0.16, h * 0.12);
    } else if (key === 'hangar') {
      g.fillStyle = '#0c0e08'; g.fillRect(x + w * 0.08, y + h * 0.55, w * 0.84, h * 0.4);
      // docked rover
      g.fillStyle = '#3a4030'; g.fillRect(x + w * 0.30, y + h * 0.66, w * 0.40, h * 0.22);
      g.fillStyle = '#9bd14a'; g.fillRect(x + w * 0.46, y + h * 0.60, w * 0.08, h * 0.07);
      g.fillStyle = '#15170f'; g.fillRect(x + w * 0.33, y + h * 0.86, w * 0.07, h * 0.07); g.fillRect(x + w * 0.60, y + h * 0.86, w * 0.07, h * 0.07);
      g.strokeStyle = '#23281b'; g.lineWidth = 3; for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(x + w * i / 5, y + h * 0.55); g.lineTo(x + w * i / 5, y + h * 0.95); g.stroke(); }
    } else if (key === 'cargo') {
      g.fillStyle = '#2c2a1c'; for (let i = 0; i < 4; i++) g.fillRect(x + w * (0.12 + i * 0.2), y + h * (0.55 + (i % 2) * 0.12), w * 0.15, h * 0.36);
    } else if (key === 'refinery') {
      g.fillStyle = '#262a1d'; g.fillRect(x + w * 0.18, y + h * 0.45, w * 0.14, h * 0.5); g.fillRect(x + w * 0.40, y + h * 0.35, w * 0.14, h * 0.6); g.fillRect(x + w * 0.62, y + h * 0.5, w * 0.14, h * 0.45);
      g.strokeStyle = '#34301f'; g.lineWidth = 4; g.beginPath(); g.moveTo(x + w * 0.18, y + h * 0.55); g.lineTo(x + w * 0.8, y + h * 0.55); g.stroke();
    } else if (key === 'research') {
      g.fillStyle = '#142420'; g.fillRect(x + w * 0.12, y + h * 0.5, w * 0.76, h * 0.42);
      g.fillStyle = col; for (let i = 0; i < 3; i++) g.fillRect(x + w * (0.2 + i * 0.22), y + h * 0.56, w * 0.12, h * 0.1);
    } else if (key === 'archive') {
      g.fillStyle = '#221a30'; for (let i = 0; i < 5; i++) g.fillRect(x + w * (0.12 + i * 0.16), y + h * 0.5, w * 0.10, h * 0.44);
    } else if (key === 'bridge') {
      g.fillStyle = '#10202a'; g.fillRect(x + w * 0.15, y + h * 0.46, w * 0.7, h * 0.14);
      g.fillStyle = '#1a242c'; g.fillRect(x + w * 0.38, y + h * 0.6, w * 0.24, h * 0.32);
      g.fillStyle = hexA(col, 0.8); g.fillRect(x + w * 0.2, y + h * 0.3, w * 0.6, h * 0.05);   // viewport strip
    } else if (key === 'eng') {
      const cx = x + w * 0.5, cy = y + h * 0.6, rg = g.createRadialGradient(cx, cy, 2, cx, cy, w * 0.38);
      rg.addColorStop(0, 'rgba(160,230,75,.8)'); rg.addColorStop(1, 'rgba(120,200,60,0)'); g.fillStyle = rg; g.fillRect(x, y, w, h);
      g.fillStyle = '#16200c'; g.fillRect(x + w * 0.38, y + h * 0.5, w * 0.24, h * 0.42);
    }
  }

  // extra exterior detail — antennae, dorsal greebles, running lights, engine glow, docking arm
  function exterior(HX, HY, HW, HH, hp) {
    g.save(); g.clip(hp);
    // plating seams
    g.strokeStyle = 'rgba(0,0,0,.32)'; g.lineWidth = 1.5;
    for (let i = 0; i < 24; i++) { g.beginPath(); g.moveTo(HX + HW * i / 24, HY); g.lineTo(HX + HW * i / 24, HY + HH); g.stroke(); }
    // dorsal spine block + greebles
    g.fillStyle = '#23271a'; g.fillRect(HX + HW * 0.28, HY + HH * 0.015, HW * 0.52, HH * 0.05);
    g.fillStyle = '#2a2f20'; for (let i = 0; i < 12; i++) g.fillRect(HX + HW * (0.30 + i * 0.04), HY, HW * 0.018, HH * 0.03);
    // belly sensor pods
    g.fillStyle = '#1a1d13'; for (let i = 0; i < 6; i++) g.fillRect(HX + HW * (0.30 + i * 0.08), HY + HH * 0.92, HW * 0.03, HH * 0.05);
    // engine bell glow (stern, right)
    const ex = HX + HW * 0.985, ey = HY + HH * 0.55, eg = g.createRadialGradient(ex, ey, 2, ex, ey, HW * 0.10);
    eg.addColorStop(0, 'rgba(120,200,255,.5)'); eg.addColorStop(1, 'rgba(80,140,220,0)'); g.fillStyle = eg; g.fillRect(HX + HW * 0.8, HY + HH * 0.3, HW * 0.25, HH * 0.5);
    g.restore();
    // hull rim light
    g.strokeStyle = 'rgba(190,210,150,.16)'; g.lineWidth = 2.5; g.stroke(hp);
    // antennae / mast (above bow)
    g.strokeStyle = 'rgba(150,165,120,.5)'; g.lineWidth = 2;
    const mx = HX + HW * 0.40, my = HY + HH * 0.04;
    g.beginPath(); g.moveTo(mx, my); g.lineTo(mx - HW * 0.01, my - HH * 0.12); g.stroke();
    g.beginPath(); g.moveTo(HX + HW * 0.55, HY + HH * 0.04); g.lineTo(HX + HW * 0.57, HY + HH * 0.04 - HH * 0.09); g.stroke();
    // blinking running lights along the keel
    for (let i = 0; i < 9; i++) {
      const lx = HX + HW * (0.18 + i * 0.075), ly = HY + HH * 0.965;
      const on = (Math.sin(t * 2 + i) > 0.4);
      g.fillStyle = on ? 'rgba(255,120,80,.9)' : 'rgba(120,50,40,.5)';
      g.beginPath(); g.arc(lx, ly, Math.max(1.4, HW * 0.0022), 0, 7); g.fill();
    }
    // docking arm / gantry at the hangar (lower-left)
    g.strokeStyle = 'rgba(90,100,70,.6)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(HX + HW * 0.16, HY + HH * 0.62); g.lineTo(HX + HW * 0.06, HY + HH * 0.78); g.stroke();
  }

  function draw() {
    g.clearRect(0, 0, W, H);
    const { HX, HY, HW, HH } = compute();
    const hp = hullPath(HX, HY, HW, HH);

    // soft reflection under the keel
    g.save(); g.globalAlpha = 0.10; g.translate(0, (HY + HH) * 2 - HH * 0.04); g.scale(1, -1); g.fillStyle = '#0d0f0a'; g.fill(hullPath(HX, HY, HW, HH)); g.restore();

    // hull body
    const hg = g.createLinearGradient(0, HY, 0, HY + HH);
    hg.addColorStop(0, '#1c1f16'); hg.addColorStop(0.5, '#15180f'); hg.addColorStop(1, '#0c0e08');
    g.fillStyle = hg; g.fill(hp);
    exterior(HX, HY, HW, HH, hp);

    // rooms
    for (const r of rects) {
      const info = ROOMS[r.key], active = (sel === r.key) || (hot === r.key);
      g.save(); rr(r.x, r.y, r.w, r.h, 9); g.clip();
      const lit = active ? 1 : 0.6, gl = info.glow, cx = r.x + r.w * 0.5, cy = r.y + r.h * 0.45;
      g.fillStyle = '#0c0e08'; g.fillRect(r.x, r.y, r.w, r.h);
      const wg = g.createRadialGradient(cx, cy, 4, cx, cy, r.w * 0.8);
      wg.addColorStop(0, hexA(gl, 0.5 * lit)); wg.addColorStop(0.5, hexA(mix(gl, '#3a3526', 0.6), 0.45 * lit)); wg.addColorStop(1, hexA('#0d0f08', 0.95));
      g.fillStyle = wg; g.fillRect(r.x, r.y, r.w, r.h);
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(r.x, r.y + r.h * 0.86, r.w, r.h * 0.14);
      machines(r.key, r.x, r.y, r.w, r.h, gl);
      g.strokeStyle = 'rgba(10,12,8,.8)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(r.x, r.y + r.h * 0.5); g.lineTo(r.x + r.w, r.y + r.h * 0.5); g.stroke();
      g.beginPath(); g.moveTo(r.x + r.w * 0.5, r.y); g.lineTo(r.x + r.w * 0.5, r.y + r.h); g.stroke();
      g.restore();

      g.strokeStyle = active ? hexA(info.glow, 0.95) : 'rgba(70,78,55,.5)'; g.lineWidth = active ? 4 : 2;
      rr(r.x, r.y, r.w, r.h, 9); g.stroke();
      if (active) { g.shadowBlur = 20; g.shadowColor = info.glow; rr(r.x, r.y, r.w, r.h, 9); g.stroke(); g.shadowBlur = 0; }

      // tutorial highlight — pulse the compartment the onboarding funnel wants the player to enter.
      // Uses the main-UI tutorial GREEN at full strength so it reads the same as every other tut cue.
      if (r.key === tutKey && !active) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 4), TG = '#5fcf6b';
        g.save();
        g.fillStyle = hexA(TG, 0.10 + 0.14 * pulse); rr(r.x, r.y, r.w, r.h, 9); g.fill();   // green wash
        g.strokeStyle = hexA(TG, 0.7 + 0.3 * pulse); g.lineWidth = 4 + 1.5 * pulse;
        g.shadowBlur = 16 + 26 * pulse; g.shadowColor = TG; rr(r.x, r.y, r.w, r.h, 9); g.stroke();
        g.stroke();   // second pass to deepen the glow (matches the DOM pulse weight)
        g.shadowBlur = 0; g.restore();
      }

      g.fillStyle = active ? '#eef4e0' : 'rgba(205,214,191,.72)'; g.textAlign = 'center';
      g.font = `${Math.max(11, Math.min(r.h * 0.18, r.w * 0.2))}px 'Share Tech Mono',monospace`;
      g.fillText(info.icon, cx, r.y + r.h * 0.30);
      // name — shrink to fit the room width so labels never collide
      let fs = Math.max(8, Math.min(r.h * 0.13, r.w * 0.12));
      g.font = `bold ${fs}px 'Share Tech Mono',monospace`;
      while (fs > 6 && g.measureText(info.name).width > r.w * 0.9) { fs -= 0.5; g.font = `bold ${fs}px 'Share Tech Mono',monospace`; }
      g.fillText(info.name, cx, r.y + r.h * 0.46);
    }
    g.textAlign = 'left';
  }

  // ── interaction ──
  function atEvent(inst, e) {
    const b = inst.cv.getBoundingClientRect();
    const x = (e.clientX - b.left) * (inst.W / b.width), y = (e.clientY - b.top) * (inst.H / b.height);
    for (const r of inst.rects) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.key;
    return null;
  }

  function bind(inst) { g = inst.g; W = inst.W; H = inst.H; hot = inst.hot; sel = inst.sel; }
  function defaultPick(room) { if (typeof window.enterDeckRoom === 'function') window.enterDeckRoom(room.panel); }
  // Mount the cross-section onto a canvas. opts: { label:bool (drives #deckmap-label), onPick:fn(room), onBlank:fn() }
  function mount(canvasId, opts) {
    const cv = document.getElementById(canvasId); if (!cv) return null;
    opts = opts || {};
    const inst = { cv, g: cv.getContext('2d'), W: 1, H: 1, hot: null, sel: null, rects: [], opts };
    const resize = () => { const b = cv.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1); inst.W = cv.width = Math.max(2, Math.round(b.width * dpr)); inst.H = cv.height = Math.max(2, Math.round(b.height * dpr)); };
    resize(); window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(cv);
    cv.addEventListener('mousemove', e => { inst.hot = atEvent(inst, e); cv.style.cursor = inst.hot ? 'pointer' : 'default'; if (opts.label) updateLabel(inst.hot || inst.sel); });
    cv.addEventListener('mouseleave', () => { inst.hot = null; if (opts.label) updateLabel(inst.sel); });
    cv.addEventListener('click', e => { const k = atEvent(inst, e); if (!k) { if (opts.onBlank) opts.onBlank(); return; } inst.sel = k; (opts.onPick || defaultPick)(ROOMS[k]); });
    instances.push(inst);
    return inst;
  }
  SM.mount = mount;
  SM.init = function () { mount('deckmap-canvas', { label: true }); };
  SM.rooms = ROOMS;
  function updateLabel(k) { const el = document.getElementById('deckmap-label'); if (!el) return;
    el.textContent = k ? `${ROOMS[k].icon}  ${ROOMS[k].name}  —  ENTER` : 'SELECT A COMPARTMENT'; }
  SM.setSel = k => { if (instances[0]) instances[0].sel = k; updateLabel(k); };
  // Tutorial highlight: pulse the compartment for a given facility. Accepts a room key
  // ('refinery') OR a base-panel id ('prf'); pass null/falsy to clear.
  SM.setTut = idOrKey => {
    if (!idOrKey) { tutKey = null; return; }
    tutKey = ROOMS[idOrKey] ? idOrKey : (Object.keys(ROOMS).find(k => ROOMS[k].panel === idOrKey) || null);
  };
  // one render loop drives every mounted, on-screen canvas (offscreen ones are skipped)
  (function loop() {
    t += 0.016;
    for (const inst of instances) if (inst.cv.offsetParent !== null) { bind(inst); draw(); inst.rects = rects; }
    requestAnimationFrame(loop);
  })();
  SM._draw = () => { const inst = instances[0]; if (inst) { bind(inst); draw(); inst.rects = rects; } };   // offline-capture hook

  if (document.readyState !== 'loading') SM.init(); else document.addEventListener('DOMContentLoaded', SM.init);
})();

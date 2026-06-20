// ============================================================
//  scenes/colossus.js — BIOME 5 "THE COLOSSUS" (orbit scene)
//  Split out of iso.js. Registers ISO.scenes.colossus(scv) and reads ISO.rc (the shared render context:
//  live G/W/H/it/gY + stable helpers, synced by iso.js just before dispatch). Load AFTER iso.js.
//
//  The catwalk ring is a CIRCULAR BRIDGE over a vast central VOID; a biomech TITAN rises from the silo — head
//  above the catwalk, body fading down into the void, an amber CHEST FURNACE it draws energy into via wires that
//  plug into its shoulders and sweep out to the catwalk ring. The whole room ROTATES by theta = scv·B5.rot
//  (travel-driven → STOPS while drilling): floor spokes, the curved back wall, the titan's yaw and the wires all
//  turn in UNISON. The real ISO rover rides the front of the catwalk.
//  Knobs: ISO.B5 = { rot, zoom, head, tilt (ring flatness), hole (void size), cy (camera height), rover, roverRot }.
// ============================================================
(function () {
  const ISO = window.ISO; if (!ISO || !ISO.rc) return;
  const rc = ISO.rc;
  const B5 = ISO.B5 = { rot: -0.045, zoom: 1.0, head: 2.6, tilt: 1.0, hole: 0.62, cy: 0.52, rover: 1.0 };

  ISO.scenes.colossus = function (scv) {
    const G = rc.G, W = rc.W, H = rc.H, it = rc.it, ell = rc.ell, lineS = rc.lineS, hash = rc.hash;
    const Z = B5.zoom, cx = W * 0.5, cyc = H * B5.cy, RX = W * 0.64 * Z, RY = H * 0.32 * B5.tilt * Z;
    const VRX = RX * B5.hole, VRY = RY * B5.hole;                                   // the central void (catwalk inner edge)
    const theta = scv * B5.rot, pulse = 0.5 + 0.5 * Math.sin(it * 0.5), HS = B5.head;
    const grn = (x, y, r, a) => { const g = G.createRadialGradient(x, y, 1, x, y, r); g.addColorStop(0, 'rgba(120,255,175,' + a + ')'); g.addColorStop(0.5, 'rgba(70,210,130,' + (a * 0.4) + ')'); g.addColorStop(1, 'rgba(40,160,95,0)'); G.fillStyle = g; G.fillRect(x - r, y - r, r * 2, r * 2); };
    // AMBER core-energy accent (the corestuff glow) — a warm counter-colour so things read against the green murk
    const amb = (x, y, r, a) => { const g = G.createRadialGradient(x, y, 1, x, y, r); g.addColorStop(0, 'rgba(255,196,96,' + a + ')'); g.addColorStop(0.5, 'rgba(230,130,50,' + (a * 0.45) + ')'); g.addColorStop(1, 'rgba(150,70,20,0)'); G.fillStyle = g; G.fillRect(x - r, y - r, r * 2, r * 2); };
    const rimY = x => { const t = (x - cx) / RX; return Math.abs(t) < 1 ? cyc - RY * Math.sqrt(1 - t * t) : cyc; };   // far rim curve (wall stands here)

    G.fillStyle = '#060a09'; G.fillRect(0, 0, W, H);

    // ── CURVED BACK WALL — circular chamber wall standing on the floor's far rim; scrolls with the orbit ──
    G.save();
    G.beginPath(); G.moveTo(0, 0); G.lineTo(W, 0); G.lineTo(W, rimY(W));
    for (let x = W; x >= 0; x -= 12) G.lineTo(x, rimY(x)); G.closePath();
    const wl = G.createLinearGradient(0, 0, 0, cyc); wl.addColorStop(0, '#0d1310'); wl.addColorStop(0.55, '#19241d'); wl.addColorStop(1, '#27352c');
    G.fillStyle = wl; G.fill(); G.clip();
    G.save(); G.globalCompositeOperation = 'lighter';                                                            // soft green ambient wash lifts the wall out of pure black
    const wash = G.createLinearGradient(0, 0, 0, cyc); wash.addColorStop(0, 'rgba(40,120,80,0.05)'); wash.addColorStop(1, 'rgba(50,150,95,0.12)'); G.fillStyle = wash; G.fillRect(0, 0, W, cyc); G.restore();
    const Nw = 34;                                                                                               // vertical bevel seams by WORLD ANGLE (slide + compress at the grazing edges)
    for (let k = 0; k < Nw; k++) { const a = k * 6.283 / Nw - theta; if (Math.sin(a) >= 0) continue;
      const x = cx + RX * Math.cos(a), yb = rimY(x), edge = -Math.sin(a);
      lineS({ x: x, y: 0 }, { x: x, y: yb }, 1.6, '#070b09'); lineS({ x: x + 1.4, y: 0 }, { x: x + 1.4, y: yb }, 1, 'rgba(150,180,160,' + (0.03 + 0.05 * edge) + ')'); }
    for (const k of [34, 80, 138, 200]) { G.beginPath(); for (let x = 0; x <= W; x += 12) { const y = rimY(x) - k; x === 0 ? G.moveTo(x, y) : G.lineTo(x, y); }   // curved structural bands
      G.strokeStyle = '#0c110f'; G.lineWidth = 5; G.stroke();
      G.beginPath(); for (let x = 0; x <= W; x += 12) { const y = rimY(x) - k - 3; x === 0 ? G.moveTo(x, y) : G.lineTo(x, y); } G.strokeStyle = 'rgba(44,58,48,0.5)'; G.lineWidth = 1.4; G.stroke(); }
    const Nr = 7;                                                                                                // green-lit recesses, orbiting (dim toward the edges)
    for (let k = 0; k < Nr; k++) { const a = k * 6.283 / Nr + 0.6 - theta, edge = -Math.sin(a); if (edge <= 0.18) continue;
      const x = cx + RX * Math.cos(a), yb = rimY(x), rh = Math.min(yb * 0.62, 150), rw = 30 * edge + 8, ry = yb - 14 - rh / 2;
      G.fillStyle = '#060908'; G.fillRect(x - rw / 2, ry - rh / 2, rw, rh);
      G.strokeStyle = '#1b231e'; G.lineWidth = 2; G.strokeRect(x - rw / 2, ry - rh / 2, rw, rh);
      const gp = 0.5 + 0.5 * Math.sin(it * 1.1 + k * 2); grn(x, ry, 50 * edge, (0.16 + 0.14 * gp) * edge);
      G.globalAlpha = (0.55 + 0.4 * gp) * edge; G.fillStyle = '#7dffb5'; G.fillRect(x - 3 * edge, ry - rh * 0.34, 6 * edge, rh * 0.68); G.globalAlpha = 1; }
    // GREEBLE plates + amber indicator lights bolted to the wall (orbiting; adds machined clutter)
    for (let k = 0; k < 20; k++) { const a = k * 0.3316 + 0.2 - theta, edge = -Math.sin(a); if (edge <= 0.14) continue;
      const x = cx + RX * Math.cos(a), yb = rimY(x), gy = yb - 16 - hash(k) * yb * 0.5;
      G.fillStyle = '#0b0f0c'; G.fillRect(x - 5 * edge, gy, 10 * edge, 6 + 7 * hash(k + 2));
      G.fillStyle = 'rgba(120,150,120,0.08)'; G.fillRect(x - 5 * edge, gy, 10 * edge, 1.4);
      if (hash(k + 5) > 0.55) { const bl = 0.4 + 0.6 * Math.abs(Math.sin(it * 2.2 + k * 1.7)); G.save(); G.globalCompositeOperation = 'lighter'; ell(x, gy + 4, 2.6 * edge, 1.7, 'rgba(255,188,88,' + (0.3 + 0.45 * bl) * edge + ')'); G.restore(); } }
    // bright pulsing ENERGY CONDUITS running up the wall (a few; orbiting) — make the chamber feel powered
    G.save(); G.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 4; k++) { const a = k * 1.571 + 0.3 - theta, edge = -Math.sin(a); if (edge <= 0.25) continue;
      const x = cx + RX * Math.cos(a), yb = rimY(x), gp = 0.45 + 0.55 * Math.sin(it * 1.6 + k * 1.7);
      const cg = G.createLinearGradient(x, 0, x, yb); cg.addColorStop(0, 'rgba(60,200,120,0)'); cg.addColorStop(1, 'rgba(150,255,190,' + (0.10 + 0.22 * gp) * edge + ')');
      G.strokeStyle = cg; G.lineWidth = 2.4; G.beginPath(); G.moveTo(x, 0); G.lineTo(x, yb); G.stroke(); }
    G.restore();
    // ARC LIGHTS crawling horizontally along the wall bands (pulsing energy travelling the chamber)
    G.save(); G.globalCompositeOperation = 'lighter';
    for (let m = 0; m < 4; m++) { const band = [30, 80, 138, 200][m], sp = (m % 2 ? -1 : 1) * (42 + m * 14), span = W + 200, xc = (((it * sp + m * 337) % span) + span) % span - 100, y = rimY(xc) - band, gp = 0.5 + 0.5 * Math.sin(it * 3 + m);
      ell(xc, y, 30, 4, 'rgba(120,255,180,' + (0.10 + 0.12 * gp) + ')'); ell(xc, y, 9, 2, 'rgba(200,255,225,' + (0.30 + 0.20 * gp) + ')'); }
    G.restore();
    G.restore();
    // base trim hugging the curved rim + green energy bleed up off the floor
    G.beginPath(); for (let x = 0; x <= W; x += 8) { const y = rimY(x); x === 0 ? G.moveTo(x, y) : G.lineTo(x, y); } G.strokeStyle = '#040605'; G.lineWidth = 4; G.stroke();
    G.save(); G.globalCompositeOperation = 'lighter'; G.beginPath(); for (let x = 0; x <= W; x += 8) { const y = rimY(x) - 3; x === 0 ? G.moveTo(x, y) : G.lineTo(x, y); }
    G.strokeStyle = 'rgba(60,180,110,' + (0.10 + 0.06 * pulse) + ')'; G.lineWidth = 6; G.stroke(); G.restore();

    // ── HANGING CABLES / chains from the ceiling — anchored to WORLD ANGLES on the far wall (orbit with the room) ──
    G.lineCap = 'round';
    const NHC = 12;
    for (let k = 0; k < NHC; k++) { const a = k / NHC * 6.283 - theta, edge = -Math.sin(a); if (edge <= 0.12) continue;   // far half only
      const hx = cx + RX * Math.cos(a), len = (rimY(hx) - 16) * (0.5 + 0.5 * hash(k * 3)), sway = Math.sin(it * 0.5 + k * 1.3) * 8 * edge, lw = (1.8 + hash(k) * 2.2) * (0.5 + 0.5 * edge);
      G.strokeStyle = '#0c100d'; G.lineWidth = lw; G.beginPath(); G.moveTo(hx, 0); G.quadraticCurveTo(hx + sway, len * 0.6, hx + sway * 1.4, len); G.stroke();
      if (hash(k + 9) > 0.5) { const gp = 0.4 + 0.6 * Math.abs(Math.sin(it * 1.4 + k)); G.save(); G.globalCompositeOperation = 'lighter'; ell(hx + sway * 1.4, len, 2.2 * edge, 2.2 * edge, 'rgba(150,255,190,' + (0.3 + 0.4 * gp) * edge + ')'); G.restore(); } }
    G.lineCap = 'butt';

    // ── FLOOR (catwalk + outer plating) — clipped to the disc; rings + rotating spokes + bands + grime ──
    G.save(); G.beginPath(); G.ellipse(cx, cyc, RX, RY, 0, 0, 7); G.clip();
    const fl = G.createLinearGradient(0, cyc - RY, 0, cyc + RY); fl.addColorStop(0, '#0c100e'); fl.addColorStop(0.5, '#121810'); fl.addColorStop(1, '#090c0a'); G.fillStyle = fl; G.fillRect(0, cyc - RY, W, RY * 2);
    for (let a = 0; a < 360; a += 9) { const al = (a - theta * 57.3) * Math.PI / 180, c = Math.cos(al), s = Math.sin(al), o = { x: cx + c * RX, y: cyc + s * RY }, i = { x: cx + c * VRX, y: cyc + s * VRY };   // spokes span catwalk only (rim → void)
      const glow = (((Math.floor((a - theta * 57.3) / 45) % 2) + 2) % 2 === 0); lineS(i, o, glow ? 1.8 : 1, glow ? 'rgba(80,230,140,0.20)' : 'rgba(110,150,130,0.08)'); }
    const bands = [1.02, 0.92, 0.82, 0.72];                                                                      // outer plating + the catwalk lane
    for (const f of bands) { G.strokeStyle = f === 0.82 ? 'rgba(90,220,140,0.24)' : 'rgba(130,170,150,0.14)'; G.lineWidth = f === 0.82 ? 2.6 : 1.2; G.beginPath(); G.ellipse(cx, cyc, RX * f, RY * f, 0, 0, 7); G.stroke(); }
    for (let i = 0; i < 34; i++) { const al = hash(i) * 6.28 - theta, rr = (B5.hole + 0.04) + (0.96 - B5.hole) * hash(i + 7), gx = cx + Math.cos(al) * RX * rr, gy = cyc + Math.sin(al) * RY * rr;   // grime on the catwalk
      G.globalAlpha = 0.12 + 0.12 * hash(i + 3); ell(gx, gy, (8 + 16 * hash(i)) * Z, (3 + 6 * hash(i)) * Z, '#070a08'); G.globalAlpha = 1; }
    // GREEBLE plates / access panels bolted along the catwalk (orbiting with the ring)
    for (let k = 0; k < 22; k++) { const a = k * 0.2856 - theta, dx = Math.cos(a), dy = Math.sin(a), rr = B5.hole + 0.06 + (0.9 - B5.hole) * ((k * 7 % 5) / 5);
      const gx = cx + dx * RX * rr, gy = cyc + dy * RY * rr; if (gy < rimY(gx)) continue; const sc2 = (0.5 + 0.6 * (dy * 0.5 + 0.5)) * Z;
      G.fillStyle = '#0d120d'; G.fillRect(gx - 7 * sc2, gy - 3 * sc2, 14 * sc2, 6 * sc2);
      G.fillStyle = 'rgba(120,145,110,0.10)'; G.fillRect(gx - 7 * sc2, gy - 3 * sc2, 14 * sc2, 1.4 * sc2);
      if ((k % 4) === 0) { G.save(); G.globalCompositeOperation = 'lighter'; ell(gx + 5 * sc2, gy, 2 * sc2, 1.4 * sc2, 'rgba(255,200,110,0.55)'); G.restore(); } }
    G.restore();
    // amber RUNNING LIGHTS ringing the catwalk edge — defines the bridge + a warm accent against the green
    G.save(); G.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 30; k++) { const a = k / 30 * 6.283 - theta, lx = cx + Math.cos(a) * RX * 0.98, ly = cyc + Math.sin(a) * RY * 0.98; if (ly < rimY(lx)) continue;
      const d = Math.sin(a) * 0.5 + 0.5, bl = 0.35 + 0.65 * d; amb(lx, ly, 6 * Z * bl, (0.08 + 0.16 * bl)); ell(lx, ly, 1.4 * Z, 1.0 * Z, 'rgba(255,214,150,' + (0.45 * bl) + ')'); }
    G.restore();

    // ── THE VOID — vast central pit the colossus sits in; energy light rises out of it ──
    G.fillStyle = '#000'; G.beginPath(); G.ellipse(cx, cyc, VRX, VRY, 0, 0, 7); G.fill();                       // solid dark void
    const vfill = G.createRadialGradient(cx, cyc - VRY * 0.2, 2, cx, cyc, VRX); vfill.addColorStop(0, '#000'); vfill.addColorStop(0.7, '#040705'); vfill.addColorStop(1, 'rgba(6,10,8,0)');
    G.fillStyle = vfill; G.beginPath(); G.ellipse(cx, cyc, VRX, VRY, 0, 0, 7); G.fill();
    G.save(); G.beginPath(); G.ellipse(cx, cyc, VRX, VRY, 0, 0, 7); G.clip(); G.globalCompositeOperation = 'lighter';   // colossus energy glowing up from the deep
    amb(cx, cyc + VRY * 0.55, VRX * 0.7, 0.16 + 0.10 * pulse);                                                   // AMBER core furnace far down (warm counter-colour)
    grn(cx, cyc + VRY * 0.15, VRX * 0.85, 0.10 + 0.08 * pulse); grn(cx, cyc + VRY * 0.5, VRX * 0.5, 0.05 + 0.04 * pulse); G.restore();

    // ── FIXTURES (green biomech shrines + resource nodes) on the catwalk lane, depth-sorted ──
    const shrineO = (x, y, s) => { grn(x, y - 16 * s, 46 * s, 0.4);
      G.fillStyle = '#181d1b'; G.beginPath(); G.moveTo(x - 12 * s, y + 4 * s); G.lineTo(x - 12 * s, y - 28 * s); G.lineTo(x, y - 42 * s); G.lineTo(x + 12 * s, y - 28 * s); G.lineTo(x + 12 * s, y + 4 * s); G.closePath(); G.fill();
      G.fillStyle = '#272f2b'; G.beginPath(); G.moveTo(x, y - 42 * s); G.lineTo(x + 12 * s, y - 28 * s); G.lineTo(x + 12 * s, y + 4 * s); G.lineTo(x + 4 * s, y + 2 * s); G.lineTo(x + 4 * s, y - 34 * s); G.closePath(); G.fill();
      for (let r = 0; r < 4; r++) lineS({ x: x - 12 * s, y: y - 6 * s - r * 9 * s }, { x: x + 12 * s, y: y - 6 * s - r * 9 * s }, 1, '#0e1110');
      const gp = 0.55 + 0.45 * Math.sin(it * 1.3 + x); G.globalAlpha = gp; G.fillStyle = '#8dffc0'; G.fillRect(x - 3 * s, y - 34 * s, 6 * s, 30 * s); G.globalAlpha = 1; };
    const nodeO = (x, y, s) => { grn(x, y, 22 * s, 0.45 + 0.25 * pulse);
      G.fillStyle = '#9dffce'; G.beginPath(); G.moveTo(x, y - 12 * s); G.lineTo(x + 6 * s, y - 2 * s); G.lineTo(x + 9 * s, y + 6 * s); G.lineTo(x, y + 10 * s); G.lineTo(x - 9 * s, y + 6 * s); G.lineTo(x - 6 * s, y - 2 * s); G.closePath(); G.fill();
      G.fillStyle = '#3a7a55'; G.beginPath(); G.moveTo(x, y - 12 * s); G.lineTo(x - 6 * s, y - 2 * s); G.lineTo(x - 9 * s, y + 6 * s); G.lineTo(x, y + 10 * s); G.closePath(); G.fill(); };
    const lane = (B5.hole + 1.0) / 2;                                                                            // mid-catwalk radius
    const fix = [];
    for (let i = 0; i < 6; i++) fix.push({ phi: i * 60, t: 'shrine' });
    for (let i = 0; i < 5; i++) fix.push({ phi: 30 + i * 72, t: 'node' });
    for (const f of fix) { const al = f.phi * Math.PI / 180 - theta; f.x = cx + Math.cos(al) * RX * lane; f.y = cyc + Math.sin(al) * RY * lane; f.s = (0.5 + 0.7 * (Math.sin(al) * 0.5 + 0.5)) * Z; }
    fix.sort((a, b) => a.y - b.y);
    const drawF = f => f.y > rimY(f.x) && (f.t === 'shrine' ? shrineO(f.x, f.y, f.s) : nodeO(f.x, f.y, f.s));
    for (const f of fix) if (f.y < cyc) drawF(f);   // behind the colossus

    // subtle catwalk inner rim (definition for the void edge)
    G.strokeStyle = 'rgba(120,200,150,' + (0.16 + 0.10 * pulse) + ')'; G.lineWidth = 2.2; G.beginPath(); G.ellipse(cx, cyc, VRX, VRY, 0, 0, 7); G.stroke();

    // ── THE TITAN metrics — shared by the wires (anchor on its shoulders) and the body ──
    const HX = cx, fc = Math.cos(theta), fsd = Math.sin(theta), sk = fsd * 10 * HS;     // sk = subtle body-yaw skew
    const TS = HS, HSH = HS * 0.82;                                                      // body scale / head scale
    const headCY = cyc - 44 * TS, shY = cyc - 12 * TS, shRX = 56 * TS, shRY = 15 * TS, torsoBot = cyc + VRY * 0.92;
    const fa = Math.max(0, fc), ba = Math.max(0, -fc);

    // ── THE RISE — wires plug into the titan's SHOULDER band and sweep out to the catwalk ring (on its iso ellipse);
    //    amber power pulses flow INWARD (the titan drawing energy in). Depth-sorted around the body. ──
    const NW = 40;
    const wire = i => { const a = i / NW * 6.283 - theta, dx = Math.cos(a), dy = Math.sin(a), lit = i % 4 === 0, dep = dy * 0.5 + 0.5;
      const bx = HX + dx * shRX + sk, by = shY + dy * shRY, ex = cx + dx * RX * lane, ey = cyc + dy * RY * lane;   // shoulder port → end ON the ring
      const mx = (bx + ex) / 2 + dx * 8 * HS, my = (by + ey) / 2 + (14 + 12 * hash(i)) * HS;                     // drape sag
      G.strokeStyle = lit ? '#474e41' : '#1e231c'; G.lineWidth = (lit ? 3.6 : 2.2) * HS * (0.55 + 0.45 * dep);
      G.beginPath(); G.moveTo(bx, by); G.quadraticCurveTo(mx, my, ex, ey); G.stroke();
      if (lit) { const t = (it * 0.35 + i * 0.27) % 1, q = 1 - t, px = q * q * ex + 2 * q * t * mx + t * t * bx, py = q * q * ey + 2 * q * t * my + t * t * by;   // INWARD: ring → shoulder
        G.save(); G.globalCompositeOperation = 'lighter'; amb(px, py, 6 * HS, 0.5 * (0.5 + 0.5 * dep)); G.restore(); } };
    G.lineCap = 'round';
    for (let i = 0; i < NW; i++) if (Math.sin(i / NW * 6.283 - theta) < 0) wire(i);   // FAR wires (behind the titan)
    G.lineCap = 'butt';

    // ── THE TITAN — a biomech colossus rising from the silo: head above the catwalk, body fading into the void ──
    grn(HX, cyc - 6 * TS, 220 * TS, 0.18 + 0.12 * pulse);
    // TORSO silhouette, tapering down into the dark
    G.fillStyle = '#14180f'; G.beginPath();
    G.moveTo(HX - 54 * TS + sk, shY); G.quadraticCurveTo(HX - 62 * TS + sk, shY + 46 * TS, HX - 30 * TS + sk * 0.4, torsoBot);
    G.lineTo(HX + 30 * TS + sk * 0.4, torsoBot); G.quadraticCurveTo(HX + 62 * TS + sk, shY + 46 * TS, HX + 54 * TS + sk, shY); G.closePath(); G.fill();
    // spine + vertebrae
    G.strokeStyle = '#0c0f0a'; G.lineWidth = 7 * TS; G.beginPath(); G.moveTo(HX + sk, shY); G.lineTo(HX + sk * 0.3, torsoBot); G.stroke();
    for (let v = 0; v < 7; v++) { const vy = shY + (v + 0.5) / 7 * (torsoBot - shY), vw = (15 - v) * TS; G.fillStyle = v % 2 ? '#2b3122' : '#222719'; G.fillRect(HX + sk * (1 - v / 7) - vw / 2, vy - 2.5 * TS, vw, 5 * TS); }
    // ribcage — bone ribs framing the chest cavity
    for (let r = 0; r < 5; r++) { const ry2 = shY + 8 * TS + r * 12 * TS, rw = (46 - r * 5) * TS, sh = 0.72 - r * 0.11;
      G.strokeStyle = 'rgba(' + (158 * sh | 0) + ',' + (150 * sh | 0) + ',' + (132 * sh | 0) + ',0.9)'; G.lineWidth = 3.2 * TS;
      G.beginPath(); G.moveTo(HX - rw + sk, ry2 - 4 * TS); G.quadraticCurveTo(HX + sk, ry2 + 11 * TS, HX + rw + sk, ry2 - 4 * TS); G.stroke(); }
    // CHEST CORE — amber furnace the titan is drawing energy into
    const coreY = shY + 22 * TS, cpu = 0.5 + 0.5 * Math.sin(it * 2.2);
    ell(HX + sk, coreY, 21 * TS, 23 * TS, '#0a0c07');
    G.save(); G.globalCompositeOperation = 'lighter'; amb(HX + sk, coreY, 42 * TS, 0.4 + 0.3 * cpu);
    ell(HX + sk, coreY, 11 * TS, 12 * TS, '#7a4a14'); ell(HX + sk, coreY, 6 * TS * (0.9 + 0.2 * cpu), 7 * TS, '#ffcf86'); G.restore();
    G.strokeStyle = '#2a2f20'; G.lineWidth = 2 * TS; G.beginPath(); G.ellipse(HX + sk, coreY, 21 * TS, 23 * TS, 0, 0, 7); G.stroke();
    // PAULDRONS (shoulder armour); the side turning away reads dimmer
    const pauld = (sgn, br) => { const px = HX + sgn * 48 * TS + sk, py = shY - 2 * TS;
      G.fillStyle = br ? '#2c3325' : '#1b2017'; G.beginPath();
      G.moveTo(px - sgn * 26 * TS, py + 18 * TS); G.quadraticCurveTo(px - sgn * 30 * TS, py - 22 * TS, px + sgn * 8 * TS, py - 24 * TS);
      G.quadraticCurveTo(px + sgn * 26 * TS, py - 18 * TS, px + sgn * 22 * TS, py + 16 * TS); G.closePath(); G.fill();
      G.strokeStyle = br ? 'rgba(150,205,165,0.16)' : 'rgba(70,100,80,0.1)'; G.lineWidth = 2; G.stroke();
      for (let p = 0; p < 3; p++) lineS({ x: px - sgn * 20 * TS + sgn * p * 9 * TS, y: py - 14 * TS + p * 2 * TS }, { x: px - sgn * 16 * TS + sgn * p * 9 * TS, y: py + 12 * TS }, 1.4, '#0e120c'); };
    pauld(-1, fsd <= 0); pauld(1, fsd > 0);
    // NECK cabling
    G.strokeStyle = '#23281c'; G.lineWidth = 6 * TS; G.lineCap = 'round';
    for (const o of [-7, 0, 7]) { G.beginPath(); G.moveTo(HX + o * TS + sk, shY - 2 * TS); G.lineTo(HX + o * TS * 0.6 + sk, headCY + 14 * HSH); G.stroke(); } G.lineCap = 'butt';
    // COLLAR PORTS (the sockets the wires plug into)
    for (let k = 0; k < NW; k += 2) { const a = k / NW * 6.283 - theta, dx = Math.cos(a), dy = Math.sin(a), x = HX + dx * shRX + sk, y = shY + dy * shRY; ell(x, y, 3.4 * TS, 2.1 * TS, '#0c0f0a'); ell(x, y - 0.5 * TS, 1.7 * TS, 1.1 * TS, '#3a412f'); }

    // ── HEAD — biomech skull/faceplate with a swept crest; the face crossfades with the yaw (rotation read) ──
    const HY = headCY;
    G.fillStyle = '#3a4030'; for (const sgn of [-1, 1]) { G.beginPath(); G.moveTo(HX + sgn * 30 * HSH + sk, HY - 48 * HSH); G.quadraticCurveTo(HX + sgn * 74 * HSH + sk, HY - 78 * HSH, HX + sgn * 60 * HSH + sk, HY - 96 * HSH); G.quadraticCurveTo(HX + sgn * 50 * HSH + sk, HY - 70 * HSH, HX + sgn * 22 * HSH + sk, HY - 44 * HSH); G.closePath(); G.fill(); }   // crest horns
    G.fillStyle = '#9a948a'; G.beginPath(); G.moveTo(HX - 50 * HSH + sk, HY + 20 * HSH); G.quadraticCurveTo(HX - 60 * HSH + sk, HY - 60 * HSH, HX + sk, HY - 68 * HSH); G.quadraticCurveTo(HX + 60 * HSH + sk, HY - 60 * HSH, HX + 50 * HSH + sk, HY + 20 * HSH); G.closePath(); G.fill();
    G.fillStyle = '#726c61'; G.beginPath(); G.moveTo(HX - 50 * HSH + sk, HY + 20 * HSH); G.quadraticCurveTo(HX - 60 * HSH + sk, HY - 60 * HSH, HX + sk, HY - 68 * HSH); G.quadraticCurveTo(HX - 24 * HSH + sk, HY - 38 * HSH, HX - 28 * HSH + sk, HY + 16 * HSH); G.closePath(); G.fill();
    G.strokeStyle = '#5c574c'; G.lineWidth = 1.3 * HSH; G.beginPath(); G.moveTo(HX + sk, HY - 68 * HSH); G.quadraticCurveTo(HX - 5 * HSH + sk, HY - 24 * HSH, HX + sk, HY + 6 * HSH); G.stroke();
    G.beginPath(); G.moveTo(HX - 36 * HSH + sk, HY - 44 * HSH); G.quadraticCurveTo(HX + sk, HY - 52 * HSH, HX + 36 * HSH + sk, HY - 44 * HSH); G.stroke();
    G.save(); G.globalCompositeOperation = 'lighter'; G.strokeStyle = 'rgba(150,225,185,0.22)'; G.lineWidth = 2.4; G.beginPath(); G.moveTo(HX - 50 * HSH + sk, HY + 20 * HSH); G.quadraticCurveTo(HX - 60 * HSH + sk, HY - 60 * HSH, HX + sk, HY - 68 * HSH); G.quadraticCurveTo(HX + 60 * HSH + sk, HY - 60 * HSH, HX + 50 * HSH + sk, HY + 20 * HSH); G.stroke(); G.restore();   // rim light
    if (fa > 0.02) { const sx = fsd * 26 * HSH + sk, fw = 0.5 + 0.5 * fa; G.save(); G.globalAlpha = fa;
      G.fillStyle = '#5f5a50'; G.beginPath(); G.moveTo(HX + sx - 40 * HSH * fw, HY - 16 * HSH); G.quadraticCurveTo(HX + sx, HY - 30 * HSH, HX + sx + 40 * HSH * fw, HY - 16 * HSH); G.quadraticCurveTo(HX + sx, HY - 8 * HSH, HX + sx - 40 * HSH * fw, HY - 16 * HSH); G.closePath(); G.fill();   // faceplate
      for (const sgn of [-1, 1]) { const ex = HX + sx + sgn * 20 * HSH * fw; G.fillStyle = '#080a07'; ell(ex, HY - 6 * HSH, 11 * HSH * fw, 13 * HSH, '#080a07');
        G.save(); G.globalCompositeOperation = 'lighter'; G.shadowColor = '#ffb050'; G.shadowBlur = 20 * HSH; G.globalAlpha = fa * (0.6 + 0.35 * pulse);
        ell(ex, HY - 5 * HSH, 5.5 * HSH * fw, 6.5 * HSH, '#7a5a20'); ell(ex, HY - 5 * HSH, 3 * HSH * fw, 3.6 * HSH, '#ffd27a'); G.restore(); G.globalAlpha = fa; }   // amber eye-fire
      G.fillStyle = '#13100d'; G.beginPath(); G.moveTo(HX + sx, HY - 2 * HSH); G.lineTo(HX + sx - 8 * HSH * fw, HY + 22 * HSH); G.lineTo(HX + sx + 8 * HSH * fw, HY + 22 * HSH); G.closePath(); G.fill();   // nasal
      for (let t = -3; t <= 3; t++) { G.fillStyle = '#8f897b'; G.fillRect(HX + sx + t * 7 * HSH * fw - 1.8 * HSH, HY + 24 * HSH, 3.6 * HSH * fw, 7 * HSH); }   // teeth
      G.restore(); }
    if (ba > 0.02) { G.save(); G.globalAlpha = ba; G.strokeStyle = '#23271f'; G.lineCap = 'round';   // back-of-head cabling
      for (let d = -3; d <= 3; d++) { const ox = HX + d * 13 * HSH + sk; G.lineWidth = 3.2 * HSH; G.beginPath(); G.moveTo(ox, HY - 14 * HSH); G.quadraticCurveTo(ox + 5 * HSH, HY + 12 * HSH, ox - 3 * HSH, HY + 36 * HSH); G.stroke(); } G.lineCap = 'butt'; G.restore(); }

    // body fade — lower torso sinks into the void dark (the silo depth)
    const tf = G.createLinearGradient(0, cyc + VRY * 0.2, 0, torsoBot); tf.addColorStop(0, 'rgba(6,9,6,0)'); tf.addColorStop(1, '#040604'); G.fillStyle = tf; G.fillRect(HX - 70 * TS, cyc + VRY * 0.2, 140 * TS, torsoBot - (cyc + VRY * 0.2));

    G.lineCap = 'round';
    for (let i = 0; i < NW; i++) if (Math.sin(i / NW * 6.283 - theta) >= 0) wire(i);   // NEAR wires (in front of the titan)
    G.lineCap = 'butt';

    for (const f of fix) if (f.y >= cyc) drawF(f);   // in front of the colossus

    // ── B5 ROVER — the SAME rover as B1–4 (iso.js `roverBoxes` is the blueprint), redrawn in this scene's side /
    //    oblique projection so it sits ON the catwalk. Same parts + PAL colours; length axis = travel (faces right).
    //    Local model units mirror the iso model (length 2.4, width ~1.7, height ~1.6); P maps them to the ring tilt. ──
    { const PAL = rc.PAL, sh = rc.hexShade, X = cx, Y = cyc + RY * 0.84, s = (B5.rover || 1.0) * Z;
      const u = 28 * s, wx = 6 * s, wy = 14 * s;                                                                  // length→x; width(across)→ slight x + screen-depth (near = lower)
      const P = (l, w, h) => ({ x: X + l * u + w * wx, y: Y - h * u + w * wy });
      const quad = (a, b, c, d, col) => { G.fillStyle = col; G.beginPath(); G.moveTo(a.x, a.y); G.lineTo(b.x, b.y); G.lineTo(c.x, c.y); G.lineTo(d.x, d.y); G.closePath(); G.fill(); G.strokeStyle = 'rgba(10,11,7,0.45)'; G.lineWidth = 1; G.stroke(); };
      const box3 = (l0, w0, h0, ll, ww, hh, cT, cS, cE) => { const nbl = P(l0, w0 + ww, h0), nbr = P(l0 + ll, w0 + ww, h0), ntr = P(l0 + ll, w0 + ww, h0 + hh), ntl = P(l0, w0 + ww, h0 + hh), fbr = P(l0 + ll, w0, h0), ftr = P(l0 + ll, w0, h0 + hh), ftl = P(l0, w0, h0 + hh);
        quad(ntl, ntr, ftr, ftl, cT); quad(nbr, ntr, ftr, fbr, cE); quad(nbl, nbr, ntr, ntl, cS); };
      const track = w0 => { box3(-1.2, w0, -0.16, 2.4, 0.30, 0.54, sh(PAL.tread, 1.5), PAL.tread, sh(PAL.tread, 0.6));
        for (let i = 0; i < 6; i++) { const f = ((i / 6) + (scv * 0.35 % 1)) % 1, lx = -1.1 + f * 2.0; lineS(P(lx, w0, 0.40), P(lx, w0 + 0.30, 0.40), 1.4 * s, sh(PAL.tread, 1.7)); }   // moving links
        for (let i = 0; i < 4; i++) { const lx = -0.84 + i * (1.68 / 3), wp = P(lx, w0 + 0.15, 0.06), wr = 6 * s; ell(wp.x, wp.y, wr, wr * 0.95, PAL.wheel); ell(wp.x, wp.y, wr * 0.5, wr * 0.5, PAL.hub);
          const a = scv * 2.2 + i * 1.3; lineS(wp, { x: wp.x + Math.cos(a) * wr * 0.7, y: wp.y + Math.sin(a) * wr * 0.7 }, 1.3 * s, '#0a0906'); } };
      G.save(); G.globalAlpha = 0.4; const shp = P(0, 0.1, 0); G.fillStyle = '#000'; G.beginPath(); G.ellipse(shp.x, shp.y + 4 * s, 40 * s, 12 * s, 0, 0, 7); G.fill(); G.globalAlpha = 1; G.restore();   // contact shadow
      track(-1.06);                                                                                               // FAR track (behind body)
      // REAR BATTERY PACK (corestuff) protruding off the back
      box3(-1.55, -0.52, 0.14, 0.5, 1.04, 0.62, sh(PAL.core, 1.0), sh(PAL.core, 0.7), sh(PAL.core, 0.5));
      for (let i = 0; i < 3; i++) box3(-1.5 + i * 0.16, -0.34, 0.76, 0.12, 0.22, 0.10, sh(PAL.core, 1.25), sh(PAL.core, 0.9), sh(PAL.core, 0.7));   // cell caps
      G.save(); G.globalCompositeOperation = 'lighter'; const bp = P(-1.3, 0, 0.5); ell(bp.x, bp.y, 8 * s, 5 * s, 'rgba(220,255,180,' + (0.4 + 0.3 * Math.sin(it * 3)) + ')'); G.restore();   // charge vent
      // ARMOURED BODY
      box3(-1.2, -0.86, 0.02, 2.4, 1.72, 0.20, sh(PAL.rover, 0.7), sh(PAL.rover, 0.62), sh(PAL.rover, 0.5));      // skirt
      box3(-1.2, -0.84, 0.20, 2.4, 1.68, 0.66, sh(PAL.rover, 1.12), PAL.rover, sh(PAL.rover, 0.72));              // main hull
      for (let i = 1; i < 4; i++) lineS(P(-1.2 + 2.4 * i / 4, -0.84, 0.86), P(-1.2 + 2.4 * i / 4, 0.84, 0.86), 1 * s, sh(PAL.rover, 0.7));   // panel seams
      box3(-0.58, -0.5, 0.86, 0.95, 1.0, 0.34, PAL.roverHi, sh(PAL.roverHi, 0.82), sh(PAL.roverHi, 0.66));       // raised equipment deck
      // TOP AUTO-TURRET (ring + barrel)
      box3(-0.65, -0.2, 0.88, 0.4, 0.4, 0.22, sh(PAL.rover, 0.95), sh(PAL.rover, 0.8), sh(PAL.rover, 0.62));
      lineS(P(-0.45, 0, 1.12), P(0.08, 0, 1.18), 3 * s, sh(PAL.rover, 0.5));
      // TOP ROTATING RADAR DISH
      lineS(P(-0.15, 0, 1.10), P(-0.15, 0, 1.55), 3 * s, sh(PAL.rover, 0.6));                                     // mast
      const rot = it * 1.3, rr = 0.4, dh = P(-0.15 + Math.sin(rot) * rr, Math.cos(rot) * rr, 1.6), fw = (8 + 4 * Math.cos(rot)) * s;
      lineS(P(-0.15, 0, 1.55), dh, 2 * s, sh(PAL.rover, 0.55));
      ell(dh.x, dh.y, Math.abs(fw) + 2 * s, 6 * s, sh(PAL.rover, 0.55)); ell(dh.x, dh.y - 1, Math.abs(fw), 4.5 * s, sh(PAL.rover, 1.18)); ell(dh.x, dh.y, 1.6 * s, 1.6 * s, PAL.eye);
      // FRONT SENSOR NECK + BOXED EYE
      box3(0.74, -0.16, 0.86, 0.32, 0.32, 0.52, sh(PAL.rover, 1.0), sh(PAL.rover, 0.85), sh(PAL.rover, 0.65));
      const ey = P(1.05, 0, 1.28), es = 4 * s; G.fillStyle = '#141008'; G.fillRect(ey.x - es - 1, ey.y - es - 1, es * 2 + 2, es * 2 + 2);
      G.save(); G.globalCompositeOperation = 'lighter'; G.shadowBlur = 8 * s; G.shadowColor = PAL.eye; G.fillStyle = PAL.eye; G.fillRect(ey.x - es, ey.y - es, es * 2, es * 2); G.restore();
      // FRONT DRILL (auger out the front face)
      box3(1.04, -0.32, -0.02, 0.22, 0.64, 0.46, sh(PAL.hub, 1.1), sh(PAL.hub, 0.9), sh(PAL.hub, 0.7));          // housing
      const db = P(1.28, 0, 0.18), dt = P(1.95, 0, 0.18), br = 9 * s;
      G.fillStyle = '#9a948a'; G.beginPath(); G.moveTo(db.x, db.y - br); G.lineTo(dt.x, dt.y); G.lineTo(db.x, db.y); G.closePath(); G.fill();         // cone lit
      G.fillStyle = '#54504a'; G.beginPath(); G.moveTo(db.x, db.y); G.lineTo(dt.x, dt.y); G.lineTo(db.x, db.y + br); G.closePath(); G.fill();         // cone shade
      for (let i = 0; i < 4; i++) { const f = (i / 4 + (it * 0.6 % 1)) % 1, px = db.x + (dt.x - db.x) * f, py = (db.y - br * 0.4) + (dt.y - (db.y - br * 0.4)) * f; ell(px, py, br * 0.32 * (1 - f * 0.5), br * 0.2, '#d8d3c8'); }   // spiral flighting
      track(0.76); }                                                                                             // NEAR track (front, drawn last)

    // ── CORESTUFF NODE + HARVEST — the B5 interactable, drawn AT THE ROVER on the catwalk (was anchored to the
    //    B1–4 far-left ROVERX). corestuff is B5's only resource → the prestige tap. Logic (distance/time/click)
    //    is unchanged in game.js; this only places the visual + beam where the B5 rover actually is. ──
    { const exp = (typeof STATE !== 'undefined') && STATE.expedition;
      if (exp && exp.active && exp.obstacle && exp.status === 'HARVESTING') {   // only while actually drilling (no constant node sitting in front)
        const s = (B5.rover || 1.0) * Z, def = exp.obstacle.def || {}, col = def.color || '#ff8a4c';
        const rvY = cyc + RY * 0.84, nx = cx + 72 * s, ny = rvY - 8 * s, hh = 30 * s, bw = 12 * s;
        const hp = Math.max(0, Math.min(1, 1 - exp.obstacle.timeLeft / exp.obstacle.maxTime)), harv = exp.status === 'HARVESTING';
        G.save(); G.globalCompositeOperation = 'lighter'; amb(nx, ny - hh * 0.4, 36 * s, 0.28 + 0.22 * pulse); G.restore();   // amber ground glow
        const lit = '#ffd9a0';
        G.fillStyle = 'rgba(120,60,20,0.92)'; G.beginPath(); G.moveTo(nx - bw, ny); G.lineTo(nx - bw * 0.3, ny - hh); G.lineTo(nx + bw, ny - hh * 0.3); G.lineTo(nx + bw * 0.4, ny + 1); G.closePath(); G.fill();   // crystal (shaded)
        G.fillStyle = col; G.beginPath(); G.moveTo(nx - bw * 0.3, ny - hh); G.lineTo(nx + bw, ny - hh * 0.3); G.lineTo(nx + bw * 0.1, ny - hh * 0.1); G.closePath(); G.fill();   // mid facet
        G.fillStyle = lit; G.beginPath(); G.moveTo(nx - bw, ny); G.lineTo(nx - bw * 0.3, ny - hh); G.lineTo(nx - bw * 0.05, ny - hh * 0.5); G.closePath(); G.fill();   // lit facet
        if (harv) { G.save(); G.globalCompositeOperation = 'lighter'; G.strokeStyle = 'rgba(255,180,90,0.7)'; G.lineWidth = 2.5; G.shadowColor = '#ffb050'; G.shadowBlur = 8;   // drill beam from rover to node
          const dtx = cx + 56 * s, dty = rvY - 3 * s, tyN = ny - hh * 0.45; G.beginPath(); G.moveTo(dtx, dty); G.lineTo(nx, tyN); G.stroke();
          for (let i = 0; i < 3; i++) { const t = Math.random(); ell(dtx + (nx - dtx) * t, dty + (tyN - dty) * t, 1.6, 1.6, '#ffe6b0'); } G.restore();
          const bx = nx - 18 * s, by = ny - hh - 10 * s; G.fillStyle = '#0c0b06'; G.fillRect(bx - 1, by - 1, 36 * s + 2, 5); G.fillStyle = '#2a2618'; G.fillRect(bx, by, 36 * s, 3); G.fillStyle = lit; G.fillRect(bx, by, 36 * s * hp, 3); }   // progress bar
      }
    }


    // ── FOREGROUND parallax layer — near under-catwalk structure filling the bottom; reads as the closest layer.
    //    Posts orbit with -theta (near radius → exaggerated parallax); corner trusses sway. ──
    const fgRimY = x => { const t = (x - cx) / (RX * 1.08); return Math.abs(t) < 1 ? cyc + RY * 1.08 * Math.sqrt(1 - t * t) : cyc + RY * 1.08; };
    G.beginPath(); for (let x = 0; x <= W; x += 10) { const y = fgRimY(x); x === 0 ? G.moveTo(x, y) : G.lineTo(x, y); } G.lineTo(W, H); G.lineTo(0, H); G.closePath();
    const fgg = G.createLinearGradient(0, cyc + RY * 0.9, 0, H); fgg.addColorStop(0, '#0a0f0b'); fgg.addColorStop(1, '#05080b'); G.fillStyle = fgg; G.fill();
    G.strokeStyle = 'rgba(70,150,105,0.12)'; G.lineWidth = 2; G.beginPath(); for (let x = 0; x <= W; x += 10) { const y = fgRimY(x); x === 0 ? G.moveTo(x, y) : G.lineTo(x, y); } G.stroke();   // lit near lip
    for (let k = 0; k < 46; k++) { const a = k / 46 * 6.283 - theta; if (Math.sin(a) < 0.62) continue;                // near railing posts (front arc only)
      const x = cx + Math.cos(a) * RX * 1.04, yb = cyc + Math.sin(a) * RY * 1.04, ph = 12 + 16 * Math.sin(a);
      G.strokeStyle = '#0b110d'; G.lineWidth = 3; G.beginPath(); G.moveTo(x, yb); G.lineTo(x, yb - ph); G.stroke();
      if (k % 3 === 0) { G.save(); G.globalCompositeOperation = 'lighter'; ell(x, yb - ph, 2.6, 2, 'rgba(255,190,90,0.6)'); G.restore(); } }
    // big foreground SUPPORT TRUSSES anchored to WORLD ANGLES on the near rim — they slide across the bottom as the
    // room turns (true parallax, moving with the world). Only the front-most few are visible.
    const NT = 9;
    for (let k = 0; k < NT; k++) { const a = k / NT * 6.283 - theta, sn = Math.sin(a); if (sn < 0.74) continue;
      const x = cx + Math.cos(a) * RX * 1.14, top = cyc + RY * 0.96 - (sn - 0.74) * 220, sc2 = 0.7 + 0.6 * (sn - 0.74) / 0.26;
      G.strokeStyle = '#070b08'; G.lineWidth = 13 * sc2; G.beginPath(); G.moveTo(x, H); G.lineTo(x, top); G.stroke();                  // main column
      G.strokeStyle = '#16201a'; G.lineWidth = 3 * sc2; G.beginPath(); G.moveTo(x - 5 * sc2, H); G.lineTo(x - 5 * sc2, top); G.stroke();
      for (let r = 0; r < 5; r++) { const ry2 = top + r / 5 * (H - top); G.strokeStyle = '#0c120e'; G.lineWidth = 2 * sc2; G.beginPath(); G.moveTo(x - 7 * sc2, ry2); G.lineTo(x + 7 * sc2, ry2 + 14 * sc2); G.stroke(); }   // lattice cross-bracing
      G.save(); G.globalCompositeOperation = 'lighter'; ell(x, top, 3 * sc2, 2.4 * sc2, 'rgba(255,196,96,0.7)'); G.restore(); }       // amber node light
    G.lineCap = 'butt';

    // ── HOSTILES — drawn ON TOP here (B5's iso path gates the normal enemy pass off). Enemies live in SCREEN
    //    space (en.x/en.y), so draw + reticle directly; clicks already hit them (tryShootEnemy is screen-space). ──
    { const exp = (typeof STATE !== 'undefined') && STATE.expedition;
      if (exp && exp.enemies && exp.enemies.length) {
        let best = null, bd = 1e9;
        for (const en of exp.enemies) {
          if (en.dead) { const fd = Math.max(0, en.deathTimer / 0.5); if (fd > 0) { G.save(); G.globalAlpha = fd; G.globalCompositeOperation = 'lighter'; G.strokeStyle = '#ffb050'; G.lineWidth = 2; G.beginPath(); G.arc(en.x, en.y, (1 - fd) * 26, 0, 7); G.stroke(); G.restore(); } continue; }
          const hue = en.hue || 34, r = 18, ex = en.x, ey = en.y + Math.sin(it * 2 + en.pulse) * 3;
          G.save(); G.globalCompositeOperation = 'lighter'; const hg = G.createRadialGradient(ex, ey, 1, ex, ey, r * 2.6); hg.addColorStop(0, `hsla(${hue},100%,66%,${0.45 + 0.2 * Math.sin(it * 5 + en.pulse)})`); hg.addColorStop(0.5, `hsla(${hue},100%,52%,0.18)`); hg.addColorStop(1, `hsla(${hue},100%,50%,0)`); G.fillStyle = hg; G.fillRect(ex - r * 2.6, ey - r * 2.6, r * 5.2, r * 5.2); G.restore();   // amber halo
          ell(ex, ey + r * 0.26, r * 0.95, r * 0.5, '#191206'); ell(ex, ey, r, r * 0.9, '#2c2419'); ell(ex - r * 0.26, ey - r * 0.3, r * 0.42, r * 0.26, '#46402f');   // hull
          const lr = r * 0.62; ell(ex, ey, lr, lr * 0.95, '#1a1208');                                            // lens socket
          G.save(); G.shadowBlur = 16; G.shadowColor = `hsl(${hue},95%,58%)`; const grd = G.createRadialGradient(ex - lr * 0.2, ey - lr * 0.2, 0, ex, ey, lr * 0.85); grd.addColorStop(0, `hsl(${hue},100%,85%)`); grd.addColorStop(0.55, `hsl(${hue},90%,50%)`); grd.addColorStop(1, '#1a0e04'); G.fillStyle = grd; G.beginPath(); G.ellipse(ex, ey, lr * 0.8, lr * 0.76, 0, 0, 7); G.fill(); G.restore();
          ell(ex - lr * 0.28, ey - lr * 0.28, 1.8, 1.8, 'rgba(255,255,255,0.85)');                               // glint
          if (en.hitTimer > 0 && en.maxHp) { const frac = Math.max(0, Math.min(1, en.hp / en.maxHp)), a = Math.min(1, en.hitTimer / 0.5), bw = r * 2.0, bh = 3.2, bx = ex - bw / 2, by = ey - r * 1.9;
            G.globalAlpha = a; G.fillStyle = 'rgba(8,9,6,0.85)'; G.fillRect(bx - 1, by - 1, bw + 2, bh + 2); G.fillStyle = frac > 0.5 ? '#9be08a' : frac > 0.25 ? '#e0c25a' : '#e06a4a'; G.fillRect(bx, by, bw * frac, bh); G.globalAlpha = 1; }
          const dd = Math.abs(ex - cx) + Math.abs(ey - (cyc + RY * 0.84)); if (dd < bd) { bd = dd; best = { x: ex, y: ey }; }
        }
        if (best) { const R = 24, rot = it * 1.4, pu = 0.85 + 0.15 * Math.sin(it * 7); G.save(); G.strokeStyle = '#ff3b30'; G.lineWidth = 2; G.shadowBlur = 6; G.shadowColor = '#ff3b30'; G.beginPath(); G.arc(best.x, best.y, R * pu, 0, 6.283); G.stroke();
          for (let i = 0; i < 4; i++) { const ang = rot + i * Math.PI / 2, c = Math.cos(ang), s = Math.sin(ang); G.beginPath(); G.moveTo(best.x + c * (R * pu - 4), best.y + s * (R * pu - 4)); G.lineTo(best.x + c * (R * pu + 6), best.y + s * (R * pu + 6)); G.stroke(); } G.shadowBlur = 0; G.restore(); }
      }
    }

    // ── atmosphere: drifting green spores + amber motes + brighter embers + deep vignette ──
    for (let i = 0; i < 36; i++) { const t = (it * 0.04 + i * 0.123) % 1, mx = cx + Math.sin(i * 2.1 + it * 0.08) * W * 0.44, my = H * 0.99 - t * H * 0.95;
      G.globalAlpha = 0.40 * (1 - t) * (0.5 + 0.5 * pulse); ell(mx, my, 1.5 * Z, 1.5 * Z, '#9dffc8'); } G.globalAlpha = 1;
    G.save(); G.globalCompositeOperation = 'lighter';                                                            // warm amber motes drifting low (more orange glow)
    for (let i = 0; i < 12; i++) { const t = (it * 0.05 + i * 0.17) % 1, mx = cx + Math.sin(i * 1.3 + it * 0.06) * W * 0.4, my = H * 0.96 - t * H * 0.7;
      G.globalAlpha = 0.34 * (1 - t) * (0.5 + 0.5 * Math.sin(it * 2 + i)); ell(mx, my, 2 * Z, 2 * Z, '#ffca78'); } G.restore(); G.globalAlpha = 1;
    G.save(); G.globalCompositeOperation = 'lighter';                                                            // a few bright embers rising from the void
    for (let i = 0; i < 9; i++) { const t = (it * 0.06 + i * 0.31) % 1, mx = cx + Math.sin(i * 1.7 + it * 0.05) * VRX * 0.8, my = cyc + VRY * 0.4 - t * RY * 1.4;
      G.globalAlpha = 0.5 * (1 - t); ell(mx, my, 2.4 * Z, 2.4 * Z, '#bfffd6'); } G.restore(); G.globalAlpha = 1;
    const vg = G.createRadialGradient(cx, cyc, RY * 0.4, cx, cyc + RY * 0.2, Math.max(W, H) * 0.72); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.78)'); G.fillStyle = vg; G.fillRect(0, 0, W, H);
  };
})();

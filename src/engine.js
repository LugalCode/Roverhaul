// ============================================================
//  engine.js — ROVERHAUL v0.8
//  Canvas setup, drawing, parallax, rover, enemies.
//  Depends on: data.js (RT, CFG, UPGCFG)
//  Depends on: game.js (STATE, G)
// ============================================================

const canvas = document.getElementById('gc');
const ctx    = canvas.getContext('2d');

const PX     = 80;
const FTILE  = 200;
const ROVERX = 150;

let bgO1 = 0, bgO2 = 0, bgO3 = 0, bgO4 = 0;

let aT          = 0;
let wRot        = 0;
let drillRot    = 0;  // kept for update loop compatibility, not used in drawing
let trackOff    = 0;
let shakeAmt    = 0;
let shakeSeed   = 0;
let parts       = [];
let spores      = [];
let scrollWorld = 0;

// Title screen: when true, the engine renders only the scrolling wasteland
// backdrop (no rover, no HUD, no hangar) for the landing page to mirror.
let titleMode   = true;

// ── COMBAT VISUALS ────────────────────────────────────────────
let beams       = [];      // transient turret beams { x1,y1,x2,y2,life,ml }
let turretAngle = -0.4;    // smoothed barrel angle (radians, screen space)
let turretTipX  = 0;       // barrel-tip screen position, updated each draw
let turretTipY  = 0;

// ── SCENE TRANSITION ──────────────────────────────────────────
let screenFade = 0;            // black overlay alpha, used to mask the launch cut
let prevStatus = 'STANDBY';

// Smooth 0→1 ramp between edges a and b.
function smoothstep(x, a, b) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Nearest living hostile to a screen point — used for turret auto-aim.
function nearestEnemy(px, py) {
  let best = null, bd = Infinity;
  (STATE.expedition.enemies || []).forEach(en => {
    if (en.dead) return;
    const dx = en.x - px, dy = en.y - py, d = dx*dx + dy*dy;
    if (d < bd) { bd = d; best = en; }
  });
  return best;
}

// Fire a beam from the current turret tip to a target point.
function fireBeam(tx, ty) {
  beams.push({ x1: turretTipX, y1: turretTipY, x2: tx, y2: ty, life: 0.16, ml: 0.16 });
}

// ── SETUP ─────────────────────────────────────────────────────
function initSpores() {
  spores = [];
  for (let i = 0; i < 50; i++) spores.push({
    x:  Math.random() * 1400,
    y:  Math.random() * 500,
    sy: -(0.1  + Math.random() * 0.3),
    sx: -(0.05 + Math.random() * 0.2),
    sz: 0.5 + Math.random() * 2,
    op: 0.06 + Math.random() * 0.28,
    ps: 0.8 + Math.random() * 1.8,
  });
}

function resizeCv() {
  const r = canvas.parentElement.getBoundingClientRect();
  canvas.width  = r.width;
  canvas.height = r.height;
}

// Unified particle spawner.  type: 'spark' | 'dust'
function spawnSparks(x, y, c = '#39e65b', count = 7, type = 'spark') {
  for (let i = 0; i < count; i++) {
    const a  = Math.random() * Math.PI * 2;
    const sp = type === 'dust' ? 0.3 + Math.random() * 1.0
                               : 1.5 + Math.random() * 3.5;
    parts.push({
      x, y,
      vx:   Math.cos(a) * sp * (type === 'dust' ? -1 : 1),
      vy:   Math.sin(a) * sp - (type === 'dust' ? 0.1 : 1),
      life: type === 'dust' ? 0.6 + Math.random() * 0.9 : 0.3 + Math.random() * 0.4,
      ml:   type === 'dust' ? 1.5 : 0.7,
      sz:   type === 'dust' ? 2.5 + Math.random() * 4.5 : 1 + Math.random() * 2.5,
      c, type,
    });
  }
}
// Debris burst when a resource node is cleared — chunks fly off in the node's
// colour. `big` (a smash-through) throws more, faster chunks.
function spawnShatter(color = '#caa', big = false) {
  const x = ROVERX + 120, y = (canvas.height || 400) - 130;
  const n = big ? 20 : 12;
  for (let i = 0; i < n; i++) {
    const a  = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;   // upward-biased fan
    const sp = (big ? 2.6 : 1.8) + Math.random() * 3.6;
    parts.push({
      x: x + (Math.random() - 0.5) * 22,
      y: y + (Math.random() - 0.5) * 22,
      vx: Math.cos(a) * sp * (big ? 1.35 : 1),
      vy: Math.sin(a) * sp - 1.2,
      life: 0.38 + Math.random() * 0.5,
      ml:   0.9,
      sz:  (big ? 2 : 1.4) + Math.random() * 3.4,
      c: color, type: 'spark',
    });
  }
}
  // Exhaust-style plume: fumes stream straight out the BACK of the rover and
  // fan into a cone as they trail away (like car exhaust in the travel direction).
function emitDust(gY) {
  const exp = STATE.expedition;
  if (exp.status !== 'DRIVING') return;
  const boost = exp.boostActive;
  const n = boost ? 5 : 3;
  const ox = ROVERX - 50;     // rear of the rover (tracks/exhaust)
  const oy = gY - 12;         // low, near the ground at the back
  for (let i = 0; i < n; i++) {
    const spread = (Math.random() - 0.5);          // symmetric → widening cone
    const speed  = (1.3 + Math.random() * 1.7) * (boost ? 1.6 : 1);
    // Mix of earthy brown and faint bioluminescent green puffs
    const bioPuff = Math.random() < 0.35;
    const col = bioPuff
      ? `rgba(70,${150 + Math.floor(Math.random()*80)},80,${0.22 + Math.random()*0.28})`
      : `rgba(${120+Math.floor(Math.random()*40)},${100+Math.floor(Math.random()*25)},70,${0.22+Math.random()*0.3})`;
    parts.push({
      x: ox + (Math.random() - 0.5) * 6,
      y: oy + (Math.random() - 0.5) * 5,
      vx: -speed,                       // straight back, opposite to travel
      vy: spread * 1.15 - 0.18,         // cone fan + slight rise (fumes lift)
      life: 0.55 + Math.random() * 0.7,
      ml:   1.25,
      sz:   2 + Math.random() * 3.2,
      c: col, type: 'dust',
    });
  }
}
// ── UPDATE ────────────────────────────────────────────────────
function engUpdate(dt) {
  aT += dt;
  if (window.ISO && ISO.on) ISO.tick(dt);
  let sc = 0;
  const exp = STATE.expedition;
  if (exp.active) {
    // Use the live ramped speed (curSpeed) so the world scroll matches the
    // rover's acceleration; fall back to G.speed() if it isn't set yet.
    if (exp.status === 'DRIVING')   sc = (exp.curSpeed != null ? exp.curSpeed : G.speed());
    // RECALLING no longer reverse-scrolls the world — the rover itself is dragged off-screen.
  }
  if (titleMode) sc = 2.4;   // gentle constant drift for the landing-page backdrop

  bgO1 = (bgO1 + sc *  8 * dt) % 1400;
  bgO2 = (bgO2 + sc * 18 * dt) % 1200;
  bgO3 = (bgO3 + sc * 38 * dt) % 1200;
  bgO4 = (bgO4 + sc * PX * dt) % FTILE;
  scrollWorld += sc * PX * dt;

  if (exp.status === 'DRIVING')    trackOff = (trackOff + (exp.curSpeed != null ? exp.curSpeed : G.speed()) * dt * 18) % 12;
  // Tracks reverse while the rover is winched home
  if (exp.status === 'RECALLING')  trackOff = (trackOff - dt * 140) % 12;
  // Tracks roll while the rover drives out of the bay
  if (exp.status === 'LAUNCHING' && exp.launchT > exp.launchDur * 0.28) trackOff = (trackOff + dt * 140) % 12;
  // Tracks roll while the rover drives into/out of the descent entrance
  if (exp.status === 'DESCENDING') trackOff = (trackOff + dt * 150) % 12;
  drillRot += dt * 4; // tick so activeDrills logic still works

  // Mask the cut from bay to wasteland: flash to black the instant launch ends
  const st = exp.active ? exp.status : 'STANDBY';
  if (prevStatus === 'LAUNCHING' && st === 'DRIVING') screenFade = 1;
  prevStatus = st;
  screenFade = Math.max(0, screenFade - dt * 2.5);

  // Screen shake — gentle while driving, stronger under boost
  if (exp.status === 'DRIVING') {
    shakeAmt = Math.min(shakeAmt + dt * 3, exp.boostActive ? 2.6 : 1.2);
  } else {
    shakeAmt = Math.max(0, shakeAmt - dt * 6);
  }
  shakeSeed += dt * 37;

  // Boost thrust — jet of hot particles off the rover's rear
  if (exp.status === 'DRIVING' && exp.boostActive) {
    for (let i = 0; i < 3; i++) {
      parts.push({
        x: ROVERX - 42 + (Math.random() - 0.5) * 8,
        y: canvas.height - 96 + (Math.random() - 0.5) * 12,
        vx: -2.5 - Math.random() * 2.5, vy: (Math.random() - 0.5) * 1.2,
        life: 0.3 + Math.random() * 0.25, ml: 0.55,
        sz: 2 + Math.random() * 3,
        c: Math.random() < 0.5 ? 'rgba(70,232,255,0.9)' : 'rgba(255,255,255,0.8)', type: 'spark',
      });
    }
  }

  // Particles
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.x += p.vx; p.y += p.vy;
    if (p.type === 'dust') p.vy -= 0.015;
    p.life -= dt;
    if (p.life <= 0) parts.splice(i, 1);
  }
  // Decay turret beams
  for (let i = beams.length - 1; i >= 0; i--) {
    beams[i].life -= dt;
    if (beams[i].life <= 0) beams.splice(i, 1);
  }
  // Luminescent trail behind each roaming hostile
  exp.enemies.forEach(en => {
    if (en.dead || Math.random() > 0.75) return;
    parts.push({
      x: en.x + (Math.random() - 0.5) * 5,
      y: en.y + (Math.random() - 0.5) * 5,
      vx: 0, vy: 0.15,
      life: 0.5, ml: 0.5,
      sz: 2.5 + Math.random() * 2.5,
      c: `hsla(${en.hue},90%,70%,0.8)`, type: 'dust',
    });
  });

  if (exp.activeDrills && exp.activeDrills.length > 0) {
    for (let i = exp.activeDrills.length - 1; i >= 0; i--) {
      const d = exp.activeDrills[i]; d.life -= dt;
      if (d.life <= 0) exp.activeDrills.splice(i, 1);
      else spawnSparks(d.x, d.y, '#ffcc44', 3);
    }
  }

  spores.forEach(s => {
    s.y += s.sy; s.x += s.sx - sc * 0.08;
    if (s.y < 0)                { s.y = canvas.height; s.x = Math.random() * canvas.width; }
    if (s.x < 0)                { s.x = canvas.width;  s.y = Math.random() * canvas.height; }
    else if (s.x > canvas.width){ s.x = 0;             s.y = Math.random() * canvas.height; }
  });

if (exp.status === 'HARVESTING' && exp.obstacle && Math.random() < 0.25) {
    // Drill tip world position: rover X + mount offset (52) + cone length (~60) + tip
    const drillTipX = ROVERX + 52 + 60 + 8;
    const drillTipY = canvas.height - 100 - 52 + 4; // gY - roverY offset + mount Y
    spawnSparks(drillTipX, drillTipY, exp.obstacle.def.color, 6);
  }

  if (exp.status === 'DRIVING') emitDust(canvas.height - 100);
}

// ── TANK TRACK ────────────────────────────────────────────────
// Metallic track belt with chunky animated cleats, a row of rotating road
// wheels (with suspension jiggle while driving), and glowing drive sprockets.
function drawTrack(cx, cy, tw, th) {
  const tl      = STATE.upgrades.treads || 1;
  const accent  = 'rgba(120,116,104,0.6)';   // neutral cleat highlight
  const wheelC  = '#726d62';                  // neutral spoke grey
  const st      = STATE.expedition.status;
  const driving = st === 'DRIVING' || st === 'LAUNCHING';

  ctx.save(); ctx.translate(cx, cy);

  // Contact shadow
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath(); ctx.ellipse(0, th + 4, tw + 6, 5, 0, 0, Math.PI * 2); ctx.fill();

  // Track belt — dark neutral metal
  const belt = ctx.createLinearGradient(0, -th, 0, th);
  belt.addColorStop(0, '#33332e'); belt.addColorStop(0.5, '#1c1c19'); belt.addColorStop(1, '#0d0d0b');
  ctx.fillStyle = belt;
  ctx.beginPath();
  ctx.moveTo(-tw, -th); ctx.lineTo(tw, -th);
  ctx.arc(tw, 0, th, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(-tw, th);
  ctx.arc(-tw, 0, th, Math.PI / 2, -Math.PI / 2);
  ctx.closePath(); ctx.fill();
  // Top rim light
  ctx.strokeStyle = 'rgba(180,175,160,0.18)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-tw, -th + 0.6); ctx.lineTo(tw, -th + 0.6); ctx.stroke();

  // Chunky tread cleats wrapping the belt
  const numLinks = 22, topLen = tw * 2, arcLen = th * Math.PI, total = (topLen + arcLen) * 2;
  for (let i = 0; i < numLinks; i++) {
    const t = ((i / numLinks) + trackOff / total) % 1, pos = t * total;
    let lx, ly, la;
    if (pos < topLen)               { lx = -tw + pos; ly = -th; la = 0; }
    else if (pos < topLen + arcLen) { const a = -Math.PI/2 + (pos - topLen) / th; lx = tw + Math.cos(a)*th; ly = Math.sin(a)*th; la = a + Math.PI/2; }
    else if (pos < topLen*2+arcLen) { lx = tw - (pos - topLen - arcLen); ly = th; la = Math.PI; }
    else                            { const a = Math.PI/2 + (pos - topLen*2 - arcLen) / th; lx = -tw + Math.cos(a)*th; ly = Math.sin(a)*th; la = a + Math.PI/2; }
    ctx.save(); ctx.translate(lx, ly); ctx.rotate(la);
    ctx.fillStyle = i % 2 ? '#101010' : '#26261f';
    ctx.fillRect(-2.5, -3.5, 5, 7);
    ctx.fillStyle = accent;
    ctx.fillRect(-2.5, -3.5, 5, 1.1);
    ctx.restore();
  }

  // Road wheels — rotating spokes + suspension jiggle; ends are drive sprockets
  const wpos = [-tw * 0.82, -tw * 0.3, tw * 0.3, tw * 0.82];
  wpos.forEach((wx, wi) => {
    const isEnd = wi === 0 || wi === wpos.length - 1;
    const wr = isEnd ? th - 1 : th - 3;
    const wy = driving ? Math.sin(aT * 9 + wi * 1.9) * 1.1 : 0;
    ctx.save(); ctx.translate(wx, wy);
    const wg = ctx.createRadialGradient(-wr * 0.3, -wr * 0.3, 1, 0, 0, wr);
    wg.addColorStop(0, '#3a3a34'); wg.addColorStop(1, '#111110');
    ctx.fillStyle = wg; ctx.strokeStyle = '#2b2b26'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, wr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const rot = trackOff * 0.5 + (st === 'RECALLING' ? -aT * 6 : 0);
    ctx.strokeStyle = wheelC; ctx.lineWidth = 1.4;
    for (let s = 0; s < 5; s++) { const a = rot + s / 5 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * (wr - 2), Math.sin(a) * (wr - 2)); ctx.stroke(); }
    ctx.fillStyle = wheelC; ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, Math.PI * 2); ctx.fill();
    if (isEnd) {
      ctx.fillStyle = '#caa468';
      ctx.shadowBlur = 4; ctx.shadowColor = '#caa468';
      ctx.beginPath(); ctx.arc(0, 0, 1.5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }
    ctx.restore();
  });

  ctx.restore();
}

// ── DRILL — side-on auger with scrolling helical flutes ───────
// The flutes scroll along the bit to read as rotation: a fast spin while
// harvesting, a slow idle creep otherwise. Tip glows hot under load.
function drawDrill(llvl, harvesting) {
  const dC    = llvl >= 4 ? '#ff6ec7' : llvl >= 3 ? '#c084fc' : llvl >= 2 ? '#00e8b0' : '#86b89a';
  const coneL = 56 + Math.min(llvl * 4, 18);
  const coneH = 14 + Math.min(llvl * 1.5, 7);

  ctx.save();
  ctx.translate(52, 2); // mount further forward, ahead of the hull nose

  // Hydraulic ram back into the hull
  ctx.strokeStyle = '#46443c'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-14, -4); ctx.lineTo(-26, -4); ctx.stroke();
  ctx.strokeStyle = '#6a665c'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-14, -4); ctx.lineTo(-21, -4); ctx.stroke();

  // Motor housing / collar (grey metal, no colour outline)
  const hg = ctx.createLinearGradient(0, -coneH, 0, coneH);
  hg.addColorStop(0, '#3a3a34'); hg.addColorStop(1, '#15150f');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.roundRect(-14, -coneH * 0.95, 15, coneH * 1.9, 3); ctx.fill();

  // Cone body — light metal gradient; the only colour is the glowing tip
  if (harvesting) { ctx.shadowBlur = 12; ctx.shadowColor = dC; }
  const cg = ctx.createLinearGradient(0, -coneH, 0, coneH);
  cg.addColorStop(0, '#9a948a'); cg.addColorStop(0.5, '#5e594e'); cg.addColorStop(1, '#322e26');
  ctx.fillStyle = cg;
  ctx.beginPath(); ctx.moveTo(0, -coneH); ctx.lineTo(0, coneH); ctx.lineTo(coneL, 0); ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  // Scrolling helical flutes (clipped to the cone) — neutral cut lines
  ctx.save();
  ctx.beginPath(); ctx.moveTo(0, -coneH); ctx.lineTo(0, coneH); ctx.lineTo(coneL, 0); ctx.closePath(); ctx.clip();
  const spin = harvesting ? aT * -9 : aT * -0.5;
  const flutes = 7, spacing = coneL / flutes;
  const off = (((spin % 1) + 1) % 1) * spacing;
  for (let i = -1; i < flutes + 1; i++) {
    const x = i * spacing + off;
    const hh = coneH * Math.max(0, 1 - x / coneL);
    ctx.strokeStyle = 'rgba(30,28,22,0.55)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x, -hh - 2); ctx.lineTo(x - spacing * 0.5, hh + 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(224,220,208,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 1.5, -hh - 2); ctx.lineTo(x - spacing * 0.5 + 1.5, hh + 2); ctx.stroke();
  }
  ctx.restore(); // end clip

  // Glowing tip
  ctx.fillStyle = dC; ctx.shadowBlur = harvesting ? 16 : 5; ctx.shadowColor = dC;
  ctx.beginPath(); ctx.arc(coneL, 0, harvesting ? 3.2 : 2.4, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;

  // Heat shimmer ring while drilling
  if (harvesting) {
    const pl = 0.5 + 0.5 * Math.sin(aT * 16);
    ctx.strokeStyle = dC; ctx.globalAlpha = 0.4 * pl; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(coneL * 0.5, 0, coneL * 0.42, coneH * 0.75, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ── TURRET CANNON ─────────────────────────────────────────────
// Mounted on top of the cockpit. The barrel rotates to track the
// nearest hostile and is the origin point for fired beams.
// pvX/pvY are the pivot's SCREEN coordinates (passed so the beam
// origin can be stored without re-deriving the rover transform).
function drawTurret(pvX, pvY, llvl) {
  // Aim: track nearest hostile, else rest pointing up-forward.
  const tgt = nearestEnemy(pvX, pvY);
  const want = tgt ? Math.atan2(tgt.y - pvY, tgt.x - pvX) : -0.5;
  // Shortest-arc smoothing toward the desired angle
  let diff = want - turretAngle;
  while (diff >  Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  turretAngle += diff * 0.2;

  const barrelLen = 22 + Math.min(llvl * 2, 14);
  const wepC = '#46e8ff';
  // Recoil kicks the barrel back the instant a beam is fired, then settles.
  const hot    = beams.length ? Math.min(1, beams[beams.length - 1].life / beams[beams.length - 1].ml) : 0;
  const recoil = hot * 4;

  ctx.save();
  ctx.translate(8, -30); // pivot in rover-local space (top of cockpit)

  // Mounting base / ring — grey, no colour outline
  const bg = ctx.createLinearGradient(0, -6, 0, 8);
  bg.addColorStop(0, '#a09a8c'); bg.addColorStop(1, '#3e3a32');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(-10, -5, 20, 13, 3); ctx.fill();
  ctx.fillStyle = '#2a2823';
  ctx.beginPath(); ctx.arc(0, 0, 6.5, 0, Math.PI * 2); ctx.fill();

  // Rotating barrel assembly (recoils along its own axis)
  ctx.save();
  ctx.rotate(turretAngle);
  ctx.translate(-recoil, 0);

  // Breech + barrel — light metal, no colour outline
  const brg = ctx.createLinearGradient(0, -5, 0, 5);
  brg.addColorStop(0, '#b4aea0'); brg.addColorStop(0.5, '#7c7668'); brg.addColorStop(1, '#3a352c');
  ctx.fillStyle = brg;
  ctx.beginPath(); ctx.roundRect(-6, -5, barrelLen, 10, 2); ctx.fill();
  // Cooling fins (neutral dark)
  ctx.strokeStyle = 'rgba(40,36,30,0.5)'; ctx.lineWidth = 1;
  for (let i = 1; i <= 4; i++) { const fx = barrelLen * 0.25 + i * 4; ctx.beginPath(); ctx.moveTo(fx, -5); ctx.lineTo(fx, 5); ctx.stroke(); }
  // Muzzle block
  ctx.fillStyle = '#2a2823';
  ctx.beginPath(); ctx.roundRect(barrelLen - 4, -4, 6, 8, 1.5); ctx.fill();
  // Charged muzzle glow (brightens just after firing)
  const mp = 0.4 + 0.3 * Math.sin(aT * 6) + hot;
  ctx.fillStyle = wepC; ctx.shadowBlur = 6 + hot * 16; ctx.shadowColor = wepC;
  ctx.globalAlpha = Math.min(1, mp);
  ctx.beginPath(); ctx.arc(barrelLen + 2, 0, 2.6 + hot * 3, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  // Muzzle flash burst right after firing
  if (hot > 0.45) {
    ctx.fillStyle = `rgba(200,250,255,${(hot - 0.45) * 1.6})`;
    ctx.beginPath();
    ctx.moveTo(barrelLen + 2, 0); ctx.lineTo(barrelLen + 14, -6);
    ctx.lineTo(barrelLen + 20, 0); ctx.lineTo(barrelLen + 14, 6);
    ctx.closePath(); ctx.fill();
  }

  ctx.restore(); // end barrel rotation
  ctx.restore(); // end turret mount

  // Store barrel-tip screen position for beam origin (pvX/pvY are the pivot)
  turretTipX = pvX + Math.cos(turretAngle) * (barrelLen - recoil);
  turretTipY = pvY + Math.sin(turretAngle) * (barrelLen - recoil);
}

// ── ROVER ─────────────────────────────────────────────────────
// Higher-fidelity armored mining rover. A fixed silhouette with animated
// parts: rolling tracks + suspension, spinning drill, recoiling turret,
// suspension bob while driving, and a rhythmic kick-back while drilling.
function drawRover(gY, atX, status) {
  const tl = STATE.upgrades.treads || 1;
  const ll = STATE.upgrades.laser  || 1;
  const harvesting = status === 'HARVESTING';

  // Body motion
  let rY = gY - 52, pitch = 0, kick = 0;
  if (status === 'DRIVING')    { rY += Math.sin(aT * 11) * 1.5 + Math.sin(aT * 6.7) * 0.6; pitch = Math.sin(aT * 5.3) * 0.02; }
  if (harvesting)              { const b = Math.max(0, Math.sin(aT * 9)); kick = -b * 2.6; pitch += b * 0.02; }
  if (status === 'RECALLING')  { rY += (Math.random() - 0.5) * 2.2; pitch = -0.04; }

  ctx.save(); ctx.translate(atX + kick, rY); ctx.rotate(pitch);

  // Ground contact shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(2, 54, 56, 7, 0, 0, Math.PI * 2); ctx.fill();

  // Tracks — far-side track first (2.5D depth: peeks up behind), near track in front
  // Longer track base so the rover reads as a long rectangular crawler, not a box.
  const trackW = 62 + Math.min((tl - 1) * 3, 14);
  ctx.save(); ctx.globalAlpha = 0.6; ctx.translate(-3, -9); drawTrack(0, 40, trackW * 0.97, 12); ctx.restore();
  drawTrack(0, 40, trackW, 13);

  // ── Lower hull skirt ──
  const skirt = ctx.createLinearGradient(0, 16, 0, 40);
  skirt.addColorStop(0, '#857f71'); skirt.addColorStop(1, '#4a463c');
  ctx.fillStyle = skirt;
  ctx.beginPath(); ctx.roundRect(-54, 18, 108, 20, [3, 3, 7, 7]); ctx.fill();
  ctx.fillStyle = 'rgba(216,168,70,0.5)';
  for (let x = -50; x < 48; x += 12) ctx.fillRect(x, 34, 6, 2.5);

  // ── Rear engine / cargo module ──
  const eng = ctx.createLinearGradient(0, -8, 0, 20);
  eng.addColorStop(0, '#9a9486'); eng.addColorStop(1, '#524e44');
  ctx.fillStyle = eng;
  ctx.beginPath(); ctx.roundRect(-52, -6, 30, 26, [5, 3, 3, 5]); ctx.fill();
  // 2.5D top face on the engine deck (visible lit top)
  ctx.fillStyle = '#b6b0a2';
  ctx.beginPath(); ctx.moveTo(-52, -6); ctx.lineTo(-22, -6); ctx.lineTo(-26, -14); ctx.lineTo(-56, -14); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(70,64,52,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-56, -14); ctx.lineTo(-26, -14); ctx.stroke();
  ctx.strokeStyle = 'rgba(40,36,30,0.5)'; ctx.lineWidth = 1.4;
  for (let y = -2; y < 16; y += 4) { ctx.beginPath(); ctx.moveTo(-50, y); ctx.lineTo(-26, y); ctx.stroke(); }
  // cargo fill readout on the engine deck
  const fp = Math.min(1, G.totalCargo() / 500);
  ctx.fillStyle = 'rgba(57,230,91,0.18)'; ctx.fillRect(-50, -4, 26, 4);
  if (fp > 0.001) { ctx.fillStyle = '#39e65b'; ctx.shadowBlur = 5; ctx.shadowColor = '#39e65b'; ctx.fillRect(-50, -4, 26 * fp, 4); ctx.shadowBlur = 0; }
  // exhaust stacks
  for (const ex of [-44, -36]) {
    ctx.fillStyle = '#5a564c';
    ctx.beginPath(); ctx.roundRect(ex, -14, 5, 10, 1.5); ctx.fill();
    ctx.fillStyle = '#16140f'; ctx.beginPath(); ctx.ellipse(ex + 2.5, -14, 2.5, 1.4, 0, 0, Math.PI * 2); ctx.fill();
  }

  // ── Main armored hull ── (light bone-grey, value-defined, no colour outline)
  const hull = ctx.createLinearGradient(0, -32, 0, 20);
  hull.addColorStop(0, '#cdc7b8'); hull.addColorStop(0.45, '#a39c8c'); hull.addColorStop(1, '#605a4e');
  ctx.fillStyle = hull;
  ctx.beginPath();
  ctx.moveTo(-24, 18); ctx.lineTo(-24, -18); ctx.lineTo(-10, -30);
  ctx.lineTo(26, -30); ctx.lineTo(44, -14); ctx.lineTo(44, 18);
  ctx.closePath(); ctx.fill();
  // 2.5D roof plane — the lit top of the hull, receding up-and-back (the visible
  // top that makes the rover read as a volume on the low-angle ground plane)
  ctx.fillStyle = '#ddd7c7';
  ctx.beginPath(); ctx.moveTo(-10, -30); ctx.lineTo(26, -30); ctx.lineTo(21, -39); ctx.lineTo(-15, -39); ctx.closePath(); ctx.fill();
  // shaded back lip of the roof
  ctx.strokeStyle = 'rgba(70,64,52,0.55)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-15, -39); ctx.lineTo(21, -39); ctx.stroke();
  // roof panel seams (sell the plane)
  ctx.strokeStyle = 'rgba(40,36,30,0.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(4, -30); ctx.lineTo(0, -39); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-12, -34.5); ctx.lineTo(24, -34.5); ctx.stroke();
  // top rim light (warm) — the front-top edge
  ctx.strokeStyle = 'rgba(234,229,214,0.6)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-10, -30); ctx.lineTo(26, -30); ctx.stroke();
  // panel seams (neutral dark recesses give the form)
  ctx.strokeStyle = 'rgba(40,36,30,0.4)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-10, -18); ctx.lineTo(44, -18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4, -30); ctx.lineTo(4, 18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-24, 2); ctx.lineTo(44, 2); ctx.stroke();
  // rivets
  ctx.fillStyle = 'rgba(40,36,30,0.55)';
  for (const [bx, by] of [[-20, -14], [-20, 14], [40, -10], [40, 14], [0, -26], [22, -26]]) { ctx.beginPath(); ctx.arc(bx, by, 1.5, 0, Math.PI * 2); ctx.fill(); }
  // weathering streaks (rust)
  ctx.strokeStyle = 'rgba(120,86,52,0.3)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-14, -16); ctx.lineTo(-13, 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(30, -24); ctx.lineTo(31, -4); ctx.stroke();
  // hazard chevron decal along the lower hull (warm painted marking)
  ctx.save(); ctx.beginPath(); ctx.rect(-24, 8, 68, 10); ctx.clip();
  for (let i = 0; i < 9; i++) {
    ctx.fillStyle = 'rgba(216,168,70,0.55)';
    const cx = -24 + i * 9;
    ctx.beginPath(); ctx.moveTo(cx, 18); ctx.lineTo(cx + 5, 18); ctx.lineTo(cx - 3, 8); ctx.lineTo(cx - 8, 8); ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // ── Sensor head (solid grey housing — no window panel, no eye) ──
  const cock = ctx.createLinearGradient(0, -28, 0, -4);
  cock.addColorStop(0, '#8f897b'); cock.addColorStop(1, '#4e4a40');
  ctx.fillStyle = cock;
  ctx.beginPath(); ctx.roundRect(8, -26, 30, 22, [3, 9, 4, 3]); ctx.fill();
  // 2.5D top face on the sensor head
  ctx.fillStyle = '#aaa496';
  ctx.beginPath(); ctx.moveTo(8, -26); ctx.lineTo(38, -26); ctx.lineTo(34, -31); ctx.lineTo(4, -31); ctx.closePath(); ctx.fill();
  // armored louvre vents (neutral recessed slits — replaces the old viewport)
  ctx.strokeStyle = 'rgba(40,36,30,0.5)'; ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) { const vy = -21 + i * 5; ctx.beginPath(); ctx.moveTo(12, vy); ctx.lineTo(33, vy); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(224,220,208,0.28)'; ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) { const vy = -21 + i * 5 + 1; ctx.beginPath(); ctx.moveTo(12, vy); ctx.lineTo(33, vy); ctx.stroke(); }
  // corner bolts
  ctx.fillStyle = 'rgba(40,36,30,0.55)';
  for (const [bx, by] of [[12, -23], [33, -23], [12, -7], [33, -7]]) { ctx.beginPath(); ctx.arc(bx, by, 1.2, 0, Math.PI * 2); ctx.fill(); }

  // ── Power core (colour by charge) ──
  const active = STATE.expedition.active;
  const plvl = active ? (STATE.expedition.power || 0) / G.maxPower() : 1;
  let cc = '#39e65b'; if (active && plvl < 0.25) cc = '#ff3b30'; else if (active && plvl < 0.6) cc = '#ffaa00';
  if (!active) cc = '#2e6a40';
  const corePulse = 0.6 + 0.4 * Math.sin(aT * 7);
  ctx.fillStyle = cc; ctx.shadowBlur = 12 * corePulse; ctx.shadowColor = cc;
  ctx.beginPath(); ctx.arc(-6, 6, 5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  ctx.strokeStyle = cc + '66'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(-6, 6, 8 + corePulse * 2, 0, Math.PI * 2); ctx.stroke();

  // ── Headlamp cone (driving / drilling) ──
  if (status === 'DRIVING' || harvesting) {
    const lampP = 0.7 + 0.3 * Math.sin(aT * 3);
    const cone = ctx.createLinearGradient(44, 0, 120, 0);
    cone.addColorStop(0, `rgba(220,240,180,${0.12 * lampP})`); cone.addColorStop(1, 'rgba(220,240,180,0)');
    ctx.fillStyle = cone;
    ctx.beginPath(); ctx.moveTo(42, -8); ctx.lineTo(120, -30); ctx.lineTo(120, 20); ctx.lineTo(42, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(240,250,210,${lampP})`; ctx.shadowBlur = 8; ctx.shadowColor = '#f0f4d0';
    ctx.beginPath(); ctx.arc(42, -2, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  }

  // ── Antenna (sways while driving) ──
  const aSway = Math.sin(aT * 2.4) * (status === 'DRIVING' ? 3 : 1);
  ctx.strokeStyle = '#2a6040'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-16, -28); ctx.quadraticCurveTo(-18, -40, -14 + aSway * 0.4, -48); ctx.stroke();
  const antP = 0.5 + 0.5 * Math.sin(aT * 3.2);
  ctx.fillStyle = `rgba(57,230,91,${antP})`; ctx.shadowBlur = 5; ctx.shadowColor = '#39e65b';
  ctx.beginPath(); ctx.arc(-14 + aSway * 0.4, -49, 2.4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;

  // ── Hazard beacon (drilling / recalling) ──
  if (harvesting || status === 'RECALLING') {
    const bp = 0.5 + 0.5 * Math.sin(aT * 9);
    ctx.fillStyle = `rgba(240,150,40,${bp})`; ctx.shadowBlur = 10 * bp; ctx.shadowColor = '#f0a830';
    ctx.beginPath(); ctx.arc(2, -32, 3, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  }

  // ── Front drill ──
  drawDrill(ll, harvesting);

  // ── Turret (pivot screen coords; +kick keeps the beam origin aligned) ──
  drawTurret(atX + kick + 8, rY - 30, STATE.upgrades.weapon || 1);

  ctx.restore();
}

// ── OBSTACLE / RESOURCE NODES ─────────────────────────────────
// Resources read as rocky/organic forms embedded in the world: muted earthy
// bodies with dark (not bright) outlines. Only RARE minerals (low spawn weight
// or exotic tier) and living ORGANIC matter get a bioluminescent glow.
function drawObs(def, gY) {
  const c       = def.color;
  const rare    = def.tier === 'exotic' || (def.weight > 0 && def.weight <= 10);
  const organic = def.category === 'Organic Matter';
  const lum     = rare || organic;                       // gets bioluminescence
  const pulse   = 0.5 + 0.5 * Math.sin(aT * (organic ? 3.6 : 2.2) + def.weight);
  const ol      = 'rgba(12,10,6,0.62)';                  // earthy dark outline
  const acc     = lum ? c : c + '99';                    // accent (muted unless luminescent)
  ctx.save(); ctx.translate(0, gY - 15);

  if (def.obsShape === 'heap') {
    // craggy ore pile half-buried in dirt
    ctx.fillStyle = '#2a2618';
    ctx.beginPath();
    ctx.moveTo(0,15); ctx.lineTo(11,-19); ctx.lineTo(25,-27);
    ctx.lineTo(41,-19); ctx.lineTo(54,15); ctx.closePath();
    ctx.fill(); ctx.strokeStyle = ol; ctx.lineWidth = 1.6; ctx.stroke();
    // ore facets in the resource colour
    if (lum) { ctx.shadowBlur = 8 * pulse; ctx.shadowColor = c; }
    ctx.fillStyle = acc; ctx.globalAlpha = lum ? 0.7 : 0.42;
    [[16,-8,7],[29,-14,6],[24,3,5],[40,1,5],[10,6,4]].forEach(([fx,fy,fr]) => {
      ctx.beginPath(); ctx.moveTo(fx,fy-fr); ctx.lineTo(fx+fr,fy); ctx.lineTo(fx,fy+fr); ctx.lineTo(fx-fr,fy); ctx.closePath(); ctx.fill();
    });
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    // faint sunlit top ridge
    ctx.strokeStyle = 'rgba(150,142,108,0.22)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(11,-19); ctx.lineTo(25,-27); ctx.lineTo(41,-19); ctx.stroke();

  } else if (def.obsShape === 'shard') {
    // angular slab of mineral-veined rock
    ctx.fillStyle = '#26241a';
    ctx.beginPath();
    ctx.moveTo(5,15); ctx.lineTo(18,-30); ctx.lineTo(29,-21);
    ctx.lineTo(43,-30); ctx.lineTo(56,12); ctx.lineTo(40,15); ctx.closePath();
    ctx.fill(); ctx.strokeStyle = ol; ctx.lineWidth = 1.6; ctx.stroke();
    if (lum) { ctx.shadowBlur = 9 * pulse; ctx.shadowColor = c; }
    ctx.fillStyle = acc; ctx.globalAlpha = lum ? 0.66 : 0.4;
    ctx.beginPath(); ctx.moveTo(18,-30); ctx.lineTo(25,-4); ctx.lineTo(13,9); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(43,-30); ctx.lineTo(49,-2); ctx.lineTo(37,8); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;

  } else if (def.obsShape === 'crystal') {
    // tall crystal cluster — the rare exotics; strongest glow
    ctx.fillStyle = '#1d1b24';
    ctx.beginPath();
    ctx.moveTo(25,-44); ctx.lineTo(40,-8); ctx.lineTo(36,15);
    ctx.lineTo(14,15); ctx.lineTo(10,-8); ctx.closePath();
    ctx.fill(); ctx.strokeStyle = ol; ctx.lineWidth = 1.6; ctx.stroke();
    if (lum) { ctx.shadowBlur = 16 * pulse; ctx.shadowColor = c; }
    ctx.fillStyle = acc; ctx.globalAlpha = lum ? 0.82 : 0.5;
    ctx.beginPath(); ctx.moveTo(25,-44); ctx.lineTo(34,-8); ctx.lineTo(25,3); ctx.lineTo(16,-8); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = lum ? 0.5 : 0.3;
    ctx.beginPath(); ctx.moveTo(12,-16); ctx.lineTo(22,-38); ctx.lineTo(29,-27); ctx.lineTo(18,-11); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    if (lum) { ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.5 * pulse; ctx.beginPath(); ctx.arc(25,-15,3,0,Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; }

  } else if (def.obsShape === 'cyst') {
    // organic pod — soft bioluminescent sac with a pulsing nucleus
    ctx.fillStyle = '#162018';
    ctx.beginPath(); ctx.arc(26,2,22,0,Math.PI,true); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(22,32,20,0.7)'; ctx.lineWidth = 1.6; ctx.stroke();
    // membrane veins
    ctx.strokeStyle = acc; ctx.globalAlpha = 0.4; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(12,2);  ctx.quadraticCurveTo(18,-15,26,-17); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(40,2);  ctx.quadraticCurveTo(34,-15,26,-17); ctx.stroke();
    ctx.globalAlpha = 1;
    // glowing nucleus
    ctx.fillStyle = c; ctx.shadowBlur = 12 * pulse; ctx.shadowColor = c;
    ctx.globalAlpha = 0.3 + 0.45 * pulse;
    ctx.beginPath(); ctx.arc(26,-5, 9 * (0.7 + 0.3*pulse), 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;

  } else { // node
    ctx.fillStyle = '#1c1a12';
    ctx.beginPath(); ctx.arc(25,0,21,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = ol; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.strokeStyle = acc; ctx.globalAlpha = lum ? 0.5 : 0.3; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(25,0,13,0,Math.PI*2); ctx.stroke(); ctx.globalAlpha = 1;
    if (lum) {
      for (let i = 0; i < 6; i++) { const a = i/6*Math.PI*2 + aT*0.5; ctx.fillStyle = acc; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(25+Math.cos(a)*16, Math.sin(a)*16, 2.4, 0, Math.PI*2); ctx.fill(); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = c; ctx.shadowBlur = 15 * pulse; ctx.shadowColor = c;
      ctx.beginPath(); ctx.arc(25,0,7,0,Math.PI*2); ctx.fill(); ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = acc; ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.arc(25,0,6,0,Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

// ── HOSTILE ORB ───────────────────────────────────────────────
// Luminescent roaming orb. Position (en.x/en.y) is screen space,
// driven by updateEnemies() in game.js.
function drawEnemy(en) {
  if (en.dead) {
    // Expanding burst on death / departure
    const f  = Math.max(0, en.deathTimer / 0.5);
    const dr = (1 - f) * 34;
    const c  = en.escaped ? 200 : en.hue;
    ctx.save();
    ctx.globalAlpha = f;
    ctx.strokeStyle = `hsl(${c},90%,65%)`; ctx.lineWidth = 3;
    ctx.shadowBlur = 14; ctx.shadowColor = `hsl(${c},90%,65%)`;
    ctx.beginPath(); ctx.arc(en.x, en.y, dr, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = `hsla(${c},100%,85%,${f * 0.5})`;
    ctx.beginPath(); ctx.arc(en.x, en.y, dr * 0.5, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.restore();
    return;
  }

  const p = 0.6 + 0.4 * Math.sin(aT * 4 + en.pulse);
  const r = 11 + p * 2;
  ctx.save(); ctx.translate(en.x, en.y);

  // Outer glow halo
  ctx.shadowBlur = 24; ctx.shadowColor = `hsl(${en.hue},95%,60%)`;
  const grd = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.7);
  grd.addColorStop(0,   `hsla(${en.hue},100%,88%,0.95)`);
  grd.addColorStop(0.45,`hsla(${en.hue},90%,60%,0.75)`);
  grd.addColorStop(1,   `hsla(${en.hue},90%,45%,0)`);
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(0, 0, r * 1.7, 0, Math.PI*2); ctx.fill();

  // Bright core
  ctx.shadowBlur = 12;
  ctx.fillStyle = `hsl(${en.hue},100%,93%)`;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, Math.PI*2); ctx.fill();
  ctx.shadowBlur = 0;

  // HP bar
  const hpPct = en.hp / en.maxHp;
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(-16, -r - 11, 32, 4);
  ctx.fillStyle = hpPct > 0.5 ? '#39e65b' : hpPct > 0.25 ? '#ffaa00' : '#ff3b30';
  ctx.fillRect(-16, -r - 11, 32 * hpPct, 4);

  ctx.restore();
}

// ── HANGAR BAY (standby + launch) ─────────────────────────────
// Industrial interior aboard the ship. The bay door sits on the right
// and rolls up as launchP climbs 0→~0.32, revealing the wasteland beyond.
function drawHangar(W, H, gY, doorOpen, warn) {
  const doorW = Math.min(260, W * 0.26);
  const doorX = W - doorW;

  // ── Back wall — cool gunmetal gradient ──
  const wall = ctx.createLinearGradient(0, 0, 0, gY);
  wall.addColorStop(0,   '#0e1013');
  wall.addColorStop(0.5, '#15181c');
  wall.addColorStop(1,   '#1b1f24');
  ctx.fillStyle = wall; ctx.fillRect(0, 0, W, gY);

  // ── Deep-bay recess + distant machinery (gives the room real depth) ──
  const recess = ctx.createLinearGradient(0, 0, 0, gY);
  recess.addColorStop(0, '#090b0d'); recess.addColorStop(1, '#0f1316');
  ctx.fillStyle = recess; ctx.fillRect(0, gY * 0.14, doorX, gY * 0.78);
  for (let x = 70; x < doorX - 40; x += 124) {
    const mh = 60 + ((x * 7) % 92);
    ctx.fillStyle = '#171b1f'; ctx.fillRect(x, gY - mh, 42, mh);
    ctx.fillStyle = '#13171a'; ctx.fillRect(x + 46, gY - mh * 0.66, 22, mh * 0.66);
    ctx.strokeStyle = '#1c2127'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x, gY - mh * 0.6); ctx.lineTo(x + 66, gY - mh * 0.6); ctx.stroke();
    if ((x * 3) % 5 < 2) {
      const lp = 0.5 + 0.5 * Math.sin(aT * 3 + x);
      ctx.fillStyle = `rgba(240,150,60,${0.45 + 0.4 * lp})`; ctx.shadowBlur = 6; ctx.shadowColor = '#f09030';
      ctx.beginPath(); ctx.arc(x + 21, gY - mh + 9, 2.5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }
  }
  // Haze the recess back so the foreground frame reads as closer
  ctx.fillStyle = 'rgba(24,28,32,0.4)'; ctx.fillRect(0, gY * 0.14, doorX, gY * 0.78);

  // Structural ribs / support columns
  const ribGap = 150;
  for (let x = 40; x < doorX - 20; x += ribGap) {
    ctx.fillStyle = '#23282e';
    ctx.fillRect(x, 0, 26, gY);
    ctx.fillStyle = '#2c333a';
    ctx.fillRect(x, 0, 5, gY);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x + 21, 0, 5, gY);
    // Bolt rows
    ctx.fillStyle = '#161a1e';
    for (let y = 40; y < gY; y += 60) {
      ctx.beginPath(); ctx.arc(x + 13, y, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Wall panel seams
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
  for (let y = 70; y < gY; y += 70) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(doorX, y); ctx.stroke();
  }

  // Wall pipes
  ctx.strokeStyle = '#2a3138'; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(0, gY - 50); ctx.lineTo(doorX, gY - 50); ctx.stroke();
  ctx.strokeStyle = '#202429';
  ctx.beginPath(); ctx.moveTo(0, gY - 90); ctx.lineTo(doorX - 60, gY - 90); ctx.lineTo(doorX - 60, 30); ctx.stroke();

  // ── Overhead gantry / catwalk + hanging cables ──
  const gyc = gY * 0.34;
  ctx.fillStyle = '#20262c'; ctx.fillRect(0, gyc, doorX, 9);
  ctx.fillStyle = '#2a313a'; ctx.fillRect(0, gyc, doorX, 3);
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, gyc + 7, doorX, 2);
  ctx.strokeStyle = '#171b1f'; ctx.lineWidth = 2;
  for (let x = 24; x < doorX; x += 44) { ctx.beginPath(); ctx.moveTo(x, gyc + 9); ctx.lineTo(x, gyc + 20); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2;
  for (const cx of [90, 250, 430, 600]) { if (cx < doorX) { ctx.beginPath(); ctx.moveTo(cx, 0); ctx.quadraticCurveTo(cx + 12, 64, cx - 6, 116); ctx.stroke(); } }

  // ── Overhead light fixtures + pools on the floor ──
  for (let x = 120; x < doorX; x += 260) {
    const lp = 0.7 + 0.3 * Math.sin(aT * 2 + x);
    ctx.fillStyle = `rgba(255,240,200,${0.5 * lp})`;
    ctx.fillRect(x - 26, 0, 52, 8);
    ctx.fillStyle = `rgba(255,240,200,${0.9 * lp})`;
    ctx.fillRect(x - 20, 4, 40, 3);
    // light cone
    const cone = ctx.createLinearGradient(0, 8, 0, gY);
    cone.addColorStop(0, `rgba(255,238,190,${0.10 * lp})`);
    cone.addColorStop(1, 'rgba(255,238,190,0)');
    ctx.fillStyle = cone;
    ctx.beginPath(); ctx.moveTo(x - 24, 8); ctx.lineTo(x + 24, 8); ctx.lineTo(x + 70, gY); ctx.lineTo(x - 70, gY); ctx.closePath(); ctx.fill();
  }

  // ── The opening behind the door — wasteland beyond ──
  if (doorOpen > 0.01) {
    ctx.save();
    ctx.beginPath(); ctx.rect(doorX, 0, doorW, gY); ctx.clip();
    // bright exterior sky (matches the wasteland palette)
    const ext = ctx.createLinearGradient(0, 0, 0, gY);
    ext.addColorStop(0,   '#2b322a');
    ext.addColorStop(0.6, '#52503f');
    ext.addColorStop(1,   '#6f6d54');
    ctx.fillStyle = ext; ctx.fillRect(doorX, 0, doorW, gY);
    // hazy exterior sun glow (sickly green to match the wasteland orb)
    const g = ctx.createRadialGradient(doorX + doorW * 0.5, gY * 0.5, 0, doorX + doorW * 0.5, gY * 0.5, doorW);
    g.addColorStop(0, 'rgba(200,206,150,0.4)');
    g.addColorStop(1, 'rgba(200,206,150,0)');
    ctx.fillStyle = g; ctx.fillRect(doorX, 0, doorW, gY);
    // faint biomech spires visible through the doorway
    ctx.fillStyle = 'rgba(96,104,82,0.6)';
    for (const [sx, sh, sw] of [[40, 150, 16], [110, 220, 22], [180, 130, 14], [230, 190, 18]]) {
      const px = doorX + sx;
      ctx.beginPath(); ctx.moveTo(px - sw, gY - 26); ctx.lineTo(px - sw*0.3, gY - 26 - sh*0.7);
      ctx.lineTo(px, gY - 26 - sh); ctx.lineTo(px + sw*0.3, gY - 26 - sh*0.7); ctx.lineTo(px + sw, gY - 26); ctx.closePath(); ctx.fill();
    }
    // distant ground line outside
    ctx.fillStyle = 'rgba(36,40,26,0.95)';
    ctx.fillRect(doorX, gY - 26, doorW, 26);
    ctx.restore();
  }

  // ── Floor — 2.5D receding bay floor (matches the wasteland path) ──
  const HS = 20, fTop = gY - HS;
  // Receding floor surface band (covers the base of the back wall)
  const fl = ctx.createLinearGradient(0, fTop, 0, gY);
  fl.addColorStop(0, '#11161c'); fl.addColorStop(1, '#1a1f26');
  ctx.fillStyle = fl; ctx.fillRect(0, fTop, W, HS);
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, fTop, W, 2);   // far seam
  // Near front floor
  ctx.fillStyle = '#0c0e10'; ctx.fillRect(0, gY, W, H - gY);
  // Perspective floor plates — fan toward a vanishing point near the bay door
  const vpX = doorX - 40;
  ctx.strokeStyle = '#1a1e22'; ctx.lineWidth = 2;
  for (let x = -500; x < W + 500; x += 116) {
    ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(vpX + (x - vpX) * 0.16, fTop); ctx.stroke();
  }
  // Tile recession lines + lit front lip
  ctx.strokeStyle = '#15191d'; ctx.lineWidth = 1;
  for (const fy of [gY + 16, gY + 42, gY + 74]) { ctx.beginPath(); ctx.moveTo(0, fy); ctx.lineTo(W, fy); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(60,68,76,0.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, gY); ctx.lineTo(W, gY); ctx.stroke();
  // Floor sheen
  ctx.fillStyle = 'rgba(255,255,255,0.02)'; ctx.fillRect(0, gY, W, 14);

  // ── Floor clutter — crates, a barrel, loose cabling ──
  ctx.fillStyle = '#23282d'; ctx.fillRect(58, gY - 26, 40, 26);
  ctx.strokeStyle = '#333b42'; ctx.lineWidth = 1.5; ctx.strokeRect(58, gY - 26, 40, 26);
  ctx.fillStyle = 'rgba(232,192,32,0.6)'; ctx.fillRect(62, gY - 22, 32, 4);
  ctx.fillStyle = '#1e221f'; ctx.fillRect(96, gY - 18, 26, 18);
  ctx.strokeStyle = '#2c322a'; ctx.strokeRect(96, gY - 18, 26, 18);
  ctx.fillStyle = '#2a2f26'; ctx.beginPath(); ctx.roundRect(150, gY - 30, 22, 30, 3); ctx.fill();
  ctx.strokeStyle = '#3a4030'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(150, gY - 22); ctx.lineTo(172, gY - 22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(150, gY - 10); ctx.lineTo(172, gY - 10); ctx.stroke();
  ctx.strokeStyle = '#14171a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, gY + 20); ctx.bezierCurveTo(120, gY + 14, 240, gY + 26, 400, gY + 18); ctx.stroke();

  // Hazard chevrons leading to the bay door
  ctx.save();
  ctx.beginPath(); ctx.rect(doorX - 150, gY, 150, H - gY); ctx.clip();
  for (let i = -1; i < 12; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(232,192,32,0.5)' : 'rgba(20,20,20,0.5)';
    const cx = doorX - 150 + i * 26;
    ctx.beginPath();
    ctx.moveTo(cx, gY); ctx.lineTo(cx + 18, gY); ctx.lineTo(cx + 36, H); ctx.lineTo(cx + 18, H);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  // ── Bay BLAST DOOR — heavy slab that lifts straight UP into an overhead pocket ──
  // Built with wall-thickness jambs + a slanted (perspective) sill and a 3D leading
  // lip, so it reads as a 3D portal in the 2.5D bay rather than a flat square.
  const jamb = 22;
  const openX = doorX + jamb;          // inner edge of the actual opening
  const sillL = gY - HS + 3;           // threshold follows the receding floor band:
  const sillR = gY;                    //   inner (left) side higher, near (right) lower
  const topY  = 22;                    // underside of the lintel / pocket mouth

  // Perspective jamb faces (the wall's thickness around the portal)
  ctx.fillStyle = '#2c333b';           // lit inner jamb
  ctx.beginPath(); ctx.moveTo(doorX, 0); ctx.lineTo(openX, topY); ctx.lineTo(openX, sillL); ctx.lineTo(doorX, gY); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.4)';   // shadowed lintel underside
  ctx.beginPath(); ctx.moveTo(doorX, 0); ctx.lineTo(W, 0); ctx.lineTo(W, topY); ctx.lineTo(openX, topY); ctx.closePath(); ctx.fill();

  // Outer frame rail on the bay side
  ctx.fillStyle = '#1c2025'; ctx.fillRect(doorX - 14, 0, 14, gY);
  ctx.fillStyle = '#2a3037'; ctx.fillRect(doorX - 14, 0, 5, gY);

  // Lifting slab — its bottom edge rises from the sill up to the lintel as doorOpen 0→1.
  const liftL = sillL + (topY - sillL) * doorOpen;   // left bottom-edge Y
  const liftR = sillR + (topY - sillR) * doorOpen;   // right bottom-edge Y
  if (doorOpen < 0.992) {
    ctx.save();
    ctx.beginPath(); ctx.rect(openX, 0, W - openX, gY); ctx.clip();
    const dg = ctx.createLinearGradient(openX, 0, W, 0);
    dg.addColorStop(0, '#262b31'); dg.addColorStop(0.5, '#343b43'); dg.addColorStop(1, '#23282e');
    ctx.fillStyle = dg;
    ctx.beginPath(); ctx.moveTo(openX, 0); ctx.lineTo(W, 0); ctx.lineTo(W, liftR); ctx.lineTo(openX, liftL); ctx.closePath(); ctx.fill();
    // Heavy horizontal slats
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2;
    const slatMax = Math.max(liftL, liftR);
    for (let y = topY + 18; y < slatMax; y += 22) {
      ctx.beginPath(); ctx.moveTo(openX, y - (y-topY)*0.0); ctx.lineTo(W, y); ctx.stroke();
    }
    // Hazard stripes near the leading edge (clipped to the slab band)
    ctx.save();
    ctx.beginPath(); ctx.moveTo(openX, liftL); ctx.lineTo(W, liftR); ctx.lineTo(W, liftR - 26); ctx.lineTo(openX, liftL - 26); ctx.closePath(); ctx.clip();
    ctx.fillStyle = 'rgba(232,192,32,0.85)';
    for (let k = 1; k <= 2; k++) {
      const off = liftL - k * 12;
      ctx.beginPath(); ctx.moveTo(openX, off); ctx.lineTo(W, off - (liftL - liftR)); ctx.lineTo(W, off - (liftL - liftR) + 5); ctx.lineTo(openX, off + 5); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // 3D leading lip — bright top edge + dark thickness face beneath it
    ctx.strokeStyle = 'rgba(150,160,170,0.6)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(openX, liftL); ctx.lineTo(W, liftR); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath(); ctx.moveTo(openX, liftL); ctx.lineTo(W, liftR); ctx.lineTo(W, liftR + 6); ctx.lineTo(openX, liftL + 6); ctx.closePath(); ctx.fill();
    // Moving warning beacon on the slab
    if (warn && doorOpen > 0 && doorOpen < 1) {
      const wp = 0.5 + 0.5 * Math.sin(aT * 14);
      ctx.fillStyle = `rgba(240,90,50,${wp})`; ctx.shadowBlur = 8 * wp; ctx.shadowColor = '#f0502a';
      ctx.beginPath(); ctx.arc((openX + W) / 2, topY + 18, 8, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
  // Overhead pocket the door retracts into (dark recess so the upward lift reads)
  ctx.fillStyle = '#0a0c0e'; ctx.fillRect(openX, 0, W - openX, 9);
  // Lintel + caution trim across the top
  ctx.fillStyle = '#1c2025'; ctx.fillRect(doorX - 14, 0, doorW + 14, topY - 4);
  ctx.fillStyle = 'rgba(232,192,32,0.5)'; ctx.fillRect(doorX - 14, topY - 6, doorW + 14, 2);
}

// Rover's screen X while launching: idles, then accelerates out through the door.
function launchRoverX(W, launchP) {
  return W * 0.40 + (W * 1.08 - W * 0.40) * smoothstep(launchP, 0.28, 1.0);
}

// Recall phase 1 (wasteland): ROVERX → winched off-screen left, gone by mid-recall.
function recallExitX(W, recallP) {
  return ROVERX + (-140 - ROVERX) * smoothstep(recallP, 0.0, 0.48);
}

// Recall phase 2 (hangar): reverses in from the bay door back to the parked spot.
function recallEnterX(W, recallP) {
  return W * 1.08 + (W * 0.40 - W * 1.08) * smoothstep(recallP, 0.5, 0.92);
}

// Descent: phase 1 the rover drives right into the entrance; phase 2 (after the black
// cut + biome switch) it drives back in from the left to its normal spot.
function descRoverX(W, p) {
  if (p < 0.5) return ROVERX + (W - 36 - ROVERX) * smoothstep(p, 0.0, 0.48);
  return -60 + (ROVERX + 60) * smoothstep(p, 0.55, 1.0);
}
// A biomech tunnel-mouth / cave entrance at the right edge that the rover drives into
// during descent phase 1. Grows slightly as it's "approached".
function drawCaveEntrance(W, H, gY, p) {
  const ax = W - 30, grow = 0.8 + smoothstep(p, 0, 0.5) * 0.5;
  const w = 150 * grow, h = (H - 20) * 0.78 * grow, topY = gY - h;
  ctx.save();
  // outer rock/biomech frame
  ctx.fillStyle = '#171511';
  ctx.beginPath();
  ctx.moveTo(ax - w, gY);
  ctx.quadraticCurveTo(ax - w, topY, ax - w * 0.35, topY);
  ctx.quadraticCurveTo(ax, topY - 14, ax + 60, topY + 20);
  ctx.lineTo(ax + 60, gY);
  ctx.closePath(); ctx.fill();
  // dark mouth (recedes into black)
  const mg = ctx.createRadialGradient(ax - w * 0.45, gY - h * 0.5, 4, ax - w * 0.45, gY - h * 0.5, w * 0.8);
  mg.addColorStop(0, '#000'); mg.addColorStop(0.7, '#0a0907'); mg.addColorStop(1, '#1a1712');
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.moveTo(ax - w * 0.85, gY);
  ctx.quadraticCurveTo(ax - w * 0.85, topY + h * 0.18, ax - w * 0.4, topY + h * 0.1);
  ctx.quadraticCurveTo(ax + 10, topY + h * 0.05, ax + 30, gY);
  ctx.closePath(); ctx.fill();
  // a few biomech ribs framing the mouth + faint warm interior glow
  ctx.strokeStyle = 'rgba(120,110,86,0.5)'; ctx.lineWidth = 3;
  for (let i = 0; i < 4; i++) { const t = i / 3; ctx.beginPath(); ctx.moveTo(ax - w * (0.85 - t * 0.5), gY); ctx.quadraticCurveTo(ax - w * (0.6 - t * 0.3), topY + h * (0.2 + t * 0.1), ax - w * 0.1, topY + h * 0.1); ctx.stroke(); }
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const ig = ctx.createRadialGradient(ax - w * 0.45, gY - h * 0.45, 2, ax - w * 0.45, gY - h * 0.45, w * 0.5);
  ig.addColorStop(0, 'rgba(240,150,70,0.18)'); ig.addColorStop(1, 'rgba(240,150,70,0)');
  ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(ax - w * 0.45, gY - h * 0.45, w * 0.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.restore();
}

// Stable hash-noise in [0,1) for deterministic, non-repeating placement that
// scrolls smoothly (keyed to an absolute index, not a moving x).
function frand(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
// Smooth value-noise in [0,1] (interpolated frand) — for organic, crumbling edges.
function noise1(t) { const i = Math.floor(t), f = t - i, u = f*f*(3-2*f); return frand(i)*(1-u) + frand(i+1)*u; }

// Iterate the visible columns of an infinite layer at a given parallax fraction
// of scrollWorld. cb(absoluteIndex, screenX) — index is stable as it scrolls.
function eachCol(frac, spacing, cb) {
  const off = scrollWorld * frac;
  const a = Math.floor(off / spacing) - 1, b = Math.floor((off + canvas.width) / spacing) + 1;
  for (let n = a; n <= b; n++) cb(n, n * spacing - off);
}

// A simple thin distant spire (cheap — used in the far sprawl in bulk).
function drawSpire(x, baseY, h, w, col, hi) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x - w, baseY); ctx.lineTo(x - w*0.35, baseY - h*0.72);
  ctx.lineTo(x, baseY - h); ctx.lineTo(x + w*0.35, baseY - h*0.72);
  ctx.lineTo(x + w, baseY); ctx.closePath(); ctx.fill();
  if (hi) { ctx.strokeStyle = hi; ctx.lineWidth = 1; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(x - w, baseY); ctx.lineTo(x, baseY - h); ctx.stroke(); ctx.globalAlpha = 1; }
}

// ── BIOMECH STRUCTURE HELPERS (parallax ornamentation) ──────────
// A tapering, ribbed biomechanical tower: horizontal-gradient form shading,
// vertebrae ribs, a central conduit, side tube-loops, ports, an arched base
// opening, and a lit (left) edge. `detail=false` skips the costly internals
// for hazy far-distance silhouettes.
function bmTower(bx, baseY, h, w, fill, hi, dark, detail, seed = 0) {
  const topY = baseY - h;
  const grad = ctx.createLinearGradient(bx - w*0.5, 0, bx + w*0.5, 0);
  grad.addColorStop(0, hi); grad.addColorStop(0.42, fill); grad.addColorStop(1, dark);
  const jc = frand(seed) - 0.5;   // per-tower crown jitter (stable)
  const bl = (frand(seed+3) - 0.5) * 0.05;   // stable organic bulge variance
  // Curved organic flanks (no straight column sides) + a jagged broken crown.
  const outline = () => {
    ctx.beginPath();
    ctx.moveTo(bx - w*0.50, baseY);
    ctx.quadraticCurveTo(bx - w*(0.54+bl), baseY - h*0.34, bx - w*0.40, baseY - h*0.60);
    ctx.quadraticCurveTo(bx - w*(0.33-bl), baseY - h*0.80, bx - w*0.21, baseY - h*0.90);
    ctx.quadraticCurveTo(bx - w*0.16, baseY - h*0.96, bx - w*0.16, topY + 8);
    // jagged broken crown (kept angular — it's meant to read as shattered)
    ctx.lineTo(bx - w*0.06, topY - 12 - jc*18);
    ctx.lineTo(bx + w*0.00, topY + 6);
    ctx.lineTo(bx + w*0.08, topY - 18 + jc*16);
    ctx.lineTo(bx + w*0.15, topY + 10);
    ctx.quadraticCurveTo(bx + w*0.16, baseY - h*0.96, bx + w*0.21, baseY - h*0.90);
    ctx.quadraticCurveTo(bx + w*(0.33+bl), baseY - h*0.80, bx + w*0.40, baseY - h*0.60);
    ctx.quadraticCurveTo(bx + w*(0.54-bl), baseY - h*0.34, bx + w*0.50, baseY);
    ctx.closePath();
  };
  ctx.fillStyle = grad; outline(); ctx.fill();

  if (detail) {
    ctx.save(); outline(); ctx.clip();
    // Vertical conduit grooves — bowed, not ruler-straight
    ctx.strokeStyle = dark; ctx.globalAlpha = 0.5; ctx.lineWidth = 2;
    for (const gx of [-0.22, -0.06, 0.1, 0.24]) { const bow = w*0.05*Math.sin(seed*3 + gx*11); ctx.beginPath(); ctx.moveTo(bx + w*gx, baseY); ctx.quadraticCurveTo(bx + w*gx + bow, (baseY + topY)/2, bx + w*gx, topY + 12); ctx.stroke(); }
    // Vertebrae ribs — slight organic sag
    ctx.lineWidth = 2.5;
    for (let y = baseY - 8; y > topY + 14; y -= 16) { ctx.beginPath(); ctx.moveTo(bx - w, y); ctx.quadraticCurveTo(bx, y + 4, bx + w, y); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // Wrapping tube-rings (full ellipses → read as 3D bands)
    ctx.strokeStyle = hi; ctx.globalAlpha = 0.4; ctx.lineWidth = 2;
    for (let k = 1; k <= 4; k++) { const y = baseY - h*0.2*k; const rw = w*0.5 * (1 - (baseY - y)/h*0.4); ctx.beginPath(); ctx.ellipse(bx, y, rw, 5, 0, 0, Math.PI*2); ctx.stroke(); }
    ctx.globalAlpha = 1;
    // Windows / vents — a few lit warm (stable via seed)
    let row = 0;
    for (let y = baseY - h*0.16; y > topY + 24; y -= 20, row++) {
      for (const wx of [-0.26, -0.1, 0.06, 0.22]) {
        ctx.fillStyle = '#1a140c'; ctx.fillRect(bx + w*wx - 2, y - 3, 4, 6);
        if (frand(seed*9 + row*4 + (wx+1)*7) > 0.85) { ctx.fillStyle = 'rgba(240,176,84,0.5)'; ctx.fillRect(bx + w*wx - 1.5, y - 2.5, 3, 5); }
      }
    }
    // Circular ports
    ctx.fillStyle = dark;
    for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.arc(bx - w*0.06, baseY - h*0.24*k, 4, 0, Math.PI*2); ctx.fill(); }
    ctx.restore();
    // Arched opening at the base
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.moveTo(bx - w*0.16, baseY); ctx.lineTo(bx - w*0.16, baseY - h*0.14);
    ctx.quadraticCurveTo(bx, baseY - h*0.24, bx + w*0.16, baseY - h*0.14); ctx.lineTo(bx + w*0.16, baseY);
    ctx.closePath(); ctx.fill();
    // Antenna spike on the crown with a tip light
    ctx.strokeStyle = dark; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(bx + w*0.08, topY - 18 + jc*16); ctx.lineTo(bx + w*0.1, topY - 42 - jc*10); ctx.stroke();
    ctx.fillStyle = 'rgba(240,120,60,0.55)'; ctx.beginPath(); ctx.arc(bx + w*0.1, topY - 43 - jc*10, 1.8, 0, Math.PI*2); ctx.fill();
  }
  // Lit left edge (bone highlight) — follows the curved flank
  ctx.strokeStyle = hi; ctx.lineWidth = 1.6; ctx.globalAlpha = detail ? 0.65 : 0.4;
  ctx.beginPath();
  ctx.moveTo(bx - w*0.50, baseY);
  ctx.quadraticCurveTo(bx - w*(0.54+bl), baseY - h*0.34, bx - w*0.40, baseY - h*0.60);
  ctx.quadraticCurveTo(bx - w*(0.33-bl), baseY - h*0.80, bx - w*0.21, baseY - h*0.90);
  ctx.quadraticCurveTo(bx - w*0.16, baseY - h*0.96, bx - w*0.16, topY + 8);
  ctx.stroke(); ctx.globalAlpha = 1;
}

// A foreground tube-worm / coral growth rising from the bottom edge.
function fgGrowth(x, baseY, h, w, body, hi, dark) {
  ctx.strokeStyle = body; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, baseY); ctx.quadraticCurveTo(x + w*0.6, baseY - h*0.6, x + 3, baseY - h); ctx.stroke();
  ctx.lineCap = 'butt';
  // Segment rings
  ctx.strokeStyle = dark; ctx.lineWidth = 1.5;
  for (let s = 1; s < 6; s++) { const t = s/6, sy = baseY - h*t, sx = x + (3)*t + w*0.6*Math.sin(t*Math.PI)*0.5; ctx.beginPath(); ctx.moveTo(sx - w*0.5, sy); ctx.lineTo(sx + w*0.5, sy); ctx.stroke(); }
  // Tube mouth
  ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(x + 3, baseY - h, w*0.7, w*0.5, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = dark; ctx.beginPath(); ctx.ellipse(x + 3, baseY - h, w*0.42, w*0.3, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = hi; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.ellipse(x + 3 - w*0.2, baseY - h - w*0.12, w*0.18, w*0.12, 0, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1;
}

// Closest foreground layer — drawn IN FRONT of the rover. Most growths hug the
// bottom edge, but an occasional tall one rises above the path so the rover
// passes behind it (depth). World-anchored via eachCol so it never jumps.
function drawForeground(W, H, gY) {
  // eachCol keys content to an ABSOLUTE world index (not a wrapping accumulator),
  // so growths scroll smoothly and never jump when a chunk recycles. Drawn at
  // 1.5× ground speed (closest layer).
  eachCol(1.5, 200, (i, x) => {
    if (frand(i*3.7) < 0.25) return;
    const tall = frand(i*5.3) > 0.82;                       // ~occasional tall growth
    const h = tall ? 108 + frand(i*1.9)*22 : 36 + frand(i*2.4)*48;
    const w = tall ? 15 + frand(i*4.1)*6  : 8  + frand(i*4.1)*7;
    const dk = frand(i*6.6) > 0.5;
    fgGrowth(x, H, h, w, dk ? '#241d11' : '#3a2f1c', dk ? '#4a3f28' : '#6e5c3a', '#120d07');
    // a second smaller clump beside it for clustering
    if (frand(i*8.1) > 0.55) fgGrowth(x + 26, H, 30 + frand(i*9.2)*30, 7, '#2a2215', '#52462c', '#120d07');
  });
}

// ── FULL RENDER ───────────────────────────────────────────────
function engRender() {
  const W  = canvas.width;
  const H  = canvas.height;
  const gY = H - 100;
  ctx.clearRect(0, 0, W, H);

  // Screen shake
  const sx = shakeAmt * Math.sin(shakeSeed * 2.3) * 0.8;
  const sy = shakeAmt * Math.cos(shakeSeed * 1.7) * 0.5;
  ctx.save(); ctx.translate(sx, sy);

  // Scene mode: hangar interior for standby + launch + late recall, wasteland once in the field
  const exp = STATE.expedition;
  const launchP = exp.status === 'LAUNCHING' ? Math.min(1, exp.launchT / exp.launchDur) : 0;
  const recallP = exp.status === 'RECALLING' ? Math.min(1, exp.recallT / CFG.recallTime) : 0;
  const descP   = exp.status === 'DESCENDING' ? Math.min(1, exp.descT / exp.descDur) : 0;
  // Wasteland for driving/harvesting and the first half of recall; hangar otherwise.
  const sceneWorld = exp.active && exp.status !== 'LAUNCHING' && !(exp.status === 'RECALLING' && recallP >= 0.5);

  // ── ISOMETRIC RENDER (optional) — takes over the biome-1 field + title scene.
  // Shares the screen-shake transform; UI overlay (DOM) is unaffected. Hangar/deploy
  // states still use the vector render below.
  if (window.ISO && ISO.on) {
    // ISO owns the whole loop: bay (standby/launch/recall), field (all biomes, per-biome palette),
    // and the descend transition (fade-to-black between biomes). Biome 5's special arena visuals are
    // deferred — iso renders it as a basic core-cavern field for now.
    ISO.render(ctx, W, H, gY, { exp, sceneWorld, titleMode, launchP, recallP, descP });
    ctx.restore();   // close the screen-shake save opened above
    return;
  }

  // ── BAY CAMERA ZOOM ──
  // Standby parks the rover up close (the bay fills the monitor); deploying pans
  // the camera back out to 1.0 as the launch animation begins, and recall eases
  // back in as the rover docks. Applied within the screen-shake transform so it
  // wraps the whole hangar scene + rover; the wasteland always renders at 1.0.
  let bayZoom = 1;
  if (!titleMode && !sceneWorld) {
    if (exp.status === 'LAUNCHING')      bayZoom = 1.5 + (1.0 - 1.5) * smoothstep(launchP, 0.0, 0.34);
    else if (exp.status === 'RECALLING') bayZoom = 1.0 + (1.5 - 1.0) * smoothstep(recallP, 0.58, 0.97);
    else                                 bayZoom = 1.5;   // STANDBY — parked, up close
  }
  if (bayZoom !== 1) {
    const zcx = W * 0.40, zcy = gY - 18;
    ctx.translate(zcx, zcy); ctx.scale(bayZoom, bayZoom); ctx.translate(-zcx, -zcy);
  }

  if (!sceneWorld && !titleMode) {
    let doorOpen = 0, warn = false;
    if (exp.status === 'LAUNCHING')      { doorOpen = smoothstep(launchP, 0.0, 0.32); warn = true; }
    else if (exp.status === 'RECALLING') { doorOpen = 1 - smoothstep(recallP, 0.9, 1.0); warn = true; }
    drawHangar(W, H, gY, doorOpen, warn);
  }

  if (sceneWorld || titleMode) {
  // Biomes 2+ paint their own scene (biomes.js). Biome 1 (and the title) use the
  // original wasteland render below. titleMode always shows the wasteland.
  const _bdef = (!titleMode && typeof currentBiome === 'function') ? currentBiome() : null;
  if (_bdef && _bdef.no !== 1 && typeof drawBiomeScene === 'function') {
    drawBiomeScene(_bdef, W, H, gY, scrollWorld);
  } else {
  // ── SKY — murky olive-grey haze (darker, greener; Godhusk-leaning) ──
  const sg = ctx.createLinearGradient(0, 0, 0, H);
  sg.addColorStop(0,    '#2b322a');
  sg.addColorStop(0.4,  '#414636');
  sg.addColorStop(0.72, '#5f5e4a');
  sg.addColorStop(1,    '#6f6d54');
  ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);

  // ── GIANT BACKGROUND ORB (drawn before haze so distance softens it) ──
  const orbX = W * 0.7, orbY = H * 0.3, orbR = Math.min(W, H) * 0.36;
  const orbBody = ctx.createRadialGradient(orbX - orbR*0.25, orbY - orbR*0.25, 0, orbX, orbY, orbR);
  orbBody.addColorStop(0,    'rgba(154,152,126,0.9)');
  orbBody.addColorStop(0.5,  'rgba(112,112,86,0.82)');
  orbBody.addColorStop(0.85, 'rgba(72,72,52,0.58)');
  orbBody.addColorStop(1,    'rgba(48,48,36,0)');
  ctx.fillStyle = orbBody;
  ctx.beginPath(); ctx.arc(orbX, orbY, orbR, 0, Math.PI*2); ctx.fill();
  // Concentric biomech rings + cracks
  ctx.save(); ctx.globalAlpha = 0.22; ctx.strokeStyle = '#5a5040'; ctx.lineWidth = 1.5;
  for (const rr of [0.4, 0.66, 0.9]) { ctx.beginPath(); ctx.arc(orbX, orbY, orbR*rr, 0, Math.PI*2); ctx.stroke(); }
  ctx.lineWidth = 1;
  const cracks = [[0.1,0.2],[0.3,-0.1],[-0.15,0.35],[0.25,0.4],[-0.3,-0.2],[0.05,-0.35]];
  cracks.forEach(([ox,oy]) => {
    ctx.beginPath();
    ctx.moveTo(orbX + ox*orbR, orbY + oy*orbR);
    ctx.quadraticCurveTo(orbX+(ox+0.2)*orbR, orbY+(oy-0.15)*orbR, orbX+(ox+0.35)*orbR, orbY+(oy+0.1)*orbR);
    ctx.stroke();
  });
  ctx.globalAlpha = 1; ctx.restore();

  // Far edge of the walkable path (lower viewing angle → shallow surface band)
  const SURF = 23, surfTop = gY - SURF;
  // Progressive haze veil between depth layers → real atmospheric perspective.
  const haze = a => { ctx.fillStyle = `rgba(116,124,100,${a})`; ctx.fillRect(0, H*0.06, W, gY - H*0.06); };

  // ── L0: DISTANT MEGASTRUCTURES — huge, sparse, hazy silhouettes ──
  // A desolate horizon: a few colossal forms, far apart, melting into haze.
  eachCol(0.04, 860, (n, x) => {
    const h = 240 + frand(n) * 190, w = 200 + frand(n+0.5) * 150;
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#5a5f4d';
    ctx.beginPath();
    ctx.moveTo(x - w, gY);
    ctx.lineTo(x - w*0.8, gY - h*0.6); ctx.lineTo(x - w*0.5, gY - h*0.92);
    ctx.lineTo(x - w*0.1, gY - h);     ctx.lineTo(x + w*0.4, gY - h*0.85);
    ctx.lineTo(x + w*0.8, gY - h*0.5); ctx.lineTo(x + w, gY);
    ctx.closePath(); ctx.fill();
    // Faint vertical structure seams + lit crown so it reads as built, not a hill
    ctx.strokeStyle = 'rgba(58,54,44,0.4)'; ctx.lineWidth = 2;
    for (const gx of [-0.5, -0.2, 0.1, 0.45]) { ctx.beginPath(); ctx.moveTo(x + w*gx, gY); ctx.lineTo(x + w*gx, gY - h*0.7); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(124,132,106,0.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - w*0.5, gY - h*0.92); ctx.lineTo(x - w*0.1, gY - h); ctx.lineTo(x + w*0.4, gY - h*0.85); ctx.stroke();
    ctx.globalAlpha = 1;
  });
  haze(0.22);

  // ── L1: FAR TOWERS — sparse tall structures (no city sprawl) ──
  eachCol(0.10, 680, (n, x) => {
    if (frand(n) < 0.42) return;                 // mostly empty horizon
    ctx.globalAlpha = 0.55;
    bmTower(x, gY, 250 + frand(n+1)*190, 60 + frand(n+2)*44, '#5d6350', '#7b8268', '#454b38', false, n);
    ctx.globalAlpha = 1;
  });
  haze(0.13);

  // ── L2: MID TOWERS — occasional ornate structure ──
  eachCol(0.2, 640, (n, x) => {
    if (frand(n) < 0.4) return;
    bmTower(x, gY, 230 + frand(n+3)*120, 80 + frand(n+4)*40, '#525844', '#7a8260', '#2a3020', true, n);
    if (frand(n+13) > 0.7) {                      // rare bio node
      const g2 = 0.04 + 0.03*Math.sin(aT*0.4+n);
      ctx.fillStyle = `rgba(96,184,104,${g2})`;
      ctx.beginPath(); ctx.arc(x, gY-260, 40, 0, Math.PI*2); ctx.fill();
    }
  });
  haze(0.06);

  // ── L3: NEAR — usually empty; rarely a COLOSSAL structure for scale ──
  eachCol(0.42, 1150, (n, x) => {
    if (frand(n+7) < 0.16) {
      // Very occasional megastructure that towers off the top of the frame —
      // this is what conveys how enormous these things are next to the rover.
      bmTower(x, gY, gY + 150, 210 + frand(n)*90, '#373d2a', '#697050', '#181d10', true, n*5);
      ctx.fillStyle = 'rgba(70,60,42,0.95)';
      [[x-70,30],[x+70,40]].forEach(([mx,mh]) => { ctx.beginPath(); ctx.moveTo(mx-7,gY); ctx.lineTo(mx,gY-mh); ctx.lineTo(mx+7,gY); ctx.fill(); });
      return;
    }
    if (frand(n) < 0.5) return;                  // otherwise often nothing → desolate
    bmTower(x, gY, 220 + frand(n)*70, 110 + frand(n+2)*34, '#3e4430', '#737a50', '#1d2212', true, n*3);
    if (frand(n+4) > 0.55) {                      // a great arching tube to one side
      const ax = x + 190;
      ctx.strokeStyle = 'rgba(58,49,34,0.98)'; ctx.lineWidth = 15;
      ctx.beginPath(); ctx.moveTo(ax, gY); ctx.bezierCurveTo(ax+70, gY-240, ax+210, gY-240, ax+280, gY); ctx.stroke();
      ctx.strokeStyle = 'rgba(130,116,86,0.4)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ax+2, gY-6); ctx.bezierCurveTo(ax+72, gY-246, ax+212, gY-246, ax+282, gY-6); ctx.stroke();
    }
    [[x-32,18],[x+22,26]].forEach(([mx,mh]) => { // coral cluster at the base
      ctx.fillStyle = 'rgba(86,76,56,0.95)';
      ctx.beginPath(); ctx.moveTo(mx-5,gY); ctx.lineTo(mx,gY-mh); ctx.lineTo(mx+5,gY); ctx.fill();
      ctx.fillStyle = 'rgba(140,126,96,0.6)';
      ctx.beginPath(); ctx.ellipse(mx,gY-mh,8,4,0,Math.PI,0); ctx.fill();
    });
  });

  // Spores — warm-green drifting motes
  spores.forEach(s => {
    const a = s.op * (0.5 + 0.5 * Math.sin(aT * s.ps));
    ctx.fillStyle = `rgba(120,205,110,${a})`;
    ctx.shadowBlur = s.sz * 1.5; ctx.shadowColor = 'rgba(80,210,96,0.6)';
    ctx.beginPath(); ctx.arc(s.x, s.y, s.sz, 0, Math.PI*2); ctx.fill();
  }); ctx.shadowBlur = 0;

  const sw0 = scrollWorld;
  // Organic, crumbling path edges (scroll with the ground via world coords)
  const backY  = wx => surfTop + (noise1(wx / 55) - 0.5) * 13;       // bumpy far edge
  const frontY = wx => gY + 2 + (noise1((wx + 140) / 42) - 0.5) * 8; // crumbling near edge

  // ── GROUND: receding dirt path with crumbling, irregular edges ──
  const surf = ctx.createLinearGradient(0, surfTop - 8, 0, gY + 6);
  surf.addColorStop(0, '#363b28');   // far — into haze (olive-shadowed)
  surf.addColorStop(1, '#585c3e');   // near — lit dirt, mossy undertone
  ctx.fillStyle = surf;
  ctx.beginPath();
  ctx.moveTo(0, backY(sw0));
  for (let x = 0; x <= W; x += 10) ctx.lineTo(x, backY(x + sw0));
  for (let x = W; x >= 0; x -= 10) ctx.lineTo(x, frontY(x + sw0));
  ctx.closePath(); ctx.fill();

  // Dirt mottling + scattered stones (world-anchored — no plank seams)
  for (let i = Math.floor(sw0/34) - 1, e = Math.floor((sw0 + W)/34) + 1; i <= e; i++) {
    const sx = i*34 - sw0, r = frand(i*1.7);
    ctx.fillStyle = `rgba(28,22,13,${0.16 + 0.12*frand(i*4.2)})`;
    ctx.beginPath(); ctx.ellipse(sx, surfTop + 4 + frand(i*5.1)*(SURF-2), 9 + frand(i*2.2)*10, 3, 0, 0, Math.PI*2); ctx.fill();
    if (r < 0.45) continue;
    const sy = surfTop + 4 + frand(i*2.3)*(SURF-3), sr = 2 + frand(i*3.1)*3.4;
    ctx.fillStyle = '#473f2d'; ctx.beginPath(); ctx.ellipse(sx, sy, sr, sr*0.72, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(156,140,106,0.45)'; ctx.beginPath(); ctx.ellipse(sx - sr*0.25, sy - sr*0.28, sr*0.5, sr*0.3, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(18,13,7,0.4)'; ctx.beginPath(); ctx.ellipse(sx + sr*0.2, sy + sr*0.4, sr*0.7, sr*0.25, 0, 0, Math.PI*2); ctx.fill();
  }

  // Crumbling near lip — dirt highlight following the irregular front edge + loose stones
  ctx.strokeStyle = 'rgba(176,160,120,0.5)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, frontY(sw0));
  for (let x = 0; x <= W; x += 10) ctx.lineTo(x, frontY(x + sw0));
  ctx.stroke();
  for (let i = Math.floor(sw0/90) - 1, e = Math.floor((sw0 + W)/90) + 1; i <= e; i++) {
    const sx = i*90 - sw0; if (frand(i*7.3) < 0.5) continue;
    const sy = frontY(sx + sw0) + 3 + frand(i*2.9)*5, sr = 2.5 + frand(i*1.6)*3;
    ctx.fillStyle = '#3c3422'; ctx.beginPath(); ctx.ellipse(sx, sy, sr, sr*0.7, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(150,134,100,0.4)'; ctx.beginPath(); ctx.ellipse(sx - sr*0.2, sy - sr*0.25, sr*0.45, sr*0.28, 0, 0, Math.PI*2); ctx.fill();
  }
  // Faint bio undertone along the front edge
  const ep = 0.5 + 0.4 * Math.sin(aT * 1.8);
  ctx.strokeStyle = `rgba(70,200,96,${0.07 + 0.05*ep})`; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, frontY(sw0) + 2);
  for (let x = 0; x <= W; x += 14) ctx.lineTo(x, frontY(x + sw0) + 2);
  ctx.stroke();

  // ── GROUND: rocky cliff face below the path (irregular strata + boulders) ──
  const fgGrad = ctx.createLinearGradient(0, gY, 0, H);
  fgGrad.addColorStop(0, '#323724'); fgGrad.addColorStop(0.35, '#22281a'); fgGrad.addColorStop(1, '#0f130b');
  ctx.fillStyle = fgGrad;
  ctx.beginPath(); ctx.moveTo(0, frontY(sw0));
  for (let x = 0; x <= W; x += 10) ctx.lineTo(x, frontY(x + sw0));
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();

  // Wavy sedimentary rock strata (irregular bands, world-anchored — no straight lines)
  for (const [off, thick, freq, col] of [[26, 9, 58, 'rgba(58,48,30,0.3)'], [50, 7, 74, 'rgba(16,12,6,0.5)'], [80, 11, 64, 'rgba(54,44,28,0.26)']]) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, gY + off + (noise1(sw0 / freq) - 0.5) * 12);
    for (let x = 0; x <= W; x += 12) ctx.lineTo(x, gY + off + (noise1((x + sw0) / freq) - 0.5) * 12);
    for (let x = W; x >= 0; x -= 12) ctx.lineTo(x, gY + off + thick + (noise1((x + sw0 + 41) / freq) - 0.5) * 12);
    ctx.closePath(); ctx.fill();
  }

  // Embedded boulders — irregular polygons with lit tops + shadowed bases (depth)
  for (let i = Math.floor(sw0/78) - 1, e = Math.floor((sw0 + W)/78) + 1; i <= e; i++) {
    const bx = i*78 - sw0; if (frand(i*2.7) < 0.42) continue;
    const by = gY + 16 + frand(i*3.3) * (H - gY - 26), br = 5 + frand(i*1.9) * 11;
    ctx.fillStyle = '#332a1c';
    ctx.beginPath();
    for (let a = 0; a < 7; a++) { const ang = a/7*Math.PI*2, rr = br*(0.68 + frand(i*13 + a)*0.5), px = bx + Math.cos(ang)*rr, py = by + Math.sin(ang)*rr*0.82; a ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(126,108,74,0.3)'; ctx.beginPath(); ctx.ellipse(bx - br*0.2, by - br*0.4, br*0.5, br*0.28, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.beginPath(); ctx.ellipse(bx, by + br*0.55, br*0.85, br*0.3, 0, 0, Math.PI*2); ctx.fill();
  }

  // Jagged cracks running down from the crumbling edge (sparse, irregular)
  for (let i = Math.floor(sw0/150) - 1, e = Math.floor((sw0 + W)/150) + 1; i <= e; i++) {
    const cx = i*150 - sw0; if (frand(i*5.1) < 0.45) continue;
    ctx.strokeStyle = 'rgba(10,7,3,0.6)'; ctx.lineWidth = 1.5;
    let px = cx, py = frontY(cx + sw0);
    ctx.beginPath(); ctx.moveTo(px, py);
    for (let s = 0; s < 5; s++) { px += (frand(i*7 + s) - 0.5) * 20; py += 12 + frand(i*9 + s) * 13; ctx.lineTo(px, py); }
    ctx.stroke();
  }
  // NOTE: the closest foreground layer is drawn LATER (drawForeground), in
  // front of the rover, so tall growths can pass in front of it.

  } // end biome-1 / default wasteland render
  } // end wasteland background (hangar drawn above otherwise)

  // ── GAME OBJECTS ──
  if (sceneWorld) {
    const recalling = exp.status === 'RECALLING';
    const descending = exp.status === 'DESCENDING';
    const roverX = recalling ? recallExitX(W, recallP) : (descending ? descRoverX(W, descP) : ROVERX);
    // Arena biome (Hollow Core): rover is centred & shrunk; the energy core is drawn on
    // the ellipse by biomes.js, so skip the normal flat-track obstacle + drill beam here.
    // (Forced off during descent so the drive-in animation plays normally.)
    const arena = !titleMode && !descending && typeof currentBiome === 'function' && currentBiome().no === 5;

    if (!recalling && !descending) exp.enemies.forEach(en => drawEnemy(en));

    if (exp.obstacle && !recalling && !descending && !arena) {
      const obs = exp.obstacle;
      const ma  = Math.max(0, exp.nextObstacleDist - exp.distance);
      obs.x     = ROVERX + ma * PX;
      ctx.save(); ctx.translate(obs.x, 0); drawObs(obs.def, gY); ctx.restore();

      if (exp.status === 'HARVESTING') {
        ctx.save(); ctx.translate(obs.x, gY-15);
        const bW=60, bX=25-bW/2, bY=-48;
        ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(bX,bY,bW,5);
        ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.strokeRect(bX,bY,bW,5);
        const fp2 = Math.max(0, Math.min(1, 1 - obs.timeLeft / obs.maxTime));
        ctx.fillStyle = obs.def.color; ctx.fillRect(bX+1,bY+1,(bW-2)*fp2,3);
        ctx.font='8px "Share Tech Mono"'; ctx.fillStyle='rgba(255,255,255,0.7)';
        ctx.textAlign='center'; ctx.fillText("DRILLING // CLICK", 25, -58);
        ctx.restore();
      }
    }

    // Winch cable trailing off the left edge while the rover is dragged out
    if (recalling) {
      ctx.save(); ctx.strokeStyle = '#5a6470'; ctx.lineWidth = 2.5;
      ctx.setLineDash([7, 4]);
      ctx.beginPath(); ctx.moveTo(0, gY - 46); ctx.lineTo(roverX - 34, gY - 48); ctx.stroke();
      ctx.setLineDash([]); ctx.restore();
    }

    if (arena && !recalling) {
      // Centred, shrunk rover at the front of the elliptical track (sense of scale).
      const geo = biome5Geom(W, H, gY), s = 0.6;
      ctx.save();
      ctx.translate(geo.cx, geo.frontY);
      ctx.scale(s, s);
      ctx.translate(-ROVERX, -gY);
      drawRover(gY, ROVERX, exp.status);
      ctx.restore();
    } else {
      drawRover(gY, roverX, exp.status === 'DESCENDING' ? 'DRIVING' : exp.status);
    }

    // Descent phase 1 — the cave/tunnel entrance at the right edge (drawn after the rover
    // so its mouth occludes the rover as it drives in).
    if (descending && descP < 0.5) drawCaveEntrance(W, H, gY, descP);

    // Laser beam from drill tip
    if (exp.status === 'HARVESTING' && exp.obstacle && !arena) {
      const nX = ROVERX + 40 + 28 + 20, nY = gY - 50;
      const tX = exp.obstacle.x + 25,   tY = gY - 20;
      const j  = (Math.random() - 0.5) * 4;
      const bc = exp.obstacle.def.color;
      ctx.save();
      ctx.shadowBlur = 8; ctx.shadowColor = bc;
      ctx.strokeStyle = bc; ctx.lineWidth = 3 + Math.random() * 3;
      ctx.beginPath(); ctx.moveTo(nX,nY); ctx.lineTo(tX,tY+j); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(nX,nY); ctx.lineTo(tX,tY+j); ctx.stroke();
      ctx.shadowBlur = 0; ctx.restore();
    }

    // Turret beams — energy bolt from barrel tip to target
    beams.forEach(b => {
      const a = Math.max(0, b.life / b.ml);
      ctx.save();
      ctx.shadowBlur = 12; ctx.shadowColor = '#46e8ff';
      ctx.strokeStyle = `rgba(70,232,255,${a})`; ctx.lineWidth = 4 + a * 3;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      // Impact flash
      ctx.fillStyle = `rgba(180,250,255,${a})`;
      ctx.beginPath(); ctx.arc(b.x2, b.y2, 5 + a * 4, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur = 0; ctx.restore();
    });
  } else if (exp.status === 'LAUNCHING') {
    // Rover rolling out through the bay door
    drawRover(gY, launchRoverX(W, launchP), 'DRIVING');
  } else if (exp.status === 'RECALLING') {
    // Rover reversing back in through the bay door
    drawRover(gY, recallEnterX(W, recallP), 'RECALLING');
  } else if (!titleMode) {
    // Standby — parked on the bay floor, facing the door
    drawRover(gY, W * 0.40, 'STANDBY');
  }

  // ── PARTICLES ──
  parts.forEach(p => {
    const alpha = p.life / p.ml;
    if (p.type === 'dust') {
      ctx.globalAlpha = alpha * 0.6;
      ctx.fillStyle   = p.c;
      // grow as it ages so the plume disperses into a soft cone
      ctx.beginPath(); ctx.arc(p.x, p.y, p.sz * (1.35 - alpha * 0.55), 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.sz * alpha, 0, Math.PI*2); ctx.fill();
    }
  });

  // ── CLOSEST FOREGROUND — drawn here so it sits IN FRONT of the rover ──
  // Biome 1 / title use the wasteland coral growths; biomes 2+ get their own themed
  // front parallax layer (biomes.js → drawBiomeForeground).
  const _fgBiome1 = titleMode || !(typeof currentBiome === 'function') || currentBiome().no === 1;
  if ((sceneWorld || titleMode) && _fgBiome1) drawForeground(W, H, gY);
  else if (sceneWorld && typeof drawBiomeForeground === 'function') drawBiomeForeground(currentBiome(), W, H, gY, scrollWorld);

  // ── VIGNETTE ──
  const vig = ctx.createRadialGradient(W/2, H/2, H*0.38, W/2, H/2, H*0.9);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(12,16,10,0.32)');
  ctx.fillStyle = vig; ctx.fillRect(0,0,W,H);

  // ── LAUNCH CUT FADE ──
  // Bay animation fades to black at its tail; screenFade then fades the wasteland back in.
  const launchFade = exp.status === 'LAUNCHING' ? smoothstep(launchP, 0.82, 1.0) : 0;
  // Recall fades to black across the mid-point cut (wasteland → hangar), then back in.
  const recallFade = exp.status === 'RECALLING'
    ? Math.min(smoothstep(recallP, 0.40, 0.50), 1 - smoothstep(recallP, 0.50, 0.60))
    : 0;
  // Descent fades to black across the midpoint (where the biome swaps), then back in.
  const descFade = exp.status === 'DESCENDING'
    ? Math.min(smoothstep(descP, 0.38, 0.50), 1 - smoothstep(descP, 0.50, 0.66))
    : 0;
  const fadeA = Math.max(launchFade, recallFade, screenFade, descFade);
  if (fadeA > 0.001) { ctx.fillStyle = `rgba(0,0,0,${fadeA})`; ctx.fillRect(0, 0, W, H); }

  ctx.restore(); // end screen shake
}
// ============================================================
//  ui.js — ROVERHAUL v0.7
//  All UI builders, updaters, event wiring, and game loop init.
//  Depends on: data.js, game.js, engine.js
// ============================================================

// Dev Tools access — gated by a simple shared password (not security, just a gate).
let devUnlocked = localStorage.getItem('rh_dev') === '1';
// Set true when a resource is discovered for the first time → triggers a one-off rebuild
// of the Refinery/Forge so their newly-available options appear (drip-feed).
let discoveryDirty = false;

// ── LOGGING ──────────────────────────────────────────────────
function addLog(msg, cls = 'sl') {
  const t = fmtT(STATE.uptime), el = document.getElementById('clog');
  const d = document.createElement('div'); d.className = `ll ${cls}`; d.textContent = `[${t}] ${msg}`;
  el.appendChild(d); el.scrollTop = el.scrollHeight;
  if (el.children.length > 120) el.removeChild(el.firstChild);
}
function fmtT(s) {
  const h=Math.floor(s/3600).toString().padStart(2,'0'),
        m=Math.floor((s%3600)/60).toString().padStart(2,'0'),
        ss=Math.floor(s%60).toString().padStart(2,'0');
  return `${h}:${m}:${ss}`;
}

// ── HANGAR ────────────────────────────────────────────────────
// Renders the banded material cost for an upgrade's next level, colouring
// any material the player can't yet afford. Refreshed every frame.
function costHTML(key, level) {
  return upgradeCost(key, level).map(m => {
    const r = RT.find(x => x.id === m.id);
    const have = Math.floor(STATE.inv[m.id] || 0);
    const ok = have >= m.qty;
    return `<span class="cmat${ok ? '' : ' short'}"><span class="cmat-dot" style="background:${r?.color||'#fff'}"></span>${r?.name||m.id} <b>${fmtNum(have)}/${fmtNum(m.qty)}</b></span>`;
  }).join('');
}

// Buy quantity: 1, 5, 10, or Infinity ("MAX"). Persisted per browser.
let buyMode = (() => { const v = localStorage.getItem('rh_buymode'); return v === 'max' ? Infinity : (+v || 1); })();
let forgeMode = (() => { const v = localStorage.getItem('rh_forgemode'); return v === 'max' ? Infinity : (+v || 1); })();

// How many levels of `key` the player can afford right now, up to `cap`, plus the
// cumulative material totals it would consume. Banded costs change per level, so
// we simulate spending a copy of the inventory level-by-level.
function affordableLevels(key, cap) {
  const have = {}; const lvl = STATE.upgrades[key] || 0;
  const totals = {}; let count = 0;
  const lim = Math.min(cap, 999);                 // safety bound for MAX
  while (count < lim) {
    const cost = upgradeCost(key, lvl + count + 1);
    if (!cost.every(m => ((STATE.inv[m.id] || 0) - (have[m.id] || 0)) >= m.qty)) break;
    cost.forEach(m => { have[m.id] = (have[m.id] || 0) + m.qty; totals[m.id] = (totals[m.id] || 0) + m.qty; });
    count++;
  }
  return { count, totals };
}

function buildHangar() {
  const g = document.getElementById('hangar-grid'); g.innerHTML = '';
  Object.entries(UPGCFG).forEach(([key, cfg]) => {
    const lvl = STATE.upgrades[key] || 0;
    const isLocked    = cfg.locked && lvl === 0;
    const isSubWeapon = key.startsWith('w_') && (STATE.upgrades.weapon || 0) === 0;
    const card = document.createElement('div');
    card.className = 'card' + (isLocked || isSubWeapon ? ' locked-card' : '');
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h3>${cfg.name} <span class="bestval hidden" id="bv-${key}">★ BEST VALUE</span></h3>
        <span class="lvlbdg" id="lvl-${key}">${lvl > 0 ? 'Lvl ' + lvl : 'LOCKED'}</span>
      </div>
      <p class="desc">${cfg.desc}</p>
      <div class="stats">
        <div>Now: <span id="st-${key}">${lvl > 0 ? cfg.statFn(lvl) : '—'}</span></div>
        <div>Next: <span>${cfg.nextFn(lvl)}</span></div>
      </div>
      ${isSubWeapon ? `<div class="lock-note">🔒 Unlock Turret Cannon first</div>` : ''}
      <div class="upcost-lbl">${lvl === 0 ? 'Unlock cost' : 'Next level'}</div>
      <div class="upcost" id="cost-${key}">${costHTML(key, lvl + 1)}</div>
      <button class="ubtn" id="ubtn-${key}">${lvl === 0 ? 'UNLOCK' : 'UPGRADE'}</button>`;
    g.appendChild(card);
  });
}

// Compact banner showing the metal + alloy stock that upgrades are paid from.
function bankIds() {
  return RT.filter(r => (r.tier === 'refined' || r.tier === 'alloy') && r.category !== 'Refined Organics').map(r => r.id);
}
function buildHangarBank() {
  const el = document.getElementById('hangar-bank'); if (!el) return;
  el.innerHTML = `<span class="bank-ttl">Stock</span>` +
    bankIds().map(id => {
      const r = RT.find(x => x.id === id);
      return `<span class="bank-pill"><span class="bank-dot" style="color:${r?.color||'#fff'};background:${r?.color||'#fff'}"></span>${r?.name||id}: <b id="bank-${id}">0</b></span>`;
    }).join('');
}
function updateHangarBank() {
  bankIds().forEach(id => { const e = document.getElementById('bank-' + id); if (e) e.textContent = fmtNum(STATE.inv[id] || 0); });
}

// ── CARGO BAY ─────────────────────────────────────────────────
function buildCargo() {
  const el = document.getElementById('cargo-content'); el.innerHTML = '';
  const sum = document.createElement('div'); sum.className = 'cargo-mastery-sum'; sum.id = 'cargo-mastery-sum';
  el.appendChild(sum);
  const cats = {};
  RT.forEach(r => { if (!cats[r.category]) cats[r.category] = []; cats[r.category].push(r); });
  Object.entries(cats).forEach(([cat, res]) => {
    const sec = document.createElement('div'); sec.className = 'catsec';
    sec.innerHTML = `<div class="secttl">${cat}</div><div class="cgrid" id="cg-${cat.replace(/\W/g,'_')}"></div>`;
    el.appendChild(sec);
  });
}
function updateCargo() {
  if (!STATE.discovered) STATE.discovered = {};
  const maxQ = Math.max(1, ...Object.values(STATE.inv));
  RT.forEach(r => {
    // Drip-feed: a resource only appears in the Cargo Bay once it's first been held
    // (in stores, or gathered this run). Until then, no card is created.
    if (!STATE.discovered[r.id]) {
      if ((STATE.inv[r.id] || 0) > 0 || (STATE.expedition.cargo[r.id] || 0) > 0) { STATE.discovered[r.id] = true; discoveryDirty = true; }
      else return;
    }
    let card = document.getElementById('cc-' + r.id);
    if (!card) {
      const grid = document.getElementById('cg-' + r.category.replace(/\W/g,'_')); if (!grid) return;
      card = document.createElement('div'); card.className = 'ccard'; card.id = 'cc-' + r.id;
      const tC = { raw:'tr', refined:'trf', alloy:'tal', exotic:'tex', biomech:'tbm' }[r.tier] || 'tr';
      const showM = r.drillTime > 0;   // only gatherable resources have Mastery
      card.innerHTML = `<div class="cname">${r.name}</div><div class="cqty" id="cq-${r.id}" style="color:${r.color}">0</div><span class="ctier ${tC}">${r.tier.toUpperCase()}</span><div class="cbar"><div class="cbar-f" id="cb-${r.id}" style="background:${r.color}"></div></div>` +
        (showM ? `<div class="cmastery" id="cm-${r.id}"><span class="cml">M0</span><span class="cmbar"><span class="cmbar-f" id="cmf-${r.id}"></span></span></div>` : '');
      grid.appendChild(card);
    }
    const q = STATE.inv[r.id] || 0;
    const qe = document.getElementById('cq-' + r.id); if (qe) { qe.textContent = fmtNum(q); qe.title = Math.floor(q).toLocaleString(); }
    const be = document.getElementById('cb-' + r.id); if (be) be.style.width = Math.min(100, (q/maxQ)*100) + '%';
    // Mastery readout (gatherable resources)
    if (r.drillTime > 0 && typeof masteryXpInfo === 'function') {
      const mi = masteryXpInfo(r.id), cm = document.getElementById('cm-' + r.id);
      if (cm) {
        const lbl = cm.querySelector('.cml'); if (lbl) lbl.textContent = 'M' + mi.level;
        const f = document.getElementById('cmf-' + r.id); if (f) f.style.width = Math.round(mi.prog * 100) + '%';
        cm.title = `Mastery Lvl ${mi.level} — ${fmtNum(mi.into)}/${fmtNum(mi.span)} to next (+${mi.level*3}% drill speed for ${r.name})`;
      }
    }
  });
  // Mastery summary line
  const ms = document.getElementById('cargo-mastery-sum');
  if (ms && typeof totalMasteryLevels === 'function') {
    const tot = totalMasteryLevels();
    ms.innerHTML = `⬗ MASTERY — total levels <b>${tot}</b> · global yield bonus <b>+${tot}%</b> <span style="color:var(--dim)">(persists through prestige · +3% drill speed per resource level)</span>`;
  }
  // Hide category sections that have no discovered resources yet (keeps the bay tidy).
  document.querySelectorAll('#cargo-content .catsec').forEach(sec => {
    const grid = sec.querySelector('.cgrid');
    sec.style.display = (grid && grid.children.length) ? '' : 'none';
  });
}

// Drip-feed: a resource is "discovered" once first held (see STATE.discovered, set in updateCargo).
function isDiscovered(id) { return !STATE.discovered || STATE.discovered[id] || (STATE.inv[id] || 0) > 0; }

// ── ALLOY FORGE ───────────────────────────────────────────────
function buildForge() {
  // Reverse UX: pick the ALLOY you want; requirements + craftable count are derived. Only offer alloys
  // whose BOTH inputs the player has actually discovered (keeps the list uncluttered early).
  const sel = document.getElementById('fg-alloy'), prev = sel.value;
  sel.innerHTML = '';
  ALLOYS.filter(a => isDiscovered(a.inputA) && isDiscovered(a.inputB)).forEach(a => {
    const od = RT.find(r => r.id === a.id), o = document.createElement('option');
    o.value = a.id; o.textContent = od?.name || a.id; sel.appendChild(o);
  });
  if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;   // keep the player's choice across rebuilds
  updateForge();
  if (!buildForge._bound) {
    sel.addEventListener('change', updateForge);
    document.getElementById('fg-btn').addEventListener('click', doForge);
    buildForge._bound = true;
  }
}
// How many of the selected alloy the player could craft from current stock of its two inputs.
function forgeMaxAffordable(rec) {
  return Math.min(Math.floor((STATE.inv[rec.inputA]||0) / rec.qtyA), Math.floor((STATE.inv[rec.inputB]||0) / rec.qtyB));
}
function forgeCount(rec) {
  const maxAff = forgeMaxAffordable(rec);
  return forgeMode === Infinity ? maxAff : Math.min(forgeMode, maxAff);
}
function updateForge() {
  const rec = ALLOYS.find(x => x.id === document.getElementById('fg-alloy').value);
  const outEl = document.getElementById('fg-out'), btn = document.getElementById('fg-btn'), reqs = document.getElementById('fg-reqs');
  if (!rec) { outEl.textContent = 'Select an alloy'; reqs.textContent = '—'; btn.disabled = true; btn.textContent = 'FORGE'; document.getElementById('fg-out-qty').textContent = ''; return; }
  const od = RT.find(r => r.id === rec.id);
  const maxAff = forgeMaxAffordable(rec);
  const n = forgeMode === Infinity ? maxAff : Math.min(forgeMode, maxAff);
  outEl.innerHTML = `<span style="color:${od?.color||'#ffd700'}">${od?.name||rec.id}</span><br><small style="color:var(--dim)">yields ${rec.yields} per forge · can make ${fmtNum(maxAff)}</small>`;
  document.getElementById('fg-out-qty').textContent = `In stock: ${fmtNum(STATE.inv[rec.id]||0)}`;
  // requirement rows — total needed for the selected batch (≥1 so the per-unit cost shows even when you can't afford any)
  const batch = Math.max(1, n);
  reqs.innerHTML = [[rec.inputA, rec.qtyA], [rec.inputB, rec.qtyB]].map(([id, q]) => {
    const r = RT.find(x => x.id === id), have = STATE.inv[id]||0, need = q * batch;
    return `<div class="fg-req ${have >= need ? 'ok' : 'short'}"><span style="color:${r?.color||'#ccc'}">${r?.name||id}</span><span class="fg-have">${fmtNum(have)} / ${fmtNum(need)}</span></div>`;
  }).join('');
  btn.disabled = maxAff < 1;
  btn.textContent = n > 1 ? `FORGE ×${n}` : 'FORGE';
}
function doForge() {
  const rec = ALLOYS.find(x => x.id === document.getElementById('fg-alloy').value);
  if (!rec) { SFX.denied(); return; }
  const count = forgeCount(rec);
  if (count < 1) { SFX.denied(); return; }
  STATE.inv[rec.inputA] = (STATE.inv[rec.inputA]||0) - rec.qtyA * count;
  STATE.inv[rec.inputB] = (STATE.inv[rec.inputB]||0) - rec.qtyB * count;
  STATE.inv[rec.id] = (STATE.inv[rec.id]||0) + rec.yields * count;
  if (!STATE.tutorial.forgeIntroDone) STATE.tutorial.forgeIntroDone = true;   // forge intro complete
  SFX.forge();
  addLog(`FORGE: ${rec.yields * count}× ${RT.find(r=>r.id===rec.id)?.name||rec.id} created.`, "xl");
  updateForge(); saveGame();
}
function updateAlloyTable() {
  const tb = document.getElementById('alloy-tbody'); tb.innerHTML = '';
  // Only reveal a recipe once BOTH of its inputs have been discovered.
  ALLOYS.filter(a => isDiscovered(a.inputA) && isDiscovered(a.inputB)).forEach(a => {
    const od = RT.find(r=>r.id===a.id);
    const an = RT.find(r=>r.id===a.inputA)?.name||a.inputA;
    const bn = RT.find(r=>r.id===a.inputB)?.name||a.inputB;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="color:${od?.color||'#ffd700'}">${od?.name||a.id}</td><td>${an}</td><td>${bn}</td><td>${a.qtyA}</td><td>${a.qtyB}</td><td>${a.yields}</td>`;
    tb.appendChild(tr);
  });
}

// Cost of the next Refinery-Speed level (biomass) — rises ~18%/level so it stays a
// long-term sink. No hard cap; the cycle approaches a 0.25s floor (see G.autoInterval).
function refineSpeedCost() { return Math.round(8 * Math.pow(1.18, STATE.automation.refineLevel || 0)); }

// Live automation panel: speed upgrade, auto-forge, progress bar, telemetry pill.
function updateAutomationUI() {
  // Refinery Speed
  const lasp = document.getElementById('lasp'), basp = document.getElementById('basp');
  if (lasp) lasp.textContent = G.autoInterval().toFixed(2) + 's  (Lvl ' + (STATE.automation.refineLevel || 0) + ')';
  if (basp) {
    const atFloor = G.autoInterval() <= 0.25 + 1e-6;
    if (atFloor) { basp.disabled = true; basp.textContent = 'MAX (0.25s)'; }
    else { basp.textContent = 'Buy: ' + fmtNum(refineSpeedCost()) + ' Bio-Fuel'; basp.disabled = G.biofuel() < refineSpeedCost(); }
  }
  // Shared cycle progress bar
  const prog = document.getElementById('auto-prog');
  if (prog) {
    const acc = STATE.automation.autoMetal ? STATE.autoMetalAcc
              : STATE.automation.autoBiomatter ? STATE.autoBiomatterAcc : 0;
    const anyAuto = STATE.automation.autoMetal || STATE.automation.autoBiomatter;
    prog.style.width = (anyAuto ? Math.min(100, (acc / G.autoInterval()) * 100) : 0).toFixed(0) + '%';
  }
  // Live expected yield readout — headline PER RUN (legible to the player + makes Power Core's
  // run-length benefit visible), with the per-second gather breakdown on hover.
  const yl = document.getElementById('ax-yield');
  if (yl && typeof expectedYieldRates === 'function') {
    const rates = expectedYieldRates();
    const total = Object.values(rates).reduce((a, b) => a + b, 0);
    const perRun = (typeof expectedUnitsPerRun === 'function') ? expectedUnitsPerRun() : 0;
    yl.textContent = perRun > 0 ? '≈' + fmtNum(perRun) + '/run' : '—';
    const box = document.getElementById('ax-yield-box');
    if (box) {
      const lines = Object.entries(rates).filter(([, r]) => r > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([id, r]) => `${(RT.find(x => x.id === id) || {}).name || id}: ${fmtNum(r, 2)}/s`);
      const runS = (typeof expectedRunSeconds === 'function') ? expectedRunSeconds() : 0;
      box.title = (lines.length
        ? `Expected per run (≈${fmtNum(runS)}s at ${fmtNum(total,2)}/s active):\n` + lines.join('\n')
        : 'Expected resources per run at current rover stats')
        + '\n\nPower Core lengthens runs → more per run.';
    }
  }

  // Telemetry automation pill
  const ax = document.getElementById('ax-auto');
  if (ax) {
    const on = [];
    if (STATE.automation.autoMetal) on.push('Refine');
    if (STATE.automation.autoBiomatter) on.push('Reclaim');
    if ((STATE.upgrades.drone || 0) >= 1) on.push('Drone');
    ax.textContent = on.length ? on.join(' · ') : 'Off';
  }
}

// ── REFINERY ──────────────────────────────────────────────────
function buildRefinery() {
  const el = document.getElementById('ref-content'); el.innerHTML = '';
  // Drip-feed: a refine option only appears once its raw material has been found.
  RT.filter(r => r.refinesTo && isDiscovered(r.id)).forEach(r => {
    const tgt = RT.find(x => x.id === r.refinesTo.id);
    const card = document.createElement('div'); card.className = 'refcard';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;"><h2>${r.name}</h2><span class="refbdg">ACTIVE</span></div>
      <div class="refinv">
        <div class="irow"><span>${r.name}:</span><strong id="ri-${r.id}" style="color:${r.color}">0</strong></div>
        <div class="irow"><span>${tgt?.name||r.refinesTo.id}:</span><strong id="ro-${r.id}" style="color:${tgt?.color||'#fff'}">0</strong></div>
      </div>
      <button class="abtn" id="rb-${r.id}">${r.refinesTo.ratio}× ${r.name} → 1 ${tgt?.name||r.refinesTo.id}</button>`;
    el.appendChild(card);
    card.querySelector(`#rb-${r.id}`).addEventListener('click', () => {
      if ((STATE.inv[r.id]||0) >= r.refinesTo.ratio) {
        STATE.inv[r.id] -= r.refinesTo.ratio;
        STATE.inv[r.refinesTo.id] = (STATE.inv[r.refinesTo.id]||0) + 1;
        if (!STATE.tutorial.refinedOnce) { STATE.tutorial.refinedOnce = true; addLog("TUTORIAL: Keep smelting until you can fabricate the ROVER HANGAR.", "el"); }
        SFX.refine();
        addLog(`REFINERY: ${r.refinesTo.ratio}× ${r.name} → 1 ${tgt?.name||r.refinesTo.id}.`, "xl");
        saveGame();
      }
    });
  });
}
function updateRefinery() {
  RT.filter(r => r.refinesTo).forEach(r => {
    const i=document.getElementById('ri-'+r.id), o=document.getElementById('ro-'+r.id), b=document.getElementById('rb-'+r.id);
    if (i) i.textContent = fmtNum(STATE.inv[r.id]||0);
    if (o) o.textContent = fmtNum(STATE.inv[r.refinesTo.id]||0);
    if (b) b.disabled = (STATE.inv[r.id]||0) < r.refinesTo.ratio;
  });
}

// ── TUTORIAL GATES — Refinery & Hangar start locked, unlocked in sequence ─────
function gateCanAfford(list) { return list.every(m => (STATE.inv[m.id] || 0) >= m.qty); }
function gateCostHTML(list) {
  return list.map(m => {
    const r = RT.find(x => x.id === m.id);
    const have = Math.floor(STATE.inv[m.id] || 0);
    return `<span class="${have >= m.qty ? '' : 'short'}">${r?.name || m.id} <b>${fmtNum(have)}/${fmtNum(m.qty)}</b></span>`;
  }).join('');
}
function buildTutorialGates() {
  const prf = document.getElementById('prf-lock');
  if (prf) prf.innerHTML = `
    <div class="tl-icon">🔩</div>
    <h2>REFINERY OFFLINE</h2>
    <p>Smelt raw ore into refined metal here. Emergency ore has been delivered to your hold — bring the smelter online to begin.</p>
    <div class="tl-cost" id="prf-lock-cost"></div>
    <button class="tl-btn" id="prf-unlock">UNLOCK REFINERY</button>`;
  const ph = document.getElementById('ph-lock');
  if (ph) ph.innerHTML = `
    <div class="tl-icon">🛠</div>
    <h2>ROVER HANGAR SEALED</h2>
    <p>Fabricate the hangar with refined metal you've smelted, then upgrade your rover's systems.</p>
    <div class="tl-cost" id="ph-lock-cost"></div>
    <button class="tl-btn" id="ph-unlock">UNLOCK HANGAR</button>`;
  document.getElementById('prf-unlock')?.addEventListener('click', unlockRefinery);
  document.getElementById('ph-unlock')?.addEventListener('click', unlockHangar);
  applyTutorialGates();
}
function unlockRefinery() {
  if (STATE.tutorial.refineryUnlocked) return;
  if (!gateCanAfford(REFINERY_UNLOCK)) { SFX.denied(); addLog("Insufficient raw ore to unlock the Refinery.", "dl"); return; }
  REFINERY_UNLOCK.forEach(m => { STATE.inv[m.id] = (STATE.inv[m.id] || 0) - m.qty; });
  STATE.tutorial.refineryUnlocked = true;
  grantProcessMats();
  SFX.upgrade();
  addLog("REFINERY ONLINE: Raw ore can now be smelted into refined metal.", "xl");
  addLog("TUTORIAL: Smelt 3 Refined Iron + 3 Tempered Copper to fabricate the ROVER HANGAR.", "el");
  applyTutorialGates(); saveGame();
}
function unlockHangar() {
  if (STATE.tutorial.hangarUnlocked) return;
  if (!gateCanAfford(HANGAR_UNLOCK)) { SFX.denied(); addLog("Smelt more refined metal to fabricate the Hangar.", "dl"); return; }
  HANGAR_UNLOCK.forEach(m => { STATE.inv[m.id] = (STATE.inv[m.id] || 0) - m.qty; });
  STATE.tutorial.hangarUnlocked = true;
  grantStarterMaterials();
  SFX.upgrade();
  addLog("HANGAR ONLINE: Rover systems ready for upgrade.", "xl");
  addLog("TUTORIAL: Materials supplied — UNLOCK one of each: Locomotion, Resource Extractor, Power Core.", "el");
  applyTutorialGates(); saveGame();
}
function applyTutorialGates() {
  const t = STATE.tutorial;
  const prfLock = document.getElementById('prf-lock'), phLock = document.getElementById('ph-lock');
  if (prfLock) prfLock.classList.toggle('hidden', t.refineryUnlocked);
  if (phLock)  phLock.classList.toggle('hidden', t.hangarUnlocked);
  if (!t.refineryUnlocked) {
    const c = document.getElementById('prf-lock-cost'); if (c) c.innerHTML = gateCostHTML(REFINERY_UNLOCK);
    const b = document.getElementById('prf-unlock');    if (b) b.disabled = !gateCanAfford(REFINERY_UNLOCK);
  }
  if (!t.hangarUnlocked) {
    const c = document.getElementById('ph-lock-cost'); if (c) c.innerHTML = gateCostHTML(HANGAR_UNLOCK);
    const b = document.getElementById('ph-unlock');    if (b) b.disabled = !gateCanAfford(HANGAR_UNLOCK);
  }
}

// ── WASTELAND FEED — live mini-mirror of the gameplay canvas ───
// Lets you watch the field (rover, hostiles, events) while in Ship Utilities.
let feedW = 0, feedH = 0;
function blitFeed() {
  const f = document.getElementById('feed'); if (!f) return;
  const wrap = document.getElementById('wfeed');
  if (!wrap || wrap.offsetParent === null) return;   // hidden on the wasteland screen
  const hdr = wrap.querySelector('.wfeed-hdr');
  const aspect = (canvas.width > 0 && canvas.height > 0) ? canvas.width / canvas.height : 2.5;
  // Fit the monitor INSIDE the console with margin (preserve aspect) — the console centres it.
  const availH = Math.max(2, wrap.clientHeight - (hdr ? hdr.offsetHeight : 0) - 31);   // padding 18 + bezel 6 + gap 7
  const availW = Math.max(2, wrap.clientWidth - 30);                                   // padding 24 + bezel 6
  let wantH = Math.round(availH), wantW = Math.round(wantH * aspect);
  if (wantW > availW) { wantW = availW; wantH = Math.round(availW / aspect); }
  if (wantW !== feedW || wantH !== feedH) {
    feedW = wantW; feedH = wantH;
    f.width = wantW; f.height = wantH;
    f.style.width = wantW + 'px'; f.style.height = wantH + 'px';
  }
  const fx = f.getContext('2d');
  fx.fillStyle = '#05070a'; fx.fillRect(0, 0, f.width, f.height);
  if (canvas.width > 0 && canvas.height > 0) fx.drawImage(canvas, 0, 0, f.width, f.height);
  // Hostile alert overlay so you know to jump back in
  if (STATE.expedition.active && STATE.expedition.enemies.some(e => !e.dead)) {
    fx.fillStyle = 'rgba(224,83,59,0.9)';
    fx.font = 'bold 11px "Share Tech Mono", monospace';
    fx.fillText('⚠ HOSTILE', 9, 16);
  }
}

// ── TITLE SCREEN — full-viewport mirror of the scrolling wasteland backdrop ───
function blitTitle() {
  const tb = document.getElementById('titlebg'); if (!tb) return;
  const w = window.innerWidth, h = window.innerHeight;
  if (tb.width !== w || tb.height !== h) { tb.width = w; tb.height = h; }
  const x = tb.getContext('2d');
  x.fillStyle = '#05070a'; x.fillRect(0, 0, w, h);
  if (canvas.width > 0 && canvas.height > 0) {
    // "cover" scale so the parallax fills the screen with no letterbox bars
    const s = Math.max(w / canvas.width, h / canvas.height);
    const dw = canvas.width * s, dh = canvas.height * s;
    x.drawImage(canvas, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
}

// ── ONBOARDING HIGHLIGHTS — first-run hints, gauge glow, and button funnel ────
function setPulse(sel, on) { document.querySelectorAll(sel).forEach(e => e.classList.toggle('tut-pulse', on)); }

// Reveal the Alloy Forge tab (used by the forge-intro tutorial + dev toggle).
function revealForge() {
  localStorage.setItem('rh_forge', '1');
  document.querySelectorAll('[data-panel="paf"]').forEach(b => b.classList.remove('forge-tab-hidden'));
  const hub = document.querySelector('.base-hub'); if (hub) hub.classList.remove('forge-hidden');
}
function isAlloyId(id) { const r = RT.find(x => x.id === id); return !!r && r.tier === 'alloy'; }

// ── DAILY SUPPLY DROP — small reward once per calendar day ────────────────────
function claimDaily() {
  if (!STATE.tutorial || !STATE.tutorial.expeditionDone) return null;   // not until the loop is understood
  const today = new Date(); const tStr = today.toISOString().slice(0, 10);
  const last = localStorage.getItem('rh_daily_date');
  if (last === tStr) return null;
  const y = new Date(today); y.setDate(y.getDate() - 1);
  const streak = (last === y.toISOString().slice(0, 10)) ? (+(localStorage.getItem('rh_daily_streak') || 0) + 1) : 1;
  const mult = 1 + Math.min(streak - 1, 6) * 0.15;
  const gains = { biofuel: Math.round(8 * mult), r_iron: Math.round(5 * mult), r_copper: Math.round(5 * mult) };
  Object.entries(gains).forEach(([id, q]) => { STATE.inv[id] = (STATE.inv[id] || 0) + q; });
  localStorage.setItem('rh_daily_date', tStr);
  localStorage.setItem('rh_daily_streak', String(streak));
  saveGame();
  return { streak, gains };
}
function showDailyModal(s) {
  const name = id => (RT.find(r => r.id === id) || {}).name || id;
  const sum = document.getElementById('daily-summary'); if (!sum) return;
  sum.innerHTML = `Day <b style="color:var(--bright)">${s.streak}</b> streak — supplies delivered to your stores.`;
  document.getElementById('daily-list').innerHTML = Object.keys(s.gains)
    .map(id => `<div class="trline"><span>${name(id)}</span><span style="color:var(--bright)">+${fmtNum(s.gains[id])}</span></div>`).join('');
  document.getElementById('dailyModal').classList.remove('hidden');
}
// The un-owned breach node for the next biome down (or null if none / all reached).
function nextBreachNode() {
  const cap = (typeof researchedBiomeCap === 'function') ? researchedBiomeCap() : 1;
  return (window.TECHTREE || []).find(n => n.grants && n.grants.unlockBiome === cap + 1 && !(STATE.unlocks && STATE.unlocks[n.id])) || null;
}
function biomeName(no) { const b = (window.BIOMES || []).find(x => x.no === no); return b ? b.name : ('Biome ' + no); }

// THE OBJECTIVE COMPASS — one concrete "do this next" for ANY game state, across the whole journey
// (deploy → loop → research → descend → … → Hollow Core → jettison). Fed into the #tut banner when no
// transient hint/nav is showing, so the player is never left guessing. Pure read of state (never throws).
function computeObjective() {
  const t = STATE.tutorial, exp = STATE.expedition;
  if (STATE.prestige && (STATE.prestige.count || 0) > 0) return '';   // veteran (jettisoned once) → they know the loop; go quiet
  if (exp.active) {
    if (exp.status === 'HARVESTING') return 'drill the node — click it repeatedly';
    if (exp.status === 'DRIVING') {
      if (typeof canDescend === 'function' && canDescend()) return 'press DESCEND → ' + biomeName((STATE.biome || 1) + 1);
      const cap = (typeof researchedBiomeCap === 'function') ? researchedBiomeCap() : 1;
      if (cap > (STATE.biome || 1)) { const left = (typeof descendDistLeft === 'function') ? descendDistLeft() : 0; return left > 0 ? ('explore deeper — DESCEND in ' + Math.ceil(left) + 'm') : ('press DESCEND → ' + biomeName((STATE.biome || 1) + 1)); }
      return 'gather resources, then RECALL when full';
    }
    return '';   // launching / recalling / descending — stay quiet
  }
  if (!t.expeditionDone) return 'deploy: launch your first expedition';
  if (!t.upgradedOnce) {
    if (!t.refineryUnlocked) return 'open the REFINERY and bring it online';
    if (!t.hangarUnlocked) return (typeof gateCanAfford === 'function' && gateCanAfford(HANGAR_UNLOCK)) ? 'fabricate the ROVER HANGAR' : 'smelt metal for the ROVER HANGAR';
    return 'upgrade Locomotion, Resource Extractor & Power Core';
  }
  if (typeof canPrestige === 'function' && canPrestige()) return 'JETTISON ready — open PRESTIGE to reset for Cores';
  const nb = nextBreachNode();
  if (nb) {
    if (typeof techRequiresMet === 'function' && !techRequiresMet(nb)) return 'upgrade to meet "' + nb.name + '" requirements — see RESEARCH';
    if (typeof techCanAfford === 'function' && !techCanAfford(nb)) return 'gather materials for "' + nb.name + '" — see RESEARCH';
    return 'research "' + nb.name + '" to open the next biome';
  }
  return (STATE.maxBiome || 1) >= 5 ? 'deploy, descend to the Hollow Core, then JETTISON' : 'deploy, then DESCEND to go deeper';
}

function showPrestigeIntro() {
  const m = document.getElementById('prestigeIntro'); if (!m) return;
  const c = document.getElementById('pri-cores'); if (c && typeof coresAvailable === 'function') c.textContent = coresAvailable();
  m.classList.remove('hidden'); if (window.SFX) SFX.uiToggle();
}

function updateTutorial() {
  const t = STATE.tutorial, exp = STATE.expedition;

  // ── One-shot teaching beats (contextual, non-blocking, fire once) ──
  if (!t.seenDrone && exp.active && exp.shipped && Object.keys(exp.shipped).length) { t.seenDrone = true; addLog("SALVAGE DRONE: cargo ferried home mid-run — refining starts before you're back.", "el"); saveGame(); }
  if (!t.seenDescend && exp.active && typeof canDescend === 'function' && canDescend()) { t.seenDescend = true; addLog("DESCEND is ready — breach into the next biome. (You must explore a stretch of each biome first.)", "el"); saveGame(); }
  if (!t.seenB4 && (STATE.biome || 1) >= 4) { t.seenB4 = true; addLog("The Hollow Core (Biome 5) holds Core Resonance — the key to JETTISON. Push for it.", "el"); saveGame(); }
  if (!t.seenB5 && (STATE.biome || 1) >= 5) { t.seenB5 = true; addLog("THE HOLLOW CORE: drill Core Resonance — the only resource here, and the fuel for your first Jettison.", "xl"); saveGame(); }

  // In-field banner (one at a time, priority: boost › hostile › node)
  const driving    = exp.active && exp.status === 'DRIVING';
  const boostReady  = driving && !exp.boostActive && exp.boostCdLeft <= 0;
  const enemyShown  = exp.active && exp.enemies.some(e => !e.dead);
  const harvesting  = exp.active && exp.status === 'HARVESTING' && !!exp.obstacle;
  let msg = '', enemyBanner = false;
  if (!t.usedBoost && boostReady)        msg = '⚡ THRUSTERS CHARGED  —  PRESS [ SPACE ] OR CLICK THE THRUSTER GAUGE';
  else if (!t.seenEnemy && enemyShown) { msg = '⊕ HOSTILE CONTACT  —  LEFT-CLICK ANYWHERE TO FIRE THE TURRET'; enemyBanner = true; }
  else if (!t.seenRock && harvesting)    msg = '⛏ RESOURCE NODE  —  CLICK IT REPEATEDLY TO DRILL FASTER';
  const tEl = document.getElementById('tut');   // all #tut writes happen once at the tail (msg › nav › objective)
  // Avoid stacking the generic hostile hint on top of the first-contact banner
  if (enemyBanner) document.getElementById('acp').classList.add('hidden');

  // Thruster gauge glow while the first-boost prompt is up
  const tg = document.getElementById('thrgauge');
  if (tg) tg.classList.toggle('tut-glow', !t.usedBoost && boostReady);

  // ── BASE-LOOP FUNNEL (room-navigation aware) ─────────────────────────────────
  // The UI is no longer flat tabs — it's navigable iso rooms. Each funnel step has a single TARGET
  // facility that lives in a specific room; we light that fixture's in-world clickbox, and when the
  // player is somewhere else we light the navigation step that gets them closer along the chain:
  //   wrong room → EXIT hotspot → deck-map compartment → room fixture → in-drawer button.
  const loopActive = t.expeditionDone && !t.upgradedOnce;
  // Decide which single step is live right now.
  let stepRefineryUnlock = false, stepRefine = false, stepHangarUnlock = false, stepUpgrade = false;
  if (loopActive) {
    if (!t.refineryUnlocked)      stepRefineryUnlock = true;
    else if (!t.hangarUnlocked)   { if (gateCanAfford(HANGAR_UNLOCK)) stepHangarUnlock = true; else stepRefine = true; }
    else                          stepUpgrade = true;
  }
  const wantRefineryPanel = stepRefineryUnlock || stepRefine;
  const wantHangarPanel   = stepHangarUnlock  || stepUpgrade;

  // Alloy Forge intro — when an owned upgrade first needs an alloy, reveal the Forge and guide to it.
  let forgeGuide = false;
  if (!t.forgeIntroDone) {
    for (const k in UPGCFG) {
      if ((STATE.upgrades[k] || 0) < 1) continue;
      const mats = upgradeCost(k, (STATE.upgrades[k] || 0) + 1);
      if (mats.some(m => isAlloyId(m.id))) { forgeGuide = true; break; }
    }
    if (forgeGuide && localStorage.getItem('rh_forge') !== '1') {
      revealForge();
      addLog("FORGE ONLINE: an upgrade now needs an alloy — open the ALLOY FORGE and craft it.", "el");
    }
  }

  // Resolve the single active TARGET: which facility the player should reach next.
  //   panel = base-panel id (the docked drawer) · room = iso room the fixture lives in
  //   fixture = in-world hotspot id · name = label for the navigation banner
  let tgt = null;
  if (wantRefineryPanel)    tgt = { panel: 'prf', room: 'foundry', fixture: 'refinery', name: 'REFINERY' };
  else if (wantHangarPanel) tgt = { panel: 'ph',  room: 'bay',     fixture: 'rover',    name: 'ROVER HANGAR' };
  if (forgeGuide)           tgt = { panel: 'paf', room: 'foundry', fixture: 'forge',    name: 'ALLOY FORGE' };

  // Scene detection.
  const sb = document.getElementById('sb');
  const docked   = sb.classList.contains('dock-mode');     // a facility drawer is open over a room
  const onDeck   = sb.classList.contains('deck-mode');     // the ship cross-section hub
  const onCanvas = document.getElementById('sw').classList.contains('active');   // a live iso room / field
  const room     = (window.ISO && ISO.getRoom) ? ISO.getRoom() : 'bay';
  const targetDocked = !!(tgt && docked && document.getElementById(tgt.panel)?.classList.contains('active'));

  // Reset every navigation highlight channel each frame; re-light only what this step+scene needs.
  if (window.ISO && ISO.setTutHotspot) ISO.setTutHotspot(null);
  if (window.ShipMap && ShipMap.setTut) ShipMap.setTut(null);
  setPulse('#bvb', false); setPulse('#bvw', false); setPulse('#dock-exit', false);
  setPulse('.qbtn[data-panel="prf"]', false); setPulse('.qbtn[data-panel="ph"]', false); setPulse('.qbtn[data-panel="paf"]', false);

  // Drive the player toward the target (suppressed while actually out on an expedition).
  let navMsg = '';
  if (tgt && !targetDocked && !exp.active) {
    if (docked) {                                   // wrong facility drawer is open → back out first
      setPulse('#dock-exit', true);
      navMsg = '◀ CLOSE THIS PANEL  —  THEN HEAD TO THE ' + tgt.name;
    } else if (onCanvas && room === tgt.room) {     // in the right room → pulse the in-world clickbox
      if (window.ISO) ISO.setTutHotspot(tgt.fixture);
      navMsg = 'ENTER THE ' + tgt.name + ' — CLICK IT IN THE ROOM';
    } else if (tgt.room === 'bay') {                // the Rover Bay is the standby view → go straight back
      setPulse('#bvw', true);
      navMsg = '⮌ RETURN TO THE ROVER BAY';
    } else if (onCanvas) {                          // in a different room → EXIT out toward the ship deck map
      if (window.ISO) ISO.setTutHotspot('interior');
      navMsg = '◀ EXIT THE ROOM  —  HEAD TO THE ' + tgt.name;
    } else if (onDeck) {                            // on the deck-map hub → light the destination compartment
      if (window.ShipMap) ShipMap.setTut(tgt.panel);
      navMsg = 'SELECT THE ' + tgt.name + ' COMPARTMENT';
    } else {                                        // on the wasteland → open Ship Utilities (the deck map)
      setPulse('#bvb', true);
      navMsg = 'OPEN SHIP UTILITIES  —  HEAD TO THE ' + tgt.name;
    }
  }

  // In-drawer step pulses (unchanged): once the target facility is open, guide the actual buttons.
  // Within the Refinery: its UNLOCK button, then the refine buttons.
  const onRef = document.getElementById('prf').classList.contains('active');
  document.getElementById('prf-unlock')?.classList.toggle('tut-pulse', stepRefineryUnlock && onRef);
  document.querySelectorAll('#prf .abtn').forEach(b => b.classList.toggle('tut-pulse', stepRefine && onRef && !b.disabled));
  // Within the Hangar: its UNLOCK button, then the CORE THREE upgrades — pulse each still at its
  // starting level (Locomotion, Resource Extractor, AND Power Core) so the player buys one of each.
  const onHan = document.getElementById('ph').classList.contains('active');
  document.getElementById('ph-unlock')?.classList.toggle('tut-pulse', stepHangarUnlock && onHan);
  document.querySelectorAll('#ph .ubtn').forEach(b => b.classList.remove('tut-pulse'));
  if (stepUpgrade && onHan) ['treads', 'laser', 'battery'].forEach(k => {
    if ((STATE.upgrades[k] || 0) < 1) { const b = document.getElementById('ubtn-' + k); if (b && !b.disabled) b.classList.add('tut-pulse'); }
  });
  // Within the Forge: the craft button.
  const onForge = document.getElementById('paf')?.classList.contains('active');
  const fgb = document.getElementById('fg-btn');
  if (fgb) fgb.classList.toggle('tut-pulse', forgeGuide && onForge && !fgb.disabled);

  // First-deploy prompt — before the loop is understood, pulse the DEPLOYMENT BAY door in the room
  // (and the Deploy button) so the player launches their first expedition.
  const wantDeploy = !exp.active && !loopActive && !tgt;
  const dep = document.getElementById('bdep');
  dep.classList.toggle('tut-pulse', wantDeploy);
  if (wantDeploy && !navMsg) {
    if (onCanvas && room === 'bay') { if (window.ISO) ISO.setTutHotspot('door'); navMsg = 'CLICK THE DEPLOYMENT BAY DOOR TO LAUNCH'; }
    else if (!onCanvas || room !== 'bay') { setPulse('#bvw', true); navMsg = '⮌ RETURN TO THE ROVER BAY TO DEPLOY'; }
  }

  // ── SINGLE #tut WRITE: transient hint (msg) › navigation (navMsg) › persistent OBJECTIVE compass ──
  if (tEl) {
    let obj;
    if (msg)            { tEl.textContent = msg;                      tEl.classList.remove('hidden'); tEl.classList.remove('tut-obj'); }
    else if (navMsg)    { tEl.textContent = navMsg;                   tEl.classList.remove('hidden'); tEl.classList.remove('tut-obj'); }
    else if ((obj = computeObjective())) { tEl.textContent = '◈ OBJECTIVE — ' + obj; tEl.classList.remove('hidden'); tEl.classList.add('tut-obj'); }
    else                { tEl.classList.add('hidden'); tEl.classList.remove('tut-obj'); }
  }

  // ── PRESTIGE walkthrough — one-shot modal the first time a jettison would actually pay off ──
  if (typeof canPrestige === 'function' && canPrestige() && !t.seenPrestige) { t.seenPrestige = true; saveGame(); showPrestigeIntro(); }
}

// ── DEV TOOLS ─────────────────────────────────────────────────
// Live tuning panel for the Biome-4 monochrome render pass (ISO.B4). Sliders + number boxes apply
// instantly to the live frame. Values are NOT persisted (they're code defaults) — "Copy values" dumps
// the current set so they can be baked into src/iso.js.
function buildDevB4() {
  const wrap = document.getElementById('d-b4-wrap'); if (!wrap || !window.ISO || !ISO.B4) return;
  wrap.innerHTML = ''; const B = ISO.B4;
  const META = {   // key: [min, max, step]
    res:[120,640,20], contrast:[0.6,2.0,0.05], bias:[-0.3,0.3,0.01],
    surfBase:[0,1,0.02], surfGain:[0,1.5,0.05], minB:[0,0.5,0.01], texNoise:[0,0.6,0.02],
    ambient:[0,0.8,0.02], selfLit:[0,1.5,0.05],
    roverLit:[0,1.2,0.05], roverLen:[0.5,5,0.1], roverWid:[0.5,4,0.1], roverThresh:[0,0.8,0.02],
    coneFront:[0,4,0.1], coneBack:[0,6,0.2], coneRange:[2,20,0.5], coneBaseW:[0.2,4,0.1], coneSpread:[0,2,0.05],
    conePeak:[0,0.9,0.02], coneNeck:[0,1,0.05], coneBright:[0.3,3,0.05],
    edgeOn:[0,1,1], edgeThresh:[0.02,0.6,0.01], edgeStrength:[0,1,0.05], nodeBase:[0,0.6,0.02], nodeGain:[0,1.5,0.05],
    pixel:[1,6,0.25], grain:[0,0.3,0.01], ref:[40,400,10], floor:[0,0.5,0.02],
  };
  const fmt = () => (ISO.b4force===true?'ON':ISO.b4force===false?'OFF':'AUTO');
  const ctrl = document.createElement('div'); ctrl.style.cssText = 'margin-bottom:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;';
  ctrl.innerHTML = `<button class="dapp" id="d-b4-toggle">Preview B4 here: ${fmt()}</button>
    <label style="color:#8db87a;font-size:.72rem;">clarity <input id="d-b4-clarity" type="range" min="0" max="1" step="0.05" value="${ISO.b4clarity==null?1:ISO.b4clarity}" style="width:120px;vertical-align:middle"></label>
    <span id="d-b4-clarity-v" style="color:#8db87a;font-size:.72rem;width:34px;display:inline-block;">${ISO.b4clarity==null?'auto':(+ISO.b4clarity).toFixed(2)}</span>
    <button class="dapp" id="d-b4-copy">Copy values</button>
    <span style="color:#8db87a;font-size:.72rem;margin-left:6px;">Preview biome scene:</span>
    <button class="dapp" data-fb="1">B1</button><button class="dapp" data-fb="2">B2</button><button class="dapp" data-fb="3">B3</button><button class="dapp" data-fb="4">B4</button><button class="dapp" data-fb="5">B5</button><button class="dapp" data-fb="0">off</button>`;
  wrap.appendChild(ctrl);
  ctrl.querySelectorAll('[data-fb]').forEach(b => b.addEventListener('click', e => { const n = +e.target.dataset.fb; if (window.ISO) ISO.forceBiome = n || null; addLog('DEV: preview biome scene → ' + (n || 'off'), 'xl'); }));
  // Live preview — mirrors the game canvas (#gc) each frame so sliders can be judged WITHOUT leaving Dev Tools.
  // Needs the rover deployed/driving (the field keeps rendering to #gc in the background). Toggle preview ON above.
  const pv = document.createElement('canvas'); pv.id = 'd-b4-preview'; pv.width = 360; pv.height = 210;
  pv.style.cssText = 'display:block;width:360px;height:210px;margin:0 0 10px;border:1px solid #4a5a3a;background:#000;image-rendering:pixelated;';
  wrap.appendChild(pv);
  const pvHint = document.createElement('div'); pvHint.style.cssText = 'font-size:.7rem;color:#8db87a;margin:-6px 0 10px;';
  pvHint.textContent = '↑ live mirror of the field (deploy the rover + set Preview ON to see B4 here)';
  wrap.appendChild(pvHint);
  const pg = pv.getContext('2d'); let pvSized = false;
  (function pvTick() {
    if (!document.body.contains(pv)) return;   // stop when the panel is rebuilt (old canvas removed)
    const gc = document.getElementById('gc');
    if (gc && gc.width && pv.offsetParent !== null) {   // only when the panel is actually visible
      if (!pvSized) { pv.height = Math.round(pv.width * gc.height / gc.width); pvSized = true; }
      pg.imageSmoothingEnabled = false; pg.drawImage(gc, 0, 0, gc.width, gc.height, 0, 0, pv.width, pv.height);
    }
    requestAnimationFrame(pvTick);
  })();
  const tbl = document.createElement('table'); tbl.className = 'dtbl';
  tbl.innerHTML = `<thead><tr><th>PARAM</th><th>SLIDER</th><th>VALUE</th></tr></thead>`;
  const tb = document.createElement('tbody'); tbl.appendChild(tb);
  Object.keys(META).forEach(k => { const [mn, mx, st] = META[k];
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="color:var(--dev);white-space:nowrap;">${k}</td>
      <td><input type="range" id="d-b4-${k}" min="${mn}" max="${mx}" step="${st}" value="${B[k]}" style="width:180px;vertical-align:middle"></td>
      <td><input class="di" type="number" id="d-b4n-${k}" step="${st}" value="${B[k]}" style="width:74px"></td>`;
    tb.appendChild(tr);
    const sl = tr.querySelector(`#d-b4-${k}`), nm = tr.querySelector(`#d-b4n-${k}`);
    const set = v => { B[k] = +v; sl.value = v; nm.value = v; };
    sl.addEventListener('input', e => set(e.target.value));
    nm.addEventListener('change', e => set(e.target.value));
  });
  wrap.appendChild(tbl);
  ctrl.querySelector('#d-b4-toggle').addEventListener('click', e => { ISO.b4force = ISO.b4force===true?false:(ISO.b4force===false?null:true); e.target.textContent = 'Preview B4 here: ' + fmt(); });
  const cl = ctrl.querySelector('#d-b4-clarity'), clv = ctrl.querySelector('#d-b4-clarity-v');
  cl.addEventListener('input', e => { ISO.b4clarity = +e.target.value; clv.textContent = (+e.target.value).toFixed(2); });
  ctrl.querySelector('#d-b4-copy').addEventListener('click', () => { const o = {}; Object.keys(META).forEach(k => o[k] = B[k]); const s = JSON.stringify(o); (navigator.clipboard && navigator.clipboard.writeText(s)); addLog('DEV: B4 values copied → ' + s, 'xl'); });
}

function buildDevCfg() {
  const wrap = document.getElementById('d-cfg-wrap'); wrap.innerHTML = '';
  const tbl = document.createElement('table'); tbl.className = 'dtbl';
  tbl.innerHTML = `<thead><tr><th>PARAMETER</th><th>VALUE</th><th>KEY</th></tr></thead>`;
  const tb = document.createElement('tbody'); tbl.appendChild(tb);
  const labels = {
    powerDrainDriving:'Power drain — driving (EP/s)', powerDrainDrilling:'Power drain — drilling (EP/s)',
    obstacleMinGap:'Obstacle min gap (m)', obstacleMaxGap:'Obstacle random gap (m)',
    enemySpawnMin:'Hostile spawn min (s)', enemySpawnRange:'Hostile spawn random (s)',
    enemyLifetime:'Hostile lifetime (s)', enemyMaxActive:'Max hostiles on screen',
    enemyBaseHp:'Hostile base HP', enemyHpRange:'Hostile HP random range',
    enemyWander:'Hostile wander rate', organiteDrop:'Organite drop min', organiteDropRange:'Organite drop random extra',
    recallTime:'Recall time (s)',
    offlineEfficiency:'Offline efficiency (0–1)', offlineCapHours:'Offline cap (hours)',
  };
  Object.entries(CFG).forEach(([k, v]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td style="color:var(--dev);white-space:nowrap;">${labels[k]||k}</td><td><input class="di" type="number" step="0.05" value="${v}" id="dcfg-${k}"></td><td style="color:#8db87a;font-size:.68rem;">${k}</td>`;
    tb.appendChild(tr);
    tr.querySelector(`#dcfg-${k}`).addEventListener('change', e => { CFG[k] = +e.target.value; saveGame(); });
  });
  wrap.appendChild(tbl);
}

function buildDevResTable() {
  const wrap = document.getElementById('d-res-wrap'); wrap.innerHTML = '';
  const tbl = document.createElement('table'); tbl.className = 'dtbl';
  tbl.innerHTML = `<thead><tr><th>ID</th><th>NAME</th><th>CATEGORY</th><th>TIER</th><th>SHAPE</th><th>COLOR</th><th>DRILL</th><th>MIN</th><th>MAX</th><th>WEIGHT</th><th>REFINES→</th><th>RATIO</th><th></th></tr></thead>`;
  const tb = document.createElement('tbody'); tbl.appendChild(tb);
  RT.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input class="di" value="${r.id}" style="width:88px" data-i="${i}" data-f="id"></td>
      <td><input class="di" value="${r.name}" style="width:120px" data-i="${i}" data-f="name"></td>
      <td><input class="di" value="${r.category}" style="width:110px" data-i="${i}" data-f="category"></td>
      <td><select class="ds" data-i="${i}" data-f="tier">${['raw','refined','alloy','exotic','biomech'].map(t=>`<option value="${t}"${r.tier===t?' selected':''}>${t}</option>`).join('')}</select></td>
      <td><select class="ds" data-i="${i}" data-f="obsShape">${['heap','cyst','crystal','shard','node'].map(s=>`<option value="${s}"${r.obsShape===s?' selected':''}>${s}</option>`).join('')}</select></td>
      <td><input class="di" value="${r.color}" style="width:78px" data-i="${i}" data-f="color"><span style="display:inline-block;width:12px;height:12px;background:${r.color};border-radius:2px;vertical-align:middle;margin-left:3px"></span></td>
      <td><input class="di" type="number" min="0" step="0.5" value="${r.drillTime}" data-i="${i}" data-f="drillTime"></td>
      <td><input class="di" type="number" min="0" value="${r.yieldMin}" data-i="${i}" data-f="yieldMin"></td>
      <td><input class="di" type="number" min="0" value="${r.yieldMax}" data-i="${i}" data-f="yieldMax"></td>
      <td><input class="di" type="number" min="0" value="${r.weight}" data-i="${i}" data-f="weight"></td>
      <td><input class="di" value="${r.refinesTo?r.refinesTo.id:''}" style="width:88px" placeholder="id" data-i="${i}" data-f="rtId"></td>
      <td><input class="di" type="number" min="1" value="${r.refinesTo?r.refinesTo.ratio:10}" data-i="${i}" data-f="rtRatio"></td>
      <td><button class="ddel" data-i="${i}">✕</button></td>`;
    tb.appendChild(tr);
  });
  wrap.appendChild(tbl);
  wrap.querySelectorAll('.di,.ds').forEach(inp => inp.addEventListener('change', () => {
    const i=+inp.dataset.i, f=inp.dataset.f, v=inp.type==='number'?+inp.value:inp.value;
    if (f==='rtId'||f==='rtRatio') {
      const rid = wrap.querySelector(`[data-i="${i}"][data-f="rtId"]`).value.trim();
      const rrat = +wrap.querySelector(`[data-i="${i}"][data-f="rtRatio"]`).value || 10;
      RT[i].refinesTo = rid ? { id:rid, ratio:rrat } : null;
    } else { RT[i][f] = v; }
    syncAlloyOutputs(); initInv(); buildCargo(); buildRefinery(); buildHangarBank(); saveGame();
    if (f==='color') buildDevResTable();
  }));
  wrap.querySelectorAll('.ddel').forEach(btn => btn.addEventListener('click', () => {
    if (confirm(`Delete "${RT[+btn.dataset.i].name}"?`)) { RT.splice(+btn.dataset.i, 1); syncAlloyOutputs(); initInv(); buildAll(); saveGame(); }
  }));
}

function buildDevAlloyTable() {
  const wrap = document.getElementById('d-alloy-wrap'); wrap.innerHTML = '';
  const tbl = document.createElement('table'); tbl.className = 'dtbl';
  tbl.innerHTML = `<thead><tr><th>OUTPUT ID</th><th>INPUT A</th><th>INPUT B</th><th>QTY A</th><th>QTY B</th><th>YIELDS</th><th></th></tr></thead>`;
  const tb = document.createElement('tbody'); tbl.appendChild(tb);
  ALLOYS.forEach((a, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input class="di" value="${a.id}" style="width:120px" data-ai="${i}" data-af="id"></td>
      <td><input class="di" value="${a.inputA}" style="width:95px" data-ai="${i}" data-af="inputA"></td>
      <td><input class="di" value="${a.inputB}" style="width:95px" data-ai="${i}" data-af="inputB"></td>
      <td><input class="di" type="number" min="1" value="${a.qtyA}" data-ai="${i}" data-af="qtyA"></td>
      <td><input class="di" type="number" min="1" value="${a.qtyB}" data-ai="${i}" data-af="qtyB"></td>
      <td><input class="di" type="number" min="1" value="${a.yields}" data-ai="${i}" data-af="yields"></td>
      <td><button class="ddel" data-ai="${i}">✕</button></td>`;
    tb.appendChild(tr);
  });
  wrap.appendChild(tbl);
  wrap.querySelectorAll('.di').forEach(inp => inp.addEventListener('change', () => {
    const i=+inp.dataset.ai, f=inp.dataset.af, v=inp.type==='number'?+inp.value:inp.value;
    ALLOYS[i][f] = v; syncAlloyOutputs(); initInv(); saveGame(); updateAlloyTable(); updateForge();
  }));
  wrap.querySelectorAll('.ddel').forEach(btn => btn.addEventListener('click', () => {
    ALLOYS.splice(+btn.dataset.ai, 1); syncAlloyOutputs(); initInv(); buildAll(); saveGame();
  }));
}

function buildDevUpgrades() {
  const wrap = document.getElementById('d-upg-wrap'); wrap.innerHTML = '';
  const tbl = document.createElement('table'); tbl.className = 'dtbl';
  // BASE / GROWTH drive the geometric cost curve (qty = base·growth^(lvl-1)). Edit live to tune the
  // whole curve's steepness; persists to save (see saveGame upgTune). Run tools/econ_sim.py to preview.
  tbl.innerHTML = `<thead><tr><th>UPGRADE</th><th>BASE</th><th>GROWTH</th><th>NEXT COST</th><th>LVL</th><th>SET LVL</th></tr></thead>`;
  const tb = document.createElement('tbody'); tbl.appendChild(tb);
  const fmtCost = key => upgradeCost(key, (STATE.upgrades[key]||0) + 1)
    .map(m => `${fmtNum(m.qty)}× ${RT.find(r=>r.id===m.id)?.name||m.id}`).join(' + ');
  Object.entries(UPGCFG).forEach(([key, cfg]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:var(--dev)">${cfg.name}</td>
      <td><input class="di" type="number" min="1" step="1" style="width:52px" value="${cfg.costBase}" id="dubase-${key}"></td>
      <td><input class="di" type="number" min="1.01" max="2" step="0.005" style="width:62px" value="${cfg.costGrowth}" id="dugrow-${key}"></td>
      <td style="color:#8db87a" id="ducost-${key}">${fmtCost(key)}</td>
      <td style="color:var(--cyan);font-family:'Share Tech Mono',monospace" id="ducur-${key}">${STATE.upgrades[key]||0}</td>
      <td style="display:flex;gap:6px;align-items:center;">
        <input class="di" type="number" min="0" max="999" style="width:56px" value="${STATE.upgrades[key]||0}" id="duset-${key}">
        <button class="dapp" data-uk="${key}">SET</button>
      </td>`;
    tb.appendChild(tr);
    const refreshCost = () => { document.getElementById('ducost-' + key).textContent = fmtCost(key); };
    // live curve tuning (persists)
    tr.querySelector('#dubase-' + key).addEventListener('change', e => {
      cfg.costBase = Math.max(1, +e.target.value || 1); refreshCost(); buildHangar(); saveGame();
      addLog(`DEV: ${cfg.name} costBase = ${cfg.costBase}.`, 'sl');
    });
    tr.querySelector('#dugrow-' + key).addEventListener('change', e => {
      cfg.costGrowth = Math.min(2, Math.max(1.001, +e.target.value || 1.1)); refreshCost(); buildHangar(); saveGame();
      addLog(`DEV: ${cfg.name} costGrowth = ${cfg.costGrowth}.`, 'sl');
    });
    tr.querySelector('[data-uk]').addEventListener('click', () => {
      const v = +tr.querySelector(`#duset-${key}`).value;
      STATE.upgrades[key] = v; if (v > 0) cfg.locked = false; buildHangar(); saveGame();
      document.getElementById('ducur-' + key).textContent = v; refreshCost();
      addLog(`DEV: ${cfg.name} set Lvl ${v}.`, "sl");
    });
  });
  wrap.appendChild(tbl);
}

// Dev: live editor for the biome BREACH gates (techtree.js) — material quantities + the upgrade-level
// requirements that pace each descent. The primary biome-pacing levers. Persists (see saveGame breachTune).
function buildDevBreach() {
  const wrap = document.getElementById('d-breach-wrap'); if (!wrap) return;
  wrap.innerHTML = '';
  const nodes = (window.TECHTREE || []).filter(n => n.grants && n.grants.unlockBiome);
  nodes.forEach(n => {
    const box = document.createElement('div'); box.className = 'dgrow';
    box.style.cssText = 'flex-direction:column;align-items:stretch;gap:6px;border:1px solid #2b3122;border-radius:6px;padding:8px 10px;margin-bottom:8px;';
    const reqs = (n.requires || []).filter(r => r.type === 'upgrade_level');
    const costRow = (n.cost || []).map((c, i) =>
      `<label style="color:#8db87a;font-size:.72rem;">${RT.find(r=>r.id===c.id)?.name||c.id} ×<input class="di" type="number" min="0" style="width:74px" value="${c.qty}" data-bc="${n.id}|${i}"></label>`).join(' ');
    const reqRow = reqs.map((r, i) =>
      `<label style="color:var(--cyan);font-size:.72rem;">${(UPGCFG[r.key]||{}).name||r.key} ≥<input class="di" type="number" min="0" style="width:56px" value="${r.value}" data-br="${n.id}|${i}"></label>`).join(' ');
    box.innerHTML =
      `<div style="color:var(--dev);font-weight:bold;">${n.icon||''} ${n.name} <span style="color:var(--dim);font-weight:normal;">→ Biome ${n.grants.unlockBiome}</span></div>` +
      `<div style="display:flex;flex-wrap:wrap;gap:10px;">${costRow}</div>` +
      `<div style="display:flex;flex-wrap:wrap;gap:10px;">${reqRow}</div>`;
    wrap.appendChild(box);
  });
  wrap.querySelectorAll('[data-bc]').forEach(inp => inp.addEventListener('change', e => {
    const [id, i] = e.target.dataset.bc.split('|'); const n = window.TECHTREE.find(x => x.id === id);
    if (n) { n.cost[+i].qty = Math.max(0, +e.target.value || 0); buildResearch(); saveGame(); addLog(`DEV: ${n.name} cost updated.`, 'sl'); }
  }));
  wrap.querySelectorAll('[data-br]').forEach(inp => inp.addEventListener('change', e => {
    const [id, i] = e.target.dataset.br.split('|'); const n = window.TECHTREE.find(x => x.id === id);
    const reqs = n ? n.requires.filter(r => r.type === 'upgrade_level') : [];
    if (reqs[+i]) { reqs[+i].value = Math.max(0, +e.target.value || 0); buildResearch(); saveGame(); addLog(`DEV: ${n.name} requirement updated.`, 'sl'); }
  }));
}

// Dev: one button per biome to travel directly (test pacing/visuals).
function buildDevBiomes() {
  const row = document.getElementById('d-biomes'); if (!row) return;
  row.innerHTML = '';
  (window.BIOMES || []).forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'dapp'; btn.dataset.biome = b.no;
    btn.textContent = `${b.no}· ${b.name}`;
    btn.addEventListener('click', () => { if (typeof setBiome === 'function') { setBiome(b.no); updateDevBiomeActive(); SFX.uiClick(); } });
    row.appendChild(btn);
  });
  updateDevBiomeActive();
}
function updateDevBiomeActive() {
  const cur = (typeof STATE !== 'undefined' && STATE.biome) ? STATE.biome : 1;
  document.querySelectorAll('#d-biomes [data-biome]').forEach(b => {
    const on = +b.dataset.biome === cur;
    b.style.background = on ? 'var(--dev)' : '';
    b.style.color = on ? '#000' : '';
  });
}

function buildDevGive() {
  const row = document.getElementById('d-give'); row.innerHTML = '';
  const sel = document.createElement('select'); sel.className = 'ds'; sel.style.minWidth = '140px';
  RT.forEach(r => { const o = document.createElement('option'); o.value = r.id; o.textContent = r.name; sel.appendChild(o); });
  const amt = document.createElement('input'); amt.className = 'di'; amt.type = 'number'; amt.value = 50; amt.style.width = '65px';
  const gb = document.createElement('button'); gb.className = 'dapp'; gb.textContent = 'GIVE';
  gb.addEventListener('click', () => { STATE.inv[sel.value] = (STATE.inv[sel.value]||0) + (+amt.value||0); addLog(`DEV: +${amt.value} ${RT.find(r=>r.id===sel.value)?.name||sel.value}.`, "sl"); });
  const cb = document.createElement('button'); cb.className = 'ddel'; cb.style.padding = '4px 10px'; cb.textContent = 'CLEAR ALL';
  cb.addEventListener('click', () => { if (confirm('Clear all inventory?')) Object.keys(STATE.inv).forEach(k => STATE.inv[k] = 0); });
  const lbl = document.createElement('span'); lbl.textContent = 'Qty:'; lbl.style.cssText = 'font-family:monospace;font-size:.74rem;color:#8db87a';
  row.append(sel, lbl, amt, gb, cb);
}

function updateDevSnap() {
  const el = document.getElementById('d-snap'), pdv = document.getElementById('pdv');
  if (!el || !pdv || !pdv.classList.contains('active')) return;
  el.textContent = RT.map(r =>
    `${r.name.padEnd(22,'·')} inv:${String(STATE.inv[r.id]||0).padStart(5)} run:${String(STATE.expedition.cargo[r.id]||0).padStart(4)} wt:${r.weight} drill:${r.drillTime}s`
  ).join('\n');
}

// ── ARCHIVES / LORE (built from window.ARCHIVES — see lore.js) ─
function escHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function loreBodyHtml(b){
  return (b||'').split(/\n\s*\n/).filter(x => x.trim())
    .map(p => '<p>' + escHtml(p.trim()).replace(/\*(.+?)\*/g, '<em>$1</em>') + '</p>').join('');
}
function buildArchives() {
  const list = document.getElementById('arclist'), view = document.getElementById('arcv');
  if (!list || !view || typeof ARCHIVES === 'undefined') return;
  list.innerHTML = ''; view.innerHTML = '';
  if (!STATE.archives) STATE.archives = {};
  let first = null;
  ARCHIVES.forEach(a => {
    const always = a.unlock && a.unlock.type === 'always';
    let unlocked = always || STATE.archives[a.id];
    // reveal anything already satisfied on a loaded save (e.g. distance already passed)
    if (!unlocked && typeof archiveUnlocked === 'function' && archiveUnlocked(a)) {
      unlocked = true; STATE.archives[a.id] = true;
    }
    const li = document.createElement('li');
    li.className = 'arci' + (unlocked ? '' : ' locked');
    li.dataset.log = 'arc-' + a.id; li.id = 'arcli-' + a.id;
    li.textContent = a.label || a.title || a.id;
    list.appendChild(li);
    const div = document.createElement('div');
    div.id = 'arc-' + a.id; div.className = 'hidden';
    div.innerHTML = '<h2>' + escHtml(a.title || '') + '</h2><p class="ts">' +
      escHtml(a.timestamp || '') + '</p>' + loreBodyHtml(a.body);
    view.appendChild(div);
    if (unlocked && !first) first = { li, div };
  });
  if (first) { first.li.classList.add('active'); first.div.classList.remove('hidden'); }
}
// Called from game.js when an entry unlocks mid-run.
function revealArchive(id) {
  const li = document.getElementById('arcli-' + id);
  if (li) li.classList.remove('locked');
}

// ── OBJECTIVES / ACHIEVEMENTS (built from window.ACHIEVEMENTS — see achievements.js) ─
function achRewardText(a) {
  if (!Array.isArray(a.reward) || !a.reward.length) return '';
  return 'REWARD: ' + a.reward.map(r => `+${fmtNum(r.qty)} ${(RT.find(x => x.id === r.id) || {}).name || r.id}`).join(', ');
}
function buildAchievements() {
  const grid = document.getElementById('ach-grid');
  if (!grid || typeof ACHIEVEMENTS === 'undefined') return;
  if (!STATE.objectives) STATE.objectives = {};
  grid.innerHTML = '';
  ACHIEVEMENTS.forEach(a => {
    const done = !!STATE.objectives[a.id];
    const hide = a.secret && !done;
    const name = hide ? '???' : (a.name || a.id);
    const desc = hide ? 'Hidden objective — complete it to reveal.' : (a.desc || '');
    const rew  = hide ? '' : achRewardText(a);
    const card = document.createElement('div');
    card.className = 'ach-card' + (done ? ' done' : '');
    card.id = 'ach-' + a.id;
    card.innerHTML =
      `<div class="ach-icon">${hide ? '❔' : (a.icon || '🎯')}</div>` +
      `<div class="ach-body">` +
        `<div class="ach-name">${escHtml(name)}</div>` +
        `<div class="ach-desc">${escHtml(desc)}</div>` +
        (rew ? `<div class="ach-reward">${escHtml(rew)}</div>` : '') +
        `<div class="ach-bar"><div class="ach-bar-f" id="achf-${a.id}"></div></div>` +
        `<div class="ach-prog" id="achp-${a.id}"></div>` +
      `</div>` +
      `<div class="ach-check" id="achk-${a.id}">${done ? '✔' : '🔒'}</div>`;
    grid.appendChild(card);
  });
  updateAchievements();
}
function updateAchievements() {
  if (typeof ACHIEVEMENTS === 'undefined' || typeof achievementProgress !== 'function') return;
  let doneCount = 0;
  ACHIEVEMENTS.forEach(a => {
    const done = !!(STATE.objectives && STATE.objectives[a.id]);
    if (done) doneCount++;
    const p = achievementProgress(a);
    const f = document.getElementById('achf-' + a.id);
    if (f) f.style.width = Math.min(100, (p.goal ? p.cur / p.goal : 0) * 100).toFixed(1) + '%';
    const pe = document.getElementById('achp-' + a.id);
    if (pe) pe.textContent = done ? 'COMPLETE' : `${fmtNum(Math.min(p.cur, p.goal))} / ${fmtNum(p.goal)}`;
    const card = document.getElementById('ach-' + a.id);
    if (card && done && !card.classList.contains('done')) revealAchievement(a.id);
  });
  const c = document.getElementById('ach-count');
  if (c) c.textContent = `${doneCount} / ${ACHIEVEMENTS.length}`;
}
// Called from game.js when an objective completes mid-frame (and from updateAchievements).
function revealAchievement(id) {
  const a = (typeof ACHIEVEMENTS !== 'undefined') && ACHIEVEMENTS.find(x => x.id === id);
  const card = document.getElementById('ach-' + id);
  if (!card) return;
  card.classList.add('done');
  const k = document.getElementById('achk-' + id); if (k) k.textContent = '✔';
  // If it was a secret, fill in the now-revealed name/desc/reward.
  if (a && a.secret) {
    const n = card.querySelector('.ach-name'); if (n) n.textContent = a.name || a.id;
    const d = card.querySelector('.ach-desc'); if (d) d.textContent = a.desc || '';
    const ic = card.querySelector('.ach-icon'); if (ic) ic.textContent = a.icon || '🎯';
  }
}

// ── RESEARCH / TECH TREE (built from window.TECHTREE — see techtree.js) ─
function nodeReqText(r) {
  switch (r.type) {
    case 'upgrade_level': return `${(UPGCFG[r.key] || {}).name || r.key} Lvl ${r.value}`;
    case 'resource':      return `${fmtNum(r.value)} ${(RT.find(x => x.id === r.id) || {}).name || r.id}`;
    case 'resource_tier': return `any ${r.tier} ×${r.value}`;
    case 'total_distance':return `${fmtNum(r.value)} m travelled`;
    case 'unlock':        { const n = (window.TECHTREE || []).find(x => x.id === r.value); return `Research: ${n ? n.name : r.value}`; }
    default: return r.type;
  }
}
function buildResearch() {
  const grid = document.getElementById('tr-grid');
  if (!grid || typeof TECHTREE === 'undefined') return;
  grid.innerHTML = '';
  TECHTREE.forEach(n => {
    const card = document.createElement('div');
    card.className = 'ach-card'; card.id = 'tr-' + n.id;
    card.innerHTML =
      `<div class="ach-icon">${n.icon || '🧬'}</div>` +
      `<div class="ach-body">` +
        `<div class="ach-name">${escHtml(n.name)}</div>` +
        `<div class="ach-desc">${escHtml(n.desc || '')}</div>` +
        `<div class="tr-req" id="trreq-${n.id}"></div>` +
        `<div class="tr-cost" id="trcost-${n.id}"></div>` +
        `<button class="tr-btn" id="trbtn-${n.id}">RESEARCH</button>` +
        `<div class="tr-owned hidden" id="trown-${n.id}">✔ RESEARCHED</div>` +
      `</div>`;
    grid.appendChild(card);
    card.querySelector('#trbtn-' + n.id).addEventListener('click', () => {
      if (typeof activateNode === 'function' && activateNode(n.id)) { buildResearch(); buildHangar(); }
    });
  });
  updateResearch();
}
function updateResearch() {
  if (typeof TECHTREE === 'undefined' || typeof techNodeState !== 'function') return;
  let owned = 0;
  TECHTREE.forEach(n => {
    const st = techNodeState(n);   // owned | available | locked
    if (st === 'owned') owned++;
    const card = document.getElementById('tr-' + n.id); if (!card) return;
    card.classList.toggle('locked', st === 'locked');
    card.classList.toggle('avail', st === 'available');
    const btn = document.getElementById('trbtn-' + n.id), own = document.getElementById('trown-' + n.id);
    const reqEl = document.getElementById('trreq-' + n.id), costEl = document.getElementById('trcost-' + n.id);
    if (own) own.classList.toggle('hidden', st !== 'owned');
    if (btn) btn.classList.toggle('hidden', st === 'owned');
    // unmet requirements
    if (reqEl) {
      const unmet = (n.requires || []).filter(r => {
        if (r.type === 'unlock') return !(STATE.unlocks && STATE.unlocks[r.value]);
        return !(typeof achievementProgress === 'function' && achievementProgress({ condition: r }).done);
      });
      reqEl.innerHTML = unmet.length ? 'Requires: ' + unmet.map(r => `<b>${nodeReqText(r)}</b>`).join(', ') : '';
    }
    // cost pills
    if (costEl) costEl.innerHTML = (n.cost || []).map(c => {
      const have = Math.floor(STATE.inv[c.id] || 0), ok = have >= c.qty, r = RT.find(x => x.id === c.id);
      return `<span class="tr-cmat${ok ? '' : ' short'}">${r ? r.name : c.id} ${fmtNum(have)}/${fmtNum(c.qty)}</span>`;
    }).join('');
    if (btn) btn.disabled = st !== 'available' || !techCanAfford(n) || STATE.expedition.active;
  });
  const c = document.getElementById('tr-count'); if (c) c.textContent = `${owned} / ${TECHTREE.length}`;
}

// ── PRESTIGE (Jettison + Core tree — built from PRESTIGE_TREE in game.js) ──
function buildPrestige() {
  const grid = document.getElementById('pr-grid');
  if (!grid || typeof PRESTIGE_TREE === 'undefined') return;
  grid.innerHTML = '';
  PRESTIGE_TREE.forEach(n => {
    const card = document.createElement('div');
    card.className = 'ach-card'; card.id = 'pr-' + n.id;
    card.innerHTML =
      `<div class="ach-icon">${n.icon || '✦'}</div>` +
      `<div class="ach-body">` +
        `<div class="ach-name">${escHtml(n.name)} <span id="prlvl-${n.id}" style="color:#ffcf7a;font-size:.7rem;letter-spacing:1px;"></span></div>` +
        `<div class="ach-desc">${escHtml(n.desc || '')}</div>` +
        `<div class="tr-cost" id="prcost-${n.id}"></div>` +
        `<button class="tr-btn" id="prbtn-${n.id}">UPGRADE</button>` +
      `</div>`;
    grid.appendChild(card);
    card.querySelector('#prbtn-' + n.id).addEventListener('click', () => {
      if (typeof buyPrestigeNode === 'function' && buyPrestigeNode(n.id)) { buildPrestige(); buildHangar(); }
    });
  });
  const jet = document.getElementById('pr-jettison');
  if (jet && !jet._wired) { jet._wired = true; jet.addEventListener('click', () => {
    if (typeof canPrestige !== 'function' || !canPrestige()) { SFX.denied(); return; }
    const g = coresAvailable();
    if (!confirm(`JETTISON: reset this cycle (resources, upgrades, research, biome) for +${g} CORES?\n\nKept: Cores & the prestige tree, Mastery, Archives, Achievements. Head Start re-enters you deeper.\n\nProceed?`)) return;
    if (doPrestige()) { buildAll(); }   // stays on the PRESTIGE panel (already active); buildAll refreshes everything
  }); }
  updatePrestige();
}
function updatePrestige() {
  if (typeof PRESTIGE_TREE === 'undefined') return;
  const p = STATE.prestige || {};
  const coresEl = document.getElementById('pr-cores'); if (coresEl) coresEl.textContent = `✦ ${fmtNum(p.cores || 0)} CORES`;
  const cntEl = document.getElementById('pr-count'); if (cntEl) cntEl.textContent = fmtNum(p.count || 0);
  const totEl = document.getElementById('pr-total'); if (totEl) totEl.textContent = fmtNum(p.totalEarned || 0);
  const able = typeof canPrestige === 'function' && canPrestige();
  const gain = typeof coresAvailable === 'function' ? coresAvailable() : 0;
  const info = document.getElementById('pr-jet-info');
  if (info) info.innerHTML = (p.cycleMaxBiome || 1) >= 5
    ? `Jettison now for <b style="color:#ffcf7a">+${fmtNum(gain)} cores</b> (from this cycle's output).`
    : `Reach the <b style="color:var(--cyan)">Hollow Core</b> this cycle to enable a jettison. <span style="color:var(--dim)">(pending: ${fmtNum(gain)} cores)</span>`;
  const jet = document.getElementById('pr-jettison'); if (jet) jet.disabled = !able || STATE.expedition.active;
  PRESTIGE_TREE.forEach(n => {
    const lvl = (typeof prestigeLevel === 'function') ? prestigeLevel(n.id) : 0;
    const cost = (typeof prestigeNodeCost === 'function') ? prestigeNodeCost(n) : Infinity;
    const lvlEl = document.getElementById('prlvl-' + n.id); if (lvlEl) lvlEl.textContent = n.tiers ? `${lvl}/${n.tiers.length}` : (n.max ? `${lvl}/${n.max}` : `Lvl ${lvl}`);
    const costEl = document.getElementById('prcost-' + n.id);
    const maxed = !isFinite(cost);
    if (costEl) costEl.innerHTML = maxed ? `<span class="tr-cmat">MAXED</span>` : `<span class="tr-cmat${(p.cores||0) >= cost ? '' : ' short'}">✦ ${fmtNum(cost)} cores</span>`;
    const btn = document.getElementById('prbtn-' + n.id);
    if (btn) { btn.disabled = maxed || (p.cores || 0) < cost; btn.textContent = maxed ? 'MAXED' : 'UPGRADE'; }
  });
}

// ── BUILD ALL (called on init and after data changes) ─────────
function buildAll() {
  syncAlloyOutputs(); initInv();
  buildHangar(); buildHangarBank(); buildCargo(); buildRefinery(); buildForge(); buildTutorialGates();
  buildArchives(); buildAchievements(); buildResearch(); buildPrestige();
  buildDevB4(); buildDevCfg(); buildDevResTable(); buildDevAlloyTable(); buildDevUpgrades(); buildDevBreach(); buildDevGive(); buildDevBiomes();
  updateAlloyTable();
}

// ── MAIN UI UPDATE (called every frame) ──────────────────────
function updateUI() {
  document.getElementById('tu').textContent = fmtT(STATE.uptime);
  updateCargo();
  // A new resource was just discovered → rebuild the drip-fed Refinery/Forge once so the
  // newly-unlocked refine option / forge inputs appear.
  if (discoveryDirty) { discoveryDirty = false; buildRefinery(); buildForge(); }
  updateRefinery(); updateForge(); updateAlloyTable(); updateDevSnap(); updateHangarBank(); applyTutorialGates();
  if (typeof updatePrestige === 'function') updatePrestige();

  // Hangar buttons
  Object.keys(UPGCFG).forEach(key => {
    const btn = document.getElementById('ubtn-' + key); if (!btn) return;
    const cfg = UPGCFG[key], lvl = STATE.upgrades[key] || 0;
    const isLocked = cfg.locked && lvl === 0;
    const isSub    = key.startsWith('w_') && (STATE.upgrades.weapon||0) === 0;
    const afford   = G.upCanAfford(key);
    btn.disabled   = isSub || STATE.expedition.active || !afford;
    const base = lvl === 0 ? 'UNLOCK' : 'UPGRADE';
    const n = (afford && buyMode !== 1) ? affordableLevels(key, buyMode).count : 1;
    btn.textContent = n > 1 ? `${base} ×${n}` : base;
    document.getElementById('lvl-' + key).textContent = lvl > 0 ? 'Lvl ' + lvl : 'LOCKED';
    const se = document.getElementById('st-' + key); if (se) se.textContent = lvl > 0 ? cfg.statFn(lvl) : '—';
    const ce = document.getElementById('cost-' + key); if (ce) ce.innerHTML = costHTML(key, lvl + 1);
  });

  // "Best value" — badge + gold-pulsing UPGRADE button on the best buy. SUPPRESSED during
  // onboarding (until the core systems are all online) so the tutorial can teach breadth —
  // one of each — instead of steering straight to the optimal buy.
  const onboarding = !STATE.tutorial.upgradedOnce;
  const bestKey = (!onboarding && typeof bestValueUpgrade === 'function') ? bestValueUpgrade() : null;
  Object.keys(UPGCFG).forEach(key => {
    const isBest = !!(bestKey && bestKey.key === key);
    const bv = document.getElementById('bv-' + key);
    if (bv) bv.classList.toggle('hidden', !isBest);
    const ub = document.getElementById('ubtn-' + key);
    if (ub) ub.classList.toggle('bestbuy', isBest && !ub.disabled);   // don't pulse while deployed/unaffordable
  });

  // Expedition HUD
  const exp = STATE.expedition;

  // AUX telemetry (relocated off the canvas) — updated every frame in any state
  const statusLabel = exp.active
    ? ({ LAUNCHING:'LAUNCHING', DRIVING:'DRIVING', HARVESTING:'DRILLING', RECALLING:'RECALLING', DESCENDING:'DESCENDING' }[exp.status] || 'ACTIVE')
    : 'STANDBY';
  document.getElementById('ax-status').textContent = statusLabel;
  document.getElementById('ax-elapsed').textContent = fmtT(exp.elapsed);
  document.getElementById('ax-dist').textContent   = `${fmtNum(exp.distance, 1)} m`;
  document.getElementById('ax-total').textContent  = `${fmtNum(STATE.totalDistance)} m`;
  const axb = document.getElementById('ax-biome'); if (axb && typeof currentBiome === 'function') axb.textContent = currentBiome().name.replace(/^The /, '');
  document.getElementById('ax-speed').textContent  = (exp.active && exp.status === 'DRIVING')
    ? `${G.speed().toFixed(1)} m/s${exp.boostActive ? ' ▲' : ''}`
    : (exp.active && exp.status === 'HARVESTING') ? '0.0 m/s' : '—';
  // "Resources this run" — its own HUD card on the game window. Totals = current cargo + everything drones
  // have already ferried home this run (so a drone trip doesn't wipe the tally).
  const runTotals = {};
  for (const [id, q] of Object.entries(exp.cargo)) if (q > 0) runTotals[id] = (runTotals[id] || 0) + q;
  for (const [id, q] of Object.entries(exp.shipped || {})) if (q > 0) runTotals[id] = (runTotals[id] || 0) + q;
  const runEntries = Object.entries(runTotals);
  const runList = document.getElementById('runres-list'), runCard = document.getElementById('runres');
  if (runList) runList.innerHTML = runEntries.length
    ? runEntries.map(([id,q]) => { const r = RT.find(x => x.id === id), sh = (exp.shipped && exp.shipped[id]) || 0;
        return `<div class="trline"><span>${r?.name||id}</span><span>×${fmtNum(q)}${sh ? `<span class="shp" title="${fmtNum(sh)} ferried home by drones"> ⇪${fmtNum(sh)}</span>` : ''}</span></div>`; }).join('')
    : '—';
  if (runCard) runCard.classList.toggle('empty', !runEntries.length);

  if (exp.active) {
    document.getElementById('bdep').disabled = true;
    document.getElementById('bdep').textContent = exp.status === 'LAUNCHING' ? 'LAUNCHING...' : 'EXPLORING...';
    document.getElementById('brec').disabled = exp.status === 'RECALLING' || exp.status === 'LAUNCHING' || exp.status === 'DESCENDING';
    document.getElementById('brec').textContent = exp.status === 'RECALLING' ? 'RECALL ACTIVE' : 'RECALL TO SHIP';
    document.getElementById('hstat').textContent = { LAUNCHING:'LAUNCHING', DRIVING:'DRIVING', HARVESTING:'DRILLING TARGET', RECALLING:'RETRIEVAL ACTIVE', DESCENDING:'DESCENDING' }[exp.status] || 'ACTIVE';
    const pp = (exp.power / G.maxPower()) * 100;
    document.getElementById('hp').textContent = `${Math.ceil(pp)}%`;
    document.getElementById('pbf').style.transform = `scaleY(${Math.max(0, pp) / 100})`;   // vertical gauge — fill scales from the bottom
    document.getElementById('pbf').classList.toggle('crit', pp < 25);
    document.getElementById('acp').classList.toggle('hidden', !exp.enemies.some(en => !en.dead));

    // Thruster boost gauge
    const bbf = document.getElementById('bbf'), hbst = document.getElementById('hbst');
    const thrG = document.getElementById('thrgauge');
    if (exp.boostActive) {
      bbf.style.transform = `scaleY(${Math.max(0, exp.boostTimeLeft / G.boostDur())})`;
      bbf.classList.remove('charging','ready'); hbst.textContent = 'ON';
      if (thrG) thrG.classList.remove('thr-ready');
    } else if (exp.boostCdLeft > 0) {
      bbf.style.transform = `scaleY(${1 - exp.boostCdLeft / G.boostCd()})`;
      bbf.classList.add('charging'); bbf.classList.remove('ready'); hbst.textContent = 'CHG';
      if (thrG) thrG.classList.remove('thr-ready');
    } else {
      bbf.style.transform = 'scaleY(1)';
      bbf.classList.add('ready'); bbf.classList.remove('charging'); hbst.textContent = 'RDY';
      // Pulse the gauge whenever boost is available and we're driving (invites the click).
      if (thrG) thrG.classList.toggle('thr-ready', exp.status === 'DRIVING');
    }
  } else {
    // First-run gate: once the rover has docked from its first expedition, lock
    // DEPLOY until the player finishes the loop (refine → unlock hangar → apply 1
    // upgrade). After that one-time setup, deploy is always available.
    const setupLock = STATE.tutorial.expeditionDone && !STATE.tutorial.upgradedOnce;
    document.getElementById('bdep').disabled = setupLock;
    document.getElementById('bdep').textContent = setupLock ? 'FINISH SETUP' : 'DEPLOY ROVER';
    document.getElementById('brec').disabled = true;  document.getElementById('brec').textContent = 'RECALL TO SHIP';
    // Standby: rover is charged & ready — show the Power Core FULL and the Thruster EMPTY (it charges in-run),
    // so the player doesn't read it as an uncharged rover waiting on resources.
    document.getElementById('hp').textContent = '100%';
    document.getElementById('pbf').style.transform = 'scaleY(1)'; document.getElementById('pbf').classList.remove('crit'); document.getElementById('hstat').textContent = 'STANDBY';
    document.getElementById('acp').classList.add('hidden');
    const bbf = document.getElementById('bbf'), hbst = document.getElementById('hbst');
    bbf.style.transform = 'scaleY(0)'; bbf.classList.remove('ready','charging'); hbst.textContent = '—';
    const thrG = document.getElementById('thrgauge'); if (thrG) thrG.classList.remove('thr-ready');
  }

  // Automation
  if (STATE.automation.autoMetal) { document.getElementById('bam').disabled=true; document.getElementById('bam').textContent='ACTIVE'; document.getElementById('lam').innerHTML="<span class='gt'>ONLINE</span>"; }
  else { document.getElementById('bam').disabled = G.biofuel()<5; document.getElementById('lam').textContent='Disabled'; }
  if (STATE.automation.autoBiomatter) { document.getElementById('bab').disabled=true; document.getElementById('bab').textContent='ACTIVE'; document.getElementById('lab').innerHTML="<span class='gt'>ONLINE</span>"; }
  else { document.getElementById('bab').disabled = G.biofuel()<5; document.getElementById('lab').textContent='Disabled'; }
  updateAutomationUI();
  updateAchievements();
  updateResearch();

  // DESCEND button — shown once the next biome's breach is RESEARCHED and we're in the field. It stays
  // disabled as a "DESCEND IN Xm" countdown until the rover has pushed CFG.descendMinDist into this biome.
  const bdesc = document.getElementById('bdesc');
  if (bdesc) {
    const inField = exp.active && (exp.status === 'DRIVING' || exp.status === 'HARVESTING');
    const researched = typeof researchedBiomeCap === 'function' && researchedBiomeCap() > (STATE.biome || 1);
    if (inField && researched) {
      const can = typeof canDescend === 'function' && canDescend();
      const left = typeof descendDistLeft === 'function' ? descendDistLeft() : 0;
      const nx = (window.BIOMES || []).find(b => b.no === (STATE.biome || 1) + 1), nm = nx ? nx.name.replace(/^The /, '') : 'NEXT';
      bdesc.style.display = '';
      bdesc.disabled = !can;
      bdesc.textContent = can ? ('DESCEND → ' + nm) : ('DESCEND IN ' + Math.ceil(left) + 'm');
    } else {
      bdesc.style.display = 'none';
    }
  }

  updateTutorial();
}

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadGame(); syncAlloyOutputs(); initInv();
  resizeCv(); initSpores();
  window.addEventListener('resize', resizeCv);
  buildAll();

  // ── OFFLINE / AWAY PROGRESS ──────────────────────────────────
  // Show the "while you were away" summary for the elapsed real time.
  function showAwayModal(s) {
    const name = id => (RT.find(r => r.id === id) || {}).name || id;
    const hrs = Math.floor(s.elapsed / 3600), mins = Math.floor((s.elapsed % 3600) / 60);
    const away = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    const capped = s.cappedElapsed < s.elapsed;
    document.getElementById('away-summary').innerHTML =
      `Away for <b style="color:var(--bright)">${away}</b>. Your rover kept working at ` +
      `<b style="color:var(--bright)">${Math.round(s.efficiency * 100)}%</b> efficiency` +
      (capped ? ` <span style="color:var(--amber)">(capped at ${CFG.offlineCapHours}h)</span>` : '') + '.';
    document.getElementById('away-list').innerHTML = (Object.keys(s.gains)
      .sort((a, b) => s.gains[b] - s.gains[a])
      .map(id => `<div class="trline"><span>${name(id)}</span><span style="color:var(--bright)">+${fmtNum(s.gains[id])}</span></div>`)
      .join('') || '<div style="color:var(--dim)">No resources gathered.</div>') +
      (s.refined && Object.keys(s.refined).length
        ? `<div style="margin-top:6px;color:var(--dim);font-size:11px;letter-spacing:.08em">REFINERY OUTPUT</div>` +
          Object.keys(s.refined).sort((a, b) => s.refined[b] - s.refined[a])
            .map(id => `<div class="trline"><span>${name(id)}</span><span style="color:var(--amber)">+${fmtNum(s.refined[id])}</span></div>`).join('')
        : '');
    document.getElementById('awayModal').classList.remove('hidden');
  }
  const awaySummary = applyOfflineProgress();   // credit time since last save/visit
  if (awaySummary) { buildCargo(); buildHangarBank(); showAwayModal(awaySummary); }
  document.getElementById('away-close').addEventListener('click', () => document.getElementById('awayModal').classList.add('hidden'));
  document.getElementById('away-collect').addEventListener('click', () => { document.getElementById('awayModal').classList.add('hidden'); SFX.uiClick(); });
  document.getElementById('awayModal').addEventListener('click', e => { if (e.target.id === 'awayModal') document.getElementById('awayModal').classList.add('hidden'); });
  // PRESTIGE walkthrough modal — explain, then route to the PRESTIGE panel (never auto-reset)
  const priClose = () => document.getElementById('prestigeIntro')?.classList.add('hidden');
  document.getElementById('pri-close')?.addEventListener('click', () => { priClose(); SFX.uiClick(); });
  document.getElementById('pri-later')?.addEventListener('click', () => { priClose(); SFX.uiClick(); });
  document.getElementById('pri-jettison')?.addEventListener('click', () => { priClose(); SFX.uiClick(); if (typeof gotoUtility === 'function') gotoUtility('ppr'); });
  document.getElementById('prestigeIntro')?.addEventListener('click', e => { if (e.target.id === 'prestigeIntro') priClose(); });

  // Daily supply drop — once per calendar day (after the away modal so they don't overlap).
  const daily = claimDaily();
  if (daily && !awaySummary) { buildCargo(); buildHangarBank(); showDailyModal(daily); }
  const closeDaily = () => { document.getElementById('dailyModal').classList.add('hidden'); SFX.uiClick(); };
  document.getElementById('daily-close').addEventListener('click', closeDaily);
  document.getElementById('daily-collect').addEventListener('click', closeDaily);
  document.getElementById('dailyModal').addEventListener('click', e => { if (e.target.id === 'dailyModal') document.getElementById('dailyModal').classList.add('hidden'); });

  // Tab backgrounded → stamp lastSeen + save so the away-clock is accurate.
  // Tab refocused → credit the elapsed time and show the summary.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { STATE.lastSeen = Date.now(); saveGame(); if (SFX.pauseMusic) SFX.pauseMusic(); }
    else {
      if (SFX.resumeMusic) SFX.resumeMusic();
      const s = applyOfflineProgress();
      if (s) { buildCargo(); buildHangarBank(); showAwayModal(s); }
    }
  });
  // Stop music when the page is closed/navigated away so audio can't outlive it.
  window.addEventListener('pagehide', () => { if (SFX.stopMusic) SFX.stopMusic(); });
  window.addEventListener('beforeunload', () => { if (SFX.stopMusic) SFX.stopMusic(); });

  // View switching — also swaps the footer-left between live feed and quick shortcuts
  function showView(wasteland, deck) {
    document.getElementById('bvw').classList.toggle('active', wasteland);
    document.getElementById('bvb').classList.toggle('active', !wasteland);
    document.getElementById('sw').classList.toggle('active', wasteland);
    const sb = document.getElementById('sb');
    sb.classList.toggle('active', !wasteland);
    sb.classList.remove('dock-mode');   // any normal nav exits the docked-room drawer (dockPanel re-adds it after)
    if (window.ISO) ISO.setBayFocus(0.5);
    // Entering Ship Utilities lands on the cross-section deck map; deck=false drops into a panel.
    if (!wasteland) sb.classList.toggle('deck-mode', deck !== false);
    // Footer slots: wasteland = [terminal | ship-pill | deploy]; ship utilities = [live camera | deploy].
    document.querySelector('.bbar').classList.toggle('ship', !wasteland);
    if (wasteland) resizeCv();
  }
  // Open a specific facility panel (from a deck-map room or the wasteland quick buttons)
  function gotoPanel(panel) {
    const hb = document.querySelector(`.hub-btn[data-panel="${panel}"]`);
    if (!hb) return;
    if (panel === 'pdv' && !devUnlocked) {   // Dev Tools stays password-gated
      const pw = prompt('Enter Dev Tools access password:');
      if (pw !== 'Lugal') { SFX.denied(); addLog('DEV: Access denied.', 'dl'); return; }
      devUnlocked = true; localStorage.setItem('rh_dev', '1'); addLog('DEV: Access granted.', 'xl');
    }
    document.getElementById('sb').classList.remove('deck-mode');
    document.querySelectorAll('.hub-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.bpanel').forEach(p => p.classList.remove('active'));
    hb.classList.add('active');
    document.getElementById(panel).classList.add('active');
  }
  function gotoUtility(panel) { SFX.uiClick(); showView(false, false); gotoPanel(panel); }
  // Deck map → facility (called from src/shipmap.js on room click). The DEPLOYMENT BAY routes to the
  // live wasteland/deploy view instead of a base panel.
  window.enterDeckRoom = panel => { SFX.uiClick();
    if (panel === 'FIELD') { if (window.ISO) ISO.exitRoom(); showView(true); }
    else if (window.ROOM_OF_PANEL && window.ROOM_OF_PANEL[panel]) window.enterShipRoom(window.ROOM_OF_PANEL[panel]);   // compartment lives in an iso room
    else gotoPanel(panel); };
  // ── Action hooks for the interactive Rover Bay (src/rooms.js clicks fixtures → these) ──
  window.gotoUtility = gotoUtility;                                   // rover → 'ph' (hangar), cargo → 'pca'
  window.openDeckMap = () => { SFX.uiToggle(); if (window.ISO) ISO.exitRoom(); showView(false, true); if (window.ShipMap) ShipMap.setSel(null); };   // EXIT → ship deck map (hub); leave the iso room
  // Enter a navigable iso ship room (foundry/…): show the canvas view with that room active.
  window.ROOM_OF_PANEL = { prf: 'foundry', paf: 'foundry', pob: 'bridge', par: 'bridge', ptr: 'lab' };   // which deck-map compartments live in which iso room
  window.enterShipRoom = name => { SFX.uiClick(); if (window.ISO) ISO.enterRoom(name); showView(true); resizeCv(); };
  window.deployRoverFromRoom = () => { const b = document.getElementById('bdep'); if (b && !b.disabled) b.click(); };   // blast door → reuse deploy + its guards
  // ── DOCKED FACILITY VIEW: keep the room rendering, slide the panel into a right drawer (~58%) ──
  const DOCK_PANELS = new Set(['ph', 'prf', 'paf', 'pca', 'pob', 'par', 'ptr']);   // these open in the docked drawer so the room stays alive behind them
  function dockPanel(panel) {
    SFX.uiClick();
    const sb = document.getElementById('sb');
    document.getElementById('sw').classList.add('active');     // keep the canvas (room) live underneath
    sb.classList.add('active'); sb.classList.remove('deck-mode'); sb.classList.add('dock-mode');
    document.getElementById('bvw').classList.add('active'); document.getElementById('bvb').classList.remove('active');
    document.querySelector('.bbar').classList.remove('ship');
    gotoPanel(panel);                                          // activates the bpanel (inside the drawer)
    if (window.ISO) ISO.setBayFocus(0.22);                     // slide the bay so the rover sits left of the drawer
    resizeCv();
  }
  function exitDock() {
    SFX.uiToggle();
    document.getElementById('sb').classList.remove('dock-mode');
    if (window.ISO) ISO.setBayFocus(0.5);
    showView(true); resizeCv();
  }
  window.openFacility = panel => { if (DOCK_PANELS.has(panel)) dockPanel(panel); else gotoUtility(panel); };
  window.exitDock = exitDock;
  document.getElementById('dock-exit').addEventListener('click', exitDock);
  // ── IN-ROOM TERMINAL: reparent the footer #cpan into the overlay on toggle (keeps the live log intact) ──
  const termOverlay = document.getElementById('term-overlay'), cpan = document.getElementById('cpan');
  const cpanHome = cpan.parentNode, cpanAnchor = cpan.nextSibling;   // remember the footer slot to restore into
  let termOpen = false;
  function setTerminal(open) {
    termOpen = open; SFX.uiToggle();
    if (open) { termOverlay.querySelector('.term-body').appendChild(cpan); termOverlay.classList.add('open'); }
    else { cpanHome.insertBefore(cpan, cpanAnchor); termOverlay.classList.remove('open'); }
  }
  window.toggleTerminal = () => setTerminal(!termOpen);
  document.getElementById('term-close').addEventListener('click', () => setTerminal(false));
  // Footer removed → relocate Deploy/Recall/Descend (.ectr) into the floating game-screen control bar.
  { const ectr = document.querySelector('.ectr'), bar = document.getElementById('gamebar'); if (ectr && bar) bar.appendChild(ectr); }
  resizeCv();   // canvas is now uncapped/taller — refit to the enlarged game area

  document.getElementById('bvw').addEventListener('click', () => { SFX.uiToggle(); if (window.ISO) ISO.exitRoom(); showView(true); });   // WASTELAND → live field, leave any ship room
  document.getElementById('bvb').addEventListener('click', () => { SFX.uiToggle(); if (window.ISO) ISO.exitRoom(); showView(false, true); });   // SHIP UTILITIES → deck-map hub, leave any room
  // "◀ SHIP" hub button → back to the cross-section deck map
  document.querySelectorAll('.hub-btn.deck-back').forEach(b => b.addEventListener('click', () => {
    SFX.uiToggle(); document.getElementById('sb').classList.add('deck-mode'); if (window.ShipMap) ShipMap.setSel(null);
  }));
  document.querySelectorAll('.qbtn').forEach(b => b.addEventListener('click', () => gotoUtility(b.dataset.panel)));
  // Ship-UI pill in the footer (present in BOTH views) — click a compartment to jump straight to it.
  if (window.ShipMap && ShipMap.mount) ShipMap.mount('deckpill-canvas', {
    onPick: room => { SFX.uiClick(); if (room.panel === 'FIELD') showView(true); else gotoUtility(room.panel); }
  });
  showView(true);   // start on the wasteland (terminal + ship pill; live feed swaps in for the terminal on Ship Utilities)

  // ── TITLE SCREEN — dismiss into the game on START ──
  document.getElementById('title-start').addEventListener('click', () => {
    const t = document.getElementById('title');
    if (t.classList.contains('fading')) return;   // guard double-clicks
    if (SFX.ensure) SFX.ensure();   // unlock Web Audio on the user gesture
    if (localStorage.getItem('rh_music') !== '0' && SFX.startMusic) SFX.startMusic();
    SFX.uiClick();
    // Render the real scene behind the overlay, then fade/zoom the title out over it.
    titleMode = false;
    resizeCv();
    showView(true);
    t.classList.add('fading');
    setTimeout(() => { t.classList.add('hidden'); t.classList.remove('fading'); }, 820);
  });

  // ── RESIZABLE FOOTER PANELS ──
  const appEl = document.querySelector('.app'), bbarEl = document.querySelector('.bbar');
  const savedFH = parseInt(localStorage.getItem('rh_footerH')), savedTW = parseInt(localStorage.getItem('rh_termW'));
  if (savedFH) appEl.style.setProperty('--footerH', savedFH + 'px');
  if (savedTW) bbarEl.style.setProperty('--termW', savedTW + 'px');
  resizeCv();
  let drag = null, curFH = savedFH || 200, curTW = savedTW || 320;
  const hH = document.getElementById('fdragH'), vH = document.getElementById('fdragV');
  if (hH) hH.addEventListener('pointerdown', e => { drag = 'h'; hH.classList.add('drag'); hH.setPointerCapture(e.pointerId); e.preventDefault(); });
  if (vH) vH.addEventListener('pointerdown', e => { drag = 'v'; vH.classList.add('drag'); vH.setPointerCapture(e.pointerId); e.preventDefault(); });   // terminal-width handle removed with the relocated telemetry
  window.addEventListener('pointermove', e => {
    if (!drag) return;
    if (drag === 'h') {
      curFH = Math.max(150, Math.min(window.innerHeight * 0.6, window.innerHeight - e.clientY));
      appEl.style.setProperty('--footerH', curFH + 'px');
      resizeCv();
    } else {
      const rect = bbarEl.getBoundingClientRect();
      const leftW = document.querySelector('.footer-left').getBoundingClientRect().width;
      curTW = Math.max(180, Math.min(rect.width - leftW - 300, e.clientX - rect.left - leftW));
      bbarEl.style.setProperty('--termW', curTW + 'px');
    }
  });
  window.addEventListener('pointerup', () => {
    if (!drag) return;
    if (drag === 'h') { localStorage.setItem('rh_footerH', Math.round(curFH)); hH.classList.remove('drag'); }
    else { localStorage.setItem('rh_termW', Math.round(curTW)); vH.classList.remove('drag'); }
    drag = null;
  });

  // Sound mute toggle
  document.getElementById('bsnd').addEventListener('click', () => {
    const m = SFX.toggleMute();
    const b = document.getElementById('bsnd');
    b.classList.toggle('active', !m);
    b.textContent = m ? '🔇 MUTED' : '🔊 SOUND';
    if (!m) SFX.uiClick();
  });

  // Ambient music toggle (persisted rh_music; default on). Actual start happens
  // on the first user gesture in the START handler (audio needs a gesture).
  function applyMusicBtn(on) {
    const b = document.getElementById('bmus');
    b.classList.toggle('active', on);
    b.textContent = on ? '🎵 ON' : '🎵 OFF';
  }
  applyMusicBtn(localStorage.getItem('rh_music') !== '0');   // ON by default
  // Music volume slider — maps 0–100% onto a 0–2.5× gain multiplier on the bed.
  function applyMusicVol(pct) {
    const mult = (pct / 100) * 2.5;
    if (SFX.setMusicVolume) SFX.setMusicVolume(mult);
    const v = document.getElementById('mus-vol-val'); if (v) v.textContent = pct + '%';
    const s = document.getElementById('mus-vol'); if (s && +s.value !== pct) s.value = pct;
  }
  applyMusicVol(+(localStorage.getItem('rh_music_vol') ?? 28));
  document.getElementById('mus-vol').addEventListener('input', e => {
    const pct = +e.target.value; applyMusicVol(pct); localStorage.setItem('rh_music_vol', pct);
  });
  document.getElementById('bmus').addEventListener('click', () => {
    const on = !SFX.isMusicOn();
    localStorage.setItem('rh_music', on ? '1' : '0');
    if (on) SFX.startMusic(); else SFX.stopMusic();
    applyMusicBtn(on); SFX.uiClick();
  });
  // Fallback: start ambient music on the FIRST user gesture anywhere (covers the
  // case where the player enabled it past the title, or never clicked START).
  // Audio can't autoplay without a gesture, so this one-time listener handles it.
  function musicKickstart() {
    if (localStorage.getItem('rh_music') !== '0' && SFX.startMusic && !SFX.isMusicOn()) {
      SFX.ensure(); SFX.startMusic();
    }
    window.removeEventListener('pointerdown', musicKickstart);
    window.removeEventListener('keydown', musicKickstart);
  }
  window.addEventListener('pointerdown', musicKickstart);
  window.addEventListener('keydown', musicKickstart);

  // ── OPTIONS: CRT effect (on/off + strength) and Sound, behind a modal ──
  const crtfx = document.getElementById('crtfx');
  function applyCRT(on) {
    crtfx.classList.toggle('off', !on);
    document.documentElement.classList.toggle('crt-off', !on);   // also gates the footer live-feed CRT
    const b = document.getElementById('bcrt');
    b.classList.toggle('active', on);
    b.textContent = on ? '📺 ON' : '📴 OFF';
  }
  function applyCRTStrength(pct) {
    document.documentElement.style.setProperty('--crtS', (pct / 100).toFixed(2));   // on :root so both #crtfx and the feed pill read it; scanline creasing lives in the layers
    const v = document.getElementById('crt-strength-val'); if (v) v.textContent = pct + '%';
    const s = document.getElementById('crt-strength'); if (s && +s.value !== pct) s.value = pct;
  }
  applyCRT(localStorage.getItem('rh_crt') !== '0');
  applyCRTStrength(+(localStorage.getItem('rh_crt_str') ?? 90));
  document.getElementById('bcrt').addEventListener('click', () => {
    const on = crtfx.classList.contains('off');           // currently off → turn on
    localStorage.setItem('rh_crt', on ? '1' : '0');
    applyCRT(on); SFX.uiClick();
  });
  document.getElementById('crt-strength').addEventListener('input', e => {
    const pct = +e.target.value;
    applyCRTStrength(pct); localStorage.setItem('rh_crt_str', pct);
  });
  // ── OPTIONS: Isometric View (new render layer for the biome-1 field) ──
  function applyIso(on) {
    if (window.ISO) ISO.on = on;
    const b = document.getElementById('biso');
    if (b) { b.classList.toggle('active', on); b.textContent = on ? '🟦 ON' : '🟦 OFF'; }
  }
  applyIso(window.RH_RELEASE ? true : (localStorage.getItem('rh_iso') !== '0'));   // DEFAULT ON; release = iso IS the game, fixed
  const biso = document.getElementById('biso');
  if (window.RH_RELEASE) {
    // PUBLIC BUILD: strip dev-only UI. Iso is the game (no 2D toggle); no Dev Tools tab.
    biso?.closest('.opt-row')?.remove();
    document.querySelector('.hub-btn[data-panel="pdv"]')?.remove();
    document.getElementById('pdv')?.remove();
  } else if (biso) biso.addEventListener('click', () => {
    const on = !(window.ISO && ISO.on);
    localStorage.setItem('rh_iso', on ? '1' : '0');
    applyIso(on); SFX.uiClick();
  });
  // Options modal open/close
  const optModal = document.getElementById('optModal');
  document.getElementById('bopt').addEventListener('click', () => { optModal.classList.remove('hidden'); SFX.uiClick(); });
  document.getElementById('opt-close').addEventListener('click', () => { optModal.classList.add('hidden'); SFX.uiClick(); });
  optModal.addEventListener('click', e => { if (e.target === optModal) optModal.classList.add('hidden'); });

  // ── SAVE BACKUP — export/import progress as a file ───────────────────────────
  // localStorage (key 'rhv8') survives Netlify deploys, but this is a safety net for schema changes,
  // cleared browser data, or moving to another browser/device. Progress = the save + a few flags;
  // audio/CRT/dev *preferences* are intentionally left out so importing doesn't clobber local settings.
  const SAVE_KEY = 'rhv8', EXTRA_KEYS = ['rh_daily_date', 'rh_daily_streak', 'rh_forge'];
  document.getElementById('opt-export').addEventListener('click', () => {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { alert('No save data yet — play a little first, then export.'); return; }
    const extras = {}; EXTRA_KEYS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) extras[k] = v; });
    const payload = { format: 'roverhaul-save', v: 1, savedAt: new Date().toISOString(), data: JSON.parse(raw), extras };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `roverhaul-save-${ts}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
    SFX.uiClick(); addLog('SAVE EXPORTED — backup file downloaded.', 'xl');
  });
  const importFile = document.getElementById('opt-import-file');
  document.getElementById('opt-import').addEventListener('click', () => { SFX.uiClick(); importFile.value = ''; importFile.click(); });
  importFile.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);
        const data = (parsed && parsed.format === 'roverhaul-save') ? parsed.data : parsed;   // accept envelope OR a raw save
        if (!data || (data.inv === undefined && data.upgrades === undefined && data.version === undefined))
          throw new Error('not a Roverhaul save file');
        if (!confirm('IMPORT SAVE: this REPLACES your current progress with the backup file. This cannot be undone. Continue?')) return;
        _wiping = true;   // block any teardown save (pagehide on reload) from re-persisting the in-memory STATE
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        const extras = (parsed && parsed.extras) || {};
        EXTRA_KEYS.forEach(k => { if (extras[k] != null) localStorage.setItem(k, extras[k]); });
        location.reload();
      } catch (err) {
        if (SFX.denied) SFX.denied();
        alert('Import failed — that file isn’t a valid Roverhaul save.\n\n(' + err.message + ')');
      }
    };
    r.readAsText(f);
  });

  // Hub buttons
  document.querySelectorAll('.hub-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.classList.contains('deck-back')) return;   // handled separately (returns to deck map)
      // Dev Tools is password-gated until unlocked (then remembered on this browser)
      if (btn.dataset.panel === 'pdv' && !devUnlocked) {
        const pw = prompt('Enter Dev Tools access password:');
        if (pw !== 'Lugal') { SFX.denied(); addLog('DEV: Access denied.', 'dl'); return; }
        devUnlocked = true; localStorage.setItem('rh_dev', '1');
        addLog('DEV: Access granted.', 'xl');
      }
      SFX.uiClick();
      document.querySelectorAll('.hub-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.bpanel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.panel).classList.add('active');
    });
  });

  // Hangar upgrades (event delegation)
  document.getElementById('hangar-grid').addEventListener('click', e => {
    const btn = e.target.closest('.ubtn'); if (!btn) return;
    const key = btn.id.replace('ubtn-','');
    const cfg = UPGCFG[key], lvl = STATE.upgrades[key] || 0;
    const unlocking = lvl === 0;            // Lvl 0 → 1 reads as an "unlock"
    const wasLocked = cfg.locked && lvl === 0;
    if (STATE.expedition.active) { SFX.denied(); addLog("Cannot upgrade while rover is deployed.", "dl"); return; }
    if (key.startsWith('w_') && (STATE.upgrades.weapon||0) === 0) { SFX.denied(); addLog("Unlock Turret Cannon first.", "dl"); return; }
    // Buy as many levels as the current BUY QTY mode allows and the player can afford.
    const { count, totals } = affordableLevels(key, buyMode);
    if (count < 1) {
      const mats = G.upCostMats(key);
      const miss = mats.filter(m => (STATE.inv[m.id]||0) < m.qty).map(m => RT.find(r=>r.id===m.id)?.name||m.id);
      SFX.denied(); addLog(`Insufficient materials: ${miss.join(', ')}.`, "dl"); return;
    }
    Object.entries(totals).forEach(([id, q]) => { STATE.inv[id] = (STATE.inv[id]||0) - q; });
    STATE.upgrades[key] = lvl + count;
    if (wasLocked) cfg.locked = false;
    // Onboarding completes only once the CORE THREE are all online (Locomotion + Extractor + Power Core),
    // so the player learns each system — including the Power Core's run-extending role.
    if (!STATE.tutorial.upgradedOnce) {
      const coreDone = (STATE.upgrades.treads||0) >= 1 && (STATE.upgrades.laser||0) >= 1 && (STATE.upgrades.battery||0) >= 1;
      if (coreDone) { STATE.tutorial.upgradedOnce = true; addLog("TUTORIAL: Core systems online — that's the loop: gather, refine, upgrade, range further.", "xl"); }
      else if (['treads','laser','battery'].includes(key)) {
        const left = ['treads','laser','battery'].filter(k => (STATE.upgrades[k]||0) < 1).map(k => UPGCFG[k].name);
        addLog(`SETUP: ${cfg.name} online. Still to bring up: ${left.join(', ')}.`, "el");
      }
    }
    SFX.upgrade();
    const verb = unlocking ? (count > 1 ? 'UNLOCK +' + (count - 1) : 'UNLOCK') : `UPGRADE ×${count}`;
    addLog(`${verb}: ${cfg.name} → Lvl ${STATE.upgrades[key]}.`, "xl");
    saveGame(); buildHangar();
  });

  // Automation
  document.getElementById('bam').addEventListener('click', () => { if (!STATE.automation.autoMetal && G.biofuel()>=5) { STATE.inv['biofuel']-=5; STATE.automation.autoMetal=true; SFX.upgrade(); addLog("AUTO-REFINERY active.","xl"); saveGame(); } else SFX.denied(); });
  document.getElementById('bab').addEventListener('click', () => { if (!STATE.automation.autoBiomatter && G.biofuel()>=5) { STATE.inv['biofuel']-=5; STATE.automation.autoBiomatter=true; SFX.upgrade(); addLog("AUTO-RECLAIMER active.","xl"); saveGame(); } else SFX.denied(); });
  document.getElementById('basp').addEventListener('click', () => {
    const cost = refineSpeedCost();
    if (G.autoInterval() > 0.25 + 1e-6 && G.biofuel() >= cost) {
      STATE.inv['biofuel'] -= cost; STATE.automation.refineLevel = (STATE.automation.refineLevel||0) + 1;
      SFX.upgrade(); addLog(`AUTOMATION: Refinery cycle now ${G.autoInterval().toFixed(2)}s.`, "xl"); saveGame();
    } else SFX.denied();
  });

  // Hangar BUY QTY selector (×1 / ×5 / ×10 / MAX)
  document.querySelectorAll('#buymode .bm-btn').forEach(b => b.addEventListener('click', () => {
    const m = b.dataset.mode;
    buyMode = m === 'max' ? Infinity : +m;
    localStorage.setItem('rh_buymode', m);
    document.querySelectorAll('#buymode .bm-btn').forEach(x => x.classList.toggle('active', x === b));
    SFX.uiClick();
  }));
  // Reflect the persisted mode on load
  document.querySelectorAll('#buymode .bm-btn').forEach(b => {
    const isActive = (b.dataset.mode === 'max') ? buyMode === Infinity : +b.dataset.mode === buyMode;
    b.classList.toggle('active', isActive);
  });

  // Forge QTY selector (×1 / ×5 / ×10 / ×50 / MAX)
  document.querySelectorAll('#forgemode .bm-btn').forEach(b => b.addEventListener('click', () => {
    const m = b.dataset.mode;
    forgeMode = m === 'max' ? Infinity : +m;
    localStorage.setItem('rh_forgemode', m);
    document.querySelectorAll('#forgemode .bm-btn').forEach(x => x.classList.toggle('active', x === b));
    SFX.uiClick(); updateForge();
  }));
  document.querySelectorAll('#forgemode .bm-btn').forEach(b => {
    const isActive = (b.dataset.mode === 'max') ? forgeMode === Infinity : +b.dataset.mode === forgeMode;
    b.classList.toggle('active', isActive);
  });

  // Deploy / Recall / Descend
  document.getElementById('bdep').addEventListener('click', () => {
    const before = STATE.expedition.active;
    deployRover();
    // On a successful deploy, drop ANY ship-UI overlay (deck/dock drawer) + leave any iso room so the wasteland
    // is the only interactive layer — fixes the ship UI rendering over the field and leaking clicks through.
    if (!before && STATE.expedition.active) {
      if (window.ISO && ISO.exitRoom) ISO.exitRoom();
      const sb = document.getElementById('sb');
      sb.classList.remove('active', 'dock-mode', 'deck-mode');
      document.getElementById('sw').classList.add('active');
      document.getElementById('bvw').classList.add('active');
      document.getElementById('bvb').classList.remove('active');
      const bbar = document.querySelector('.bbar'); if (bbar) bbar.classList.remove('ship');
      if (typeof resizeCv === 'function') resizeCv();
    }
  });
  document.getElementById('brec').addEventListener('click', recallRover);
  document.getElementById('bdesc').addEventListener('click', () => { if (typeof descendBiome === 'function') descendBiome(); });

  // Wasteland feed — click to jump into the live view
  document.getElementById('wfeed').addEventListener('click', () => document.getElementById('bvw').click());

  // Spacebar — boost thrusters (ignore while typing in dev inputs)
  window.addEventListener('keydown', e => {
    if (e.code !== 'Space' && e.key !== ' ') return;
    const t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    if (!e.repeat) activateBoost();
  });
  // Thruster gauge — click to boost (alternative to SPACE). activateBoost()
  // self-guards; give audible feedback when it can't fire.
  const thrEl = document.getElementById('thrgauge');
  if (thrEl) thrEl.addEventListener('click', () => {
    const exp = STATE.expedition;
    if (exp.active && exp.status === 'DRIVING' && !exp.boostActive && exp.boostCdLeft <= 0) activateBoost();
    else SFX.denied();
  });
  document.getElementById('bclr').addEventListener('click', () => { document.getElementById('clog').innerHTML = `<div class="ll sl">[${fmtT(STATE.uptime)}] LOG CLEARED.</div>`; });

  // Canvas click — shoot enemy OR boost drill
  canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX, cy = (e.clientY - rect.top) * scaleY;
    const exp = STATE.expedition;
    if (!exp.active) return;
    // Combat claims the click whenever a hostile is present (any status).
    if (tryShootEnemy(cx, cy)) return;
    if (exp.status === 'HARVESTING' && exp.obstacle) {
      const red = 0.5 * (1 + 0.1 * (STATE.upgrades.laser || 1));
      exp.obstacle.timeLeft -= red;
      if (!STATE.tutorial.seenRock) { STATE.tutorial.seenRock = true; saveGame(); }
      SFX.drillBoost();
      exp.activeDrills.push({ x: ROVERX+118, y: canvas.height-110, life:.3, size:4 });
      if (exp.obstacle.timeLeft <= 0) clearObstacle();
    }
  });

  // Archives — delegated (entries are built dynamically from window.ARCHIVES)
  const arclistEl = document.getElementById('arclist');
  if (arclistEl) arclistEl.addEventListener('click', (ev) => {
    const item = ev.target.closest('.arci'); if (!item) return;
    if (item.classList.contains('locked')) { SFX.denied(); return; }
    SFX.uiClick();
    document.querySelectorAll('.arci').forEach(i => i.classList.remove('active')); item.classList.add('active');
    document.querySelectorAll('.arcv > div').forEach(e => e.classList.add('hidden'));
    const tgt = document.getElementById(item.dataset.log); if (tgt) tgt.classList.remove('hidden');
  });

  // Dev add buttons
  document.getElementById('d-add-res').addEventListener('click', () => {
    RT.push({ id:'res_'+Date.now(), name:'New Resource', category:'Rusted Metals', tier:'raw', color:'#888888', drillTime:3, yieldMin:3, yieldMax:6, weight:10, refinesTo:null, obsShape:'heap' });
    syncAlloyOutputs(); initInv(); buildAll();
  });
  document.getElementById('d-add-alloy').addEventListener('click', () => {
    ALLOYS.push({ id:'alloy_'+Date.now(), inputA:'r_iron', inputB:'r_copper', qtyA:2, qtyB:2, yields:1 });
    syncAlloyOutputs(); initInv(); buildAll(); saveGame();
  });

  // Alloy Forge tab — hidden by default, toggled in Dev Tools (persisted)
  function applyForgeVisibility() {
    const show = localStorage.getItem('rh_forge') === '1';
    document.querySelectorAll('[data-panel="paf"]').forEach(b => b.classList.toggle('forge-tab-hidden', !show));
    document.querySelector('.base-hub').classList.toggle('forge-hidden', !show);
    const st = document.getElementById('d-forge-state'); if (st) st.textContent = show ? 'visible' : 'hidden';
  }
  document.getElementById('d-toggle-forge').addEventListener('click', () => {
    localStorage.setItem('rh_forge', localStorage.getItem('rh_forge') === '1' ? '0' : '1');
    applyForgeVisibility(); SFX.uiClick();
  });
  applyForgeVisibility();

  // Reset the onboarding loop so it can be re-tested on the same save.
  document.getElementById('d-reset-tut').addEventListener('click', () => {
    Object.assign(STATE.tutorial, {
      deployedOnce:false, usedBoost:false, seenEnemy:false, seenRock:false,
      expeditionDone:false, refineryUnlocked:false, refinedOnce:false,
      hangarUnlocked:false, upgradedOnce:false, forgeIntroDone:false,
      seenDrone:false, seenDescend:false, seenOrganite:false, seenB4:false, seenB5:false, seenPrestige:false,
    });
    applyTutorialGates(); saveGame(); SFX.uiClick();
    addLog('DEV: Tutorial reset — Refinery & Hangar relocked. Deploy to begin the loop.', 'xl');
  });

  // Backdate lastSeen by 1h and apply offline progress (for testing the system).
  document.getElementById('d-sim-offline').addEventListener('click', () => {
    STATE.lastSeen = Date.now() - 3600 * 1000;
    const s = applyOfflineProgress();
    SFX.uiClick();
    if (s) { buildCargo(); buildHangarBank(); showAwayModal(s); addLog('DEV: Simulated 1h offline.', 'xl'); }
    else addLog('DEV: No offline gain (finish the first expedition first).', 'sl');
  });

  // Wipe the entire save (progress only — options/settings kept) and start fresh from the title.
  document.getElementById('d-hard-reset').addEventListener('click', () => {
    if (!confirm('HARD RESET: erase ALL progress and start a brand-new game?\n\nThis wipes resources, upgrades, research, mastery, archives, objectives and the daily streak. Options/audio/CRT settings are kept. This cannot be undone.')) return;
    SFX.uiClick();
    _wiping = true;   // block any teardown save (visibilitychange/pagehide on reload) from re-persisting the still-full STATE
    ['rhv8', 'rh_daily_date', 'rh_daily_streak'].forEach(k => localStorage.removeItem(k));
    location.reload();
  });

  // Game loop — render every frame so the wasteland feed stays live in Ship Utilities too
  let lastT = performance.now();
  function loop(now) {
    const dt = Math.min((now - lastT) / 1000, 1.5);
    tick(dt);
    engUpdate(dt); engRender();
    if (titleMode) blitTitle();
    blitFeed();
    updateUI();
    lastT = now;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  engRender();
});

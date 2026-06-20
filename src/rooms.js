// ============================================================
//  rooms.js — ROOM-AS-NAVIGATION layer (Rover Bay vertical slice)
//  Turns the isometric Rover Bay (rendered by iso.js) into a navigable space: fixtures in the
//  room are clickable hotspots. iso.js owns the in-world hover glow + the screen polygons
//  (ISO.bayHotspots / ISO.setBayHover / ISO.bayActive); this file does hit-testing, tooltips,
//  and maps each fixture id → an existing game action (exposed on window by ui.js).
//
//  The old hub-button row still works in parallel (fallback while hotspots are tuned).
//  TUNING: hotspot boxes/glow live in iso.js (BAY_FIX). Press H to outline hotspots (ISO.debugBay).
// ============================================================
(function () {
  function init() {
    const cv = document.getElementById('gc');
    if (!cv || !window.ISO) return;

    // id → action. All targets are existing flows; we just reuse them so nothing forks.
    const ACT = {
      rover:    () => window.openFacility && window.openFacility('ph'),   // ROVER HANGAR (docks right, room stays live)
      cargo:    () => window.openFacility && window.openFacility('pca'),  // CARGO BAY (docked)
      door:     () => window.deployRoverFromRoom && window.deployRoverFromRoom(),  // deploy expedition
      interior: () => window.openDeckMap && window.openDeckMap(),        // EXIT → ship deck map (hub)
      terminal: () => window.toggleTerminal && window.toggleTerminal(),  // slide the activity-log terminal in/out
      forge:    () => window.openFacility && window.openFacility('paf'),  // FOUNDRY → alloy forge (docked)
      refinery: () => window.openFacility && window.openFacility('prf'),  // FOUNDRY → refinery (docked)
      objectives: () => window.openFacility && window.openFacility('pob'),  // BRIDGE → objectives (docked)
      archives:   () => window.openFacility && window.openFacility('par'),  // BRIDGE → archives/logs (docked)
      research:   () => window.openFacility && window.openFacility('ptr'),  // LAB → research tech tree (docked)
    };

    // Biomech tooltip — created once, positioned at the cursor on hover.
    let tip = document.getElementById('room-tip');
    if (!tip) { tip = document.createElement('div'); tip.id = 'room-tip'; document.body.appendChild(tip); }

    const sfx = (typeof SFX !== 'undefined') ? SFX : null;
    const swEl = document.getElementById('sw');
    // Only handle canvas clicks/hover when the canvas (wasteland/room) view is the ACTIVE scene AND a room/bay is up.
    const live = () => ISO.bayActive() && (!swEl || swEl.classList.contains('active'));
    let cur = null;   // currently hovered hotspot id

    // Mouse → canvas-buffer coords (canvas.width may differ from CSS width).
    function buf(e) { const r = cv.getBoundingClientRect();
      return { bx: (e.clientX - r.left) * (cv.width / r.width), by: (e.clientY - r.top) * (cv.height / r.height), cx: e.clientX, cy: e.clientY }; }
    // Hotspot AABBs can overlap (iso fixtures skew into rectangles), so among the boxes under the cursor pick
    // the one whose beacon (gcx/gcy) is NEAREST — clicking on a fixture reliably selects that fixture.
    function hit(bx, by) { const hs = ISO.bayHotspots(); let best = null, bd = Infinity;
      for (const h of hs) { if (bx >= h.x0 && bx <= h.x1 && by >= h.y0 && by <= h.y1) { const dx = bx - h.gcx, dy = by - h.gcy, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = h; } } }
      return best; }
    function clear() { if (cur) { cur = null; ISO.setBayHover(null); cv.style.cursor = ''; tip.style.display = 'none'; } }

    cv.addEventListener('mousemove', e => {
      if (!live()) { clear(); return; }
      const p = buf(e), h = hit(p.bx, p.by), id = h ? h.id : null;
      if (id !== cur) { cur = id; ISO.setBayHover(id); cv.style.cursor = id ? 'pointer' : ''; if (id && sfx && sfx.uiHover) sfx.uiHover(); }
      if (h) { tip.textContent = h.label; tip.style.display = 'block';
        const tw = tip.offsetWidth, th = tip.offsetHeight, M = 8;   // clamp inside the viewport (flip near right/bottom edges)
        let lx = p.cx + 16, ly = p.cy + 16;
        if (lx + tw + M > window.innerWidth) lx = p.cx - tw - 16;
        if (ly + th + M > window.innerHeight) ly = p.cy - th - 16;
        tip.style.left = Math.max(M, lx) + 'px'; tip.style.top = Math.max(M, ly) + 'px'; }
      else tip.style.display = 'none';
    });
    cv.addEventListener('mouseleave', clear);
    cv.addEventListener('click', e => {
      if (!live()) return;
      const p = buf(e), h = hit(p.bx, p.by); if (!h) return;
      if (sfx && sfx.uiClick) sfx.uiClick();
      const a = ACT[h.id]; if (a) a();
      clear();
    });

    // Hand-tuning aid: press H to outline the hotspot boxes (no render round-trips needed).
    window.addEventListener('keydown', e => {
      if ((e.key === 'h' || e.key === 'H') && !/^(input|textarea)$/i.test((document.activeElement || {}).tagName || '')) ISO.debugBay = !ISO.debugBay;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

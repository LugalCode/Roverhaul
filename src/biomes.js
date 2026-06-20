// ============================================================
//  biomes.js — ROVERHAUL biome definitions (FIRST PASS)
//  Data + per-biome background painters. Loaded after data.js so the
//  resource ids exist; the draw functions only run at render time (engine.js),
//  so they can freely use engine globals (ctx, aT, frand, noise1, ROVERX, PX).
//
//  ITERATION NOTE: this is a deliberately self-contained first pass for testing
//  pacing between biomes. Tweak palettes / spawn pools / draws here without
//  touching engine.js or game.js. Biome 1 keeps the original engine rendering
//  (engine.js only calls in here for biomes 2+).
//
//  A biome:
//    no          1..N — selection index (STATE.biome). Biome 1 = the original wasteland.
//    id, name    identity / display.
//    indoor      true = enclosed (no open horizon) — affects the look only.
//    resourceIds which RT ids may spawn here (pickNode filters to this pool).
//    sw[]        palette swatches (UI only).
//    draw(W,H,gY,sw)  background painter (biomes 2+). Draws sky/back + a ground
//                     that meets gY so the rover/obstacles sit correctly.
// ============================================================
(function () {
  // local helpers (don't collide with engine's)
  function _rr(g,x,y,w,h,r){ r=Math.min(r,w/2,h/2); g.beginPath(); g.moveTo(x+r,y); g.arcTo(x+w,y,x+w,y+h,r); g.arcTo(x+w,y+h,x,y+h,r); g.arcTo(x,y+h,x,y,r); g.arcTo(x,y,x+w,y,r); g.closePath(); }
  const N = (typeof noise1==='function') ? noise1 : (x=>0.5);   // smooth noise (engine), safe fallback
  const F = (typeof frand==='function')  ? frand  : (x=>0.5);   // stable hash (engine), safe fallback

  // recoloured drivable ground band (crumbling edges, scrolls with sw)
  function ground(W,H,gY,sw,cols,lip){
    const g = ctx;
    const backY  = wx => gY - 23 + (N(wx/55)-0.5)*12;
    const frontY = wx => gY + 2 + (N((wx+140)/42)-0.5)*8;
    const grd = g.createLinearGradient(0,gY-30,0,gY+6);
    grd.addColorStop(0,cols[0]); grd.addColorStop(1,cols[1]);
    g.fillStyle=grd; g.beginPath(); g.moveTo(0,backY(sw));
    for(let x=0;x<=W;x+=10) g.lineTo(x,backY(x+sw));
    for(let x=W;x>=0;x-=10) g.lineTo(x,frontY(x+sw));
    g.closePath(); g.fill();
    // cliff below the path
    const fg=g.createLinearGradient(0,gY,0,H); fg.addColorStop(0,cols[1]); fg.addColorStop(1,cols[2]||'#000');
    g.fillStyle=fg; g.beginPath(); g.moveTo(0,frontY(sw));
    for(let x=0;x<=W;x+=10) g.lineTo(x,frontY(x+sw));
    g.lineTo(W,H); g.lineTo(0,H); g.closePath(); g.fill();
    // near lip highlight
    if(lip){ g.strokeStyle=lip; g.lineWidth=1.5; g.beginPath(); g.moveTo(0,frontY(sw)); for(let x=0;x<=W;x+=10) g.lineTo(x,frontY(x+sw)); g.stroke(); }
    // scattered speckle for texture (world-anchored)
    for(let i=Math.floor(sw/40)-1,e=Math.floor((sw+W)/40)+1;i<=e;i++){ const x=i*40-sw; if(F(i*1.7)<0.5) continue; const y=gY-18+F(i*2.3)*22; g.fillStyle=cols[2]||'#000'; g.globalAlpha=0.5; g.beginPath(); g.arc(x,y,1.5+F(i*3.1)*2,0,7); g.fill(); g.globalAlpha=1; }
  }

  function membrane(g,x,y,w,h,hue){
    const p=0.5+0.5*Math.sin(aT*1.6+x*0.05);
    const grd=g.createRadialGradient(x+w/2,y+h/2,2,x+w/2,y+h/2,Math.max(w,h)*0.7);
    grd.addColorStop(0,'hsla('+hue+',55%,'+(38+p*18)+'%,0.85)');
    grd.addColorStop(0.7,'hsla('+hue+',45%,20%,0.6)');
    grd.addColorStop(1,'hsla('+hue+',40%,10%,0)');
    g.fillStyle=grd; g.beginPath(); g.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,7); g.fill();
  }
  function sparks(g,x,y,seed){
    const phase=(aT*1.3+seed)%3; if(phase>0.45) return;
    g.save(); g.strokeStyle='rgba(190,235,255,0.95)'; g.lineWidth=1.2; g.shadowColor='#bfe9ff'; g.shadowBlur=6;
    const n=4+((Math.random()*4)|0);
    for(let i=0;i<n;i++){ const a=Math.random()*6.28, len=4+Math.random()*12; g.beginPath(); g.moveTo(x,y); g.lineTo(x+Math.cos(a)*len,y+Math.sin(a)*len); g.stroke(); }
    g.fillStyle='rgba(220,245,255,0.9)'; g.beginPath(); g.arc(x,y,2,0,7); g.fill(); g.restore();
  }
  function steam(g,x,gy,seed,col){
    for(let i=0;i<5;i++){ const ph=((aT*0.4+i*0.7+seed)%3)/3, y=gy-ph*(gy*0.55), r=10+ph*42, a=(1-ph)*0.14;
      g.fillStyle=col.replace('A',a.toFixed(3)); g.beginPath(); g.arc(x+Math.sin(ph*6+i)*14,y,r,0,7); g.fill(); }
  }

  // ── BIOME 2 — THE RUBBLECHOKE (indoor transport tunnel) ──
  function drawB2(W,H,gY,sw){
    const g=ctx, vpX=W*0.5, vpY=gY*0.42;
    g.fillStyle='#0b0907'; g.fillRect(0,0,W,gY+2);
    for(let i=9;i>=0;i--){ const k=((i*0.5-(sw*0.0009)%0.5)+0.5)%0.5+i*0.5, s=Math.pow(0.76,k);
      const w=W*0.95*s,h=gY*1.7*s,x=vpX-w/2,y=vpY-h*0.42, shade=16+i*7;
      g.fillStyle='rgb('+(shade+14)+','+(shade+6)+','+(shade-2)+')'; _rr(g,x,y,w,h,18*s); g.fill(); }
    const gap=120, first=Math.floor(sw/gap)-1;
    for(let n=first;n<first+Math.ceil(W/gap)+2;n++){ const x=n*gap-sw;
      g.fillStyle='#2a261f'; _rr(g,x,4,16,gY*0.42,3); g.fill();          // ceiling girder
      membrane(g,x-4,gY*0.22,24,gY*0.42,8+(n%2)*6);                       // fleshy gasket
      g.strokeStyle='#4a4138'; g.lineWidth=7; g.beginPath(); g.moveTo(x,gY*0.74); g.lineTo(x+gap,gY*0.74); g.stroke();
      g.strokeStyle='#15120e'; g.lineWidth=2; g.beginPath(); g.moveTo(x+20,gY*0.12); g.quadraticCurveTo(x+50,gY*0.3,x+90,gY*0.13); g.stroke();
    }
    for(let n=first;n<first+Math.ceil(W/gap)+2;n+=2){ const x=n*gap-sw+gap*0.5;
      let pool=g.createRadialGradient(x,gY*0.16,2,x,gY*0.5,150); pool.addColorStop(0,'rgba(240,170,70,0.26)'); pool.addColorStop(1,'rgba(240,170,70,0)');
      g.fillStyle=pool; g.fillRect(x-150,0,300,gY); g.fillStyle='#f0c070'; g.beginPath(); g.arc(x,gY*0.15,4,0,7); g.fill(); }
    sparks(g,W*0.28,gY*0.34,0.3); sparks(g,W*0.66,gY*0.26,1.7);
    ground(W,H,gY,sw,['#23201a','#15130f','#0a0908'],'rgba(180,150,90,0.3)');
  }

  // ── BIOME 3 — THE ASHEN REACHES (hot machine-flesh) ──
  function drawB3(W,H,gY,sw){
    const g=ctx;
    let sky=g.createLinearGradient(0,0,0,gY); sky.addColorStop(0,'#1b1310'); sky.addColorStop(.6,'#2a1713'); sky.addColorStop(1,'#5a221a');
    g.fillStyle=sky; g.fillRect(0,0,W,gY);
    let em=g.createLinearGradient(0,gY,0,gY-gY*0.5); em.addColorStop(0,'rgba(255,90,30,0.4)'); em.addColorStop(1,'rgba(255,90,30,0)'); g.fillStyle=em; g.fillRect(0,gY-gY*0.5,W,gY*0.5);
    const gap=150, first=Math.floor((sw*0.4)/gap)-1;
    for(let n=first;n<first+Math.ceil(W/gap)+2;n++){ const x=n*gap-sw*0.4, h=gY*(0.5+F(n*1.3)*0.4), w=gap*0.7;
      g.fillStyle='#241712'; _rr(g,x,gY-h,w,h,4); g.fill();
      g.fillStyle='#160d0a'; for(let by=gY-h+10;by<gY-10;by+=18) g.fillRect(x+6,by,w-12,3);
      const fl=0.5+0.5*Math.sin(aT*5+n); g.strokeStyle='rgba(255,'+(120+fl*80|0)+',40,'+(0.5+fl*0.4)+')'; g.lineWidth=2+fl*2; g.shadowColor='#ff6020'; g.shadowBlur=10;
      g.beginPath(); g.moveTo(x+w+2,gY); g.lineTo(x+w+2,gY-h*0.9); g.stroke(); g.shadowBlur=0;
      if(n%2===0) membrane(g,x+w*0.2,gY-h*0.7,w*0.6,h*0.5,2);
    }
    steam(g,W*0.25,gY,0,'rgba(230,170,150,A)'); steam(g,W*0.7,gY,1.3,'rgba(230,170,150,A)');
    g.strokeStyle='#2a120c'; g.lineWidth=4; for(let n=0;n<4;n++){ const x=((n*360-sw*0.6)%(W+300)+W+300)%(W+300)-150; g.beginPath(); g.moveTo(x,0); g.quadraticCurveTo(x+60,gY*0.4,x+140,0); g.stroke(); }
    ground(W,H,gY,sw,['#241612','#150d0a','#0c0807'],'rgba(255,110,50,0.4)');
    g.strokeStyle='rgba(255,90,30,0.5)'; g.lineWidth=2; g.shadowColor='#ff5018'; g.shadowBlur=8;
    for(let i=0;i<5;i++){ const x=((i*260-sw)%(W+200)+W+200)%(W+200)-100; g.beginPath(); g.moveTo(x,gY+8); g.lineTo(x+18,H); g.stroke(); } g.shadowBlur=0;
  }

  // ── BIOME 4 — THE LIGHTLESS VAULT (pitch-black hive) ──
  function drawB4(W,H,gY,sw){
    const g=ctx, lampX=(typeof ROVERX==='number'?ROVERX:150)+30, lampY=gY-30;
    g.fillStyle='#040305'; g.fillRect(0,0,W,H);
    const gap=70, first=Math.floor(sw/gap)-1; g.lineWidth=8;
    for(let n=first;n<first+Math.ceil(W/gap)+2;n++){ const x=n*gap-sw, d=Math.abs(x-lampX)/W, lit=Math.max(0.05,0.5-d*1.2);
      g.strokeStyle='rgba(120,90,140,'+lit.toFixed(3)+')';
      g.beginPath(); g.moveTo(x,0); g.quadraticCurveTo(x+gap*0.5,gY*0.2,x,gY*0.55); g.stroke();
      g.beginPath(); g.moveTo(x,H); g.quadraticCurveTo(x+gap*0.5,gY+30,x,gY); g.stroke(); }
    g.save(); g.globalCompositeOperation='lighter';
    for(let n=0;n<14;n++){ const bx=((n*150-sw)%(W+200)+W+200)%(W+200)-100, p=0.4+0.6*Math.abs(Math.sin(aT*1.4+n)), hue=n%3===0?185:285;
      g.strokeStyle='hsla('+hue+',90%,60%,'+(0.18+p*0.4)+')'; g.lineWidth=2; g.shadowColor='hsl('+hue+',90%,60%)'; g.shadowBlur=10;
      g.beginPath(); g.moveTo(bx,gY*0.2); g.bezierCurveTo(bx+30,gY*0.45,bx-20,gY*0.7,bx+10,gY); g.stroke();
      if(n%4===0){ const cy=gY*0.5+N(n)*gY*0.2; let cg=g.createRadialGradient(bx,cy,2,bx,cy,24); cg.addColorStop(0,'hsla('+hue+',90%,65%,'+(0.5*p)+')'); cg.addColorStop(1,'hsla('+hue+',90%,40%,0)'); g.fillStyle=cg; g.beginPath(); g.arc(bx,cy,24,0,7); g.fill(); } }
    g.shadowBlur=0; g.restore();
    // headlamp cone from the rover
    g.save(); g.globalCompositeOperation='lighter';
    let cone=g.createRadialGradient(lampX+30,lampY-6,4,lampX+120,lampY-20,260); cone.addColorStop(0,'rgba(200,225,255,0.30)'); cone.addColorStop(1,'rgba(120,150,210,0)');
    g.fillStyle=cone; g.beginPath(); g.moveTo(lampX+10,lampY-8); g.lineTo(W*0.95,lampY-150); g.lineTo(W*0.95,lampY+90); g.closePath(); g.fill(); g.restore();
    ground(W,H,gY,sw,['#0c0912','#070510','#030208'],'rgba(150,120,180,0.18)');
  }

  // ── BIOME 5 — THE HOLLOW CORE (circular ARENA; you orbit a float tank) ──
  // Reworked per references: zoomed-out chamber, rover small & centred at the FRONT
  // of an elliptical track. Centrepiece = a cracked float-tank pulsing with energy,
  // biomass tendrils spilling out (dark greens/browns/reds, Scorn/Godhusk). Energy-core
  // batteries (the only resource here) spawn BEHIND the tank and travel the ellipse to
  // the rover. The rover + the active core are drawn by engine.js using the geometry
  // helpers below, so harvesting stays the normal loop.

  // Shared arena geometry. front of the ellipse sits on the ground line (rover there).
  function b5geom(W,H,gY){ const ery=H*0.115, eyc=gY-ery; return {cx:W*0.5, erx:W*0.42, ery:ery, eyc:eyc, frontY:eyc+ery, backY:eyc-ery}; }
  // map a 0..1 "approach" frac (1 = just spawned behind the tank, 0 = at the rover) to a
  // point on the ellipse — sweeps from top-centre (behind) round one side to bottom-centre.
  function b5corePos(W,H,gY,frac){ const g=b5geom(W,H,gY); frac=Math.max(0,Math.min(1,frac)); const ang=-Math.PI/2+(1-frac)*Math.PI, dep=Math.sin(ang); return {x:g.cx+g.erx*Math.cos(ang), y:g.eyc+g.ery*dep, dep, scale:0.45+0.55*((dep+1)/2)}; }
  // current core's approach fraction from the live expedition (null if none).
  function b5coreFrac(){ const e=(typeof STATE!=='undefined')&&STATE.expedition; if(!e||!e.active||!e.obstacle) return null; const gap=((typeof CFG!=='undefined')?(CFG.obstacleMinGap+CFG.obstacleMaxGap):40)||40; return Math.max(0,Math.min(1,(e.nextObstacleDist-e.distance)/gap)); }

  function drawEnergyCore(g,x,y,s){
    const pulse=0.55+0.45*Math.sin(aT*4+x*0.05), w=20*s, h=34*s;
    g.save(); g.translate(x,y);
    g.fillStyle='#161210'; _rr(g,-w/2-3,-h/2-4,w+6,h+8,4); g.fill();                 // casing
    g.fillStyle='#0c0a08'; _rr(g,-w/2-3,-h/2-9,w+6,6,2); g.fill();                    // cap
    let cg=g.createLinearGradient(0,-h/2,0,h/2); cg.addColorStop(0,'rgba(255,'+(150+pulse*80|0)+',70,'+(0.85)+')'); cg.addColorStop(1,'rgba(200,60,30,0.8)');
    g.fillStyle=cg; _rr(g,-w/2,-h/2,w,h,3); g.fill();                                 // energy cell
    g.save(); g.globalCompositeOperation='lighter'; g.shadowColor='#ffae5a'; g.shadowBlur=16*s; g.fillStyle='rgba(255,200,120,'+(0.4+pulse*0.45)+')'; _rr(g,-w/2,-h/2,w,h,3); g.fill();
    g.strokeStyle='rgba(255,240,200,'+(0.5+pulse*0.4)+')'; g.lineWidth=1.4; g.beginPath(); g.moveTo(0,-h*0.3); g.lineTo(-2,0); g.lineTo(2,h*0.1); g.lineTo(0,h*0.32); g.stroke(); g.restore();
    g.restore();
  }

  // base of the structure: control desks, greebling, periodic lights + sparks (in front of the tank base)
  function drawB5Base(g,W,H,gY,geo){
    const baseY=geo.eyc-geo.ery*0.2, halfW=W*0.30;
    let bg=g.createLinearGradient(0,baseY-30,0,geo.eyc+geo.ery); bg.addColorStop(0,'#15140f'); bg.addColorStop(1,'#0a0a08');
    g.fillStyle=bg; g.beginPath(); g.moveTo(geo.cx-halfW,geo.eyc); g.lineTo(geo.cx-halfW*0.7,baseY-22); g.lineTo(geo.cx+halfW*0.7,baseY-22); g.lineTo(geo.cx+halfW,geo.eyc); g.closePath(); g.fill();
    // control desks along the front of the base
    for(let i=-3;i<=3;i++){ const dx=geo.cx+i*halfW*0.26, dy=baseY-10+Math.abs(i)*3, dw=halfW*0.2, dh=14;
      g.fillStyle='#22201a'; _rr(g,dx-dw/2,dy,dw,dh,2); g.fill();
      // greeble — little panels
      g.fillStyle='#2c2922'; for(let k=-1;k<=1;k++){ g.fillRect(dx-dw/2+4+(k+1)*(dw/3),dy+3,dw/4,3); }
      // periodic blinking light
      const lit=0.4+0.6*Math.abs(Math.sin(aT*1.5+i*1.3)); g.save(); g.globalCompositeOperation='lighter';
      g.fillStyle='rgba('+(80+lit*120|0)+',220,120,'+(0.3+lit*0.5)+')'; g.beginPath(); g.arc(dx,dy+2,2,0,7); g.fill(); g.restore();
    }
    sparks(g,geo.cx-halfW*0.5,baseY-6,0.6); sparks(g,geo.cx+halfW*0.55,baseY-2,2.1);
  }

  // the float tank — cracked capsule pulsing with energy; metal frame; greeble rings
  function drawFloatTank(g,W,H,gY,geo){
    const cx=geo.cx, topY=geo.backY-H*0.34, botY=geo.eyc-geo.ery*0.4, tw=W*0.15, pulse=0.5+0.5*Math.sin(aT*0.8);
    // back glow
    g.save(); g.globalCompositeOperation='lighter'; let gl=g.createRadialGradient(cx,(topY+botY)/2,8,cx,(topY+botY)/2,tw*2.4); gl.addColorStop(0,'rgba(150,200,90,'+(0.12+pulse*0.12)+')'); gl.addColorStop(1,'rgba(40,70,30,0)'); g.fillStyle=gl; g.beginPath(); g.arc(cx,(topY+botY)/2,tw*2.4,0,7); g.fill(); g.restore();
    // metal cradle behind
    g.strokeStyle='#1c1a14'; g.lineWidth=10; g.beginPath(); g.moveTo(cx-tw*1.1,botY); g.quadraticCurveTo(cx-tw*1.3,(topY+botY)/2,cx-tw*0.5,topY-10); g.moveTo(cx+tw*1.1,botY); g.quadraticCurveTo(cx+tw*1.3,(topY+botY)/2,cx+tw*0.5,topY-10); g.stroke();
    // glass body
    g.fillStyle='#0e120c'; _rr(g,cx-tw/2,topY,tw,botY-topY,tw*0.45); g.fill();
    // pulsing energy fluid inside (sickly green→amber)
    g.save(); _rr(g,cx-tw/2+4,topY+4,tw-8,botY-topY-8,tw*0.4); g.clip();
    let fl=g.createLinearGradient(0,topY,0,botY); fl.addColorStop(0,'rgba(120,170,70,'+(0.35+pulse*0.3)+')'); fl.addColorStop(0.6,'rgba(180,200,90,'+(0.5+pulse*0.4)+')'); fl.addColorStop(1,'rgba(110,90,40,0.5)');
    g.fillStyle=fl; g.fillRect(cx-tw/2,topY,tw,botY-topY);
    // drifting bubbles
    for(let b=0;b<7;b++){ const by=botY-((aT*18+b*40)%(botY-topY)), bx=cx+Math.sin(aT+b)*tw*0.25; g.fillStyle='rgba(220,235,170,0.25)'; g.beginPath(); g.arc(bx,by,2+(b%3),0,7); g.fill(); }
    g.restore();
    // metal frame rings (greeble)
    g.strokeStyle='#2a271f'; g.lineWidth=6; for(let r=0;r<4;r++){ const ry=topY+ (botY-topY)*(r/3); g.beginPath(); g.moveTo(cx-tw/2-3,ry); g.lineTo(cx+tw/2+3,ry); g.stroke(); }
    g.fillStyle='#1a1813'; _rr(g,cx-tw/2-7,topY-14,tw+14,16,4); g.fill();        // top cap
    g.fillStyle='#16140f'; _rr(g,cx-tw/2-9,botY-4,tw+18,20,4); g.fill();         // base socket
    // glowing CRACKS leaking light
    g.save(); g.globalCompositeOperation='lighter'; g.strokeStyle='rgba(170,220,90,'+(0.5+pulse*0.4)+')'; g.lineWidth=2; g.shadowColor='#aee05a'; g.shadowBlur=8;
    [[-0.2,0.1],[0.25,0.4],[-0.1,0.7]].forEach(([fx,fy],i)=>{ let px=cx+fx*tw, py=topY+(botY-topY)*fy; g.beginPath(); g.moveTo(px,py); for(let s=0;s<3;s++){ px+=(F(i*7+s)-0.5)*22; py+=8+F(i*3+s)*10; g.lineTo(px,py); } g.stroke(); });
    g.shadowBlur=0; g.restore();
  }

  // biomass tendrils/roots erupting from the cracks, spreading across the environment
  function drawTendrils(g,W,H,gY,geo){
    const cx=geo.cx, srcY=geo.eyc-H*0.18, cols=['#243a1c','#3a2a14','#3a161a','#1e3018'];
    for(let n=0;n<10;n++){
      const dir=(n/9-0.5), sx=cx+dir*W*0.16, sy=srcY+F(n)*H*0.18;
      const ex=cx+dir*W*0.62, ey=geo.eyc+geo.ery*0.4 + F(n*2)*H*0.1;
      const sway=Math.sin(aT*0.6+n)*18;
      g.strokeStyle=cols[n%cols.length]; g.lineWidth=5-(n%3); g.beginPath();
      g.moveTo(sx,sy); g.bezierCurveTo(sx+dir*60+sway, sy+H*0.1, (sx+ex)/2+sway, (sy+ey)/2, ex, ey); g.stroke();
      // little offshoot roots
      g.lineWidth=1.6; g.strokeStyle=cols[(n+2)%cols.length];
      for(let k=0;k<2;k++){ const t=0.4+k*0.3, mx=sx+(ex-sx)*t+sway*0.5, my=sy+(ey-sy)*t; g.beginPath(); g.moveTo(mx,my); g.lineTo(mx+(F(n*5+k)-0.5)*40, my+10+F(n+k)*16); g.stroke(); }
    }
  }

  // Rotation phase is LOCKED TO ROVER MOVEMENT (scrollWorld), so the arena only spins
  // while you're driving and stops when you stop — "circling" the centrepiece.
  function b5phase(){ return (typeof scrollWorld==='number' ? scrollWorld : 0) * 0.004; }

  // Rotating floor: radial seams + greeble plates sweeping around the ring (a strong
  // ground-level rotation cue, clipped to the elliptical floor).
  function drawB5Floor(g,geo,phase){
    const cx=geo.cx;
    g.save(); g.beginPath(); g.ellipse(cx,geo.eyc,geo.erx,geo.ery,0,0,7); g.clip();
    g.strokeStyle='rgba(72,74,56,0.22)'; g.lineWidth=1.5;
    for(let i=0;i<16;i++){ const sa=i*(Math.PI/8)+phase; g.beginPath(); g.moveTo(cx,geo.eyc); g.lineTo(cx+geo.erx*Math.cos(sa), geo.eyc+geo.ery*Math.sin(sa)); g.stroke(); }
    for(let i=0;i<14;i++){ const sa=i*(Math.PI/7)-phase*0.8, rr=0.6+0.3*((i*5)%3)/2, x=cx+geo.erx*rr*Math.cos(sa), y=geo.eyc+geo.ery*rr*Math.sin(sa);
      g.fillStyle='rgba(38,40,28,0.55)'; _rr(g,x-9,y-3,18,6,2); g.fill();
      const lit=0.3+0.5*Math.abs(Math.sin(aT*1.2+i)); g.save(); g.globalCompositeOperation='lighter'; g.fillStyle='rgba(140,200,110,'+(0.05+lit*0.12)+')'; g.beginPath(); g.arc(x+6,y,1.6,0,7); g.fill(); g.restore(); }
    g.restore();
  }

  // Guard rail of posts around the track edge — they orbit with the rotation, so the
  // whole ring visibly turns as you drive. `half` = 'far' (behind tank) or 'near' (front).
  function drawB5Rail(g,geo,phase,half){
    const cx=geo.cx, N=30, rx=geo.erx*1.02, ry=geo.ery*1.02, pts=[];
    for(let i=0;i<N;i++){ const sa=i*(Math.PI*2/N)+phase, dep=Math.sin(sa); pts.push({dep,x:cx+rx*Math.cos(sa), y:geo.eyc+ry*dep}); }
    const postH=p=>9+15*((p.dep+1)/2);
    const want=p=> half==='near' ? p.dep>=0 : p.dep<0;
    // top rail segments (connect consecutive posts in the same half)
    g.strokeStyle='rgba(120,122,96,0.45)'; g.lineWidth=2;
    for(let i=0;i<N;i++){ const p=pts[i], q=pts[(i+1)%N]; if(!(want(p)&&want(q))) continue; g.beginPath(); g.moveTo(p.x,p.y-postH(p)); g.lineTo(q.x,q.y-postH(q)); g.stroke(); }
    // posts
    for(const p of pts){ if(!want(p)) continue; const h=postH(p); g.strokeStyle='rgba(96,98,74,0.7)'; g.lineWidth=2.5; g.beginPath(); g.moveTo(p.x,p.y); g.lineTo(p.x,p.y-h); g.stroke();
      g.fillStyle='rgba(150,152,118,0.6)'; g.beginPath(); g.arc(p.x,p.y-h,2.2,0,7); g.fill(); }
  }

  function drawB5(W,H,gY,sw){
    const g=ctx, geo=b5geom(W,H,gY), cx=geo.cx, phase=b5phase();
    // dark Scorn/Godhusk backdrop
    let bg=g.createLinearGradient(0,0,0,H); bg.addColorStop(0,'#0a0c08'); bg.addColorStop(0.5,'#0d0b08'); bg.addColorStop(1,'#070806'); g.fillStyle=bg; g.fillRect(0,0,W,H);
    // far domed wall — organic dark arches with dim purple alcoves (few straight lines)
    g.save(); g.strokeStyle='rgba(40,36,30,0.6)'; g.lineWidth=4;
    for(let i=0;i<7;i++){ const ax=W*(0.1+i*0.13), ay=H*0.42+Math.sin(i)*20; g.beginPath(); g.moveTo(ax,ay+H*0.2); g.quadraticCurveTo(ax,ay-30,ax+W*0.06,ay+H*0.2); g.stroke();
      const lit=0.3+0.5*Math.abs(Math.sin(aT*0.8+i)); g.save(); g.globalCompositeOperation='lighter'; let pg=g.createRadialGradient(ax+W*0.03,ay+10,1,ax+W*0.03,ay+10,22); pg.addColorStop(0,'rgba(150,90,210,'+(0.18+lit*0.25)+')'); pg.addColorStop(1,'rgba(80,40,140,0)'); g.fillStyle=pg; g.beginPath(); g.arc(ax+W*0.03,ay+10,22,0,7); g.fill(); g.restore(); }
    g.restore();
    // sickly energy halo
    let halo=g.createRadialGradient(cx,geo.eyc-H*0.16,10,cx,geo.eyc-H*0.10,H*0.9); halo.addColorStop(0,'rgba(150,190,90,0.16)'); halo.addColorStop(1,'rgba(10,12,8,0)'); g.fillStyle=halo; g.fillRect(0,0,W,H);
    // ── elliptical track (perspective floor ring) ──
    let floor=g.createRadialGradient(cx,geo.eyc,20,cx,geo.eyc,geo.erx); floor.addColorStop(0,'#14130e'); floor.addColorStop(1,'#0a0907'); g.fillStyle=floor; g.beginPath(); g.ellipse(cx,geo.eyc,geo.erx,geo.ery,0,0,7); g.fill();
    g.lineWidth=Math.max(10,H*0.055); g.strokeStyle='rgba(120,130,90,0.08)'; g.beginPath(); g.ellipse(cx,geo.eyc,geo.erx*0.9,geo.ery*0.9,0,0,7); g.stroke();
    drawB5Floor(g,geo,phase);                       // rotating floor seams/greeble
    g.lineWidth=2; g.strokeStyle='rgba(150,170,110,0.16)'; g.beginPath(); g.ellipse(cx,geo.eyc,geo.erx,geo.ery,0,0,7); g.stroke();
    drawB5Rail(g,geo,phase,'far');                  // far guard rail (behind the tank)
    // energy core BEHIND the tank (hides its spawn-in)
    const frac=b5coreFrac(); let cp=frac!==null?b5corePos(W,H,gY,frac):null;
    if(cp && cp.dep<0) drawEnergyCore(g,cp.x,cp.y,cp.scale);
    // base structure + float tank + tendrils
    drawB5Base(g,W,H,gY,geo);
    drawFloatTank(g,W,H,gY,geo);
    drawTendrils(g,W,H,gY,geo);
    // energy core IN FRONT + harvest beam from the (centred) rover
    if(cp && cp.dep>=0) drawEnergyCore(g,cp.x,cp.y,cp.scale);
    if(cp && STATE.expedition.status==='HARVESTING'){ g.save(); g.globalCompositeOperation='lighter'; g.strokeStyle='rgba(255,180,90,0.7)'; g.lineWidth=2; g.shadowColor='#ffb050'; g.shadowBlur=8; g.beginPath(); g.moveTo(cx,geo.frontY-22); g.lineTo(cp.x,cp.y); g.stroke(); g.restore(); }
    drawB5Rail(g,geo,phase,'near');                 // near guard rail (in front of the rover/tank)
    vig5(g,W,H);
  }
  function vig5(g,W,H){ let v=g.createRadialGradient(W/2,H*0.55,H*0.3,W/2,H*0.55,H*0.95); v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(1,'rgba(0,0,0,0.55)'); g.fillStyle=v; g.fillRect(0,0,W,H); }

  // ── PER-BIOME FOREGROUND (parallax layer IN FRONT of the rover/track) ──
  // Drawn after the rover (see engine.js) so tall pieces pass in front. World-anchored
  // off scrollWorld at a fast parallax so it reads as the closest layer.
  function fgScatter(W,sw,spacing,frac,cb){ const off=sw*frac, first=Math.floor(off/spacing)-1; for(let n=first;n<first+Math.ceil(W/spacing)+2;n++){ cb(n, n*spacing-off); } }

  // Biome 2 — close pipework + fleshy gaskets hugging the floor (organic on machine)
  function frontB2(W,H,gY,sw){ const g=ctx; fgScatter(W,sw,150,1.5,(n,x)=>{ if(F(n*1.3)<0.4) return;
    g.strokeStyle='#13100b'; g.lineWidth=11; g.beginPath(); g.moveTo(x-24,H); g.quadraticCurveTo(x+20,H-20-F(n)*14,x+74,H); g.stroke();
    g.strokeStyle='#26201a'; g.lineWidth=3; g.beginPath(); g.moveTo(x-24,H-3); g.quadraticCurveTo(x+20,H-23-F(n)*14,x+74,H-3); g.stroke();
    if(F(n*2.1)>0.7) membrane(g,x+10,H-26,30,40,8+(n%2)*6); }); }

  // Biome 3 — charred rock spires with ember tips
  function frontB3(W,H,gY,sw){ const g=ctx; fgScatter(W,sw,150,1.55,(n,x)=>{ if(F(n*1.7)<0.45) return; const h=44+F(n)*78, lean=(F(n*3)-0.5)*16;
    g.fillStyle='#0c0705'; g.beginPath(); g.moveTo(x-14,H); g.quadraticCurveTo(x-4+lean*0.5,H-h*0.6, x+lean,H-h); g.quadraticCurveTo(x+6+lean*0.5,H-h*0.6, x+14,H); g.closePath(); g.fill();
    g.save(); g.globalCompositeOperation='lighter'; const e=0.35+0.4*Math.sin(aT*3+n); g.fillStyle='rgba(255,90,30,'+e+')'; g.shadowColor='#ff5a1e'; g.shadowBlur=7; g.beginPath(); g.arc(x+lean,H-h,2.6,0,7); g.fill(); g.restore(); }); }

  // Biome 4 — fleshy fronds with bioluminescent tips
  function frontB4(W,H,gY,sw){ const g=ctx; fgScatter(W,sw,128,1.5,(n,x)=>{ if(F(n*1.9)<0.5) return; const h=52+F(n)*84, sway=Math.sin(aT*0.8+n)*13, hue=n%2?185:285, p=0.4+0.5*Math.abs(Math.sin(aT*1.5+n));
    g.strokeStyle='#0a0710'; g.lineWidth=5; g.beginPath(); g.moveTo(x,H); g.quadraticCurveTo(x+sway,H-h*0.6,x+sway*1.6,H-h); g.stroke();
    g.save(); g.globalCompositeOperation='lighter'; g.fillStyle='hsla('+hue+',90%,66%,'+(0.3+p*0.4)+')'; g.shadowColor='hsl('+hue+',90%,60%)'; g.shadowBlur=9; g.beginPath(); g.arc(x+sway*1.6,H-h,3,0,7); g.fill(); g.restore(); }); }

  // Biome 5 — draping roots at the frame edges + a low biomass ridge (static; arena)
  function frontB5(W,H,gY,sw){ const g=ctx;
    g.strokeStyle='#1a120a'; g.lineWidth=6;
    for(let s=-1;s<=1;s+=2){ const bx=s<0?W*0.07:W*0.93, sway=Math.sin(aT*0.5+s)*14; g.beginPath(); g.moveTo(bx,H); g.quadraticCurveTo(bx+sway,H-100,bx+s*34+sway,H-168); g.stroke(); }
    g.fillStyle='rgba(20,26,16,0.92)'; g.beginPath(); g.moveTo(0,H); for(let x=0;x<=W;x+=22) g.lineTo(x,H-7-Math.abs(Math.sin(x*0.02+aT*0.3))*6); g.lineTo(W,H); g.closePath(); g.fill(); }

  window.drawBiomeForeground = function(bdef,W,H,gY,sw){ if(bdef && typeof bdef.drawFront==='function'){ try{ bdef.drawFront(W,H,gY,sw); }catch(e){} } };

  window.BIOMES = [
    { no:1, id:'wasteland',   name:'The Wasteland',     indoor:false, draw:null,    // null = use engine's original render
      sw:['#777458','#39392b','#23251f'],
      resourceIds:['iron','copper','alum','steel','titanium','nickel','tungsten','biomatter','spore'] },
    { no:2, id:'rubblechoke', name:'The Rubblechoke',   indoor:true,  draw:drawB2, drawFront:frontB2,
      sw:['#f0c070','#4a4138','#1d1a15'],
      resourceIds:['iron','copper','cobalt','manganese','graphite','myco'] },
    { no:3, id:'ashen',       name:'The Ashen Reaches', indoor:false, draw:drawB3, drawFront:frontB3,
      sw:['#ff5a1e','#241712','#5a221a'],
      resourceIds:['steel','titanium','nickel','chromite','vanadium','iridium'] },
    { no:4, id:'lightless',   name:'The Lightless Vault',indoor:true, draw:drawB4, drawFront:frontB4,
      sw:['#c084fc','#2a8855','#0a0710'],
      resourceIds:['titanium','tungsten','void_ore','luminite'] },
    { no:5, id:'core',        name:'The Hollow Core',   indoor:true,  draw:drawB5, drawFront:frontB5,
      sw:['#9fc060','#3a2a14','#0d0f0a'], arena:true,   // arena = engine centres + shrinks the rover, draws the core on the ellipse
      resourceIds:['corestuff'] },                       // energy batteries are the ONLY resource here
  ];

  // geometry helpers for engine.js (rover placement + the orbiting energy core)
  window.biome5Geom = b5geom;
  window.biome5CorePos = b5corePos;
  window.biome5CoreFrac = b5coreFrac;

  // current biome record (by STATE.biome; falls back to biome 1)
  window.currentBiome = function(){
    const n = (typeof STATE!=='undefined' && STATE.biome) ? STATE.biome : 1;
    return window.BIOMES.find(b=>b.no===n) || window.BIOMES[0];
  };
  // called from engine.js for biomes 2+
  window.drawBiomeScene = function(bdef,W,H,gY,sw){
    if (bdef && typeof bdef.draw === 'function') { try { bdef.draw(W,H,gY,sw); } catch(e){ /* never break the frame */ } }
  };
})();

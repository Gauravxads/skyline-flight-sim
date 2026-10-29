// HUD (2D canvas overlay), minimap, cockpit panel gauges, lens flare.
(function () {
  var MINT = '#8CF2C4', AMB = '#FFC36B', RED = '#FF6B5B', INK = 'rgba(6,16,24,0.55)', PI = Math.PI;
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function pad(n, l) { n = Math.round(n) + ''; while (n.length < l) n = '0' + n; return n; }
  var MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace', COND = '"Barlow Condensed", "Arial Narrow", sans-serif';

  SK.HUD = function (canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.toasts = []; this.mini = document.createElement('canvas'); this.mini.width = this.mini.height = 96;
    this.miniT = -9; this.miniCenter = [0, 0]; this.show = true; this.fps = 60;
  };
  var H = SK.HUD.prototype;
  H.toast = function (text, color, dur) { for (var k = 0; k < this.toasts.length; k++) if (this.toasts[k].text === text) { this.toasts[k].t = this.toasts[k].max = dur || 3.2; return; } this.toasts.push({ text: text, color: color || MINT, t: dur || 3.2, max: dur || 3.2 }); if (this.toasts.length > 4) this.toasts.shift(); };
  H.resize = function (w, h, dpr) { this.cv.width = Math.floor(w * dpr); this.cv.height = Math.floor(h * dpr); this.cv.style.width = w + 'px'; this.cv.style.height = h + 'px'; this.dpr = dpr; this.W = w; this.H = h; };

  function box(g, x, y, w, h) { g.fillStyle = INK; g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(140,242,196,0.75)'; g.lineWidth = 2; g.strokeRect(x, y, w, h); }

  H.updateMini = function (px, pz) {
    var g = this.mini.getContext('2d'), N = 96, span = 18000, img = g.createImageData(N, N), d = img.data;
    for (var j = 0; j < N; j++) for (var i = 0; i < N; i++) {
      var h = SK.terrainH(px + (i / N - 0.5) * span, pz + (j / N - 0.5) * span), k = (j * N + i) * 4, r, gg, b;
      if (h < -25) { r = 8; gg = 30; b = 60; } else if (h < 0) { r = 14; gg = 90 + h; b = 120; } else if (h < 4) { r = 190; gg = 175; b = 120; }
      else if (h < 500) { var t = h / 500; r = 50 + 40 * t; gg = 110 - 20 * t; b = 50; } else if (h < 1400) { var t2 = (h - 500) / 900; r = 90 + 50 * t2; gg = 90 + 40 * t2; b = 80 + 40 * t2; } else { r = 235; gg = 238; b = 245; }
      d[k] = r; d[k + 1] = gg; d[k + 2] = b; d[k + 3] = 255;
    }
    g.putImageData(img, 0, 0); this.miniCenter = [px, pz]; this.miniSpan = span;
  };

  H.draw = function (S, dt) {
    var g = this.ctx, W = this.W, Ht = this.H, dpr = this.dpr, f = S.f, cam = S.cam;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, Ht);
    // lens flare
    this.flare(g, W, Ht, S);
    // toasts update even if hud hidden
    for (var q = this.toasts.length - 1; q >= 0; q--) { this.toasts[q].t -= dt; if (this.toasts[q].t <= 0) this.toasts.splice(q, 1); }
    if (!this.show || !f) return;
    var sc = clamp(Math.min(W / 1280, Ht / 720), 0.62, 1.4);
    g.save(); g.scale(sc, sc); var w = W / sc, h = Ht / sc;
    var eul = f.euler(), ias = f.V * Math.sqrt(f.rho / 1.225) * 1.9438, altFt = f.p.y * 3.2808, aglFt = Math.max(0, f.agl) * 3.2808;
    var vs = f.v.y * 196.85, hdg = (S.hdg + 360) % 360;
    g.font = '500 13px ' + MONO; g.textBaseline = 'middle';
    // ----- pitch ladder + flight path marker (projected) -----
    var proj = S.project;
    if (S.hudLadder) {
      var hd = S.hdg * PI / 180;
      for (var p = -30; p <= 30; p += 5) {
        if (p === 0) continue;
        var a = proj(Math.sin(hd) * Math.cos(p * PI / 180), Math.sin(p * PI / 180), -Math.cos(hd) * Math.cos(p * PI / 180));
        var b = proj(Math.sin(hd + 0.06) * Math.cos(p * PI / 180), Math.sin(p * PI / 180), -Math.cos(hd + 0.06) * Math.cos(p * PI / 180));
        if (!a || !b) continue;
        var ang = Math.atan2(b[1] - a[1], b[0] - a[0]), ax = a[0] / sc, ay = a[1] / sc, len = p % 10 === 0 ? 70 : 44;
        g.save(); g.translate(ax, ay); g.rotate(ang); g.strokeStyle = p < 0 ? 'rgba(255,195,107,0.8)' : 'rgba(140,242,196,0.85)'; g.lineWidth = 2; g.setLineDash(p < 0 ? [8, 6] : []);
        g.beginPath(); g.moveTo(-len, 0); g.lineTo(-18, 0); g.moveTo(18, 0); g.lineTo(len, 0); g.stroke(); g.setLineDash([]);
        g.fillStyle = MINT; g.textAlign = 'right'; g.fillText(Math.abs(p), -len - 6, 0); g.textAlign = 'left'; g.fillText(Math.abs(p), len + 6, 0); g.restore();
      }
      var hz = proj(Math.sin(hd), 0, -Math.cos(hd)), hz2 = proj(Math.sin(hd + 0.1), 0, -Math.cos(hd + 0.1)), hz3 = proj(Math.sin(hd - 0.1), 0, -Math.cos(hd - 0.1));
      if (hz && hz2 && hz3) { g.strokeStyle = 'rgba(140,242,196,0.55)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(hz3[0] / sc + (hz3[0] - hz[0]) / sc * 6, hz3[1] / sc + (hz3[1] - hz[1]) / sc * 6); g.lineTo(hz2[0] / sc + (hz2[0] - hz[0]) / sc * 6, hz2[1] / sc + (hz2[1] - hz[1]) / sc * 6); g.stroke(); }
    }
    // flight path vector
    var vv = f.v.clone(); if (vv.length() > 3) {
      vv.normalize(); var fp = proj(vv.x, vv.y, vv.z);
      if (fp) { var fx = fp[0] / sc, fy = fp[1] / sc; g.strokeStyle = MINT; g.lineWidth = 2.2; g.beginPath(); g.arc(fx, fy, 8, 0, PI * 2); g.moveTo(fx - 22, fy); g.lineTo(fx - 8, fy); g.moveTo(fx + 8, fy); g.lineTo(fx + 22, fy); g.moveTo(fx, fy - 8); g.lineTo(fx, fy - 17); g.stroke(); }
    }
    // nose reticle
    var fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(f.q), np = proj(fwd.x, fwd.y, fwd.z);
    if (np && S.camMode !== 'cockpit') { var nx = np[0] / sc, ny = np[1] / sc; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(nx - 14, ny); g.lineTo(nx - 5, ny); g.lineTo(nx, ny + 6); g.lineTo(nx + 5, ny); g.lineTo(nx + 14, ny); g.stroke(); }
    // ----- speed tape -----
    var tw = 108, th = 270, tx = Math.max(24, w / 2 - 470 * Math.min(1, w / 1100)), ty = h / 2 - th / 2 - 40;
    if (w < 900) tx = 14;
    box(g, tx, ty, tw, th); g.save(); g.beginPath(); g.rect(tx, ty, tw, th); g.clip();
    for (var k = -40; k <= 40; k += 5) { var v = Math.round(ias / 5) * 5 + k, yy = ty + th / 2 - (v - ias) * 4.2; if (v < 0) continue; var maj = v % 10 === 0; g.strokeStyle = MINT; g.lineWidth = 1.5; g.beginPath(); g.moveTo(tx + tw, yy); g.lineTo(tx + tw - (maj ? 18 : 9), yy); g.stroke(); if (maj) { g.fillStyle = MINT; g.textAlign = 'left'; g.fillText(v, tx + 10, yy); } }
    // stall / vr markers
    var vs0 = S.spec.vstall * 1.9438 * (1.0); var yy2 = ty + th / 2 - (vs0 - ias) * 4.2; g.fillStyle = RED; g.fillRect(tx + tw - 5, yy2 - 30, 5, 30);
    g.restore();
    g.fillStyle = '#06101A'; g.fillRect(tx - 2, ty + th / 2 - 22, tw - 14, 44); g.strokeStyle = MINT; g.lineWidth = 2; g.strokeRect(tx - 2, ty + th / 2 - 22, tw - 14, 44);
    g.fillStyle = MINT; g.font = '600 34px ' + COND; g.textAlign = 'right'; g.fillText(Math.round(ias), tx + tw - 26, ty + th / 2 + 1);
    g.font = '500 11px ' + MONO; g.textAlign = 'left'; g.fillText('IAS KT', tx + 8, ty - 10);
    g.fillText('GS ' + Math.round(f.groundSpeed * 1.9438), tx + 8, ty + th + 14);
    // ----- altitude tape -----
    var ax2 = Math.min(w - 24 - 120, w / 2 + 470 * Math.min(1, w / 1100) - 120 + 120); if (w < 900) ax2 = w - 14 - 120;
    box(g, ax2, ty, 120, th); g.save(); g.beginPath(); g.rect(ax2, ty, 120, th); g.clip();
    for (var k2 = -300; k2 <= 300; k2 += 20) { var av = Math.round(altFt / 20) * 20 + k2, ay2 = ty + th / 2 - (av - altFt) * 0.5; var maj2 = av % 100 === 0; g.strokeStyle = MINT; g.lineWidth = 1.5; g.beginPath(); g.moveTo(ax2, ay2); g.lineTo(ax2 + (maj2 ? 18 : 9), ay2); g.stroke(); if (maj2) { g.fillStyle = MINT; g.textAlign = 'right'; g.fillText(av.toLocaleString('en-US'), ax2 + 112, ay2); } }
    g.restore();
    g.fillStyle = '#06101A'; g.fillRect(ax2 + 16, ty + th / 2 - 22, 106, 44); g.strokeStyle = MINT; g.lineWidth = 2; g.strokeRect(ax2 + 16, ty + th / 2 - 22, 106, 44);
    g.fillStyle = MINT; g.font = '600 32px ' + COND; g.textAlign = 'right'; g.fillText(Math.round(altFt).toLocaleString('en-US'), ax2 + 112, ty + th / 2 + 1);
    g.font = '500 11px ' + MONO; g.textAlign = 'right'; g.fillText('ALT FT', ax2 + 118, ty - 10); g.fillText('AGL ' + Math.round(aglFt).toLocaleString('en-US') + ' FT', ax2 + 118, ty + th + 14);
    g.fillStyle = vs < -1500 && f.agl < 500 ? RED : MINT; g.textAlign = 'right'; g.fillText('VS ' + (vs >= 0 ? '+' : '') + Math.round(vs / 10) * 10, ax2 + 118, ty + th + 32);
    // ----- heading strip -----
    var hw = 320, hx = w / 2 - hw / 2, hy = 22; box(g, hx, hy, hw, 48); g.save(); g.beginPath(); g.rect(hx, hy, hw, 48); g.clip();
    for (var k3 = -40; k3 <= 40; k3 += 5) { var hv = Math.round(hdg / 5) * 5 + k3, hxx = hx + hw / 2 + (hv - hdg) * 3.4, hh = ((hv % 360) + 360) % 360; g.strokeStyle = MINT; g.lineWidth = 1.5; g.beginPath(); g.moveTo(hxx, hy + 48); g.lineTo(hxx, hy + 48 - (hh % 10 === 0 ? 14 : 7)); g.stroke(); if (hh % 10 === 0) { var lab = hh % 90 === 0 ? ['N', 'E', 'S', 'W'][hh / 90 % 4] : pad(hh / 10, 2); g.fillStyle = hh % 90 === 0 ? AMB : MINT; g.textAlign = 'center'; g.fillText(lab, hxx, hy + 16); } }
    if (S.target) { var br = S.target.bearing - hdg; br = ((br + 540) % 360) - 180; var bx = hx + hw / 2 + clamp(br, -45, 45) * 3.4; g.fillStyle = AMB; g.beginPath(); g.moveTo(bx, hy + 46); g.lineTo(bx - 7, hy + 34); g.lineTo(bx + 7, hy + 34); g.fill(); }
    g.restore(); g.fillStyle = MINT; g.beginPath(); g.moveTo(w / 2, hy + 52); g.lineTo(w / 2 - 6, hy + 62); g.lineTo(w / 2 + 6, hy + 62); g.fill();
    g.font = '600 20px ' + COND; g.textAlign = 'center'; g.fillText(pad(hdg, 3), w / 2, hy + 78);
    // ----- left status -----
    g.font = '500 13px ' + MONO; g.textAlign = 'left'; var sy = 22;
    function line(txt, col) { g.fillStyle = col || MINT; g.fillText(txt, 24, sy); sy += 20; }
    line('THR ' + Math.round(f.ctl.thr * 100) + '%' + (f.ab ? ' AB' : ''));
    line('FLAPS ' + ['0', '10', '20', '30'][Math.round(f.ctl.flaps)], f.ctl.flaps > 0 ? AMB : MINT);
    line(f.gearPos > 0.95 ? 'GEAR DOWN' : f.gearPos < 0.05 ? 'GEAR UP' : 'GEAR TRANSIT', f.gearPos > 0.05 ? AMB : MINT);
    line('G ' + f.nz.toFixed(1), Math.abs(f.nz) > 4 ? RED : MINT);
    line('TRIM ' + (f.ctl.trim >= 0 ? '+' : '') + (f.ctl.trim * 100).toFixed(0));
    line(f.ctl.brake > 0.1 ? 'BRAKES' : f.ctl.assist ? 'ASSIST ON' : 'ASSIST OFF', f.ctl.brake > 0.1 ? AMB : 'rgba(140,242,196,0.7)');
    // ----- right status -----
    g.textAlign = 'right'; var ry = 22, rx = w - 24;
    function rline(txt, col) { g.fillStyle = col || MINT; g.fillText(txt, rx, ry); ry += 20; }
    rline('WIND ' + pad(S.windDir, 3) + '/' + Math.round(S.windKt) + ' KT');
    rline(pad(Math.floor(S.time), 2) + ':' + pad((S.time % 1) * 60, 2) + ' LOCAL');
    rline(S.spec.name.toUpperCase() + ' / ' + S.camLabel);
    rline(Math.round(this.fps) + ' FPS', 'rgba(140,242,196,0.5)');
    // ----- warnings -----
    var warn = null, flash = Math.floor(S.time2 * 3) % 2 === 0;
    if (f.crashed) warn = null;
    else if (f.stalled > 0.05 && !f.onGround) warn = ['STALL', RED];
    else if (f.stallMargin < 0.05 && !f.onGround && f.V > 5) warn = ['STALL WARNING', AMB];
    else if (f.agl < 220 && vs < -1400 && !f.onGround) warn = ['PULL UP', RED];
    else if (f.gearPos < 0.5 && f.agl < 150 && f.agl > 5 && ias < S.spec.vstall * 1.9438 * 1.6 && f.v.y < 0) warn = ['GEAR', AMB];
    else if (S.overspeed) warn = ['OVERSPEED', AMB];
    if (warn && flash) { g.font = '700 46px ' + COND; g.textAlign = 'center'; g.fillStyle = warn[1]; g.fillText(warn[0], w / 2, h * 0.3); }
    // ----- objective -----
    if (S.objective) {
      g.save(); if (this.touch) g.translate(w / 2 - 190, 0);
      g.fillStyle = INK; g.fillRect(24, h - 150, 340, 110); g.fillStyle = AMB; g.fillRect(24, h - 150, 3, 110);
      g.textAlign = 'left'; g.font = '500 11px ' + MONO; g.fillStyle = AMB; g.fillText(S.objective.label, 40, h - 134);
      g.font = '600 25px ' + COND; g.fillStyle = '#EAF0F7'; g.fillText(S.objective.title, 40, h - 108);
      g.font = '500 12px ' + MONO; g.fillStyle = 'rgba(234,240,247,0.85)';
      (S.objective.lines || []).forEach(function (t, i) { g.fillText(t, 40, h - 84 + i * 18); }); g.restore();
    }
    // ----- minimap -----
    var mr = 72, mx = w - 24 - mr, my = h - 24 - mr - 12;
    if (w > 700 && !this.touch) {
      g.save(); g.beginPath(); g.arc(mx, my, mr, 0, PI * 2); g.clip(); g.fillStyle = '#071018'; g.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
      g.translate(mx, my); g.rotate(-S.hdg * PI / 180); var scale = (mr * 2) / this.miniSpan * (this.mini.width ? 1 : 1);
      var pw = this.mini.width, off = [(f.p.x - this.miniCenter[0]), (f.p.z - this.miniCenter[1])], k4 = (mr * 2 * 1.6) / this.miniSpan * 2;
      var ms = 0.5; var pxm = (mr * 2) / 9000; // 9km across the disc
      g.globalAlpha = 0.85; g.imageSmoothingEnabled = true;
      g.drawImage(this.mini, -off[0] * pxm - this.miniSpan * pxm / 2, -off[1] * pxm - this.miniSpan * pxm / 2, this.miniSpan * pxm, this.miniSpan * pxm); g.globalAlpha = 1;
      function mpt(x, z) { return [(x - f.p.x) * pxm, (z - f.p.z) * pxm]; }
      SK.airports.forEach(function (a) { var p = mpt(a.x, a.z); g.strokeStyle = '#EAF0F7'; g.lineWidth = 3; g.beginPath(); g.moveTo(p[0] - a.dx * 18 * pxm * 10 / 5, p[1] - a.dz * 18 * pxm * 10 / 5); g.lineTo(p[0] + a.dx * 18 * pxm * 10 / 5, p[1] + a.dz * 18 * pxm * 10 / 5); g.stroke(); });
      if (S.target) { var tp = mpt(S.target.x, S.target.z), d = Math.hypot(tp[0], tp[1]), lim = mr - 8; if (d > lim) { tp[0] *= lim / d; tp[1] *= lim / d; } g.fillStyle = AMB; g.beginPath(); g.arc(tp[0], tp[1], 6, 0, PI * 2); g.fill(); }
      g.restore(); g.strokeStyle = 'rgba(140,242,196,0.8)'; g.lineWidth = 2; g.beginPath(); g.arc(mx, my, mr, 0, PI * 2); g.stroke();
      g.fillStyle = AMB; g.beginPath(); g.moveTo(mx, my - 9); g.lineTo(mx - 7, my + 7); g.lineTo(mx + 7, my + 7); g.closePath(); g.fill();
      g.fillStyle = MINT; g.font = '500 11px ' + MONO; g.textAlign = 'center'; g.fillText('N', mx - Math.sin(S.hdg * PI / 180) * (mr - 10) * -1 * 0 + Math.sin(-S.hdg * PI / 180) * (mr - 10), my - Math.cos(-S.hdg * PI / 180) * (mr - 10));
    }
    // ----- toasts -----
    g.textAlign = 'center';
    for (var i = 0; i < this.toasts.length; i++) {
      var t = this.toasts[i], al = clamp(Math.min(t.t / 0.5, (t.max - t.t) / 0.15), 0, 1);
      g.globalAlpha = al; g.font = '600 26px ' + COND; g.fillStyle = t.color; g.fillText(t.text, w / 2, h * 0.76 - (this.toasts.length - 1 - i) * 32 - (1 - al) * 6); g.globalAlpha = 1;
    }
    g.font = '500 11px ' + MONO; g.fillStyle = 'rgba(234,240,247,0.55)'; g.textAlign = 'center'; if (!this.touch) g.fillText('C CAMERA   G GEAR   F/V FLAPS   B BRAKE   P PAUSE   H HUD   ESC MENU', w / 2, h - 12);
    g.restore();
  };

  H.flare = function (g, W, Ht, S) {
    if (!S.sunScreen || S.sunScreen.vis <= 0.01) return;
    var sx = S.sunScreen.x, sy = S.sunScreen.y, a = S.sunScreen.vis, cx = W / 2, cy = Ht / 2;
    g.save(); g.globalCompositeOperation = 'lighter';
    var gr = g.createRadialGradient(sx, sy, 0, sx, sy, Math.max(W, Ht) * 0.35); gr.addColorStop(0, 'rgba(255,235,200,' + 0.22 * a + ')'); gr.addColorStop(1, 'rgba(255,200,140,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, Ht);
    var ghosts = [[0.55, 60, 'rgba(120,200,255,0.10)'], [0.9, 30, 'rgba(255,200,120,0.12)'], [1.4, 90, 'rgba(255,160,120,0.06)'], [-0.3, 40, 'rgba(160,255,200,0.08)']];
    ghosts.forEach(function (gh) { var gx = sx + (cx - sx) * gh[0] * 1.3, gy = sy + (cy - sy) * gh[0] * 1.3; var r = gh[1]; var gg = g.createRadialGradient(gx, gy, 0, gx, gy, r); gg.addColorStop(0, gh[2].replace(/[\d.]+\)$/, (parseFloat(gh[2].match(/([\d.]+)\)$/)[1]) * a * 2) + ')')); gg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gg; g.beginPath(); g.arc(gx, gy, r, 0, PI * 2); g.fill(); });
    g.restore();
  };

  // ---------- cockpit panel ----------
  SK.drawPanel = function (cp, f, spec, S) {
    var u = cp.userData, g = u.ctx, W = 1024, Hh = 512;
    g.fillStyle = '#0d0f12'; g.fillRect(0, 0, W, Hh);
    var eul = f.euler(), ias = f.V * Math.sqrt(f.rho / 1.225) * 1.9438, alt = f.p.y * 3.2808, vs = f.v.y * 196.85;
    function dial(cx, cy, r, label) { var gr = g.createRadialGradient(cx, cy, r * 0.1, cx, cy, r); gr.addColorStop(0, '#16191d'); gr.addColorStop(1, '#0a0b0d'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, PI * 2); g.fill(); g.strokeStyle = '#6a6e75'; g.lineWidth = 7; g.stroke(); g.fillStyle = '#9aa0a8'; g.font = '600 20px ' + COND; g.textAlign = 'center'; g.fillText(label, cx, cy + r * 0.45); }
    function needle(cx, cy, ang, len, col, wd) { g.save(); g.translate(cx, cy); g.rotate(ang); g.strokeStyle = col || '#f4f4f0'; g.lineWidth = wd || 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, len * 0.18); g.lineTo(0, -len); g.stroke(); g.restore(); }
    function tick(cx, cy, r, a0, a1, n, lab, fmt, major) { for (var i = 0; i <= n; i++) { var a = a0 + (a1 - a0) * i / n; var isM = i % major === 0; g.save(); g.translate(cx, cy); g.rotate(a); g.strokeStyle = '#e8e8e2'; g.lineWidth = isM ? 4 : 2; g.beginPath(); g.moveTo(0, -r * 0.88); g.lineTo(0, -r * (isM ? 0.74 : 0.8)); g.stroke(); if (isM && lab) { g.fillStyle = '#e8e8e2'; g.font = '600 22px ' + COND; g.textAlign = 'center'; g.fillText(fmt(i), 0, -r * 0.6); } g.restore(); } }
    var R = 118, y1 = 140, y2 = 380, xs = [190, 512, 834];
    // airspeed
    var vmax = spec.type === 'jet' ? 500 : spec.id === 'atlas' ? 260 : 180;
    dial(xs[0], y1, R, 'KNOTS'); tick(xs[0], y1, R, -2.4, 2.4, vmax / 10, true, function (i) { return i * 10; }, vmax > 300 ? 5 : 2);
    needle(xs[0], y1, -2.4 + 4.8 * clamp(ias / vmax, 0, 1), R * 0.8, '#fff', 4);
    // attitude
    var cx = xs[1], cy = y1; dial(cx, cy, R, ''); g.save(); g.beginPath(); g.arc(cx, cy, R - 8, 0, PI * 2); g.clip(); g.translate(cx, cy); g.rotate(eul.roll); var po = eul.pitch * 180 / PI * 3.0;
    g.fillStyle = '#3a78c2'; g.fillRect(-R, -R * 3 + po, R * 2, R * 3); g.fillStyle = '#7a5a3a'; g.fillRect(-R, po, R * 2, R * 3); g.fillStyle = '#fff'; g.fillRect(-R, po - 1.5, R * 2, 3);
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.font = '600 16px ' + COND; g.fillStyle = '#fff'; for (var p = -30; p <= 30; p += 10) { if (!p) continue; var yy = po - p * 3; g.beginPath(); g.moveTo(-26, yy); g.lineTo(26, yy); g.stroke(); g.fillText(Math.abs(p), 40, yy + 5); }
    g.restore(); g.strokeStyle = '#ffb000'; g.lineWidth = 5; g.beginPath(); g.moveTo(cx - 60, cy); g.lineTo(cx - 20, cy); g.lineTo(cx - 12, cy + 10); g.moveTo(cx + 60, cy); g.lineTo(cx + 20, cy); g.lineTo(cx + 12, cy + 10); g.stroke(); g.fillStyle = '#ffb000'; g.beginPath(); g.arc(cx, cy, 5, 0, PI * 2); g.fill();
    // altimeter
    dial(xs[2], y1, R, 'ALT x100'); tick(xs[2], y1, R, 0, PI * 2 - 0.0001, 50, true, function (i) { return i / 5; }, 5);
    needle(xs[2], y1, (alt % 10000) / 10000 * PI * 2, R * 0.55, '#fff', 6); needle(xs[2], y1, (alt % 1000) / 1000 * PI * 2, R * 0.82, '#fff', 4);
    g.fillStyle = '#ffb000'; g.font = '600 24px ' + MONO; g.textAlign = 'center'; g.fillText(Math.round(alt), xs[2], y1 + R * 0.7);
    // heading
    cx = xs[0]; cy = y2; dial(cx, cy, R, 'HDG'); var hdg = S.hdg; g.save(); g.translate(cx, cy); g.rotate(-hdg * PI / 180);
    for (var a = 0; a < 360; a += 10) { g.save(); g.rotate(a * PI / 180); g.strokeStyle = '#e8e8e2'; g.lineWidth = a % 30 === 0 ? 4 : 2; g.beginPath(); g.moveTo(0, -R * 0.88); g.lineTo(0, -R * (a % 30 === 0 ? 0.74 : 0.8)); g.stroke(); if (a % 30 === 0) { g.fillStyle = a % 90 === 0 ? '#ffb000' : '#e8e8e2'; g.font = '600 22px ' + COND; g.textAlign = 'center'; g.fillText(a % 90 === 0 ? ['N', 'E', 'S', 'W'][a / 90] : a / 10, 0, -R * 0.58); } g.restore(); }
    g.restore(); g.fillStyle = '#ffb000'; g.beginPath(); g.moveTo(cx, cy - R * 0.9); g.lineTo(cx - 8, cy - R * 0.74); g.lineTo(cx + 8, cy - R * 0.74); g.fill(); g.strokeStyle = '#ffb000'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 30, cy + 8); g.lineTo(cx, cy - 22); g.lineTo(cx + 30, cy + 8); g.stroke();
    // vertical speed
    cx = xs[1]; dial(cx, y2, R, 'VS x1000'); tick(cx, y2, R, -2.4, 2.4, 8, true, function (i) { return Math.abs(i - 4) / 2 * (i === 4 ? 0 : 1); }, 2);
    needle(cx, y2, clamp(vs / 3000, -1, 1) * 2.4, R * 0.8, '#fff', 4);
    // engine
    cx = xs[2]; cy = y2; dial(cx, cy, R, spec.type === 'jet' ? 'THRUST' : 'RPM'); tick(cx, cy, R, -2.4, 2.4, 10, true, function (i) { return i * 10; }, 2);
    needle(cx, cy, -2.4 + 4.8 * clamp(f.thrEff, 0, 1), R * 0.8, '#ffb000', 5);
    g.fillStyle = '#9aa0a8'; g.font = '600 18px ' + MONO; g.textAlign = 'center'; g.fillText('G ' + f.nz.toFixed(1) + '  FL ' + Math.round(f.flapPos) + '  ' + (f.gearPos > 0.9 ? 'GEAR' : f.gearPos < 0.1 ? 'UP' : '...'), 512, 505);
    u.tex.needsUpdate = true;
  };
})();

// Procedural aircraft models with animated parts.
(function () {
  var V3 = THREE.Vector3, PI = Math.PI;
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

  function loft(secs, x0, x1, n) {
    n = n || 9; var ring = [], i;
    function yt(x, t) { return 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x * x * x - 0.1015 * x * x * x * x); }
    for (i = 0; i <= n; i++) { var t = i / n, xf = x0 + (x1 - x0) * (0.5 - 0.5 * Math.cos(PI * t)); ring.push([xf, 1]); }
    for (i = n; i >= 0; i--) { var t2 = i / n, xf2 = x0 + (x1 - x0) * (0.5 - 0.5 * Math.cos(PI * t2)); ring.push([xf2, -1]); }
    var R = ring.length, pos = [], idx = [];
    secs.forEach(function (s) {
      ring.forEach(function (r) {
        var xf = r[0], cam = (s.cam || 0.02) * 4 * xf * (1 - xf);
        pos.push(s.x, s.y + s.chord * (cam + r[1] * yt(xf, s.th || 0.12)), s.zle + s.chord * xf);
      });
    });
    var ns = secs.length;
    for (var s = 0; s < ns - 1; s++) for (var r = 0; r < R; r++) {
      var a = s * R + r, b = s * R + (r + 1) % R, c = (s + 1) * R + r, d = (s + 1) * R + (r + 1) % R; idx.push(a, c, b, b, c, d);
    }
    [0, ns - 1].forEach(function (e) {
      var cx = 0, cy = 0, cz = 0; for (var r2 = 0; r2 < R; r2++) { cx += pos[(e * R + r2) * 3]; cy += pos[(e * R + r2) * 3 + 1]; cz += pos[(e * R + r2) * 3 + 2]; }
      var ci = pos.length / 3; pos.push(cx / R, cy / R, cz / R);
      for (var r3 = 0; r3 < R; r3++) { var p = e * R + r3, q = e * R + (r3 + 1) % R; if (e === 0) idx.push(ci, q, p); else idx.push(ci, p, q); }
    });
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  // wing sections helper: root & tip lerp
  function wingSecs(span, rootC, tipC, zleRoot, sweep, y0, dih, th, cam, tipRound) {
    var out = [], N = 6;
    for (var i = 0; i <= N; i++) {
      var t = i / N, x = span * t, c = rootC + (tipC - rootC) * t;
      var k = tipRound && i === N ? 0.55 : 1;
      out.push({ x: x, zle: zleRoot + sweep * t * span, chord: c * (tipRound && i === N ? 0.7 : 1), y: y0 + Math.tan(dih) * x, th: th * (1 - 0.25 * t), cam: cam });
    }
    return out;
  }
  function sub(secs, t0, t1) { // sections within span fraction range, with interpolated end sections
    var xs = secs[secs.length - 1].x, res = [];
    function at(t) {
      var x = xs * t, i = 0; while (i < secs.length - 2 && secs[i + 1].x < x) i++;
      var a = secs[i], b = secs[i + 1], u = (x - a.x) / (b.x - a.x), o = {};
      ['x', 'zle', 'chord', 'y', 'th', 'cam'].forEach(function (k) { o[k] = a[k] + (b[k] - a[k]) * u; }); return o;
    }
    res.push(at(t0)); secs.forEach(function (s) { if (s.x > xs * t0 + 1e-6 && s.x < xs * t1 - 1e-6) res.push(s); }); res.push(at(t1)); return res;
  }
  function mk(geo, mat, x, y, z) { var m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.receiveShadow = true; return m; }

  function liveryTex(o) {
    var cv = document.createElement('canvas'); cv.width = 512; cv.height = 512; var g = cv.getContext('2d');
    g.fillStyle = o.base; g.fillRect(0, 0, 512, 512);
    g.fillStyle = o.belly; g.fillRect(512 * 0.38, 0, 512 * 0.24, 512);
    [0.25, 0.75].forEach(function (u) {
      g.fillStyle = o.stripe; g.fillRect(512 * (u - 0.07), 512 * o.v0, 512 * 0.14, 512 * (o.v1 - o.v0) * 0.55);
      g.fillStyle = o.stripe2; g.fillRect(512 * (u - 0.07), 512 * (o.v0 + (o.v1 - o.v0) * 0.62), 512 * 0.14, 512 * (o.v1 - o.v0) * 0.2);
      if (o.windows) { g.fillStyle = '#0d1824'; for (var w = o.windows[0]; w < o.windows[1]; w += o.windows[2]) g.fillRect(512 * (u - 0.012), 512 * w, 512 * 0.024, 512 * o.windows[3]); }
    });
    g.fillStyle = o.tail; g.fillRect(0, 512 * 0.9, 512, 512 * 0.1);
    if (o.nose) { g.fillStyle = o.nose; g.fillRect(0, 0, 512, 512 * 0.06); }
    var t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; return t;
  }
  function fuselage(pts, rx, ry, mat, upsweepFrom, upsweep) {
    var v2 = pts.map(function (p) { return new THREE.Vector2(p[1], -p[0]); });
    var g = new THREE.LatheGeometry(v2, 40).rotateX(-PI / 2);
    var pos = g.attributes.position;
    for (var i = 0; i < pos.count; i++) {
      var z = pos.getZ(i); var y = pos.getY(i) * ry, x = pos.getX(i) * rx;
      if (upsweep && z > upsweepFrom) y += (z - upsweepFrom) * upsweep;
      pos.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals(); return mk(g, mat);
  }
  function wheel(r, w, mats) {
    var g = new THREE.Group();
    var tire = mk(new THREE.CylinderGeometry(r, r, w, 20).rotateZ(PI / 2), mats.rubber); g.add(tire);
    var hub = mk(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w * 1.02, 12).rotateZ(PI / 2), mats.metal); g.add(hub);
    g.userData.spin = tire; g.userData.hub = hub; return g;
  }
  function glowSprite(tex, col, size) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    s.scale.set(size, size, 1); return s;
  }

  function makeMats(paint, accent) {
    var env = 1.0;
    return {
      paint: new THREE.MeshPhysicalMaterial({ color: paint, roughness: 0.28, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.12, side: THREE.DoubleSide, envMapIntensity: env }),
      accent: new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.3, metalness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.15, side: THREE.DoubleSide }),
      metal: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.28, metalness: 1.0 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.6, metalness: 0.3 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.95, metalness: 0 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x1b2a38, roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.6, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 0.9 }),
      white: new THREE.MeshStandardMaterial({ color: 0xeceef0, roughness: 0.5, metalness: 0.1, side: THREE.DoubleSide })
    };
  }

  // build interior cockpit for the panel (shared)
  function makeCockpit(eye, panelW, panelH, zPanel, yPanel, mats, tilt) {
    var g = new THREE.Group(); var cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
    var tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 4;
    var panel = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    panel.position.set(0, yPanel, zPanel); panel.rotation.x = -tilt; g.add(panel);
    var cowl = new THREE.Mesh(new THREE.BoxGeometry(panelW * 1.25, 0.1, 0.3), new THREE.MeshBasicMaterial({ color: 0x0b0c0e })); cowl.position.set(0, yPanel + panelH * 0.5 + 0.03, zPanel - 0.12); g.add(cowl);
    var body = new THREE.Mesh(new THREE.BoxGeometry(panelW * 1.3, panelH * 1.1, 0.12), new THREE.MeshBasicMaterial({ color: 0x0b0c0e })); body.position.set(0, yPanel - 0.02, zPanel - 0.08); body.rotation.x = -tilt; g.add(body);
    var base = new THREE.Mesh(new THREE.BoxGeometry(panelW * 1.8, 0.6, 1.0), new THREE.MeshBasicMaterial({ color: 0x0d0e10 })); base.position.set(0, yPanel - panelH * 0.6 - 0.3, zPanel + 0.3); g.add(base);
    var yoke = new THREE.Group(); var col = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 8).rotateX(PI / 2), mats.dark); yoke.add(col);
    var wheelG = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 8, 20), mats.dark); wheelG.position.z = 0.22; yoke.add(wheelG);
    yoke.position.set(0, yPanel - panelH * 0.65, zPanel + 0.45); g.add(yoke);
    g.userData = { cv: cv, tex: tex, ctx: cv.getContext('2d'), yoke: yoke, eye: eye };
    g.visible = false; return g;
  }

  SK.buildAircraft = function (id, glow) {
    var A = { group: new THREE.Group(), parts: {}, props: [], blurs: [], flames: [], wheels: [], strobes: [], id: id };
    var G = A.group, P = A.parts, m;
    if (id === 'skylark') {
      m = makeMats(0xf2f3f5, 0xc8312b);
      var lt = liveryTex({ base: '#f1f2f3', belly: '#a8abb0', stripe: '#c0272d', stripe2: '#1b3a66', v0: 0.28, v1: 0.62, tail: '#c0272d', windows: [0.33, 0.5, 0.1, 0.08] });
      m.fus = new THREE.MeshPhysicalMaterial({ map: lt, roughness: 0.3, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.12 });
      var fus = fuselage([[-2.7, 0], [-2.62, 0.3], [-2.25, 0.46], [-1.5, 0.55], [-0.5, 0.62], [0.7, 0.55], [2.0, 0.40], [3.4, 0.23], [4.9, 0.10], [5.15, 0.02], [5.2, 0]], 0.82, 0.95, m.fus, 2.0, 0.02);
      G.add(fus);
      var canopy = mk(new THREE.SphereGeometry(1, 24, 14), m.glass); canopy.scale.set(0.5, 0.42, 1.05); canopy.position.set(0, 0.42, -0.45); canopy.castShadow = false; G.add(canopy);
      var sec = wingSecs(5.5, 1.75, 1.05, -1.0, 0.04, -0.36, 0.07, 0.13, 0.025, true);
      var wingMain = loft(sub(sec, 0, 1), 0, 0.72), flapG = loft(sub(sec, 0.04, 0.52), 0.72, 1), ailG = loft(sub(sec, 0.52, 1), 0.72, 1);
      [1, -1].forEach(function (sd) {
        var w = mk(wingMain, m.paint); w.scale.x = sd; G.add(w);
        var hz = function (t) { var s0 = sub(sec, t, t)[0]; return s0; };
        var fp = hz(0.28), fg = flapG.clone(); var flap = new THREE.Group(); var fm = mk(flapG, m.paint); fm.position.set(0, 0, 0); flap.add(fm);
        flap.position.set(0, 0, 0); flap.userData.ax = 'x'; // pivot approximated: shift geometry
        // hinge pivot: translate geometry so hinge at origin
        var hingeZ = fp.zle + fp.chord * 0.72, hingeY = fp.y; fm.geometry = flapG.clone().translate(0, -hingeY, -hingeZ); flap.position.set(0, hingeY, hingeZ); flap.scale.x = sd; G.add(flap);
        var ap = hz(0.76); var ag = ailG.clone().translate(0, -ap.y, -(ap.zle + ap.chord * 0.72)); var ail = new THREE.Group(); ail.add(mk(ag, m.accent)); ail.position.set(0, ap.y, ap.zle + ap.chord * 0.72); ail.scale.x = sd; G.add(ail);
        P[sd > 0 ? 'ailR' : 'ailL'] = ail; P[sd > 0 ? 'flapR' : 'flapL'] = flap;
      });
      var tsec = wingSecs(1.85, 1.05, 0.7, 3.85, 0.12, 0.28, 0.0, 0.1, 0, true);
      [1, -1].forEach(function (sd) { var h = mk(loft(sub(tsec, 0, 1), 0, 0.68), m.paint); h.scale.x = sd; G.add(h); });
      var eleG = loft(sub(tsec, 0, 1), 0.68, 1); var elev = new THREE.Group(); var eh = mk(eleG.clone().translate(0, -0.28, -(3.85 + 1.05 * 0.68)), m.paint); elev.add(eh); elev.position.set(0, 0.28, 3.85 + 1.05 * 0.68); G.add(elev); P.elev = elev;
      var fsec = wingSecs(1.55, 1.35, 0.78, 3.55, 0.36, 0.0, 0, 0.1, 0, false);
      var fin = mk(loft(sub(fsec, 0, 1), 0, 0.68).rotateZ(PI / 2).translate(0, 0.25, 0), m.accent); G.add(fin);
      var rudG = loft(sub(fsec, 0, 1), 0.68, 1).rotateZ(PI / 2); var rudder = new THREE.Group(); rudder.add(mk(rudG.clone().translate(0, 0.25, -(3.55 + 0.4 * 1.5 * 0)), m.accent));
      // rudder hinge: approximate at z of fin trailing portion at mid span
      var rz = 3.55 + 0.36 * 0.8 + 1.05 * 0.68; rudder.children[0].geometry = rudG.clone().translate(0, 0.25, -rz); rudder.position.set(0, 0, rz); G.add(rudder); P.rudder = rudder;
      // cowl + prop
      G.add(mk(new THREE.CylinderGeometry(0.5, 0.6, 0.62, 24).rotateX(PI / 2), m.paint, 0, -0.02, -2.32)); G.add(mk(new THREE.TorusGeometry(0.34, 0.07, 8, 24), m.dark, 0, -0.1, -2.66));
      var prop = new THREE.Group(); prop.position.set(0, -0.04, -2.78);
      prop.add(mk(new THREE.ConeGeometry(0.17, 0.4, 16).rotateX(-PI / 2).translate(0, 0, -0.1), m.accent));
      [0, PI].forEach(function (a) { var bl = mk(new THREE.BoxGeometry(0.1, 1.0, 0.025), m.dark); bl.position.set(0, 0.52, 0); var pv = new THREE.Group(); pv.rotation.z = a; pv.add(bl); bl.rotation.y = 0.35; prop.add(pv); });
      var blur = new THREE.Mesh(new THREE.CircleGeometry(1.0, 32), new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); blur.position.z = 0.0; prop.add(blur);
      G.add(prop); A.props.push(prop); A.blurs.push(blur);
      // landing gear
      var gearBits = function (x, y, z, steer, flip) { var gr = new THREE.Group(); gr.position.set(x, y, z); var leg = mk(new THREE.CylinderGeometry(0.035, 0.045, 0.62, 8), m.metal, 0, -0.28, 0); gr.add(leg); var wh = wheel(steer ? 0.2 : 0.26, steer ? 0.1 : 0.14, m); wh.position.set(0, -0.62 + (steer ? 0.0 : 0.0), 0); gr.add(wh); A.wheels.push(wh); return gr; };
      P.gearN = gearBits(0, -0.52, -1.8, true); G.add(P.gearN);
      P.gearL = gearBits(-1.3, -0.6, 0.3); G.add(P.gearL); P.gearR = gearBits(1.3, -0.6, 0.3); G.add(P.gearR);
      var fair = mk(new THREE.SphereGeometry(0.2, 12, 8), m.paint); fair.scale.set(0.55, 0.9, 1.9); fair.position.set(0, -0.62, 0.0); P.gearL.add(fair); P.gearR.add(fair.clone());
      // fixed paint tweak: wheel center heights so tire bottom = contact y
      A.nav = [[-5.45, 0.28, -0.1, 0xff1020], [5.45, 0.28, -0.1, 0x20ff40], [0, 1.25, 5.0, 0xffffff]];
      A.cockpit = makeCockpit(new V3(0, 0.55, -0.55), 0.62, 0.34, -1.2, 0.2, m, 0.45);
      A.eye = new V3(0, 0.6, -0.55); A.chase = 11; A.rpmMax = 2700; A.contactY = [-1.15, -1.25];
    } else if (id === 'falcon') {
      m = makeMats(0x2e3944, 0xff7a1a);
      var lt2 = liveryTex({ base: '#cfd5dc', belly: '#6f7882', stripe: '#ff6a10', stripe2: '#1b232c', v0: 0.3, v1: 0.72, tail: '#2b323a', nose: '#20262c' });
      m.fus = new THREE.MeshPhysicalMaterial({ map: lt2, roughness: 0.32, metalness: 0.45, clearcoat: 1, clearcoatRoughness: 0.1 });
      var fus2 = fuselage([[-6.3, 0], [-6.1, 0.1], [-5.2, 0.34], [-3.8, 0.58], [-2.0, 0.78], [0, 0.85], [2.5, 0.78], [5, 0.6], [6.6, 0.5], [7.0, 0.42], [7.05, 0]], 0.9, 0.95, m.fus, 99, 0);
      G.add(fus2);
      var cano = mk(new THREE.SphereGeometry(1, 24, 14), m.glass); cano.scale.set(0.5, 0.42, 1.6); cano.position.set(0, 0.68, -2.9); cano.castShadow = false; G.add(cano);
      var sec2 = wingSecs(5.25, 3.6, 1.1, -0.8, 0.52, -0.2, 0.0, 0.07, 0.0, false);
      sec2.forEach(function (s, i) { s.zle = -0.8 + 0.5 * s.x; });
      var wm = loft(sub(sec2, 0, 1), 0, 0.72), ag2 = loft(sub(sec2, 0.5, 1), 0.72, 1), fg2 = loft(sub(sec2, 0.08, 0.5), 0.72, 1);
      [1, -1].forEach(function (sd) {
        var w = mk(wm, m.paint); w.scale.x = sd; G.add(w);
        var ap = sub(sec2, 0.74, 0.74)[0]; var ail = new THREE.Group(); ail.add(mk(ag2.clone().translate(0, -ap.y, -(ap.zle + ap.chord * 0.72)), m.accent)); ail.position.set(0, ap.y, ap.zle + ap.chord * 0.72); ail.scale.x = sd; G.add(ail);
        var fp = sub(sec2, 0.3, 0.3)[0]; var fl = new THREE.Group(); fl.add(mk(fg2.clone().translate(0, -fp.y, -(fp.zle + fp.chord * 0.72)), m.paint)); fl.position.set(0, fp.y, fp.zle + fp.chord * 0.72); fl.scale.x = sd; G.add(fl);
        P[sd > 0 ? 'ailR' : 'ailL'] = ail; P[sd > 0 ? 'flapR' : 'flapL'] = fl;
        // tail plane (stabilator)
        var ts = wingSecs(2.4, 1.7, 0.8, 4.6, 0.55, 0.05, 0, 0.06, 0, false); var st = new THREE.Group(); var sm = mk(loft(sub(ts, 0, 1), 0, 1).translate(0, -0.05, -4.9), m.paint); st.add(sm); st.position.set(0, 0.05, 4.9); st.scale.x = sd; G.add(st); P[sd > 0 ? 'stabR' : 'stabL'] = st;
        // twin fin
        var fs = wingSecs(1.9, 2.0, 0.9, 3.9, 0.9, 0, 0, 0.07, 0, false);
        var fin2 = new THREE.Group(); fin2.add(mk(loft(sub(fs, 0, 1), 0, 0.7).rotateZ(PI / 2), m.paint));
        var rg = loft(sub(fs, 0, 1), 0.7, 1).rotateZ(PI / 2); var rud = new THREE.Group(); var rz2 = 3.9 + 0.9 * 0.9 + 1.45 * 0.7; rud.add(mk(rg.clone().translate(0, 0, -rz2), m.accent)); rud.position.set(0, 0, rz2); fin2.add(rud);
        fin2.position.set(sd * 1.15, 0.45, 0); fin2.rotation.z = -sd * 0.28; G.add(fin2); P[sd > 0 ? 'rudR' : 'rudL'] = rud;
        // engine pod
        var en = mk(new THREE.CylinderGeometry(0.46, 0.4, 4.2, 18).rotateX(PI / 2), m.fus, sd * 0.95, -0.35, 4.6); G.add(en);
        G.add(mk(new THREE.CylinderGeometry(0.4, 0.34, 0.8, 16, 1, true).rotateX(PI / 2), m.dark, sd * 0.95, -0.35, 7.05));
        var nz = mk(new THREE.CylinderGeometry(0.34, 0.34, 0.3, 14).rotateX(PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a1e10, emissive: 0xff5a10, emissiveIntensity: 0.0, roughness: 0.5 }), sd * 0.95, -0.35, 7.2); G.add(nz); A.nozzles = (A.nozzles || []).concat(nz);
        var fl1 = new THREE.Mesh(new THREE.ConeGeometry(0.3, 4.5, 14, 1, true).rotateX(-PI / 2).translate(0, 0, 2.25), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.2, 0.7), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        fl1.position.set(sd * 0.95, -0.35, 7.3); G.add(fl1); A.flames.push(fl1);
        var core = new THREE.Mesh(new THREE.ConeGeometry(0.18, 2.4, 12, 1, true).rotateX(-PI / 2).translate(0, 0, 1.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5, 4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
        core.position.copy(fl1.position); G.add(core); A.flames.push(core);
        // intake
        G.add(mk(new THREE.TorusGeometry(0.42, 0.06, 8, 20), m.dark, sd * 0.95, -0.35, 2.55));
      });
      var gb = function (x, y, z, steer) { var gr = new THREE.Group(); gr.position.set(x, y, z); gr.add(mk(new THREE.CylinderGeometry(0.06, 0.08, 0.95, 8), m.metal, 0, -0.45, 0)); var wh = wheel(steer ? 0.28 : 0.38, steer ? 0.14 : 0.22, m); wh.position.y = -0.95; gr.add(wh); A.wheels.push(wh); return gr; };
      P.gearN = gb(0, -0.6, -4.4, true); G.add(P.gearN); P.gearL = gb(-1.5, -0.7, 0.8); G.add(P.gearL); P.gearR = gb(1.5, -0.7, 0.8); G.add(P.gearR);
      A.nav = [[-5.3, -0.1, 1.9, 0xff1020], [5.3, -0.1, 1.9, 0x20ff40], [0, 2.2, 6.0, 0xffffff]];
      A.cockpit = makeCockpit(new V3(0, 0.78, -3.2), 0.75, 0.38, -4.35, 0.52, m, 0.4);
      A.eye = new V3(0, 0.82, -3.0); A.chase = 20; A.rpmMax = 0;
    } else { // atlas
      m = makeMats(0xe8eaec, 0x1d4e89);
      var lt3 = liveryTex({ base: '#eceef0', belly: '#a2a7ad', stripe: '#1d4e89', stripe2: '#e0a21b', v0: 0.28, v1: 0.8, tail: '#1d4e89', windows: [0.34, 0.8, 0.045, 0.03] });
      m.fus = new THREE.MeshPhysicalMaterial({ map: lt3, roughness: 0.35, metalness: 0.1, clearcoat: 0.9, clearcoatRoughness: 0.15 });
      var fus3 = fuselage([[-9.7, 0], [-9.4, 0.5], [-8.6, 1.0], [-7.2, 1.38], [-5.2, 1.6], [0, 1.65], [5, 1.6], [7.2, 1.2], [9, 0.62], [10.1, 0.25], [10.2, 0]], 0.95, 1.0, m.fus, 5.0, 0.2);
      G.add(fus3);
      var ck = mk(new THREE.SphereGeometry(1, 20, 12), m.glass); ck.scale.set(0.95, 0.5, 1.2); ck.position.set(0, 0.85, -8.2); ck.castShadow = false; G.add(ck);
      var sec3 = wingSecs(13, 3.7, 1.7, -1.2, 0.03, 1.15, 0.04, 0.15, 0.03, true);
      var wm3 = loft(sub(sec3, 0, 1), 0, 0.72), ag3 = loft(sub(sec3, 0.58, 1), 0.72, 1), fg3 = loft(sub(sec3, 0.07, 0.58), 0.72, 1);
      [1, -1].forEach(function (sd) {
        var w = mk(wm3, m.paint); w.scale.x = sd; G.add(w);
        var ap = sub(sec3, 0.78, 0.78)[0]; var ail = new THREE.Group(); ail.add(mk(ag3.clone().translate(0, -ap.y, -(ap.zle + ap.chord * 0.72)), m.accent)); ail.position.set(0, ap.y, ap.zle + ap.chord * 0.72); ail.scale.x = sd; G.add(ail);
        var fp = sub(sec3, 0.3, 0.3)[0]; var fl = new THREE.Group(); fl.add(mk(fg3.clone().translate(0, -fp.y, -(fp.zle + fp.chord * 0.72)), m.paint)); fl.position.set(0, fp.y, fp.zle + fp.chord * 0.72); fl.scale.x = sd; G.add(fl);
        P[sd > 0 ? 'ailR' : 'ailL'] = ail; P[sd > 0 ? 'flapR' : 'flapL'] = fl;
        // nacelle + prop
        var ex = sd * 4.6, nac = mk(new THREE.CylinderGeometry(0.55, 0.62, 3.4, 16).rotateX(PI / 2), m.fus, ex, 0.55, -1.6 + 0.0); nac.scale.set(1, 1, 1); G.add(nac);
        G.add(mk(new THREE.SphereGeometry(0.55, 14, 10), m.paint, ex, 0.55, -3.3));
        var pr = new THREE.Group(); pr.position.set(ex, 0.55, -3.85);
        pr.add(mk(new THREE.ConeGeometry(0.2, 0.5, 14).rotateX(-PI / 2).translate(0, 0, -0.1), m.accent));
        for (var b = 0; b < 4; b++) { var pv = new THREE.Group(); pv.rotation.z = b * PI / 2; var bl = mk(new THREE.BoxGeometry(0.2, 1.7, 0.035), m.dark); bl.position.y = 0.95; bl.rotation.y = 0.3; pv.add(bl); pr.add(pv); }
        var bl2 = new THREE.Mesh(new THREE.CircleGeometry(1.8, 32), new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); pr.add(bl2);
        G.add(pr); A.props.push(pr); A.blurs.push(bl2);
        // horizontal tail
        var ts3 = wingSecs(4.2, 2.3, 1.2, 8.3, 0.12, 4.0, 0, 0.1, 0, true);
        var he = mk(loft(sub(ts3, 0, 1), 0, 0.7), m.paint); he.scale.x = sd; G.add(he);
        var eg = loft(sub(ts3, 0, 1), 0.7, 1); var eg2 = new THREE.Group(); var ez = 8.3 + 0.12 * 2 + 1.9 * 0.7; eg2.add(mk(eg.clone().translate(0, -4.0, -ez), m.accent)); eg2.position.set(0, 4.0, ez); eg2.scale.x = sd; G.add(eg2); P[sd > 0 ? 'eleR' : 'eleL'] = eg2;
      });
      var fs3 = wingSecs(4.2, 3.4, 1.9, 7.2, 0.62, 0, 0, 0.1, 0, true);
      G.add(mk(loft(sub(fs3, 0, 1), 0, 0.7).rotateZ(PI / 2).translate(0, 1.9, 0), m.accent));
      var rg3 = loft(sub(fs3, 0, 1), 0.7, 1).rotateZ(PI / 2); var rud3 = new THREE.Group(); var rz3 = 7.2 + 0.62 * 2.1 + 2.6 * 0.7; rud3.add(mk(rg3.clone().translate(0, 1.9, -rz3), m.paint)); rud3.position.set(0, 0, rz3); G.add(rud3); P.rudder = rud3;
      P.elev = { rotation: { x: 0 } };
      var gb3 = function (x, y, z, steer) { var gr = new THREE.Group(); gr.position.set(x, y, z); gr.add(mk(new THREE.CylinderGeometry(0.09, 0.11, 1.5, 8), m.metal, 0, -0.7, 0)); var wh = wheel(steer ? 0.36 : 0.5, steer ? 0.2 : 0.34, m); wh.position.y = -1.5 + 0.0; gr.add(wh); A.wheels.push(wh); return gr; };
      P.gearN = gb3(0, -0.9, -6, true); G.add(P.gearN); P.gearL = gb3(-2.6, -1.1, 1); G.add(P.gearL); P.gearR = gb3(2.6, -1.1, 1); G.add(P.gearR);
      var sp = mk(new THREE.SphereGeometry(0.5, 12, 8), m.paint); sp.scale.set(0.8, 1.1, 3.2); sp.position.set(0, 0, 0); P.gearL.add(sp.clone()); P.gearR.add(sp.clone());
      A.nav = [[-12.9, 1.0, 0.8, 0xff1020], [12.9, 1.0, 0.8, 0x20ff40], [0, 6.8, 9.2, 0xffffff]];
      A.cockpit = makeCockpit(new V3(0, 0.95, -8.2), 1.0, 0.45, -9.0, 0.55, m, 0.4);
      A.eye = new V3(0, 1.0, -8.1); A.chase = 32; A.rpmMax = 1800;
    }
    // nav lights
    A.navSprites = A.nav.map(function (n, i) { var s = glowSprite(glow, new THREE.Color(n[3]).multiplyScalar(i === 2 ? 5 : 3), i === 2 ? 1.6 : 1.1); s.position.set(n[0], n[1], n[2]); G.add(s); return s; });
    G.traverse(function (o) { if (o.isMesh && o.material && o.material !== m.glass) o.castShadow = o.castShadow !== false; });
    A.m = m; return A;
  };

  // animate parts. st = flight object
  SK.animateAircraft = function (A, f, time, dt) {
    var P = A.parts, c = f.ctl, el = clamp(c.pitch + c.trim * 0.5, -1, 1);
    if (P.ailL) { P.ailL.rotation.x = c.roll * 0.45; P.ailR.rotation.x = -c.roll * 0.45; }
    if (P.elev && P.elev.rotation) P.elev.rotation.x = el * 0.45;
    if (P.eleL) { P.eleL.rotation.x = P.eleR.rotation.x = el * 0.45; }
    if (P.stabL) { P.stabL.rotation.x = P.stabR.rotation.x = el * 0.25; }
    if (P.rudder) P.rudder.rotation.y = -c.yaw * 0.4;
    if (P.rudL) { P.rudL.rotation.y = P.rudR.rotation.y = -c.yaw * 0.3; }
    var fl = f.flapPos * 0.33; if (P.flapL) { P.flapL.rotation.x = P.flapR.rotation.x = fl; }
    var g = f.gearPos, gr = (1 - g);
    if (P.gearN) {
      P.gearN.rotation.x = -gr * 1.5; P.gearN.visible = g > 0.01;
      P.gearL.rotation.z = gr * 1.55; P.gearR.rotation.z = -gr * 1.55; P.gearL.visible = P.gearR.visible = g > 0.01;
      var sp = f.groundSpeed * dt / 0.3;
      A.wheels.forEach(function (w) { w.userData.spin.rotation.x += sp; });
      if (f.ctl.yaw !== undefined && f.onGround) P.gearN.rotation.y = -c.yaw * 0.5 * (1 - Math.min(1, f.groundSpeed / 30) * 0.8); else P.gearN.rotation.y = 0;
    }
    // propeller
    var rpm = f.thrEff * (A.rpmMax || 0) * 0.85 + 400 * (A.rpmMax ? 1 : 0) * (f.thrEff > 0.01 || f.running ? 1 : 0.0);
    var rs = rpm / 60 * 2 * PI; // rad/s
    A.props.forEach(function (p, i) { p.rotation.z += rs * dt * 0.35; });
    A.blurs.forEach(function (b) { b.material.opacity = clamp((rs - 40) / 120, 0, 1) * 0.28; });
    // jet flame
    if (A.flames.length) {
      var th = f.thrEff, ab = f.ab ? 1 : 0, fl2 = 0.7 + 0.3 * Math.sin(time * 60);
      A.flames.forEach(function (fm, i) { var s = i % 2 === 0; fm.material.opacity = s ? ab * 0.75 * fl2 : (th > 0.3 ? 0.35 + ab * 0.5 : 0) * fl2; fm.scale.set(1, 1, (s ? 0.4 + ab * 0.8 : 0.4 + ab * 0.5) * (0.9 + 0.1 * fl2) + (s ? 0 : th * 0.2)); });
      if (A.nozzles) A.nozzles.forEach(function (n) { n.material.emissiveIntensity = th * 2.5 + ab * 4; });
    }
    // nav / strobe
    var on = Math.sin(time * 9) > 0.92; if (A.navSprites[2]) A.navSprites[2].visible = on || Math.sin(time * 9 + 0.4) > 0.94;
    A.navSprites.forEach(function (s, i) { if (i < 2) s.visible = true; });
  };
})();

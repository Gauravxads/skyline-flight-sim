// World rendering: sky, ocean, terrain chunks, trees, clouds, airports, lighting.
(function () {
  var V3 = THREE.Vector3;
  function lin(r, g, b) { return new THREE.Color(Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2)); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  var smooth = SK.smooth, mix = SK.mix;

  // ---------- sky palette keyed by sin(sun elevation) ----------
  var KEYS = [
    { s: -0.30, z: [0.002, 0.004, 0.016], h: [0.012, 0.022, 0.05], c: [0, 0, 0], i: 0 },
    { s: -0.10, z: [0.012, 0.025, 0.08], h: [0.06, 0.05, 0.11], c: [0, 0, 0], i: 0 },
    { s: -0.03, z: [0.04, 0.07, 0.22], h: [0.55, 0.20, 0.17], c: [1, 0.35, 0.15], i: 0.1 },
    { s: 0.03, z: [0.06, 0.12, 0.34], h: [0.95, 0.42, 0.17], c: [1.0, 0.5, 0.22], i: 0.5 },
    { s: 0.14, z: [0.09, 0.2, 0.52], h: [0.85, 0.62, 0.45], c: [1.0, 0.78, 0.55], i: 0.85 },
    { s: 0.40, z: [0.10, 0.26, 0.68], h: [0.55, 0.70, 0.92], c: [1.0, 0.93, 0.82], i: 1.0 },
    { s: 1.00, z: [0.08, 0.22, 0.64], h: [0.50, 0.66, 0.90], c: [1.0, 0.96, 0.88], i: 1.0 }
  ];
  function palette(s) {
    var a = KEYS[0], b = KEYS[KEYS.length - 1];
    for (var i = 0; i < KEYS.length - 1; i++) if (s >= KEYS[i].s && s <= KEYS[i + 1].s) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    var t = clamp((s - a.s) / Math.max(1e-6, b.s - a.s), 0, 1); t = t * t * (3 - 2 * t);
    function m(x, y) { return [mix(x[0], y[0], t), mix(x[1], y[1], t), mix(x[2], y[2], t)]; }
    return { z: m(a.z, b.z), h: m(a.h, b.h), c: m(a.c, b.c), i: mix(a.i, b.i, t) };
  }

  var SKY_GLSL = [
    'uniform vec3 uSunDir; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunCol; uniform float uSunI; uniform float uNight; uniform float uCloudy;',
    'float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
    'vec3 skyColor(vec3 d, bool disc){',
    '  float h = d.y;',
    '  float t = pow(clamp(h,0.,1.), 0.42);',
    '  vec3 col = mix(uHorizon, uZenith, t);',
    '  float mu = max(dot(d, uSunDir), 0.);',
    '  float glow = pow(mu, 5.)*0.16 + pow(mu, 36.)*0.4 + pow(mu, 700.)*2.0;',
    '  col += uSunCol * glow * uSunI * (1.0 - 0.6*uCloudy);',
    '  float band = exp(-abs(h)*7.0) * pow(mu, 2.0) * (1.0 - clamp(uSunDir.y*3.,0.,1.));',
    '  col += uSunCol * band * 0.5 * uSunI;',
    '  col = mix(col, uHorizon*0.9, 1.0 - smoothstep(-0.2, 0.0, h));',
    '  if (disc) {',
    '    float dd = dot(d, uSunDir);',
    '    col += uSunCol * smoothstep(0.99970, 0.99988, dd) * 40.0 * uSunI * (1.0 - 0.9*uCloudy);',
    '    vec3 md = -uSunDir; float mm = dot(d, md);',
    '    col += vec3(0.8,0.85,1.0) * smoothstep(0.99985, 0.99994, mm) * 3.0 * uNight;',
    '    vec3 sd = normalize(d) * 220.; vec2 g = floor(sd.xz/ (1.0+abs(sd.y)*0.02) + sd.y*3.1); ',
    '    vec2 cell = floor(vec2(atan(d.z,d.x)*180., d.y*260.)); float r = h21(cell);',
    '    float star = step(0.9965, r) * (0.4 + 0.6*h21(cell+7.)) * smoothstep(0.02,0.25,h);',
    '    col += vec3(1.0,0.95,0.9) * star * 1.8 * uNight * (1.0-uCloudy);',
    '  }',
    '  return col;',
    '}'
  ].join('\n');

  SK.World = function (renderer, scene, camera) {
    var self = this; this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.time = 17.5; this.weather = 'clear';
    this.wind = new V3(4, 0, -3); this.windSpeed = 5; this.turb = 0; this.gust = new V3();
    this.fogDensity = 1 / 34000; this.fogColor = new THREE.Color();
    this.skyU = {
      uSunDir: { value: new V3(0, 1, 0) }, uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
      uSunCol: { value: new THREE.Color() }, uSunI: { value: 1 }, uNight: { value: 0 }, uCloudy: { value: 0 }
    };
    this.sunDir = new V3(); this.light = 1; this.night = 0;
    this._buildLights(); this._buildSky(); this._buildOcean(); this._buildTerrain(); this._buildClouds(); this._buildAirports();
    this.pmrem = SK.useHalf ? new THREE.PMREMGenerator(renderer) : null; this._envT = -9; this.setTime(this.time, true);
  };
  var W = SK.World.prototype;

  W._buildLights = function () {
    var sc = this.scene;
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    var sh = this.sun.shadow.camera; sh.left = -45; sh.right = 45; sh.top = 45; sh.bottom = -45; sh.near = 10; sh.far = 600;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.15;
    sc.add(this.sun); sc.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x88aaff, 0x445533, 0.7); sc.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0x8899cc, 0.0); sc.add(this.moon);
  };

  W._buildSky = function () {
    var mat = new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }',
      fragmentShader: SKY_GLSL + '\nvarying vec3 vD; void main(){ gl_FragColor = vec4(skyColor(normalize(vD), true), 1.); }'
    });
    this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
    this.skyMesh.renderOrder = -10; this.skyMesh.frustumCulled = false; this.scene.add(this.skyMesh);
    // second copy for PMREM environment
    this.envScene = new THREE.Scene();
    var m2 = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: SKY_GLSL + '\nvarying vec3 vD; void main(){ vec3 c = skyColor(normalize(vD), true); gl_FragColor = vec4(min(c, vec3(12.)), 1.); }'
    }));
    this.envScene.add(m2);
  };

  // ---------- ocean ----------
  // radial mesh, dense near camera, so interpolated positions stay precise (no moire)
  function oceanGeo() {
    var seg = 96, rings = [0], r = 40; while (r < 130000) { rings.push(r); r *= 1.14; } rings.push(130000);
    var pos = [], idx = [], i, j;
    for (i = 0; i < rings.length; i++) for (j = 0; j < seg; j++) { var a = j / seg * Math.PI * 2; pos.push(Math.cos(a) * rings[i], 0, Math.sin(a) * rings[i]); }
    for (i = 0; i < rings.length - 1; i++) for (j = 0; j < seg; j++) {
      var a0 = i * seg + j, a1 = i * seg + (j + 1) % seg, b0 = (i + 1) * seg + j, b1 = (i + 1) * seg + (j + 1) % seg;
      idx.push(a0, b1, b0, a0, a1, b1);
    }
    var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
  }
  W._buildOcean = function () {
    var u = THREE.UniformsUtils.merge([{ uTime: { value: 0 }, uFogCol: { value: new THREE.Color() }, uFogD: { value: 0.00003 }, uWindAmt: { value: 0.5 }, uLight: { value: 1 }, uOrg: { value: new THREE.Vector2() } }]);
    Object.assign(u, this.skyU, { uTime: u.uTime, uFogCol: u.uFogCol, uFogD: u.uFogD, uWindAmt: u.uWindAmt, uLight: u.uLight, uOrg: u.uOrg });
    this.oceanU = u;
    var mat = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false,
      vertexShader: 'varying vec3 vW; varying vec2 vL; void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; vL = position.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: SKY_GLSL + [
        'uniform float uTime; uniform vec3 uFogCol; uniform float uFogD; uniform float uWindAmt; uniform float uLight;',
        'varying vec3 vW; varying vec2 vL; uniform vec2 uOrg;',
        'void wave(vec2 p, vec2 dir, float len, float amp, float spd, float fade, inout float h, inout vec2 g){',
        '  float k = 6.2831853/len; float ph = dot(p, dir)*k + uTime*spd*k*0.9;',
        '  float s = sin(ph), c = cos(ph);',
        '  h += amp*fade*s; g += dir*(amp*fade*k*c);',
        '}',
        'void main(){',
        '  vec3 toCam = cameraPosition - vW; float dist = length(toCam); vec3 V = toCam/dist;',
        '  vec2 p = vL + uOrg; float h = 0.; vec2 g = vec2(0.);',
        '  float amp = 0.25 + uWindAmt*0.9;',
        '  float fp = dist*0.0012/max(V.y, 0.04);',
        '  float f1 = 1.0 - smoothstep(14., 35., fp), f2 = 1.0 - smoothstep(7., 18., fp), f3 = 1.0 - smoothstep(3.7, 9., fp), f4 = 1.0 - smoothstep(1.8, 4.6, fp), f5 = 1.0 - smoothstep(0.5, 1.2, fp);',
        '  wave(p, normalize(vec2(1.0,0.35)), 140., amp*1.0, 9., f1, h, g);',
        '  wave(p, normalize(vec2(0.6,1.0)), 71., amp*0.55, 7., f2, h, g);',
        '  wave(p, normalize(vec2(-0.5,0.9)), 37., amp*0.30, 5., f3, h, g);',
        '  wave(p, normalize(vec2(0.9,-0.6)), 19., amp*0.16, 4., f4, h, g);',
        '  wave(p, normalize(vec2(-0.8,-0.3)), 9.3, amp*0.08, 3., f4, h, g);',
        '  wave(p, normalize(vec2(0.2,-1.0)), 4.6, amp*0.04, 2.5, f5, h, g);',
        '  wave(p, normalize(vec2(-1.0,0.7)), 2.2, amp*0.02, 2., f5, h, g);',
        '  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));',
        '  float ndv = max(dot(N, V), 0.0);',
        '  float fres = 0.02 + 0.98*pow(1.0 - ndv, 5.0);',
        '  vec3 R = reflect(-V, N); R.y = abs(R.y);',
        '  vec3 refl = skyColor(R, false);',
        '  float sp = pow(max(dot(R, uSunDir), 0.), 900.) * 60. + pow(max(dot(R, uSunDir), 0.), 80.) * 0.5;',
        '  refl += uSunCol * sp * uSunI;',
        '  vec3 deep = vec3(0.004, 0.05, 0.11), shallow = vec3(0.02, 0.24, 0.27);',
        '  float diff = max(uSunDir.y, 0.) * 0.7 + 0.25;',
        '  float sss = pow(max(dot(-V, uSunDir)*0.5+0.5, 0.), 3.) * max(h*0.5+0.5,0.) ;',
        '  vec3 body = mix(deep, shallow, 0.35 + 0.5*h) * (diff * uLight + 0.02) + shallow * sss * 0.4 * uSunI;',
        '  vec3 col = mix(body, refl, fres);',
        '  float crest = smoothstep(0.78, 1.25, h/(amp*0.9)) * smoothstep(0.15, 0.9, uWindAmt) * f4;',
        '  col = mix(col, vec3(0.75,0.8,0.85)*(0.15+0.85*uLight), crest*0.6);',
        '  float alpha = clamp(mix(0.52, 1.0, smoothstep(150., 1100., dist)) + fres, 0., 1.);',
        '  float fog = 1.0 - exp(-pow(dist*uFogD, 2.));',
        '  col = mix(col, uFogCol, fog);',
        '  gl_FragColor = vec4(col, alpha);',
        '}'
      ].join('\n')
    });
    this.ocean = new THREE.Mesh(oceanGeo(), mat);
    this.ocean.frustumCulled = false; this.ocean.renderOrder = 2; this.scene.add(this.ocean);
  };

  // ---------- terrain ----------
  var LV = [
    { S: 384, N: 48, R: 4 }, { S: 1536, N: 48, R: 3 }, { S: 6144, N: 48, R: 3 }, { S: 24576, N: 48, R: 2 }
  ];
  function ccol(r, g, b) { return [Math.pow(r, 2.2), Math.pow(g, 2.2), Math.pow(b, 2.2)]; }
  var C_DEEP = ccol(0.02, 0.10, 0.2), C_SHAL = ccol(0.1, 0.55, 0.55), C_SAND = ccol(0.80, 0.72, 0.52), C_WET = ccol(0.55, 0.5, 0.4),
    C_GR1 = ccol(0.27, 0.42, 0.14), C_GR2 = ccol(0.40, 0.48, 0.18), C_FOR = ccol(0.10, 0.25, 0.09), C_DRY = ccol(0.55, 0.5, 0.3),
    C_ROCK = ccol(0.40, 0.36, 0.32), C_ROCK2 = ccol(0.30, 0.27, 0.25), C_SNOW = ccol(0.92, 0.94, 0.98);
  function cmix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function terrainColor(h, slope, x, z) {
    var n1 = SK.fbm(x / 160, z / 160, 3), n2 = SK.fbm(x / 1100 + 9, z / 1100, 3);
    if (h < -2) { var d = smooth(-45, -2, h); return cmix(C_DEEP, C_SHAL, Math.pow(d, 1.2)); }
    if (h < 3.5) { var t = smooth(-2, 3.5, h); return cmix(C_WET, C_SAND, t); }
    var c;
    if (h < 9) c = cmix(C_SAND, C_GR2, smooth(3.5, 9, h) * (0.5 + 0.5 * n1));
    else {
      var forest = smooth(0.45, 0.62, n2);
      c = cmix(cmix(C_GR1, C_GR2, n1), C_FOR, forest * 0.8);
      c = cmix(c, C_DRY, smooth(0.5, 0.8, n1) * 0.25 * (1 - forest));
    }
    var rock = Math.max(smooth(0.42, 0.7, slope), smooth(900, 1500, h + (n1 - 0.5) * 300));
    c = cmix(c, cmix(C_ROCK, C_ROCK2, n1), rock);
    var snow = smooth(1500, 1800, h + (n1 - 0.5) * 260) * (1 - smooth(0.6, 0.95, slope));
    return cmix(c, C_SNOW, snow);
  }

  W._buildTerrain = function () {
    var self = this;
    this.chunks = {}; this.chunkQueue = []; this.terrainGroup = new THREE.Group(); this.scene.add(this.terrainGroup);
    this.terrainMats = LV.map(function (lv, i) {
      var m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, polygonOffset: true, polygonOffsetFactor: i * 2, polygonOffsetUnits: i * 2 });
      m.onBeforeCompile = function (sh) {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed,1.)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', [
          '#include <common>', 'varying vec3 vWP;',
          'float th(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
          'float tn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(th(i),th(i+vec2(1,0)),f.x), mix(th(i+vec2(0,1)),th(i+vec2(1,1)),f.x), f.y); }'
        ].join('\n')).replace('#include <color_fragment>', [
          '#include <color_fragment>',
          'float dd = length(vWP - cameraPosition);',
          'float dn = tn(vWP.xz*0.35)*0.5 + tn(vWP.xz*1.7)*0.3 + tn(vWP.xz*7.3)*0.2;',
          'float fadeD = 1.0 - smoothstep(300., 2500., dd);',
          'diffuseColor.rgb *= mix(1.0, 0.72 + 0.56*dn, fadeD);'
        ].join('\n'));
      };
      return m;
    });
  };

  var treeGeo = null, bushGeo = null;
  function mergeGeos(list) {
    var pos = [], nor = [], col = [];
    list.forEach(function (it) {
      var g = it.g.toNonIndexed(); g.applyMatrix4(it.m);
      var p = g.attributes.position.array, n = g.attributes.normal.array;
      for (var i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); }
      for (var j = 0; j < p.length / 3; j++) col.push(it.c[0], it.c[1], it.c[2]);
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return geo;
  }
  function makeTreeGeos() {
    var M = THREE.Matrix4, T = new M();
    var trunk = ccol(0.25, 0.16, 0.09), g1 = ccol(0.07, 0.2, 0.08), g2 = ccol(0.1, 0.27, 0.1), g3 = ccol(0.16, 0.34, 0.12);
    treeGeo = mergeGeos([
      { g: new THREE.CylinderGeometry(0.3, 0.45, 2.4, 5), m: new M().makeTranslation(0, 1.2, 0), c: trunk },
      { g: new THREE.ConeGeometry(2.6, 4.2, 7), m: new M().makeTranslation(0, 3.6, 0), c: g1 },
      { g: new THREE.ConeGeometry(2.0, 3.8, 7), m: new M().makeTranslation(0, 6.0, 0), c: g2 },
      { g: new THREE.ConeGeometry(1.3, 3.4, 7), m: new M().makeTranslation(0, 8.2, 0), c: g3 }
    ]);
    bushGeo = mergeGeos([
      { g: new THREE.CylinderGeometry(0.25, 0.4, 3.0, 5), m: new M().makeTranslation(0, 1.5, 0), c: trunk },
      { g: new THREE.IcosahedronGeometry(2.6, 1), m: new M().makeTranslation(0, 4.6, 0), c: g2 },
      { g: new THREE.IcosahedronGeometry(1.9, 1), m: new M().makeTranslation(1.2, 5.6, 0.6), c: g3 }
    ]);
  }

  W._chunkKey = function (l, i, j) { return l + ':' + i + ':' + j; };
  W._buildChunk = function (l, ci, cj) {
    var lv = LV[l], S = lv.S, N = lv.N, step = S / N, x0 = ci * S, z0 = cj * S;
    var Wd = N + 3, hs = new Float32Array(Wd * Wd), i, j;
    for (j = -1; j <= N + 1; j++) for (i = -1; i <= N + 1; i++) hs[(j + 1) * Wd + (i + 1)] = SK.terrainH(x0 + i * step, z0 + j * step);
    function H(i, j) { return hs[(j + 1) * Wd + (i + 1)]; }
    var nv = (N + 1) * (N + 1), skirt = 4 * (N + 1), tot = nv + skirt;
    var pos = new Float32Array(tot * 3), nor = new Float32Array(tot * 3), col = new Float32Array(tot * 3), slopes = new Float32Array(nv);
    var k = 0;
    for (j = 0; j <= N; j++) for (i = 0; i <= N; i++, k++) {
      var h = H(i, j);
      var nx = H(i - 1, j) - H(i + 1, j), nz = H(i, j - 1) - H(i, j + 1), ny = 2 * step, nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= nl; ny /= nl; nz /= nl;
      pos[k * 3] = i * step; pos[k * 3 + 1] = h; pos[k * 3 + 2] = j * step;
      nor[k * 3] = nx; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = nz; slopes[k] = 1 - ny;
      var c = terrainColor(h, 1 - ny, x0 + i * step, z0 + j * step);
      col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
    }
    var idx = [];
    for (j = 0; j < N; j++) for (i = 0; i < N; i++) {
      var a = j * (N + 1) + i, b = a + 1, c2 = a + N + 1, d = c2 + 1;
      idx.push(a, c2, b, b, c2, d);
    }
    // skirts
    var sd = step * 1.2 + 4, sk = nv;
    function skirtEdge(getIdx) {
      var base = sk;
      for (var e = 0; e <= N; e++) {
        var s = getIdx(e);
        pos[sk * 3] = pos[s * 3]; pos[sk * 3 + 1] = pos[s * 3 + 1] - sd; pos[sk * 3 + 2] = pos[s * 3 + 2];
        nor[sk * 3] = nor[s * 3]; nor[sk * 3 + 1] = nor[s * 3 + 1]; nor[sk * 3 + 2] = nor[s * 3 + 2];
        col[sk * 3] = col[s * 3]; col[sk * 3 + 1] = col[s * 3 + 1]; col[sk * 3 + 2] = col[s * 3 + 2]; sk++;
      }
      for (var e2 = 0; e2 < N; e2++) { var p0 = getIdx(e2), p1 = getIdx(e2 + 1), q0 = base + e2, q1 = base + e2 + 1; idx.push(p0, q0, p1, p1, q0, q1, p0, p1, q0, p1, q1, q0); }
    }
    skirtEdge(function (e) { return e; }); skirtEdge(function (e) { return N * (N + 1) + e; });
    skirtEdge(function (e) { return e * (N + 1); }); skirtEdge(function (e) { return e * (N + 1) + N; });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx); geo.computeBoundingSphere();
    var mesh = new THREE.Mesh(geo, this.terrainMats[l]); mesh.position.set(x0, 0, z0);
    mesh.receiveShadow = l <= 1; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    var grp = new THREE.Group(); grp.add(mesh); grp.position.set(0, 0, 0);
    // trees
    if (l === 0) {
      if (!treeGeo) makeTreeGeos();
      var pines = [], round = [], cnt = 380, rnd = SK.hash;
      for (var t = 0; t < cnt; t++) {
        var rx = rnd(ci * 977 + t, cj * 131 + 7) * S, rz = rnd(ci * 311 + 5, cj * 719 + t * 3) * S;
        var wx = x0 + rx, wz = z0 + rz, hh = SK.terrainH(wx, wz);
        if (hh < 7 || hh > 1100) continue;
        var s2 = Math.abs(SK.terrainH(wx + 4, wz) - hh) + Math.abs(SK.terrainH(wx, wz + 4) - hh);
        if (s2 > 5) continue;
        var fn = SK.fbm(wx / 1100 + 9, wz / 1100, 3), dens = smooth(0.4, 0.62, fn) * 0.95 + 0.1;
        if (rnd(t * 13 + ci, cj * 17 + t) > dens) continue;
        var skip = false; for (var a2 = 0; a2 < SK.airports.length; a2++) if (SK.airportDist(SK.airports[a2], wx, wz) < 450) { skip = true; break; }
        if (skip) continue;
        var sc = 0.7 + rnd(t + 91, ci + cj * 5) * 1.1, mt = new THREE.Matrix4().compose(new V3(wx, hh - 0.2, wz), new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), rnd(t, 5) * 6.28), new V3(sc, sc * (0.9 + rnd(t, 9) * 0.5), sc));
        ((hh > 500 || rnd(t + 3, 33) < 0.6) ? pines : round).push([mt, rnd(t, 71)]);
      }
      [[pines, treeGeo], [round, bushGeo]].forEach(function (pr) {
        if (!pr[0].length) return;
        var im = new THREE.InstancedMesh(pr[1], self.treeMat, pr[0].length);
        for (var q = 0; q < pr[0].length; q++) { im.setMatrixAt(q, pr[0][q][0]); var v = 0.75 + pr[0][q][1] * 0.5; im.setColorAt(q, new THREE.Color(v, v, v * 0.95)); }
        im.instanceMatrix.needsUpdate = true; im.frustumCulled = true; im.castShadow = false; im.receiveShadow = true;
        im.computeBoundingSphere && im.computeBoundingSphere();
        grp.add(im);
      });
    }
    this.terrainGroup.add(grp);
    return { grp: grp, mesh: mesh };
  };

  W.updateTerrain = function (pos, budgetMs, force) {
    if (!this.treeMat) this.treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    var need = {}, list = [];
    for (var l = 0; l < LV.length; l++) {
      var S = LV[l].S, R = LV[l].R, ci = Math.floor(pos.x / S), cj = Math.floor(pos.z / S);
      for (var dj = -R; dj <= R; dj++) for (var di = -R; di <= R; di++) {
        var key = this._chunkKey(l, ci + di, cj + dj); need[key] = 1;
        if (!this.chunks[key]) list.push({ l: l, i: ci + di, j: cj + dj, key: key, d: Math.hypot((ci + di + 0.5) * S - pos.x, (cj + dj + 0.5) * S - pos.z) });
      }
    }
    list.sort(function (a, b) { return a.l - b.l || a.d - b.d; });
    var t0 = performance.now(), built = 0;
    for (var n = 0; n < list.length; n++) {
      if (!force && performance.now() - t0 > budgetMs && built > 0) break;
      var it = list[n]; this.chunks[it.key] = this._buildChunk(it.l, it.i, it.j); built++;
    }
    for (var key2 in this.chunks) if (!need[key2]) {
      var ch = this.chunks[key2]; this.terrainGroup.remove(ch.grp);
      ch.grp.traverse(function (o) { if (o.geometry && o.geometry !== treeGeo && o.geometry !== bushGeo) o.geometry.dispose(); if (o.dispose && o.isInstancedMesh) o.dispose(); });
      delete this.chunks[key2];
    }
    return list.length - built;
  };

  // ---------- clouds ----------
  W._buildClouds = function () {
    var self = this, NS = 130, systems = [], puffs = [];
    var rnd = SK.hash;
    for (var s = 0; s < NS; s++) {
      var cx = (rnd(s, 1) * 2 - 1) * 22000, cz = (rnd(s, 2) * 2 - 1) * 22000, base = 1500 + rnd(s, 3) * 900;
      var w = 500 + rnd(s, 4) * 1100, hgt = 250 + rnd(s, 5) * 500, np = 12 + Math.floor(rnd(s, 6) * 16);
      systems.push({ x: cx, z: cz, rank: rnd(s, 7), ps: [] });
      for (var p = 0; p < np; p++) {
        var a = rnd(s * 50 + p, 8) * 6.283, r = Math.sqrt(rnd(s * 50 + p, 9)) * w * 0.5;
        var ox = Math.cos(a) * r, oz = Math.sin(a) * r, edge = 1 - r / (w * 0.5 + 1);
        var oy = base + hgt * edge * (0.3 + rnd(s * 50 + p, 10) * 0.9) + (rnd(s * 50 + p, 11)) * 60;
        var sz = 260 + rnd(s * 50 + p, 12) * 380 + edge * 280;
        puffs.push({ sys: s, ox: ox, oy: oy, oz: oz, size: sz, seed: rnd(s * 50 + p, 13) * 100, shade: clamp((oy - base) / hgt, 0, 1) });
      }
    }
    this.cloudSys = systems; this.puffs = puffs; var n = puffs.length; this.nPuffs = n;
    var geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.cPos = new Float32Array(n * 4); this.cInfo = new Float32Array(n * 2);
    this.cPosAttr = new THREE.InstancedBufferAttribute(this.cPos, 4); this.cPosAttr.setUsage(THREE.DynamicDrawUsage);
    this.cInfoAttr = new THREE.InstancedBufferAttribute(this.cInfo, 2); this.cInfoAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.cPosAttr); geo.setAttribute('iInfo', this.cInfoAttr);
    geo.instanceCount = n;
    var cu = { uFogCol: { value: new THREE.Color() }, uFogD: { value: 0.00003 }, uLight: { value: 1 }, uDark: { value: 0 } };
    Object.assign(cu, this.skyU); this.cloudU = cu;
    var mat = new THREE.ShaderMaterial({
      uniforms: cu, transparent: true, depthWrite: false,
      vertexShader: 'attribute vec4 iPos; attribute vec2 iInfo; varying vec2 vUv; varying float vShade; varying float vSeed; varying float vDist; varying float vFade; varying vec3 vVD;\n' +
        'void main(){ vec4 mv = viewMatrix * vec4(iPos.xyz, 1.); float sz = iPos.w; vUv = position.xy; vShade = iInfo.y; vSeed = iInfo.x; vDist = length(mv.xyz);\n' +
        '  vVD = normalize(iPos.xyz - cameraPosition);\n' +
        '  vFade = smoothstep(sz*0.15, sz*0.9, vDist); mv.xy += position.xy * sz; gl_Position = projectionMatrix * mv; }',
      fragmentShader: SKY_GLSL + [
        'uniform vec3 uFogCol; uniform float uFogD; uniform float uLight; uniform float uDark;',
        'varying vec2 vUv; varying float vShade; varying float vSeed; varying float vDist; varying float vFade; varying vec3 vVD;',
        'float nz(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }',
        'void main(){',
        '  float r = length(vUv); if (r > 1.0) discard;',
        '  float n = nz(vUv*2.6 + vSeed)*0.55 + nz(vUv*5.5 - vSeed*1.7)*0.3 + nz(vUv*11. + vSeed*2.3)*0.15;',
        '  float a = 1.0 - smoothstep(0.25, 1.0, r + (n-0.5)*0.75);',
        '  a *= 0.92;',
        '  vec3 N = normalize(vec3(vUv*0.9 + (n-0.5)*0.5, sqrt(max(0.05, 1.0 - r*r))));',
        '  vec3 sv = normalize((viewMatrix * vec4(uSunDir, 0.)).xyz);',
        '  float lit = clamp(dot(N, sv)*0.55 + 0.5, 0., 1.);',
        '  vec3 sunC = uSunCol * (1.15 + 0.2*uSunI) * uLight;',
        '  vec3 amb = mix(uHorizon, uZenith, 0.5) * 0.9 + vec3(0.02);',
        '  vec3 col = mix(amb * (0.55 - 0.25*uDark), sunC + amb*0.5, lit);',
        '  col *= mix(0.62, 1.0, vShade) * (1.0 - 0.55*uDark);',
        '  float mu = max(dot(vVD, uSunDir), 0.);',
        '  col += uSunCol * pow(mu, 10.) * 0.55 * (1.0 - a*0.6) * uLight * (1.0-uDark);',
        '  float fog = 1.0 - exp(-pow(vDist*uFogD, 2.));',
        '  col = mix(col, uFogCol, fog);',
        '  gl_FragColor = vec4(col, a * vFade * (1.0 - fog*0.15));',
        '}'
      ].join('\n')
    });
    this.cloudMesh = new THREE.Mesh(geo, mat); this.cloudMesh.frustumCulled = false; this.cloudMesh.renderOrder = 3;
    this.scene.add(this.cloudMesh); this._cloudT = -9; this.cloudCover = 0.45;
    this._order = new Array(n); for (var i = 0; i < n; i++) this._order[i] = i; this._dist = new Float32Array(n);
  };

  W.updateClouds = function (cam, dt, force) {
    this._cloudT -= dt;
    // drift
    var self = this;
    this.cloudSys.forEach(function (s) { s.x += self.wind.x * dt * 0.8; s.z += self.wind.z * dt * 0.8; });
    if (this._cloudT > 0 && !force) return;
    this._cloudT = 0.35;
    var R = 22000, n = this.nPuffs, P = this.puffs, S = this.cloudSys, d = this._dist, order = this._order, vis = [];
    var thr = this.cloudCover;
    for (var i = 0; i < n; i++) {
      var p = P[i], s = S[p.sys];
      if (s.rank > thr) { d[i] = -1; continue; }
      var dx = s.x - cam.x, dz = s.z - cam.z;
      dx = ((dx + R) % (2 * R) + 2 * R) % (2 * R) - R; dz = ((dz + R) % (2 * R) + 2 * R) % (2 * R) - R;
      var x = cam.x + dx + p.ox, y = p.oy, z = cam.z + dz + p.oz;
      this._tmpX = x; p._x = x; p._z = z; d[i] = (x - cam.x) * (x - cam.x) + (y - cam.y) * (y - cam.y) + (z - cam.z) * (z - cam.z);
    }
    for (var k = 0; k < n; k++) order[k] = k;
    order.sort(function (a, b) { return d[b] - d[a]; });
    var cnt = 0;
    for (var m = 0; m < n; m++) {
      var id = order[m]; if (d[id] < 0) continue;
      var q = P[id];
      this.cPos[cnt * 4] = q._x; this.cPos[cnt * 4 + 1] = q.oy; this.cPos[cnt * 4 + 2] = q._z; this.cPos[cnt * 4 + 3] = q.size;
      this.cInfo[cnt * 2] = q.seed; this.cInfo[cnt * 2 + 1] = q.shade; cnt++;
    }
    this.cloudMesh.geometry.instanceCount = cnt;
    this.cPosAttr.needsUpdate = true; this.cInfoAttr.needsUpdate = true;
  };

  // ---------- airports ----------
  function runwayTexture(a) {
    var cv = document.createElement('canvas'); cv.width = 256; cv.height = 2048; var g = cv.getContext('2d');
    var W_ = 256, H_ = 2048, ppm = H_ / a.len; // px per meter along length
    var pw = W_ / a.wid;
    g.fillStyle = '#3b3d40'; g.fillRect(0, 0, W_, H_);
    for (var i = 0; i < 9000; i++) { var v = 40 + Math.random() * 40; g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v + 2) + ',0.35)'; g.fillRect(Math.random() * W_, Math.random() * H_, 1 + Math.random() * 2, 1 + Math.random() * 3); }
    // rubber at both ends
    [0.06, 0.94].forEach(function (f) { var gr = g.createLinearGradient(0, (f - 0.05) * H_, 0, (f + 0.05) * H_); gr.addColorStop(0, 'rgba(10,10,12,0)'); gr.addColorStop(0.5, 'rgba(10,10,12,0.2)'); gr.addColorStop(1, 'rgba(10,10,12,0)'); g.fillStyle = gr; g.fillRect(W_ * 0.3, (f - 0.05) * H_, W_ * 0.4, 0.1 * H_); });
    g.fillStyle = '#e9e9e4';
    g.fillRect(3, 0, 3, H_); g.fillRect(W_ - 6, 0, 3, H_);
    // centerline
    for (var y = 120 * ppm; y < H_ - 120 * ppm; y += 50 * ppm) g.fillRect(W_ / 2 - 1.5, y, 3, 30 * ppm);
    // thresholds
    [0, 1].forEach(function (end) {
      var y0 = end ? H_ - 40 * ppm : 6 * ppm, dir = 1;
      for (var b = -6; b <= 6; b++) { if (b === 0) continue; g.fillRect(W_ / 2 + b * 7.5 * pw * 0.45 - 2.5, end ? H_ - 40 * ppm : 6 * ppm, 5, 30 * ppm); }
      // touchdown zones
      var marks = [150, 300, 450, 600];
      marks.forEach(function (m, mi) { var yy = end ? H_ - (m + 22) * ppm : m * ppm; var off = [9, 8, 7, 6][mi]; g.fillRect(W_ / 2 - off * pw - 4, yy, 8, 22 * ppm); g.fillRect(W_ / 2 + off * pw - 4, yy, 8, 22 * ppm); if (mi === 1) { g.fillRect(W_ / 2 - (off + 3.5) * pw - 4, yy, 8, 22 * ppm); g.fillRect(W_ / 2 + (off + 3.5) * pw - 4, yy, 8, 22 * ppm); } });
      var ay = end ? H_ - 400 * ppm : 340 * ppm; g.fillRect(W_ / 2 - 8 * pw - 6, ay, 14, 45 * ppm); g.fillRect(W_ / 2 + 8 * pw - 6, ay, 14, 45 * ppm);
    });
    // numbers
    function num(txt, yy, flip) {
      g.save(); g.translate(W_ / 2, yy); if (flip) g.rotate(Math.PI); g.font = 'bold 48px Barlow Condensed, Arial Narrow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(225,225,218,0.8)'; g.scale(0.85, 0.42); g.fillText(txt, 0, 0); g.restore();
    }
    var h1 = Math.round(a.hdg / 10) % 36 || 36, h2 = (h1 + 18 - 1) % 36 + 1;
    function p2(n) { return (n < 10 ? '0' : '') + n; }
    num(p2(h1), 125 * ppm, false); num(p2(h2), H_ - 125 * ppm, true);
    var tex = new THREE.CanvasTexture(cv); tex.anisotropy = 8; tex.encoding = THREE.sRGBEncoding; tex.needsUpdate = true;
    return tex;
  }
  function glowTex() {
    var cv = document.createElement('canvas'); cv.width = cv.height = 64; var g = cv.getContext('2d');
    var gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); var t = new THREE.CanvasTexture(cv); return t;
  }
  SK.glowTex = glowTex;

  W._buildAirports = function () {
    var self = this; this.airportObjs = []; var gt = glowTex(); this.glowTex = gt;
    this.lightMats = [];
    function lightPoints(list, size) {
      var pos = [], col = [];
      list.forEach(function (l) { pos.push(l[0], l[1], l[2]); col.push(l[3], l[4], l[5]); });
      var g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      var m = new THREE.PointsMaterial({ size: size, map: gt, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true });
      m.color.setScalar(1); self.lightMats.push(m); var p = new THREE.Points(g, m); p.frustumCulled = false; return p;
    }
    SK.airports.forEach(function (a) {
      var grp = new THREE.Group(); grp.position.set(a.x, a.elev, a.z); grp.rotation.y = -a.hdg * Math.PI / 180;
      var tex = runwayTexture(a);
      var rw = new THREE.Mesh(new THREE.PlaneGeometry(a.wid, a.len).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0, envMapIntensity: 0.4, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      rw.position.y = 0.06; rw.rotation.y = 0; rw.receiveShadow = true; grp.add(rw);
      // runway local: length along z, +z is behind (reverse of heading). Start (threshold of hdg direction) at z=+len/2
      // apron
      var ap = new THREE.Mesh(new THREE.PlaneGeometry(150, 70).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x777876, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      ap.position.set(a.wid / 2 + 110, 0.05, 0); ap.receiveShadow = true; grp.add(ap);
      var taxi = new THREE.Mesh(new THREE.PlaneGeometry(110, 18).rotateX(-Math.PI / 2), ap.material); taxi.position.set(a.wid / 2 + 45, 0.05, 20); taxi.receiveShadow = true; grp.add(taxi);
      // buildings
      var wallM = new THREE.MeshStandardMaterial({ color: 0xcfd2d4, roughness: 0.8 }), roofM = new THREE.MeshStandardMaterial({ color: 0x8a3b2f, roughness: 0.7 }), glassM = new THREE.MeshStandardMaterial({ color: 0x223344, roughness: 0.15, metalness: 0.6, emissive: 0xffc070, emissiveIntensity: 0 });
      a.glass = glassM;
      var tw = new THREE.Group(); tw.position.set(a.wid / 2 + 85, 0, -35);
      var shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.0, 24, 12), wallM); shaft.position.y = 12; shaft.castShadow = true; tw.add(shaft);
      var cab = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 3.8, 5, 12), glassM); cab.position.y = 26.5; tw.add(cab);
      var cap = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 0.8, 12), wallM); cap.position.y = 29.4; tw.add(cap);
      var beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 8, 6) })); beacon.position.y = 31; tw.add(beacon); a.beacon = beacon;
      var term = new THREE.Mesh(new THREE.BoxGeometry(34, 7, 14), wallM); term.position.set(-16, 3.5, 6); term.castShadow = true; term.receiveShadow = true; tw.add(term);
      var win = new THREE.Mesh(new THREE.BoxGeometry(34.2, 2.2, 14.2), glassM); win.position.set(-16, 4, 6); tw.add(win);
      grp.add(tw);
      for (var h = 0; h < 3; h++) {
        var hg = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 24, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), roofM);
        hg.scale.set(1, 0.7, 1); hg.position.set(a.wid / 2 + 140, 0, -50 + h * 30 + 38); hg.castShadow = true; hg.receiveShadow = true; grp.add(hg);
      }
      // lights
      var L = [], hl = a.len / 2, ww = a.wid / 2 + 1.5;
      for (var z = -hl; z <= hl; z += 60) { L.push([-ww, 1.3, z, 1, 0.95, 0.8], [ww, 1.3, z, 1, 0.95, 0.8]); }
      for (var c = -ww; c <= ww; c += 3) { L.push([c, 1.3, hl + 1, 1.0, 1, 0.3], [c, 1.3, -hl - 1, 1, 0.1, 0.1]); }
      for (var z2 = hl + 30; z2 <= hl + 420; z2 += 30) L.push([0, 1.3, z2, 1, 0.95, 0.85], [-3, 1.3, z2, 1, 0.95, 0.85], [3, 1.3, z2, 1, 0.95, 0.85]);
      for (var z3 = -hl - 30; z3 >= -hl - 420; z3 -= 30) L.push([0, 1.3, z3, 1, 0.95, 0.85], [-3, 1.3, z3, 1, 0.95, 0.85], [3, 1.3, z3, 1, 0.95, 0.85]);
      for (var z4 = -hl; z4 <= hl; z4 += 30) L.push([0, 1.0, z4, 0.9, 0.9, 1.0]);
      grp.add(lightPoints(L, 5));
      // PAPI: 4 lights each end, left of runway
      var papiColors = new Float32Array(24);
      a.papi = [];
      [1, -1].forEach(function (side) { // side=+1 : approach from +z side to threshold at z=+hl? aircraft heading -z lands at the +z end
        var pg = new THREE.BufferGeometry(), p = [], c = [];
        for (var q = 0; q < 4; q++) { p.push(-(ww + 12 + q * 4), 0.6, side * (hl - 300)); c.push(1, 1, 1); }
        pg.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); pg.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
        var pm = new THREE.PointsMaterial({ size: 9, map: gt, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
        pm.color.setScalar(3); var pp = new THREE.Points(pg, pm); pp.frustumCulled = false; grp.add(pp); a.papi.push({ pts: pp, side: side, mat: pm });
      });
      // windsock
      var ws = new THREE.Group(); ws.position.set(-a.wid / 2 - 30, 0, a.len / 2 - 120);
      var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 7, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd })); pole.position.y = 3.5; ws.add(pole);
      var sock = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4, 12, 1, true).rotateZ(Math.PI / 2).translate(2, 0, 0), new THREE.MeshStandardMaterial({ color: 0xff6a1a, side: THREE.DoubleSide, roughness: 0.8 }));
      var sockPivot = new THREE.Group(); sockPivot.position.y = 7; sockPivot.add(sock); ws.add(sockPivot); a.sock = sockPivot; grp.add(ws);
      self.scene.add(grp); a.group = grp;
    });
  };

  W.update = function (dt, cam, player) {
    this.ocean.position.set(cam.x, 0, cam.z); this.oceanU.uOrg.value.set(cam.x, cam.z);
    this.skyMesh.position.copy(cam);
    this.oceanU.uTime.value += dt;
    this.updateClouds(cam, dt, false);
    // windsocks
    var wdir = Math.atan2(-this.wind.x, -this.wind.z);
    var sp = Math.min(1, this.windSpeed / 8);
    SK.airports.forEach(function (a) {
      if (a.sock) { a.sock.rotation.y = wdir - (-a.hdg * Math.PI / 180) + Math.PI / 2 * 0 + Math.PI; a.sock.rotation.z = -(1 - sp) * 1.1; }
    });
    // PAPI
    if (player) SK.airports.forEach(function (a) {
      a.papi.forEach(function (pp) {
        var dx = player.x - a.x, dz = player.z - a.z, along = dx * a.dx + dz * a.dz; // along heading
        var thr = pp.side * (a.len / 2 - 300); // local z of the PAPI
        // heading -z in local means along +heading direction; local z = -along
        var dist = -along - thr; // distance from papi, positive if aircraft is "behind" in local +z
        var d = Math.max(30, Math.abs(-along - thr)), hgt = player.y - a.elev;
        var ang = Math.atan2(hgt, d) * 180 / Math.PI;
        var th = [2.5, 2.83, 3.17, 3.5], c = pp.pts.geometry.attributes.color;
        for (var q = 0; q < 4; q++) { var white = ang > th[q]; c.setXYZ(q, white ? 1 : 1, white ? 1 : 0.08, white ? 0.95 : 0.05); }
        c.needsUpdate = true;
      });
    });
  };

  // ---------- time / weather ----------
  W.setTime = function (hours, force) {
    this.time = hours;
    var a = (hours - 6) / 12 * Math.PI;
    var sd = new V3(Math.cos(a) * 0.82, Math.sin(a) * 0.95 + 0.0, Math.cos(a) * 0.57 + 0.15).normalize();
    this.sunDir.copy(sd);
    var s = sd.y, pal = palette(s);
    var cl = this.cloudiness || 0;
    var grey = clamp(cl, 0, 1);
    function setC(c, arr) { c.setRGB(arr[0], arr[1], arr[2]); }
    var z = pal.z.slice(), h = pal.h.slice();
    var lum = function (v) { return 0.3 * v[0] + 0.59 * v[1] + 0.11 * v[2]; };
    if (grey > 0) { var gz = lum(z) * 1.3 + 0.03, gh = lum(h) * 1.1 + 0.02; for (var i = 0; i < 3; i++) { z[i] = mix(z[i], gz, grey * 0.55); h[i] = mix(h[i], gh, grey * 0.4); } }
    setC(this.skyU.uZenith.value, z); setC(this.skyU.uHorizon.value, h); setC(this.skyU.uSunCol.value, pal.c);
    this.skyU.uSunI.value = pal.i; this.night = 1 - smooth(-0.14, 0.02, s); this.skyU.uNight.value = this.night; this.skyU.uCloudy.value = grey;
    this.light = Math.max(0, smooth(-0.04, 0.2, s)) * (1 - 0.45 * grey);
    this.skyU.uSunDir.value.copy(sd);
    this.fogColor.setRGB(h[0], h[1], h[2]);
    this.scene.fog = this.scene.fog || new THREE.FogExp2(0xffffff, 0.00003);
    this.scene.fog.color.copy(this.fogColor); this.scene.fog.density = this.fogDensity;
    this.oceanU.uFogCol.value.copy(this.fogColor); this.oceanU.uFogD.value = this.fogDensity;
    this.cloudU.uFogCol.value.copy(this.fogColor); this.cloudU.uFogD.value = this.fogDensity; this.cloudU.uLight.value = Math.max(0.05, this.light);
    this.cloudU.uDark.value = grey * 0.8; this.oceanU.uLight.value = Math.max(0.03, this.light);
    // lights
    this.sun.color.setRGB(pal.c[0], pal.c[1], pal.c[2]); this.sun.intensity = 3.2 * pal.i * (1 - 0.6 * grey) * (s > -0.02 ? 1 : 0);
    this.hemi.color.setRGB(Math.pow(z[0], 0.6) * 1.1, Math.pow(z[1], 0.6) * 1.1, Math.pow(z[2], 0.6) * 1.1);
    this.hemi.groundColor.setRGB(0.12 + 0.2 * this.light, 0.1 + 0.15 * this.light, 0.07 + 0.08 * this.light);
    this.hemi.intensity = 0.28 + 0.9 * this.light + 0.2 * this.night;
    this.moon.position.copy(sd).multiplyScalar(-1); this.moon.intensity = 0.55 * this.night;
    this.exposureTarget = mix(0.95, 1.9, this.night) + (grey * 0.1);
    // lights glow
    var nt = this.night, lg = mix(0.35, 4.5, Math.max(nt, 1 - this.light) );
    this.lightMats.forEach(function (m) { m.color.setScalar(lg); });
    SK.airports.forEach(function (a) { if (a.glass) a.glass.emissiveIntensity = nt * 1.4; });
    this._needEnv = true;
  };

  W.setWeather = function (name) {
    this.weather = name;
    var P = { clear: { cover: 0.28, cl: 0, fog: 1 / 36000, wind: 4, turb: 0 }, cloudy: { cover: 0.78, cl: 0.7, fog: 1 / 22000, wind: 7, turb: 0.12 },
      windy: { cover: 0.5, cl: 0.25, fog: 1 / 30000, wind: 14, turb: 0.35 }, hazy: { cover: 0.35, cl: 0.2, fog: 1 / 8000, wind: 3, turb: 0.02 } }[name] || {};
    this.cloudCover = P.cover; this.cloudiness = P.cl; this.fogDensity = P.fog; this.windSpeed = P.wind; this.turb = P.turb;
    var wa = 240 * Math.PI / 180; this.wind.set(-Math.sin(wa) * P.wind * -1, 0, Math.cos(wa) * P.wind * -1);
    this.wind.set(Math.sin(wa) * P.wind, 0, -Math.cos(wa) * P.wind);
    this.oceanU.uWindAmt.value = clamp(P.wind / 14, 0.15, 1);
    this.setTime(this.time); this.updateClouds(this.camera.position, 0, true);
  };

  W.updateEnv = function (dt) {
    this._envT -= dt;
    if (this._needEnv && this._envT <= 0) {
      this._envT = 1.5; this._needEnv = false;
      if (SK.useHalf) {
        var rt = this.pmrem.fromScene(this.envScene, 0, 1, 2000);
        if (this._envRT) this._envRT.dispose();
        this._envRT = rt; this.scene.environment = rt.texture;
      } else {
        if (!this.cubeRT) {
          this.cubeRT = new THREE.WebGLCubeRenderTarget(64, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
          this.cubeCam = new THREE.CubeCamera(1, 3000, this.cubeRT);
        }
        this.cubeCam.update(this.renderer, this.envScene); this.scene.environment = this.cubeRT.texture;
      }
    }
  };

  W.windAt = function (p, out) {
    var t = SK.world_time || 0, amp = this.turb * this.windSpeed * 0.35 + 0;
    out.copy(this.wind);
    if (this.turb > 0) {
      var x = p.x * 0.004, z = p.z * 0.004;
      out.x += amp * (Math.sin(t * 0.7 + z) + Math.sin(t * 1.9 + x * 2.0) * 0.6);
      out.y += amp * (Math.sin(t * 1.3 + x) * Math.sin(t * 0.4 + z * 1.5) + Math.sin(t * 3.1) * 0.35) * 1.4;
      out.z += amp * (Math.sin(t * 0.9 + x) + Math.sin(t * 2.3 + z * 2.0) * 0.6);
    }
    return out;
  };
})();

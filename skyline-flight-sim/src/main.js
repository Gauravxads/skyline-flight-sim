// Game: renderer, input, modes, camera, effects, audio, menu wiring.
(function () {
  var V3 = THREE.Vector3, PI = Math.PI;
  function $(id) { return document.getElementById(id); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  // ---------- renderer / composer ----------
  var canvas = $('gl');
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(60, 1, 0.4, 140000);
  scene.add(camera);
  var world;
  var composer, bloom, grade, fxaa, pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75), qualityTimer = 0, avgDt = 0.016;
  var W = 1280, H = 720;
  var rtType = THREE.HalfFloatType;
  function probeType(T) {
    var rtA, rtB, ok = false;
    try {
      rtA = new THREE.WebGLRenderTarget(4, 4, { type: T, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      rtB = new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType });
      var sc = new THREE.Scene(), cm = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), vs = 'void main(){ gl_Position = vec4(position.xy, 0., 1.); }';
      var q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: 'void main(){ gl_FragColor = vec4(2.0, 1.0, 0.5, 1.0); }' })); sc.add(q);
      renderer.setRenderTarget(rtA); renderer.render(sc, cm);
      q.material = new THREE.ShaderMaterial({ uniforms: { t: { value: rtA.texture } }, vertexShader: vs, fragmentShader: 'uniform sampler2D t; void main(){ gl_FragColor = texture2D(t, vec2(0.5)) * 0.25; }' });
      renderer.setRenderTarget(rtB); renderer.render(sc, cm);
      var b = new Uint8Array(4); renderer.readRenderTargetPixels(rtB, 1, 1, 1, 1, b); ok = b[0] > 100 && b[0] < 160;
    } catch (e) { ok = false; }
    renderer.setRenderTarget(null); if (rtA) rtA.dispose(); if (rtB) rtB.dispose(); return ok;
  }
  function pickRTType() { var c = [THREE.HalfFloatType, THREE.FloatType]; for (var i = 0; i < c.length; i++) if (probeType(c[i])) return c[i]; return THREE.UnsignedByteType; }
  function makeRT(w, h) {
    var o = { type: rtType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
    var rt;
    try { rt = (renderer.capabilities.isWebGL2 && rtType === THREE.HalfFloatType && !window.__noMSAA) ? new THREE.WebGLMultisampleRenderTarget(w, h, o) : new THREE.WebGLRenderTarget(w, h, o); if (rt.samples !== undefined && rt.isWebGLMultisampleRenderTarget) rt.samples = 4; }
    catch (e) { rt = new THREE.WebGLRenderTarget(w, h, o); }
    return rt;
  }
  var GRADE = {
    uniforms: { tDiffuse: { value: null }, exposure: { value: 1 }, uTime: { value: 0 }, res: { value: new THREE.Vector2(1280, 720) }, vig: { value: 0.9 }, dim: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float exposure; uniform float uTime; uniform vec2 res; uniform float vig; uniform float dim; varying vec2 vUv;',
      'vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0., 1.); }',
      'float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }',
      'void main(){',
      '  vec2 q = vUv - 0.5; float r2 = dot(q,q);',
      '  vec2 off = q * r2 * 0.012;',
      '  vec3 c; c.r = texture2D(tDiffuse, vUv - off).r; c.g = texture2D(tDiffuse, vUv).g; c.b = texture2D(tDiffuse, vUv + off).b;',
      '  c = max(c, 0.0) * exposure;',
      '  c = aces(c);',
      '  float l = dot(c, vec3(0.299,0.587,0.114)); c = mix(vec3(l), c, 1.1);',
      '  c = pow(c, vec3(1.04));',
      '  c *= 1.0 - r2 * vig;',
      '  c *= 1.0 - dim;',
      '  c += (hh(vUv*res + fract(uTime)*100.) - 0.5) * 0.012;',
      '  gl_FragColor = vec4(pow(max(c,0.0), vec3(1.0/2.2)), 1.0);',
      '}'
    ].join('\n')
  };
  function buildComposer() {
    rtType = pickRTType(); window.__rtType = rtType;
    composer = new THREE.EffectComposer(renderer, makeRT(W, H));
    composer.addPass(new THREE.RenderPass(scene, camera));
    bloom = new THREE.UnrealBloomPass(new THREE.Vector2(W, H), 0.5, 0.75, 1.0);
    [bloom.renderTargetBright].concat(bloom.renderTargetsHorizontal, bloom.renderTargetsVertical).forEach(function (rt) { rt.texture.type = rtType; });
    composer.addPass(bloom);
    grade = new THREE.ShaderPass(GRADE); composer.addPass(grade);
    fxaa = new THREE.ShaderPass(THREE.FXAAShader); composer.addPass(fxaa);
  }
  function resize() {
    W = Math.max(320, window.innerWidth); H = Math.max(240, window.innerHeight);
    renderer.setPixelRatio(pixelRatio); renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    if (composer) { composer.setPixelRatio(pixelRatio); composer.setSize(W, H); fxaa.uniforms.resolution.value.set(1 / (W * pixelRatio), 1 / (H * pixelRatio)); grade.uniforms.res.value.set(W * pixelRatio, H * pixelRatio); }
    hud.resize(W, H, Math.min(window.devicePixelRatio || 1, 2));
    if (state === 'menu') applyMenuView();
  }
  var hud = new SK.HUD($('hud'));
  var state = 'boot', game = { ac: 'skylark', ap: 'CPT', dest: 'GRP', time: 17.5, weather: 'clear', start: 'runway', mission: 'free' };
  var flight = null, A = null, spec = null, acCache = {};
  var camMode = 0, camModes = ['chase', 'cockpit', 'orbit'], camLabels = ['CHASE', 'COCKPIT', 'ORBIT'];
  var look = { yaw: 0, pitch: 0, orbit: 0, zoom: 1, drag: false };
  var simTime = 0, acc = 0, paused = false, ended = false;
  var camQ = new THREE.Quaternion(), camPos = new V3(), camInit = false, shake = 0;
  var stats = { touchdowns: [], flown: 0 };

  // ---------- audio ----------
  var AU = { ctx: null, muted: false };
  AU.init = function () {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    var C = window.AudioContext || window.webkitAudioContext; if (!C) return; var c = this.ctx = new C();
    this.master = c.createGain(); this.master.gain.value = 0.5; this.master.connect(c.destination);
    var len = c.sampleRate * 2, nb = c.createBuffer(1, len, c.sampleRate), d = nb.getChannelData(0); for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    function noise() { var s = c.createBufferSource(); s.buffer = nb; s.loop = true; s.start(); return s; }
    this.wind = c.createGain(); this.wind.gain.value = 0; var wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 500; wf.Q.value = 0.4; noise().connect(wf); wf.connect(this.wind); this.wind.connect(this.master); this.windF = wf;
    this.eng = c.createGain(); this.eng.gain.value = 0; this.engF = c.createBiquadFilter(); this.engF.type = 'lowpass'; this.engF.frequency.value = 900;
    this.o1 = c.createOscillator(); this.o1.type = 'sawtooth'; this.o2 = c.createOscillator(); this.o2.type = 'square'; this.o1.connect(this.engF); this.o2.connect(this.engF); this.engF.connect(this.eng); this.eng.connect(this.master); this.o1.start(); this.o2.start();
    this.jet = c.createGain(); this.jet.gain.value = 0; this.jetF = c.createBiquadFilter(); this.jetF.type = 'lowpass'; this.jetF.frequency.value = 800; noise().connect(this.jetF); this.jetF.connect(this.jet); this.jet.connect(this.master);
    this.horn = c.createGain(); this.horn.gain.value = 0; var ho = c.createOscillator(); ho.type = 'square'; ho.frequency.value = 760; ho.connect(this.horn); this.horn.connect(this.master); ho.start();
    this.nb = nb;
  };
  AU.blip = function (freq, dur, vol, type) { if (!this.ctx || this.muted) return; var c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type || 'sine'; o.frequency.value = freq; g.gain.value = vol || 0.1; g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur); o.connect(g); g.connect(this.master); o.start(); o.stop(c.currentTime + dur); };
  AU.thud = function (v) { if (!this.ctx || this.muted) return; var c = this.ctx, s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter(); s.buffer = this.nb; f.type = 'lowpass'; f.frequency.value = 400 + v * 150; g.gain.value = clamp(0.15 + v * 0.12, 0, 0.9); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5 + v * 0.2); s.connect(f); f.connect(g); g.connect(this.master); s.start(); s.stop(c.currentTime + 1.4); };
  AU.update = function (f, sp, stallWarn, mode) {
    if (!this.ctx) return; var t = this.ctx.currentTime;
    this.master.gain.value = this.muted ? 0 : 0.5;
    if (!f) { this.eng.gain.setTargetAtTime(0, t, 0.1); this.jet.gain.setTargetAtTime(0, t, 0.1); this.wind.gain.setTargetAtTime(0, t, 0.1); this.horn.gain.setTargetAtTime(0, t, 0.05); return; }
    var th = f.thrEff, inside = mode === 1 ? 0.6 : 1.0;
    if (sp.type === 'prop') {
      var base = sp.id === 'atlas' ? 24 : 30; this.o1.frequency.setTargetAtTime(base + th * 48, t, 0.08); this.o2.frequency.setTargetAtTime((base + th * 48) * 0.5, t, 0.08);
      this.engF.frequency.setTargetAtTime(500 + th * 1100, t, 0.1); this.eng.gain.setTargetAtTime((0.05 + th * 0.12) * inside, t, 0.1); this.jet.gain.setTargetAtTime(0, t, 0.1);
    } else {
      this.jetF.frequency.setTargetAtTime(250 + th * 2600 + (f.ab ? 1500 : 0), t, 0.2); this.jet.gain.setTargetAtTime((0.04 + 0.35 * Math.pow(th, 1.3) + (f.ab ? 0.25 : 0)) * inside, t, 0.25);
      this.o1.frequency.setTargetAtTime(48 + th * 30, t, 0.2); this.o2.frequency.setTargetAtTime(24 + th * 15, t, 0.2); this.engF.frequency.setTargetAtTime(160, t, 0.1); this.eng.gain.setTargetAtTime(0.05 + th * 0.08, t, 0.2);
    }
    this.wind.gain.setTargetAtTime(Math.pow(clamp(f.V / 110, 0, 1), 1.6) * 0.22 * (mode === 1 ? 0.7 : 1), t, 0.2); this.windF.frequency.setTargetAtTime(300 + f.V * 7, t, 0.2);
    this.horn.gain.setTargetAtTime(stallWarn && Math.sin(t * 24) > 0 ? 0.06 : 0, t, 0.01);
  };

  // ---------- fx ----------
  var fx = [], glow;
  function fxSpawn(kind, pos, vel, life, size0, size1, col, op) {
    var m = new THREE.SpriteMaterial({ map: glow, color: col, transparent: true, depthWrite: false, blending: kind === 'fire' ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: op, fog: kind !== 'fire' });
    var s = new THREE.Sprite(m); s.position.copy(pos); s.scale.set(size0, size0, 1); scene.add(s);
    fx.push({ s: s, v: vel, life: life, t: life, s0: size0, s1: size1, op: op, kind: kind });
  }
  function fxUpdate(dt) {
    for (var i = fx.length - 1; i >= 0; i--) {
      var p = fx[i]; p.t -= dt; if (p.t <= 0) { scene.remove(p.s); p.s.material.dispose(); fx.splice(i, 1); continue; }
      var k = 1 - p.t / p.life; p.s.position.addScaledVector(p.v, dt); if (p.kind === 'smoke') p.v.y += 3 * dt; p.v.multiplyScalar(p.kind === 'fire' ? 0.96 : 0.99);
      var sz = lerp(p.s0, p.s1, Math.sqrt(k)); p.s.scale.set(sz, sz, 1); p.s.material.opacity = p.op * (1 - k) * (k < 0.05 ? k / 0.05 : 1);
    }
  }
  function explode(pos) {
    for (var i = 0; i < 26; i++) { var v = new V3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(8 + Math.random() * 38); fxSpawn('fire', pos.clone(), v, 0.8 + Math.random() * 1.2, 8, 36 + Math.random() * 30, new THREE.Color(5, 2 + Math.random() * 1.4, 0.4), 0.9); }
    for (var j = 0; j < 22; j++) { var v2 = new V3(Math.random() - 0.5, 0.2 + Math.random(), Math.random() - 0.5).normalize().multiplyScalar(5 + Math.random() * 18); fxSpawn('smoke', pos.clone(), v2, 5 + Math.random() * 6, 14, 90 + Math.random() * 60, new THREE.Color(0.06, 0.06, 0.065), 0.75); }
  }

  // ---------- input ----------
  var keys = {}, ctrlIn = { pitch: 0, roll: 0, yaw: 0 }, pad = null;
  window.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) && e.key !== 'Escape') return;
    var k = e.code; if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].indexOf(k) >= 0 && state !== 'menu') e.preventDefault();
    if (keys[k]) return; keys[k] = true;
    if (state !== 'flying' && state !== 'paused') { if (k === 'Enter' && state === 'menu') startGame(game.mission); return; }
    if (k === 'Escape') { if (!ended) setPause(!paused); return; }
    if (k === 'KeyP') { setPause(!paused); return; }
    if (paused || ended) return;
    var c = flight.ctl;
    if (k === 'KeyG') { c.gear = c.gear > 0.5 ? 0 : 1; hud.toast(c.gear ? 'GEAR DOWN' : 'GEAR UP', '#FFC36B', 1.6); AU.blip(300, 0.3, 0.08, 'triangle'); }
    if (k === 'KeyF') { c.flaps = Math.min(3, Math.round(c.flaps) + 1); hud.toast('FLAPS ' + ['0', '10', '20', '30'][c.flaps], '#FFC36B', 1.4); AU.blip(500, 0.15, 0.06, 'triangle'); }
    if (k === 'KeyV') { c.flaps = Math.max(0, Math.round(c.flaps) - 1); hud.toast('FLAPS ' + ['0', '10', '20', '30'][c.flaps], '#FFC36B', 1.4); AU.blip(450, 0.15, 0.06, 'triangle'); }
    if (k === 'KeyC') { camMode = (camMode + 1) % 3; look.yaw = look.pitch = 0; applyCamMode(); }
    if (k === 'KeyH') hud.show = !hud.show;
    if (k === 'KeyM') { AU.muted = !AU.muted; hud.toast(AU.muted ? 'SOUND OFF' : 'SOUND ON', '#8CF2C4', 1.2); }
    if (k === 'KeyY') { c.assist = !c.assist; hud.toast(c.assist ? 'FLIGHT ASSIST ON' : 'FLIGHT ASSIST OFF', '#8CF2C4', 1.6); }
    if (k === 'KeyR') { startGame(game.mission); }
    if (k === 'KeyZ') c.thr = 0; if (k === 'KeyX') c.thr = 1;
    if (k.indexOf('Digit') === 0) { var n = parseInt(k.slice(5), 10); c.thr = n === 0 ? 1 : n / 10; }
    if (k === 'BracketRight' || k === 'Period') c.trim = clamp(c.trim + 0.04, -1, 1);
    if (k === 'BracketLeft' || k === 'Comma') c.trim = clamp(c.trim - 0.04, -1, 1);
  });
  window.addEventListener('keyup', function (e) { keys[e.code] = false; });
  window.addEventListener('blur', function () { keys = {}; });
  canvas.addEventListener('pointerdown', function (e) { look.drag = true; look.lx = e.clientX; look.ly = e.clientY; canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', function (e) {
    if (!look.drag) return; var dx = e.clientX - look.lx, dy = e.clientY - look.ly; look.lx = e.clientX; look.ly = e.clientY;
    if (camMode === 1) { look.yaw = clamp(look.yaw - dx * 0.005, -2.4, 2.4); look.pitch = clamp(look.pitch - dy * 0.005, -1.0, 1.0); }
    else { look.orbit -= dx * 0.005; look.pitch = clamp(look.pitch + dy * 0.004, -0.6, 1.2); }
  });
  canvas.addEventListener('pointerup', function () { look.drag = false; });
  canvas.addEventListener('wheel', function (e) { look.zoom = clamp(look.zoom * (1 + Math.sign(e.deltaY) * 0.08), 0.5, 2.5); e.preventDefault(); }, { passive: false });

  // ---------- touch controls ----------
  var isTouch = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || 'ontouchstart' in window;
  var touch = { x: 0, y: 0, thr: null, shown: false };
  (function () {
    if (!isTouch) return;
    var root = $('touch'), stick = $('stick'), knob = $('knob'), thr = $('thr'), sid = null;
    function setStick(e) {
      var r = stick.getBoundingClientRect(), R = r.width / 2, dx = (e.clientX - (r.left + R)) / R, dy = (e.clientY - (r.top + R)) / R, l = Math.sqrt(dx * dx + dy * dy);
      if (l > 1) { dx /= l; dy /= l; }
      touch.x = dx; touch.y = dy; knob.style.transform = 'translate(' + dx * R * 0.62 + 'px,' + dy * R * 0.62 + 'px)';
    }
    stick.addEventListener('pointerdown', function (e) { sid = e.pointerId; try { stick.setPointerCapture(sid); } catch (_) {} setStick(e); e.preventDefault(); });
    stick.addEventListener('pointermove', function (e) { if (e.pointerId === sid) setStick(e); });
    function endStick(e) { if (e.pointerId !== sid) return; sid = null; touch.x = touch.y = 0; knob.style.transform = ''; }
    stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);
    var tid = null;
    function setThr(e) { var r = thr.getBoundingClientRect(); touch.thr = clamp(1 - (e.clientY - r.top) / r.height, 0, 1); }
    thr.addEventListener('pointerdown', function (e) { tid = e.pointerId; try { thr.setPointerCapture(tid); } catch (_) {} setThr(e); e.preventDefault(); });
    thr.addEventListener('pointermove', function (e) { if (e.pointerId === tid) setThr(e); });
    function endThr(e) { if (e.pointerId === tid) { tid = null; touch.thr = null; } }
    thr.addEventListener('pointerup', endThr); thr.addEventListener('pointercancel', endThr);
    Array.prototype.forEach.call(root.querySelectorAll('#tbtns button'), function (b) {
      var code = b.getAttribute('data-k'), hold = !!b.getAttribute('data-hold');
      b.addEventListener('pointerdown', function (e) {
        e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) {} b.classList.add('on');
        if (hold) keys[code] = true; else { window.dispatchEvent(new KeyboardEvent('keydown', { code: code })); window.dispatchEvent(new KeyboardEvent('keyup', { code: code })); }
      });
      function up() { b.classList.remove('on'); if (hold) keys[code] = false; }
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    });
  })();
  if (isTouch) { var hn = document.querySelector('#menu .hint'); if (hn) hn.textContent = 'Touch: left stick pitch and roll, right slider throttle, buttons for gear, flaps, brake, rudder. Drag the view to look around. Landscape works best.'; }
  function updateTouchUI() {
    if (!isTouch) return;
    var show = state === 'flying' && !paused && !ended;
    if (show !== touch.shown) { touch.shown = show; $('touch').classList.toggle('hidden', !show); }
    if (show && flight) $('thrfill').style.height = (flight.ctl.thr * 100) + '%';
  }
  function slew(cur, target, dt, up, down) { var r = (Math.abs(target) > Math.abs(cur) || Math.sign(target) !== Math.sign(cur)) ? up : down; var d = target - cur, m = r * dt; return Math.abs(d) < m ? target : cur + Math.sign(d) * m; }
  function readInput(dt) {
    var c = flight.ctl, tp = 0, tr = 0, ty = 0;
    if (keys.KeyS || keys.ArrowDown) tp += 1; if (keys.KeyW || keys.ArrowUp) tp -= 1;
    if (keys.KeyD || keys.ArrowRight) tr += 1; if (keys.KeyA || keys.ArrowLeft) tr -= 1;
    if (keys.KeyE) ty += 1; if (keys.KeyQ) ty -= 1;
    var gp = navigator.getGamepads ? navigator.getGamepads()[0] : null, usePad = false;
    if (gp) {
      var ax = gp.axes, dz = function (v) { return Math.abs(v) < 0.1 ? 0 : (v - Math.sign(v) * 0.1) / 0.9; };
      var gr = dz(ax[0] || 0), gpch = dz(ax[1] || 0), gy = dz(ax[2] || 0);
      if (gr || gpch || gy) { usePad = true; tr = gr; tp = gpch; ty = gy; }
      var rt = gp.buttons[7] ? gp.buttons[7].value : 0, lt = gp.buttons[6] ? gp.buttons[6].value : 0;
      c.thr = clamp(c.thr + (rt - lt) * dt * 0.6, 0, 1);
      if (gp.buttons[0] && gp.buttons[0].pressed && !pad.a) { c.gear = c.gear > 0.5 ? 0 : 1; } if (gp.buttons[1] && gp.buttons[1].pressed && !pad.b) { c.flaps = (Math.round(c.flaps) + 1) % 4; }
      pad = { a: gp.buttons[0] && gp.buttons[0].pressed, b: gp.buttons[1] && gp.buttons[1].pressed };
      c.brake = Math.max(c.brake, gp.buttons[5] && gp.buttons[5].pressed ? 1 : 0);
    } else pad = { a: false, b: false };
    if (touch.x * touch.x + touch.y * touch.y > 0.006) { var cv = function (v) { return Math.sign(v) * Math.pow(Math.abs(v), 1.25); }; usePad = true; tr = cv(touch.x); tp = cv(touch.y); }
    if (touch.thr !== null) c.thr = touch.thr;
    if (usePad) { c.pitch = tp; c.roll = tr; c.yaw = ty; }
    else { c.pitch = slew(c.pitch, tp, dt, 2.4, 3.2); c.roll = slew(c.roll, tr, dt, 3.0, 4.5); c.yaw = slew(c.yaw, ty, dt, 3.0, 4.0); }
    if (keys.ShiftLeft || keys.ShiftRight) c.thr = clamp(c.thr + dt * 0.45, 0, 1);
    if (keys.ControlLeft || keys.ControlRight) c.thr = clamp(c.thr - dt * 0.45, 0, 1);
    var brk = (keys.KeyB || keys.Space) ? 1 : 0; if (flight.parking) { if (c.thr > 0.12 || brk) flight.parking = false; else brk = 1; }
    c.brake = brk || (gp && gp.buttons[5] && gp.buttons[5].pressed ? 1 : 0); c.airbrake = keys.KeyX && false ? 1 : 0;
  }

  // ---------- helpers ----------
  function airportById(id) { for (var i = 0; i < SK.airports.length; i++) if (SK.airports[i].id === id) return SK.airports[i]; }
  function getAircraft(id) { if (!acCache[id]) acCache[id] = SK.buildAircraft(id, glow); return acCache[id]; }
  function cgHeight(sp) { var m = 0; sp.contacts.forEach(function (c) { if (c.gear) m = Math.max(m, -c.p[1]); }); return m; }
  function heading(f) { var fw = new V3(0, 0, -1).applyQuaternion(f.q); return Math.atan2(fw.x, -fw.z) * 180 / PI; }
  function runwayState(x, z) {
    for (var i = 0; i < SK.airports.length; i++) {
      var a = SK.airports[i], px = x - a.x, pz = z - a.z, along = px * a.dx + pz * a.dz, across = -px * a.dz + pz * a.dx;
      if (Math.abs(along) < a.len / 2 + 30 && Math.abs(across) < a.wid / 2 + 14) return { a: a, along: along, across: across };
    }
    return null;
  }
  function trimFor(f, V) {
    var s = f.spec, q = 0.5 * 1.225 * Math.exp(-f.p.y / 9300) * V * V, CL = f.mass * 9.81 / (q * s.S), alpha = (CL / 1.0 - s.CL0) / s.CLa;
    f.ctl.trim = clamp(-s.Cma * alpha / (s.Cmde * (0.35 + 0.65 * smoothstep(8, 35, V))), -1, 1);
  }

  // ---------- missions ----------
  var mission = { type: 'free', rings: [], ringIdx: 0, t0: 0, time: 0, target: null, lesson: 0, lessonT: 0, beacon: null };
  var ringGroup = new THREE.Group(); scene.add(ringGroup);
  var beacon = null;
  function clearMission() {
    while (ringGroup.children.length) { var o = ringGroup.children.pop(); o.geometry && o.geometry.dispose(); }
    if (beacon) { scene.remove(beacon); beacon = null; }
    mission = { type: game.mission, rings: [], ringIdx: 0, t0: 0, time: 0, target: null, lesson: 0, lessonT: 0, done: false };
  }
  function makeBeacon(a) {
    var g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.8, 2.2), transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    var cyl = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 1800, 16, 1, true), mat); cyl.position.y = 900; g.add(cyl);
    g.position.set(a.x, a.elev, a.z); g.userData.mat = mat; scene.add(g); return g;
  }
  function genRings(a) {
    var rings = [], x = a.x - a.dx * 3500, z = a.z - a.dz * 3500, hd = a.hdg * PI / 180, alt = Math.max(a.elev, 0) + 360, rnd = Math.random;
    for (var i = 0; i < 14; i++) {
      hd += (rnd() - 0.5) * 1.1; var d = 1100 + rnd() * 800; x += Math.sin(hd) * d; z -= Math.cos(hd) * d;
      var gh = Math.max(0, SK.terrainH(x, z)); alt = clamp(alt + (rnd() - 0.45) * 220, gh + 110, gh + 520); alt = Math.max(alt, 140);
      var dir = new V3(Math.sin(hd), 0, -Math.cos(hd)); rings.push({ pos: new V3(x, alt, z), dir: dir, got: false, mesh: null });
    }
    rings.forEach(function (r, i) {
      var m = new THREE.Mesh(new THREE.TorusGeometry(42, 3.4, 12, 56), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.4, 0.3), fog: true }));
      m.position.copy(r.pos); m.lookAt(r.pos.clone().add(r.dir)); r.mesh = m; ringGroup.add(m);
    });
    return rings;
  }
  var LESSONS = [
    { title: 'Roll', text: 'Hold B off, push throttle up with SHIFT. Reach 30 kt.', test: function (c) { return c.f.groundSpeed > 15; } },
    { title: 'Take off', text: 'At rotation speed, pull back gently with S. Leave the runway.', test: function (c) { return c.agl > 25 && !c.f.onGround; } },
    { title: 'Climb', text: 'Climb to 1,000 ft above ground. Raise the gear with G.', test: function (c) { return c.agl > 300 && c.f.ctl.gear < 0.5; } },
    { title: 'Level off', text: 'Hold your altitude within 100 ft for 8 seconds. Ease the nose down, trim with [ and ].', test: function (c, L) { var d = Math.abs(c.f.p.y - L.ref); if (L.ref === undefined || d > 30) { L.ref = c.f.p.y; L.t = 0; } else L.t += c.dt; return L.t > 8 && c.agl > 250; } },
    { title: 'Turn', text: 'Turn right 90 degrees with D. Keep the ball centred and altitude steady.', test: function (c, L) { if (L.h0 === undefined) L.h0 = c.hdg; var d = ((c.hdg - L.h0 + 540) % 360) - 180; return d > 80 && d < 180; } },
    { title: 'Stall recovery', text: 'Cut throttle (Z), pull back until the horn sounds and the nose drops. Then lower the nose, add power (X).', test: function (c, L) { if (c.f.stalled > 0.3) L.stalled = true; return L.stalled && c.f.stalled === 0 && c.ias > c.sp.vstall * 1.9438 * 1.25 && c.f.thrEff > 0.5; } },
    { title: 'Land', text: 'Fly back to the cyan beacon. Gear down, flaps 20, speed about 1.3 x stall. Touch down on the markings.', test: function (c) { return false; }, landing: true }
  ];

  // ---------- game start ----------
  function startGame(type) {
    AU.init(); game.mission = type; ended = false; paused = false;
    $('menu').classList.add('hidden'); $('end').classList.add('hidden'); $('pause').classList.add('hidden'); $('loading').classList.remove('hidden'); $('loadmsg').textContent = 'Preparing the runway';
    setTimeout(function () {
      var sp = SK.AIRCRAFT[game.ac]; spec = sp; var ap = airportById(game.ap);
      if (A) scene.remove(A.group); A = getAircraft(game.ac); scene.add(A.group);
      Object.keys(acCache).forEach(function (k) { acCache[k].group.visible = acCache[k] === A; });
      A.cockpit.visible = false; if (A.cockpit.parent !== A.group) A.group.add(A.cockpit);
      clearMission(); mission.type = type;
      flight = new SK.Flight(sp); flight.parking = false;
      var startAir = game.start === 'air' || type === 'rings';
      world.setWeather(game.weather); world.setTime(game.time);
      if (startAir) {
        var p = new V3(ap.x - ap.dx * 3800, Math.max(ap.elev, 0) + (type === 'rings' ? 380 : 650), ap.z - ap.dz * 3800);
        var V = sp.vcruise * (sp.type === 'jet' ? 0.75 : 0.85);
        flight.place(p, ap.hdg, V, 0); flight.ctl.thr = sp.type === 'jet' ? 0.55 : 0.62; flight.thrEff = flight.ctl.thr; flight.ctl.gear = 0; flight.gearPos = 0; trimFor(flight, V);
      } else {
        var rp = new V3(ap.x - ap.dx * (ap.len / 2 - 70), ap.elev + cgHeight(sp) + 0.02, ap.z - ap.dz * (ap.len / 2 - 70));
        flight.place(rp, ap.hdg, 0, 0); flight.parking = true; flight.ctl.brake = 1;
      }
      var pos = flight.p; world.updateTerrain(pos, 0, true); world.updateClouds(pos, 0, true);
      if (type === 'landing') { var d = airportById(game.dest === game.ap ? SK.airports.filter(function (x) { return x.id !== game.ap; })[0].id : game.dest); mission.target = d; beacon = makeBeacon(d); }
      if (type === 'rings') { mission.rings = genRings(ap); }
      if (type === 'school') { game.start = 'runway'; if (startAir) { } }
      hud.toast(type === 'free' ? 'CLEAR SKIES' : type === 'landing' ? 'FLY TO ' + mission.target.name.toUpperCase() : type === 'rings' ? 'FLY THROUGH THE RINGS' : 'FLIGHT SCHOOL', '#8CF2C4', 3);
      state = 'flying'; camMode = 0; look.yaw = look.pitch = look.orbit = 0; look.zoom = 1; camInit = false; applyCamMode(); camera.clearViewOffset(); camera.updateProjectionMatrix();
      flight.touchState = false; mission.lastGround = flight.onGround; mission.touchReady = false; hud.toasts.length = 0; stats.landedMsg = false; simTime = 0; acc = 0;
      $('loading').classList.add('hidden'); hud.show = true; document.body.classList.add('playing');
      hud.updateMini(flight.p.x, flight.p.z); hud.miniT = 0;
    }, 60);
  }
  function applyCamMode() { camera.fov = camMode === 1 ? 78 : 60; camera.near = camMode === 1 ? 0.15 : 1.0; camera.updateProjectionMatrix(); if (A) A.cockpit.visible = camMode === 1; }
  function setPause(p) { if (state !== 'flying' && state !== 'paused') return; paused = p; state = p ? 'paused' : 'flying'; $('pause').classList.toggle('hidden', !p); if (p) hud.toast('', '#fff', 0.01); }
  function endGame(kind, title, lines, grade) {
    ended = true; $('end').classList.remove('hidden'); $('endkicker').textContent = kind; $('endtitle').textContent = title; $('endgrade').textContent = grade || '';
    $('endgrade').className = grade ? 'grade g' + grade.charAt(0) : 'hidden'; $('endlines').innerHTML = lines.map(function (l) { return '<li><span>' + l[0] + '</span><b>' + l[1] + '</b></li>'; }).join('');
    $('endcont').classList.toggle('hidden', kind === 'CRASHED');
  }
  function toMenu() { state = 'menu'; ended = false; paused = false; $('end').classList.add('hidden'); $('pause').classList.add('hidden'); $('menu').classList.remove('hidden'); document.body.classList.remove('playing'); clearMission(); setupMenuScene(); }

  // ---------- touchdown evaluation ----------
  function onTouchdown(f) {
    var sink = Math.abs(f.lastVn || 0), rs = runwayState(f.p.x, f.p.z), ias = f.V * Math.sqrt(f.rho / 1.225) * 1.9438;
    var res = { sink: sink, rs: rs, ias: ias, off: rs ? Math.abs(rs.across) : 99, gear: f.gearPos > 0.9 };
    var grade = !rs ? 'D' : sink < 1.2 && res.off < 6 ? 'A' : sink < 2.4 && res.off < 12 ? 'B' : sink < 3.8 ? 'C' : 'D';
    res.grade = grade;
    if (mission.touch === undefined || !mission.touch) { mission.touch = res; }
    var msg = !rs ? 'OFF RUNWAY' : (sink < 1.2 ? 'BUTTER' : sink < 2.4 ? 'SMOOTH' : sink < 3.8 ? 'FIRM' : 'HARD') + ' TOUCHDOWN  ' + sink.toFixed(1) + ' M/S';
    hud.toast(msg, grade === 'A' || grade === 'B' ? '#8CF2C4' : grade === 'C' ? '#FFC36B' : '#FF6B5B', 3.5);
    AU.thud(sink);
    // tire smoke
    for (var i = 0; i < 6; i++) { var pp = f.p.clone(); pp.y -= 1.2; fxSpawn('smoke', pp.add(new V3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3)), new V3((Math.random() - 0.5) * 2, 0.4 + Math.random(), (Math.random() - 0.5) * 2), 2.5, 3, 14 + sink * 2, new THREE.Color(0.8, 0.8, 0.8), 0.55); }
  }

  // ---------- menu scene ----------
  function applyMenuView() {
    var w = W, h = H; if (w > 900) camera.setViewOffset(w, h, -w * 0.17, 0, w, h); else camera.clearViewOffset(); camera.updateProjectionMatrix();
  }
  function setupMenuScene() {
    var sp = SK.AIRCRAFT[game.ac], ap = airportById(game.ap);
    if (A) scene.remove(A.group); A = getAircraft(game.ac); scene.add(A.group); Object.keys(acCache).forEach(function (k) { acCache[k].group.visible = acCache[k] === A; });
    A.cockpit.visible = false; if (A.cockpit.parent !== A.group) A.group.add(A.cockpit);
    spec = sp; flight = new SK.Flight(sp); var rp = new V3(ap.x - ap.dx * (ap.len / 2 - 90) + ap.dz * 0 + ap.dx * 0, ap.elev + cgHeight(sp), ap.z - ap.dz * (ap.len / 2 - 90));
    flight.place(rp, ap.hdg, 0, 0); flight.p.copy(rp); flight.gearPos = 1; flight.thrEff = 0.18; flight.menu = true;
    world.setWeather(game.weather); world.setTime(game.time); world.updateTerrain(rp, 0, true); world.updateClouds(rp, 0, true);
    camera.fov = 42; camera.near = 0.5; camera.updateProjectionMatrix(); applyMenuView(); menuAz = 0.9 + Math.random() * 0.4; document.querySelector('#acstat').textContent = acStat(sp);
    $('menu').classList.remove('hidden'); hud.show = false;
  }
  var menuAz = 1;
  function acStat(sp) { return sp.name.toUpperCase() + ' / ' + (sp.type === 'jet' ? 'TWIN JET' : sp.id === 'atlas' ? 'TWIN TURBOPROP' : 'SINGLE PROP') + ' / ' + Math.round(sp.vcruise * 1.944) + ' KT CRUISE / ' + (sp.id === 'skylark' ? 'FORGIVING' : sp.id === 'falcon' ? 'DEMANDING' : 'HEAVY'); }

  // ---------- camera ----------
  var tmpV = new V3(), tmpQ = new THREE.Quaternion();
  function updateCamera(dt) {
    var f = flight, mode = state === 'menu' ? 3 : camMode;
    if (state !== 'menu' && ended && f.crashed) mode = 2;
    if (mode === 3) { menuAz += dt * 0.12; var d = A.chase * 0.95; camera.position.set(f.p.x + Math.sin(menuAz) * d, f.p.y + A.chase * 0.18, f.p.z + Math.cos(menuAz) * d * 0.9); camera.lookAt(f.p.x, f.p.y + 0.6, f.p.z); return; }
    if (mode === 1) {
      camera.position.copy(A.eye).applyQuaternion(f.q).add(f.p);
      var qq = f.q.clone(); var e = new THREE.Euler(look.pitch, look.yaw, 0, 'YXZ'); qq.multiply(tmpQ.setFromEuler(e)); camera.quaternion.copy(qq);
      var sh = shake * 0.02; camera.position.x += (Math.random() - 0.5) * sh; camera.position.y += (Math.random() - 0.5) * sh;
      return;
    }
    if (!camInit) { camQ.copy(f.q); camInit = true; }
    var rate = mode === 2 ? 0.0 : 1 - Math.exp(-dt * 3.2);
    var fl = flight.q.clone(); camQ.slerp(fl, rate || 1);
    // keep camera yaw-follows but limit roll follow for comfort
    var fw = new V3(0, 0, -1).applyQuaternion(camQ), yaw = Math.atan2(fw.x, -fw.z), pit = Math.asin(clamp(fw.y, -1, 1));
    var dist = A.chase * look.zoom, offY = A.chase * 0.2;
    var az = mode === 2 ? look.orbit + simTime * 0.15 : look.orbit;
    var baseQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(pit * 0.5 + look.pitch * 0.5 * (mode === 2 ? 0 : 1), -yaw + az, 0, 'YXZ'));
    if (mode === 2) { var el = 0.18 + look.pitch * 0.5; camera.position.set(f.p.x + Math.sin(az) * dist * 0.8, f.p.y + dist * el + 2, f.p.z + Math.cos(az) * dist * 0.8); camera.lookAt(f.p); return; }
    var off = new V3(0, offY, dist).applyQuaternion(baseQ); var target = f.p.clone().add(off);
    camera.position.lerp(target, camInit && camPos.lengthSq() > 0 ? 1 - Math.exp(-dt * 14) : 1); camPos.copy(camera.position);
    var gh = Math.max(0, SK.terrainH(camera.position.x, camera.position.z)) + 3; if (camera.position.y < gh) camera.position.y = gh;
    var look0 = f.p.clone().add(new V3(0, A.chase * 0.04, -A.chase * 0.3).applyQuaternion(camQ));
    camera.lookAt(look0);
    if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.05; camera.position.y += (Math.random() - 0.5) * shake * 0.05; }
  }

  // ---------- main update ----------
  var contrailT = 0, lastFlag = { stall: false }, S = {}, envSim, time2 = 0;
  function simulate(dt) {
    var f = flight;
    readInput(dt);
    var h = 1 / 120; acc += dt; var steps = 0;
    while (acc >= h && steps < 12) { simTime += h; SK.world_time = simTime; envSim.time = simTime; envSim.turb = world.turb; f.step(h, envSim); acc -= h; steps++; }
    if (acc > h * 12) acc = 0;
    // touchdown detection
    var wasG = mission.lastGround, nowG = f.wheelsOn > 0 && f.agl < 6;
    if (nowG && !wasG && !f.crashed && mission.touchReady) { onTouchdown(f); mission.touchReady = false; }
    if (!f.wheelsOn && f.agl > 3) mission.touchReady = true;
    mission.lastGround = nowG;
    shake = clamp((f.stalled * 1.5 + world.turb * 2 + (f.onGround ? f.groundSpeed / 80 : 0) + Math.max(0, f.nz - 3) * 0.6 + (f.ab ? 0.4 : 0)) * 2, 0, 4);
    // crash
    if (f.crashed && !ended) {
      explode(f.p.clone()); AU.thud(10); A.group.visible = false; hud.toast('', '#fff', 0.01);
      setTimeout(function () { if (state === 'flying') endGame('CRASHED', f.crashReason || 'Crashed', [['Flight time', fmtT(simTime)], ['Speed at impact', Math.round(f.V * 1.944) + ' kt']], null); }, 1800); ended = true;
      $('end').classList.add('hidden');
    }
    // mission logic
    var agl = Math.max(0, f.agl), ias = f.V * Math.sqrt(f.rho / 1.225) * 1.9438, hd = (heading(f) + 360) % 360;
    S.target = null; S.objective = null;
    if (mission.type === 'landing' && mission.target) {
      var t = mission.target, dx = t.x - f.p.x, dz = t.z - f.p.z, dist = Math.hypot(dx, dz), br = (Math.atan2(dx, -dz) * 180 / PI + 360) % 360;
      S.target = { x: t.x, z: t.z, bearing: br, dist: dist };
      S.objective = { label: 'OBJECTIVE', title: 'Land at ' + t.name + ' RWY ' + pad2(Math.round(((t.hdg / 10) % 36) || 36)), lines: ['DIST ' + (dist / 1852).toFixed(1) + ' NM  BRG ' + Math.round(br), 'ELEV ' + Math.round(t.elev * 3.281) + ' FT'] };
      if (beacon) beacon.userData.mat.opacity = 0.1 + 0.12 * (0.5 + 0.5 * Math.sin(simTime * 3));
      var rs = runwayState(f.p.x, f.p.z);
      if (!mission.done && f.wheelsOn > 0 && rs && rs.a === t && f.groundSpeed < 6 && mission.touch) {
        mission.done = true; var tt = mission.touch; ended = true;
        setTimeout(function () { endGame('MISSION COMPLETE', 'Landed at ' + t.name, [['Sink rate', tt.sink.toFixed(1) + ' m/s'], ['Off centreline', tt.off.toFixed(0) + ' m'], ['Touchdown speed', Math.round(tt.ias) + ' kt'], ['Flight time', fmtT(simTime)]], tt.grade + (tt.grade === 'A' ? '+' : '')); }, 800);
      }
    } else if (mission.type === 'rings') {
      var R = mission.rings, nxt = null; for (var i = 0; i < R.length; i++) if (!R[i].got) { nxt = R[i]; break; }
      R.forEach(function (r, idx) { r.mesh.visible = !r.got && (idx - (nxt ? R.indexOf(nxt) : 0)) < 4; var cur = r === nxt; r.mesh.material.color.setRGB(cur ? 0.4 : 3.2, cur ? 3.2 : 1.1, cur ? 2.4 : 0.2); r.mesh.scale.setScalar(cur ? 1.0 + 0.04 * Math.sin(simTime * 6) : 0.85); });
      if (nxt) {
        var rel = f.p.clone().sub(nxt.pos), sd = rel.dot(nxt.dir), prev = nxt.prevSd;
        if (prev !== undefined && prev < 0 && sd >= 0 && Math.hypot(rel.x - nxt.dir.x * sd, rel.y - nxt.dir.y * sd, rel.z - nxt.dir.z * sd) < 46) {
          nxt.got = true; mission.ringIdx++; if (!mission.t0) mission.t0 = simTime; hud.toast('RING ' + mission.ringIdx + ' / ' + R.length, '#8CF2C4', 1.5); AU.blip(880, 0.25, 0.1, 'triangle');
        }
        nxt.prevSd = sd;
        var dxr = nxt.pos.x - f.p.x, dzr = nxt.pos.z - f.p.z; S.target = { x: nxt.pos.x, z: nxt.pos.z, bearing: (Math.atan2(dxr, -dzr) * 180 / PI + 360) % 360, dist: Math.hypot(dxr, dzr) };
        S.objective = { label: 'RING RUN', title: 'Ring ' + (mission.ringIdx + 1) + ' of ' + R.length, lines: ['DIST ' + Math.round(S.target.dist) + ' M  BRG ' + Math.round(S.target.bearing), 'TIME ' + (mission.t0 ? fmtT(simTime - mission.t0) : 'READY')] };
      } else if (!mission.done) {
        mission.done = true; ended = true; var tm = simTime - mission.t0; var grd = tm < 150 ? 'A' : tm < 200 ? 'B' : tm < 280 ? 'C' : 'D';
        setTimeout(function () { endGame('RING RUN COMPLETE', 'All ' + R.length + ' rings', [['Time', fmtT(tm)], ['Aircraft', spec.name]], grd); }, 600);
      }
    } else if (mission.type === 'school') {
      var L = LESSONS[mission.lesson];
      if (L) {
        mission.lessonState = mission.lessonState || {}; if (L.landing && !mission.target) { mission.target = airportById('CPT'); beacon = makeBeacon(mission.target); }
        if (L.landing) { var tt2 = mission.target, dx2 = tt2.x - f.p.x, dz2 = tt2.z - f.p.z; S.target = { x: tt2.x, z: tt2.z, bearing: (Math.atan2(dx2, -dz2) * 180 / PI + 360) % 360, dist: Math.hypot(dx2, dz2) }; var rs2 = runwayState(f.p.x, f.p.z); if (!mission.done && f.wheelsOn > 0 && rs2 && f.groundSpeed < 6 && mission.touch) { mission.done = true; ended = true; var t3 = mission.touch; setTimeout(function () { endGame('FLIGHT SCHOOL', 'Course complete', [['Landing sink rate', t3.sink.toFixed(1) + ' m/s'], ['Off centreline', t3.off.toFixed(0) + ' m'], ['Lessons', LESSONS.length + ' / ' + LESSONS.length]], t3.grade); }, 800); } }
        else if (L.test({ f: f, agl: agl, ias: ias, hdg: hd, dt: dt, sp: spec }, mission.lessonState)) { mission.lesson++; mission.lessonState = {}; hud.toast('LESSON COMPLETE', '#8CF2C4', 2); AU.blip(660, 0.2, 0.1, 'triangle'); }
        S.objective = { label: 'LESSON ' + (mission.lesson + 1) + ' / ' + LESSONS.length, title: L.title, lines: wrap(L.text, 38) };
      }
    }
    // landing result tip for free mode handled by toast
    S.hdg = hd; S.spec = spec; S.windDir = Math.round((Math.atan2(-world.wind.x, world.wind.z) * 180 / PI + 360) % 360); S.windKt = world.windSpeed * 1.944; S.time = world.time; S.f = f; S.cam = camera; S.camMode = camModes[camMode]; S.camLabel = camLabels[camMode]; S.time2 = time2;
    S.overspeed = spec.type === 'jet' ? f.V > 330 : f.V > spec.vcruise * 1.7; S.hudLadder = true;
    AU.update(f, spec, (f.stalled > 0.05 || f.stallMargin < 0.05) && !f.onGround && f.V > 5, camMode);
    // sim-time world
    S.agl = agl;
    // contrails for jets at altitude
    contrailT -= dt; if (spec.type === 'jet' && f.p.y > 4500 && f.thrEff > 0.3 && contrailT <= 0 && !f.crashed) { contrailT = 0.08; [-1, 1].forEach(function (sd) { var pp = new V3(sd * 0.95, -0.35, 7.5).applyQuaternion(f.q).add(f.p); fxSpawn('smoke', pp, new V3(0, 0, 0), 14, 6, 60, new THREE.Color(0.95, 0.95, 0.98), 0.35); }); }
    // wake of afterburner heat none
  }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function fmtT(s) { var m = Math.floor(s / 60), r = Math.floor(s % 60); return m + ':' + pad2(r); }
  function wrap(t, n) { var out = [], cur = ''; t.split(' ').forEach(function (w) { if ((cur + ' ' + w).length > n) { out.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; }); if (cur) out.push(cur); return out.slice(0, 4); }

  // ---------- loop ----------
  var last = performance.now(), fpsAcc = 0, fpsN = 0, panelT = 0, miniT = 0, started = false, expTarget = 1;
  function frame(now) {
    requestAnimationFrame(frame);
    if (window.__stop) { last = now; return; }
    var dt = Math.min(0.05, (now - last) / 1000); last = now; if (!started) return;
    time2 += dt; avgDt = avgDt * 0.95 + dt * 0.05; fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { hud.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
    qualityTimer += dt; if (qualityTimer > 2.5) { qualityTimer = 0; var np = pixelRatio; if (avgDt > 0.032 && pixelRatio > 0.6) np = Math.max(0.6, pixelRatio - 0.2); else if (avgDt < 0.0185 && pixelRatio < Math.min(window.devicePixelRatio || 1, 1.75)) np = Math.min(Math.min(window.devicePixelRatio || 1, 1.75), pixelRatio + 0.15); if (np !== pixelRatio) { pixelRatio = np; resize(); } }
    var f = flight; if (!f) return;
    if (state === 'flying') simulate(dt);
    else if (state === 'paused') { }
    else if (state === 'menu') { SK.world_time = (SK.world_time || 0) + dt; f.thrEff = 0.15; f.groundSpeed = 0; f.gearPos = 1; f.flapPos = 0; }
    // aircraft transform
    A.group.position.copy(f.p); A.group.quaternion.copy(f.q);
    SK.animateAircraft(A, f, time2, dt);
    if (state === 'flying' && camMode === 1 && A.cockpit.visible) { panelT -= dt; if (panelT <= 0) { panelT = 0.05; SK.drawPanel(A.cockpit, f, spec, S); } A.cockpit.userData.yoke.rotation.z = -f.ctl.roll * 0.8; A.cockpit.userData.yoke.position.z = A.cockpit.userData.yoke.userData.z0 === undefined ? (A.cockpit.userData.yoke.userData.z0 = A.cockpit.userData.yoke.position.z) - f.ctl.pitch * 0.08 : A.cockpit.userData.yoke.userData.z0 - f.ctl.pitch * 0.08; }
    // shadow follows aircraft
    world.sun.position.copy(f.p).addScaledVector(world.sunDir, 300); world.sun.target.position.copy(f.p); world.sun.target.updateMatrixWorld();
    world.sun.shadow.camera.left = world.sun.shadow.camera.bottom = -(A.chase * 1.4 + 20); world.sun.shadow.camera.right = world.sun.shadow.camera.top = A.chase * 1.4 + 20; world.sun.shadow.camera.updateProjectionMatrix();
    world.sun.castShadow = world.sunDir.y > 0.02;
    updateCamera(dt);
    camera.updateMatrixWorld();
    world.update(dt, camera.position, f.p); world.updateEnv(dt);
    world.updateTerrain(camera.position, state === 'flying' ? 3.5 : 6, false);
    fxUpdate(dt);
    // speed fov kick
    if (state === 'flying') { var base = camMode === 1 ? 78 : 60; camera.fov = lerp(camera.fov, base + clamp((f.V - 60) / 220, 0, 1) * 8 + (f.ab ? 3 : 0), 1 - Math.exp(-dt * 3)); camera.updateProjectionMatrix(); }
    // exposure + uniforms
    var ex = grade.uniforms.exposure.value, et = world.exposureTarget || 1; grade.uniforms.exposure.value = lerp(ex, et, 1 - Math.exp(-dt * 0.8));
    grade.uniforms.uTime.value = time2; grade.uniforms.dim.value = (state === 'menu') ? 0.12 : 0;
    bloom.strength = 0.3 + world.night * 0.35; bloom.threshold = 1.0 - world.night * 0.25;
    if (window.__direct) { renderer.setRenderTarget(null); renderer.render(scene, camera); } else composer.render(dt);
    // hud
    if (state === 'flying' || state === 'paused') {
      miniT -= dt; if (miniT <= 0) { miniT = 1.0; hud.updateMini(f.p.x, f.p.z); }
      S.project = function (x, y, z) { tmpV.set(camera.position.x + x * 1000, camera.position.y + y * 1000, camera.position.z + z * 1000).project(camera); if (tmpV.z > 1 || tmpV.z < -1) return null; return [(tmpV.x * 0.5 + 0.5) * W, (-tmpV.y * 0.5 + 0.5) * H]; };
    }
    var sd = new V3(world.sunDir.x, world.sunDir.y, world.sunDir.z); tmpV.copy(camera.position).addScaledVector(sd, 1000).project(camera);
    var vis = (tmpV.z < 1 && Math.abs(tmpV.x) < 1.3 && Math.abs(tmpV.y) < 1.3 && world.sunDir.y > -0.02) ? 1 : 0; vis *= smoothstep(-0.02, 0.1, world.sunDir.y) * (1 - 0.85 * (world.cloudiness || 0));
    S.sunScreen = { x: (tmpV.x * 0.5 + 0.5) * W, y: (-tmpV.y * 0.5 + 0.5) * H, vis: vis * 0.9 };
    if (state === 'menu') { S.f = null; }
    updateTouchUI(); hud.touch = isTouch;
    hud.draw(state === 'menu' ? { sunScreen: S.sunScreen, f: null } : S, dt);
  }

  // ---------- menu wiring ----------
  function selectGroup(groupId, attr, key, cb) {
    var el = $(groupId); if (!el) return;
    el.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; var v = b.getAttribute(attr); game[key] = v; [].forEach.call(el.querySelectorAll('button'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); if (cb) cb(); });
  }
  function wireMenu() {
    selectGroup('g-ac', 'data-v', 'ac', function () { setupMenuScene(); });
    selectGroup('g-ap', 'data-v', 'ap', function () { setupMenuScene(); syncDest(); });
    selectGroup('g-wx', 'data-v', 'weather', function () { world.setWeather(game.weather); });
    selectGroup('g-st', 'data-v', 'start', null);
    selectGroup('g-dest', 'data-v', 'dest', null);
    var tr = $('time'); tr.addEventListener('input', function () { game.time = parseFloat(tr.value); $('timeval').textContent = fmtClock(game.time); world.setTime(game.time); });
    [].forEach.call(document.querySelectorAll('[data-mode]'), function (b) { b.addEventListener('click', function () { game.mission = b.getAttribute('data-mode'); if (game.mission === 'landing') { $('destrow').classList.remove('hidden'); } startGame(game.mission); }); });
    [].forEach.call(document.querySelectorAll('[data-mode-sel]'), function (b) { });
    $('resume').addEventListener('click', function () { setPause(false); });
    $('restart').addEventListener('click', function () { startGame(game.mission); });
    $('tomenu').addEventListener('click', toMenu); $('endmenu').addEventListener('click', toMenu); $('endretry').addEventListener('click', function () { startGame(game.mission); });
    $('endcont').addEventListener('click', function () { $('end').classList.add('hidden'); ended = false; mission.done = true; });
    window.addEventListener('resize', resize);
    syncDest();
  }
  function syncDest() { var dest = $('g-dest'); [].forEach.call(dest.querySelectorAll('button'), function (b) { b.classList.toggle('hidden', b.getAttribute('data-v') === game.ap); }); if (game.dest === game.ap) { var first = [].filter.call(dest.querySelectorAll('button'), function (b) { return b.getAttribute('data-v') !== game.ap; })[0]; game.dest = first.getAttribute('data-v'); [].forEach.call(dest.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b === first ? 'true' : 'false'); }); } }
  function fmtClock(h) { var hh = Math.floor(h), mm = Math.round((h - hh) * 60); if (mm === 60) { hh++; mm = 0; } return pad2(hh % 24) + ':' + pad2(mm); }

  // ---------- boot ----------
  function boot() {
    try {
      glow = SK.glowTex();
      buildComposer(); SK.useHalf = rtType === THREE.HalfFloatType; world = new SK.World(renderer, scene, camera); resize();
      envSim = { time: 0, turb: 0, wind: function (p, o) { return world.windAt(p, o); }, heightAt: SK.terrainH };
      wireMenu(); world.setWeather(game.weather); world.setTime(game.time);
      $('loadmsg').textContent = 'Building the world';
      setTimeout(function () {
        setupMenuScene(); state = 'menu'; started = true; $('loading').classList.add('hidden'); $('menu').classList.remove('hidden');
        window.SKY = { game: game, start: startGame, state: function () { return state; }, flight: function () { return flight; }, world: world, hud: hud, camera: camera, renderer: renderer, key: function (c, v) { keys[c] = v; }, setCam: function (m) { camMode = m; applyCamMode(); }, scene: scene, toMenu: toMenu, composer: composer, bloom: bloom, grade: grade, fxaa: fxaa, GRADE: GRADE, rtType: function () { return rtType; }, aircraft: function () { return A; } };
      }, 50);
      requestAnimationFrame(frame);
    } catch (err) { var m = $('loadmsg'); m.textContent = 'Could not start: ' + (err && err.message ? err.message : err); console.error(err); $('loading').classList.add('failed'); }
  }
  if (document.fonts && document.fonts.ready) setTimeout(boot, 30); else boot();
})();

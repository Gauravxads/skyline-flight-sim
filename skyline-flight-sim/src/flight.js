// Flight model. Body axes: +x right, +y up, +z back (forward = -z). Needs global THREE.
var SK = (typeof SK === 'undefined') ? {} : SK;
(function () {
  var G = 9.81;
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function sm(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  SK.AIRCRAFT = {
    skylark: {
      id: 'skylark', name: 'Skylark', blurb: 'Single prop trainer. Forgiving and slow. Start here.', type: 'prop',
      mass: 1100, S: 16.2, b: 11, c: 1.5, Ix: 1825, Iy: 2667, Iz: 1285,
      CL0: 0.30, CLa: 5.0, CLmax: 1.6, CD0: 0.032, e: 0.75,
      Cma: -1.2, Cmq: -15, Cmde: 0.30, Clp: -0.47, Clb: 0.08, Clda: 0.045, Cnb: 0.10, Cnr: -0.35, Cndr: 0.02, Cnda: 0.006, CYb: 0.3,
      flapCL: [0, 0.15, 0.3, 0.45], flapCD: [0, 0.008, 0.02, 0.045], flapCLmax: [0, 0.15, 0.3, 0.45], gearCD: 0.014,
      Tstat: 2800, power: 107000, spool: 0.5, ab: 0, propTorque: 220, gearTime: 5,
      vr: 28, vcruise: 62, vstall: 26, maxThrustAlt: 9300,
      contacts: [
        { n: 'nose', p: [0, -1.15, -1.8], gear: 1, steer: 1, share: 0.16, trav: 0.14 },
        { n: 'ml', p: [-1.3, -1.25, 0.3], gear: 1, share: 0.42, trav: 0.2 },
        { n: 'mr', p: [1.3, -1.25, 0.3], gear: 1, share: 0.42, trav: 0.2 },
        { n: 'tail', p: [0, -0.35, 4.0] }, { n: 'belly', p: [0, -0.95, 0.4] },
        { n: 'wl', p: [-5.5, 0.3, -0.3] }, { n: 'wr', p: [5.5, 0.3, -0.3] }, { n: 'nose2', p: [0, -0.1, -2.9] }
      ]
    },
    falcon: {
      id: 'falcon', name: 'Falcon', blurb: 'Twin-jet sport. Fast and twitchy, with afterburner.', type: 'jet',
      mass: 6500, S: 22, b: 10.5, c: 2.5, Ix: 55000, Iy: 65000, Iz: 12000,
      CL0: 0.15, CLa: 4.6, CLmax: 1.4, CD0: 0.020, e: 0.8,
      Cma: -1.2, Cmq: -32, Cmde: 0.28, Clp: -0.45, Clb: 0.07, Clda: 0.04, Cnb: 0.12, Cnr: -0.45, Cndr: 0.02, Cnda: 0.004, CYb: 0.3,
      flapCL: [0, 0.12, 0.25, 0.4], flapCD: [0, 0.01, 0.025, 0.05], flapCLmax: [0, 0.12, 0.25, 0.4], gearCD: 0.016,
      Tstat: 36000, Tab: 56000, spool: 1.2, ab: 1, propTorque: 0, gearTime: 6, jetLapse: 0.7,
      vr: 70, vcruise: 220, vstall: 58, maxThrustAlt: 9300,
      contacts: [
        { n: 'nose', p: [0, -1.5, -4.4], gear: 1, steer: 1, share: 0.15, trav: 0.16 },
        { n: 'ml', p: [-1.5, -1.65, 0.8], gear: 1, share: 0.425, trav: 0.2 },
        { n: 'mr', p: [1.5, -1.65, 0.8], gear: 1, share: 0.425, trav: 0.2 },
        { n: 'tail', p: [0, -0.6, 6.2] }, { n: 'belly', p: [0, -1.25, 0.5] },
        { n: 'wl', p: [-5.2, 0.2, 0.6] }, { n: 'wr', p: [5.2, 0.2, 0.6] }, { n: 'nose2', p: [0, -0.1, -6.3] }
      ]
    },
    atlas: {
      id: 'atlas', name: 'Atlas', blurb: 'Twin turboprop hauler. Heavy, stable, long landing roll.', type: 'prop',
      mass: 11000, S: 55, b: 26, c: 2.2, Ix: 300000, Iy: 420000, Iz: 150000,
      CL0: 0.30, CLa: 5.6, CLmax: 1.6, CD0: 0.027, e: 0.8,
      Cma: -1.3, Cmq: -22, Cmde: 0.30, Clp: -0.5, Clb: 0.08, Clda: 0.05, Cnb: 0.12, Cnr: -0.5, Cndr: 0.02, Cnda: 0.004, CYb: 0.3,
      flapCL: [0, 0.2, 0.4, 0.6], flapCD: [0, 0.01, 0.03, 0.06], flapCLmax: [0, 0.2, 0.45, 0.7], gearCD: 0.02,
      Tstat: 54000, power: 2300000, spool: 1.0, ab: 0, propTorque: 3000, gearTime: 7,
      vr: 48, vcruise: 100, vstall: 38, maxThrustAlt: 9300,
      contacts: [
        { n: 'nose', p: [0, -2.4, -6], gear: 1, steer: 1, share: 0.14, trav: 0.2 },
        { n: 'ml', p: [-2.6, -2.6, 1], gear: 1, share: 0.43, trav: 0.25 },
        { n: 'mr', p: [2.6, -2.6, 1], gear: 1, share: 0.43, trav: 0.25 },
        { n: 'tail', p: [0, -1.0, 9.2] }, { n: 'belly', p: [0, -2.0, 0] },
        { n: 'wl', p: [-13, 0.6, 0.8] }, { n: 'wr', p: [13, 0.6, 0.8] }, { n: 'nose2', p: [0, 0.1, -9.6] }
      ]
    }
  };

  SK.Flight = function (spec) {
    this.spec = spec;
    this.p = new THREE.Vector3(); this.v = new THREE.Vector3();
    this.q = new THREE.Quaternion(); this.w = new THREE.Vector3();
    this.ctl = { pitch: 0, roll: 0, yaw: 0, thr: 0, flaps: 0, gear: 1, brake: 0, trim: 0, airbrake: 0, assist: true };
    this.gearPos = 1; this.flapPos = 0; this.thrEff = 0; this.ab = false;
    this.onGround = false; this.crashed = false; this.crashReason = ''; this.stalled = 0;
    this.touch = null; this.bodyAccel = new THREE.Vector3(); this.nz = 1;
    this.alpha = 0; this.beta = 0; this.V = 0; this.rho = 1.225; this.dropSign = 1;
    this.contactState = {}; this.lastVn = 0; this.wheelsOn = 0; this.thrust = 0; this.groundSpeed = 0;
    this._qi = new THREE.Quaternion(); this._t = new THREE.Vector3();
    var s = spec, ar = s.b * s.b / s.S; this.k = 1 / (Math.PI * s.e * ar);
    this.mass = s.mass;
    s.contacts.forEach(function (c) {
      c.v = new THREE.Vector3(c.p[0], c.p[1], c.p[2]);
      if (c.gear) { c.k = c.share * s.mass * G / c.trav; c.c = 2 * 0.55 * Math.sqrt(c.k * c.share * s.mass); }
      else { c.k = s.mass * G / 0.12; c.c = 2 * 0.7 * Math.sqrt(c.k * s.mass * 0.2); }
    });
    this.cstate = s.contacts.map(function () { return { d: 0 }; });
  };

  SK.Flight.prototype.place = function (pos, headingDeg, speed, pitchDeg) {
    this.p.copy(pos);
    var h = headingDeg * Math.PI / 180;
    this.q.setFromEuler(new THREE.Euler(pitchDeg ? pitchDeg * Math.PI / 180 : 0, -h, 0, 'YXZ'));
    var f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.q);
    this.v.copy(f).multiplyScalar(speed || 0); this.w.set(0, 0, 0);
    this.crashed = false; this.crashReason = ''; this.touch = null;
  };

  SK.Flight.prototype.euler = function () {
    var e = new THREE.Euler().setFromQuaternion(this.q, 'YXZ');
    return { pitch: e.x, yaw: -e.y, roll: -e.z };
  };

  SK.Flight.prototype.step = function (dt, env) {
    var s = this.spec, c = this.ctl, self = this;
    if (this.crashed) { this.v.multiplyScalar(0.98); this.w.set(0, 0, 0); return; }
    // actuators
    var gd = dt / s.gearTime; this.gearPos += clamp(c.gear - this.gearPos, -gd, gd);
    var fi = Math.round(c.flaps), fd = dt / 2.5; this.flapPos += clamp(fi - this.flapPos, -fd, fd);
    var thrCmd = c.thr;
    this.ab = !!(s.ab && thrCmd > 0.92);
    this.thrEff += (thrCmd - this.thrEff) * (1 - Math.exp(-dt / s.spool));
    var alt = this.p.y; var rho = 1.225 * Math.exp(-Math.max(0, alt) / 9300); this.rho = rho;
    var wind = env.wind(this.p, this._t);
    var qi = this._qi.copy(this.q).invert();
    var vb = this.v.clone().sub(wind).applyQuaternion(qi);
    var V = Math.max(vb.length(), 0.5); this.V = V;
    var u = -vb.z;
    var alpha = Math.atan2(-vb.y, Math.max(u, 0.5)); if (u < 0.5 && V > 3) alpha = clamp(-vb.y / V * 1.5, -0.6, 0.6);
    var beta = Math.asin(clamp(vb.x / V, -1, 1));
    this.alpha = alpha; this.beta = beta;
    var qbar = 0.5 * rho * V * V;
    // lift
    var fl = this.flapPos, f0 = Math.floor(fl), f1 = Math.min(3, f0 + 1), ft = fl - f0;
    var fCL = s.flapCL[f0] * (1 - ft) + s.flapCL[f1] * ft;
    var fCD = s.flapCD[f0] * (1 - ft) + s.flapCD[f1] * ft;
    var fCLm = s.flapCLmax[f0] * (1 - ft) + s.flapCLmax[f1] * ft;
    var CLmax = s.CLmax + fCLm;
    var aS = (CLmax - s.CL0 - fCL) / s.CLa, aSn = -0.30;
    var CLlin = s.CL0 + fCL + s.CLa * alpha, CL, x = 0;
    if (alpha > aS) {
      x = sm(aS, aS + 0.14, alpha);
      var CLpost = 0.95 * Math.sin(2 * alpha);
      CL = (CLmax * (1 - x) + CLpost * x);
    } else if (alpha < aSn) {
      x = sm(-aSn, -aSn + 0.14, -alpha);
      CL = (s.CL0 + fCL + s.CLa * aSn) * (1 - x) + 0.95 * Math.sin(2 * alpha) * x;
    } else CL = CLlin;
    if (CL > CLmax) CL = CLmax;
    // stall warning state
    var stallMargin = (aS - alpha); this.stallMargin = stallMargin;
    var prevS = this.stalled; this.stalled = x > 0.1 ? x : 0; if (this.stalled > 0 && prevS === 0) this.dropSign = Math.random() < 0.5 ? -1 : 1;
    // ground effect
    var agl = alt - env.heightAt(this.p.x, this.p.z);
    var ge = Math.exp(-Math.max(agl, 0) / (s.b * 0.5)); CL *= 1 + 0.12 * ge;
    var mach = V / (340 - 0.0035 * Math.max(0, alt));
    var wave = mach > 0.8 ? 0.35 * Math.pow(mach - 0.8, 2) : 0;
    var CD = s.CD0 + this.k * (CL - s.CL0 * 0.6) * (CL - s.CL0 * 0.6) + fCD + s.gearCD * this.gearPos + c.airbrake * 0.05 + 1.3 * Math.pow(Math.sin(alpha), 2) * Math.max(x, 0.3 * Math.abs(Math.sin(beta))) + wave + 0.6 * beta * beta * 0.1;
    // thrust
    var T;
    if (s.type === 'jet') {
      var Tm = this.ab ? s.Tab : s.Tstat;
      T = this.thrEff * Tm * Math.pow(rho / 1.225, s.jetLapse) * (1 - 0.18 * V / 300) * (0.18 + 0.82 * Math.min(1, this.thrEff * 1.4));
      if (this.thrEff < 0.02) T = 0.02 * s.Tstat * Math.pow(rho / 1.225, s.jetLapse);
    } else {
      var Pw = s.power * Math.pow(rho / 1.225, 0.9);
      T = this.thrEff * Math.min(s.Tstat, Pw / Math.max(V, 8));
      if (this.thrEff < 0.05) T = -0.02 * s.Tstat * (1 - this.thrEff / 0.05) * 0 + 0;
    }
    this.thrust = T;
    // forces (body)
    var F = new THREE.Vector3(0, 0, -T);
    var a = vb.clone().multiplyScalar(1 / V);
    var ld = new THREE.Vector3(0, 1, 0).addScaledVector(a, -a.y);
    if (ld.lengthSq() > 1e-6) { ld.normalize(); F.addScaledVector(ld, qbar * s.S * CL); }
    F.addScaledVector(a, -qbar * s.S * CD);
    F.x += -qbar * s.S * s.CYb * beta;
    // moments (body torque; +x nose up, +z roll left, +y yaw left)
    var el = clamp(c.pitch + c.trim, -1.2, 1.2);
    var ac = clamp(alpha, -0.4, 0.4);
    var cV = s.c / (2 * V), bV = s.b / (2 * V);
    var Tq = new THREE.Vector3();
    var Cm = s.Cma * ac + s.Cmq * this.w.x * cV + s.Cmde * el * (0.35 + 0.65 * sm(8, 35, V));
    Cm += -0.32 * x * (alpha > 0 ? 1 : -1) + (-0.02 * fl);
    Tq.x = qbar * s.S * s.c * Cm;
    var roll = c.roll, yaw = c.yaw;
    var asst = c.assist ? 1 : 0;
    var Cl = s.Clp * this.w.z * bV + s.Clb * beta - s.Clda * roll * (0.35 + 0.65 * sm(8, 35, V));
    Cl += 0.05 * x * this.dropSign + (c.assist ? 0 : 0);
    Tq.z = qbar * s.S * s.b * Cl;
    var Cn = -s.Cnb * (1 + asst * 0.8) * beta + s.Cnr * this.w.y * bV - s.Cndr * yaw * (0.35 + 0.65 * sm(8, 35, V)) + s.Cnda * roll;
    Tq.y = qbar * s.S * s.b * Cn + s.propTorque * this.thrEff;
    Tq.z += s.propTorque * 0.4 * this.thrEff;
    if (c.assist) {
      var r = new THREE.Vector3(1, 0, 0).applyQuaternion(this.q), bank = Math.asin(clamp(-r.y, -1, 1));
      if (Math.abs(roll) < 0.05 && Math.abs(bank) < 1.05 && this.gearPos > -1) Tq.z += s.Iz * 0.9 * bank * sm(15, 40, V);
      Tq.x += -s.Ix * 0.5 * this.w.x * sm(10, 40, V);
      Tq.y += -s.Iy * 0.8 * beta * sm(10, 40, V);
    }
    // turbulence on attitude
    if (env.turb > 0) { var tt = env.time; Tq.x += s.Ix * env.turb * 0.6 * Math.sin(tt * 2.3 + 1.1) * Math.sin(tt * 0.7); Tq.z += s.Iz * env.turb * 1.2 * Math.sin(tt * 1.9) * Math.sin(tt * 0.5 + 2); }
    // world forces (gravity + contacts)
    var Fw = F.clone().applyQuaternion(this.q);
    Fw.y -= this.mass * G;
    // ground contacts
    var anyWheel = 0, impact = 0, crash = '', hardest = 0, onSurf = false;
    var fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.q); fwd.y = 0; if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1); fwd.normalize();
    var lat = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(-1);
    lat.set(fwd.z, 0, -fwd.x); // right of fwd
    for (var i = 0; i < s.contacts.length; i++) {
      var ct = s.contacts[i], cs = this.cstate[i];
      var wp = ct.v.clone();
      var isGear = !!ct.gear;
      if (isGear) wp.y += (1 - this.gearPos) * 0.9 * (ct.p[1] < -1 ? 1 : 0.5) + (1 - this.gearPos) * 0.6;
      var pw = wp.clone().applyQuaternion(this.q).add(this.p);
      var th = env.heightAt(pw.x, pw.z), water = th < 0.3, gh = water ? 0 : th;
      var d = gh - pw.y; cs.d = d;
      if (d <= 0) { cs.contact = false; continue; }
      cs.contact = true; onSurf = true;
      var wcross = new THREE.Vector3().crossVectors(this.w, wp).applyQuaternion(this.q);
      var vp = this.v.clone().add(wcross);
      var vn = vp.y;
      if (isGear && this.gearPos < 0.9) { // retracted: acts as belly
        isGear = false;
      }
      var Nf;
      if (isGear) {
        anyWheel++;
        Nf = Math.max(0, ct.k * Math.min(d, ct.trav * 1.8) - ct.c * vn);
        if (!cs.was) { impact = Math.min(impact, vn); hardest = Math.min(hardest, vn); }
      } else {
        Nf = Math.max(0, (ct.k || s.mass * G / 0.12) * Math.min(d, 0.5) - (ct.c || 4000) * vn);
        var sp = Math.hypot(vp.x, vp.z);
        if (!cs.was && (-vn > 6 || sp > 22 || water && sp > 12)) crash = water ? 'Ditched in the water' : (ct.n === 'tail' || ct.n === 'belly' ? 'Gear-up / belly impact at speed' : 'Hit the ground');
        if (water) crash = crash || ((this.v.length() > 6) ? 'Ditched in the water' : '');
      }
      cs.was = true;
      // friction
      var vf = vp.x * fwd.x + vp.z * fwd.z, vl = vp.x * lat.x + vp.z * lat.z;
      var dirf = fwd, dirl = lat;
      if (ct.steer) {
        var st = clamp(yaw, -1, 1) * 0.55 * (1 - sm(5, 30, Math.hypot(this.v.x, this.v.z)) * 0.8);
        var cs_ = Math.cos(st), sn_ = Math.sin(st);
        dirf = new THREE.Vector3(fwd.x * cs_ + lat.x * sn_, 0, fwd.z * cs_ + lat.z * sn_);
        dirl = new THREE.Vector3(dirf.z, 0, -dirf.x);
        vf = vp.x * dirf.x + vp.z * dirf.z; vl = vp.x * dirl.x + vp.z * dirl.z;
      }
      var mu_f = (isGear ? 0.018 + c.brake * 0.55 * (ct.steer ? 0 : 1) : 0.7), mu_l = isGear ? 1.1 : 0.8;
      if (water) { mu_f = 3; mu_l = 3; }
      var ff = -clamp(vf * 400, -1, 1) * mu_f * Nf, fl2 = -clamp(vl * 800, -1, 1) * mu_l * Nf;
      var Fc = new THREE.Vector3(dirf.x * ff + dirl.x * fl2, Nf, dirf.z * ff + dirl.z * fl2);
      Fw.add(Fc);
      var rb = wp.clone().applyQuaternion(this.q);
      var tw = new THREE.Vector3().crossVectors(rb, Fc);
      Tq.add(tw.applyQuaternion(qi));
    }
    for (var j = 0; j < this.cstate.length; j++) if (!(this.cstate[j].d > 0)) this.cstate[j].was = false;
    this.wheelsOn = anyWheel; this.onGround = anyWheel > 0 || onSurf;
    if (impact < 0) this.lastVn = impact;
    if (anyWheel && hardest < -9) crash = crash || 'Hard landing: gear collapsed';
    if (crash && !this.crashed) { this.crashed = true; this.crashReason = crash; }
    // integrate
    this.bodyAccel.copy(Fw).sub(new THREE.Vector3(0, -this.mass * G, 0)).multiplyScalar(1 / this.mass);
    var accB = F.clone().multiplyScalar(1 / this.mass); this.nz = accB.y / G + 0; if (this.onGround) this.nz = Math.max(this.nz, 0);
    this.v.addScaledVector(Fw, dt / this.mass);
    this.p.addScaledVector(this.v, dt);
    var I = s, wx = this.w.x, wy = this.w.y, wz = this.w.z;
    var gx = wy * I.Iz * wz - wz * I.Iy * wy, gy = wz * I.Ix * wx - wx * I.Iz * wz, gz = wx * I.Iy * wy - wy * I.Ix * wx;
    this.w.x += (Tq.x - gx) / I.Ix * dt; this.w.y += (Tq.y - gy) / I.Iy * dt; this.w.z += (Tq.z - gz) / I.Iz * dt;
    var wl = this.w.length();
    if (wl > 1e-6) { this._t.copy(this.w).multiplyScalar(1 / wl); var dq = new THREE.Quaternion().setFromAxisAngle(this._t, wl * dt); this.q.multiply(dq).normalize(); }
    this.groundSpeed = Math.hypot(this.v.x, this.v.z);
    this.agl = this.p.y - (env.heightAt(this.p.x, this.p.z) > 0 ? env.heightAt(this.p.x, this.p.z) : 0) - 1.3;
  };
})();

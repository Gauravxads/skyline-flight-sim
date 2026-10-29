global.THREE = require('three');
const fs = require('fs'), vm = require('vm');
global.SK = {};
for (const f of ['terrain', 'flight']) vm.runInThisContext(fs.readFileSync(__dirname + '/src/' + f + '.js', 'utf8'));
const env = { time: 0, turb: 0, wind: (p, o) => o.set(0, 0, 0), heightAt: SK.terrainH };
function run(id, label, fn) {
  const spec = SK.AIRCRAFT[id], fl = new SK.Flight(spec);
  const ap = SK.airports[0];
  const rp = new THREE.Vector3(ap.x - ap.dx * 900, ap.elev + 1.25 + 0.0, ap.z - ap.dz * 900);
  fl.place(rp, ap.hdg, 0, 2.5);
  fl.ctl.assist = true;
  return fn(fl, rp, ap);
}
for (const id of ['skylark', 'falcon', 'atlas']) {
  run(id, 'takeoff', (fl, rp, ap) => {
    const spec = fl.spec; let t = 0, dt = 1 / 120, rotated = false, log = [];
    fl.ctl.thr = 1; fl.ctl.gear = 1;
    while (t < 70) {
      env.time = t;
      const eul = fl.euler();
      if (fl.V > spec.vr && !rotated) rotated = true;
      if (rotated) fl.ctl.pitch = Math.max(-1, Math.min(1, (0.14 - eul.pitch) * 4 - fl.w.x * 1.2)); else fl.ctl.pitch = 0;
      if (fl.p.y - ap.elev > 60) fl.ctl.gear = 0;
      fl.step(dt, env); t += dt;
      if (Math.round(t * 120) % (120 * 5) === 0) log.push(`t=${t.toFixed(0)} V=${fl.V.toFixed(0)} h=${(fl.p.y - ap.elev).toFixed(0)} pitch=${(eul.pitch * 57.3).toFixed(1)} a=${(fl.alpha * 57.3).toFixed(1)} on=${fl.wheelsOn} x=${((fl.p.x - rp.x) * ap.dx + (fl.p.z - rp.z) * ap.dz).toFixed(0)} crash=${fl.crashed}`);
      if (fl.crashed) break;
    }
    console.log('---', id); console.log(log.join('\n')); if (fl.crashed) console.log('CRASH', fl.crashReason);
  });
}

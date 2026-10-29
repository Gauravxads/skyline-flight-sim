// World math: noise, terrain height, airports. Pure JS (no THREE).
var SK = (typeof SK === 'undefined') ? {} : SK;
(function () {
  function hash(ix, iz) {
    var h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }
  function vnoise(x, z) {
    var ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    var u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    var a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, z, oct) {
    var s = 0, a = 0.5, n = 0;
    for (var i = 0; i < oct; i++) {
      s += a * vnoise(x + i * 17.3, z - i * 31.7); n += a; a *= 0.5;
      var nx = x * 1.6 - z * 1.2, nz = x * 1.2 + z * 1.6; x = nx; z = nz;
    }
    return s / n;
  }
  function smooth(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
  function mix(a, b, t) { return a + (b - a) * t; }

  function baseHeight(x, z) {
    var c = fbm(x / 15000 + 3.1, z / 15000 - 7.7, 4);
    var h = (c - 0.5) * 320;
    if (h > 0) {
      var land = smooth(0.5, 0.56, c);
      var ridges = 1 - Math.abs(2 * fbm(x / 3200, z / 3200, 5) - 1);
      var mt = ridges * ridges * smooth(0.54, 0.74, c) * 2100;
      var detail = (fbm(x / 420, z / 420, 4) - 0.5) * 70 * land;
      h += smooth(0.5, 0.78, c) * 520 + mt + detail;
    } else {
      h += (fbm(x / 600, z / 600, 3) - 0.5) * 12;
    }
    return h;
  }

  var airports = [
    { id: 'CPT', name: 'Coral Point', x: 0, z: 0, hdg: 90, len: 1900, wid: 45, fixElev: 14 },
    { id: 'GRP', name: 'Granite Peak', x: 9200, z: -7400, hdg: 35, len: 1500, wid: 38, minElev: 160, maxElev: 700 },
    { id: 'SBZ', name: 'Seabreeze', x: -11000, z: 6500, hdg: 295, len: 1400, wid: 36, fixElev: 9 }
  ];
  airports.forEach(function (a) {
    var r = a.hdg * Math.PI / 180;
    a.dx = Math.sin(r); a.dz = -Math.cos(r); // runway direction (heading)
    if (a.fixElev !== undefined) a.elev = a.fixElev;
    else {
      var s = 0, n = 0;
      for (var t = -1; t <= 1; t += 0.5) { s += baseHeight(a.x + a.dx * t * a.len / 2, a.z + a.dz * t * a.len / 2); n++; }
      a.elev = Math.min(a.maxElev, Math.max(a.minElev, s / n));
    }
  });

  function airportDist(a, x, z) {
    var px = x - a.x, pz = z - a.z;
    var along = px * a.dx + pz * a.dz, across = -px * a.dz + pz * a.dx;
    var da = Math.max(0, Math.abs(along) - a.len / 2 - 90), dc = Math.max(0, Math.abs(across) - 120);
    return Math.sqrt(da * da + dc * dc);
  }
  function terrainH(x, z) {
    var h = baseHeight(x, z);
    for (var i = 0; i < airports.length; i++) {
      var a = airports[i];
      var d = airportDist(a, x, z);
      if (d < 900) { var t = 1 - smooth(0, 900, d); h = mix(h, a.elev, t); }
    }
    return h;
  }
  SK.hash = hash; SK.vnoise = vnoise; SK.fbm = fbm; SK.smooth = smooth; SK.mix = mix;
  SK.terrainH = terrainH; SK.airports = airports; SK.airportDist = airportDist;
})();

const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=gl-egl', '--use-gl=angle', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); const logs = [];
  page.on('console', m => logs.push(m.type() + ': ' + m.text())); page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  await page.goto('file:///home/claude/game/dist/test.html');
  await page.waitForFunction(() => window.SKY && window.SKY.state() === 'menu', null, { timeout: 120000 });
  await page.screenshot({ path: 'dist/tm.png' });
  await page.evaluate(() => { SKY.game.ac = 'skylark'; SKY.game.start = 'air'; SKY.start('free'); });
  await page.waitForTimeout(8000);
  // drag stick and throttle, tap gear
  const st = await page.locator('#stick').boundingBox(), th = await page.locator('#thr').boundingBox();
  await page.evaluate(([sx, sy, tx, ty]) => {
    const fire = (el, type, x, y, id) => el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: id, bubbles: true, pointerType: 'touch' }));
    const s = document.getElementById('stick'), t = document.getElementById('thr');
    fire(s, 'pointerdown', sx, sy, 1); fire(s, 'pointermove', sx + 40, sy - 30, 1);
    fire(t, 'pointerdown', tx, ty, 2); window.__x = 1;
  }, [st.x + st.width / 2, st.y + st.height / 2, th.x + th.width / 2, th.y + th.height * 0.2]);
  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => { const c = SKY.flight().ctl; return { roll: c.roll, pitch: c.pitch, thr: c.thr }; });
  console.log(JSON.stringify(r));
  await page.evaluate(() => { window.__stop = true; }); await page.waitForTimeout(300);
  await page.screenshot({ path: 'dist/tf.png', timeout: 120000 });
  console.log(logs.filter(l => !/ReadPixels|toNonIndexed|TUNNEL/.test(l)).slice(0, 10).join('\n'));
  await browser.close();
})();

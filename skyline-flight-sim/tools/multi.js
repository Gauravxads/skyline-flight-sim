const { chromium } = require('playwright');
(async () => {
  const shots = JSON.parse(process.argv[2]); // [{name, script, wait}]
  const browser = await chromium.launch({ args: ['--use-angle=gl-egl', '--use-gl=angle', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = []; page.on('console', m => logs.push(m.type() + ': ' + m.text())); page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  await page.goto('file:///home/claude/game/dist/test.html');
  await page.waitForFunction(() => window.SKY && window.SKY.state() === 'menu', null, { timeout: 120000 });
  for (const s of shots) {
    await page.evaluate(() => { window.__stop = false; });
    if (s.script) await page.evaluate(s.script);
    await page.waitForTimeout(s.wait || 5000);
    await page.evaluate(() => { window.__stop = true; });
    await page.waitForTimeout(300);
    await page.screenshot({ path: 'dist/' + s.name + '.png', timeout: 120000 });
    console.log('shot', s.name);
  }
  console.log(logs.filter(l => !/ReadPixels|toNonIndexed|TUNNEL/.test(l)).slice(0, 25).join('\n'));
  await browser.close();
})();

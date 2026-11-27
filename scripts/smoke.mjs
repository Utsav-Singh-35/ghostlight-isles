// Browser smoke test: serves the production build, drives the game in the installed Chrome or Edge,
// checks it really works and stays inside the performance budget, and saves screenshots.
// Usage: npm run build && npm run smoke
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';

const DIST = resolve('dist');
const SHOTS = resolve('Documents', 'screenshots');
const BUDGET = { drawCalls: 150, pointLights: 4 };
const SPAWN = { x: 0, z: 85 };
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.glb': 'model/gltf-binary',
};

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
      const file = resolve(join(DIST, path === '/' ? 'index.html' : path));
      if (!file.startsWith(DIST + sep) && file !== DIST) throw new Error('outside dist');
      const info = await stat(file);
      if (!info.isFile()) throw new Error('not a file');
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

async function launchBrowser() {
  const attempts = [
    { channel: 'chrome', args: ['--ignore-gpu-blocklist'] },
    { channel: 'msedge', args: ['--ignore-gpu-blocklist'] },
    { channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  ];
  let lastError;
  for (const attempt of attempts) {
    try {
      return await chromium.launch({ headless: true, ...attempt });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${message}`);
};

async function openGame(browser, base, query, errors) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${base}/${query}`);
  await page.waitForFunction(() => window.__ghostlight?.ready === true, null, { timeout: 30000 });
  return page;
}

async function main() {
  await stat(join(DIST, 'index.html')).catch(() => {
    throw new Error('No production build found. Run `npm run build` first.');
  });
  await mkdir(SHOTS, { recursive: true });
  const server = await startServer();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await launchBrowser();
  const errors = [];
  const report = {};

  try {
    // High graphics, with the title screen.
    const page = await openGame(browser, base, '?seed=smoke-test', errors);
    report.gpu = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
    await sleep(2500);
    check(await page.locator('.intro').isVisible(), 'the title screen shows on load');
    check((await page.evaluate(() => window.__ghostlight.mode())) === 'intro', 'the camera circles the ship during the intro');
    await page.screenshot({ path: join(SHOTS, '01-intro.png') });

    await page.getByRole('button', { name: 'Set sail' }).click();
    await sleep(300);
    await page.keyboard.press('KeyW');
    await sleep(150);
    await page.keyboard.press('KeyW');
    await sleep(4000);
    await page.keyboard.down('KeyD');
    await sleep(1200);
    await page.keyboard.up('KeyD');
    await sleep(4000);

    const ship = await page.evaluate(() => window.__ghostlight.ship());
    const high = await page.evaluate(() => window.__ghostlight.stats());
    report.high = { ...high, ship };
    await page.screenshot({ path: join(SHOTS, '02-sailing.png') });

    check((await page.evaluate(() => window.__ghostlight.mode())) === 'chase', 'Set sail hands control to the player');
    check(ship.sailLevel === 2, 'two presses of W set full sail');
    const moved = Math.hypot(ship.x - SPAWN.x, ship.z - SPAWN.z);
    check(moved > 20, `the ship sailed away from the spawn (${moved.toFixed(1)} m)`);
    check(Math.abs(ship.heading) > 0.05, `holding D turned the ship (heading ${ship.heading.toFixed(3)} rad)`);
    check(high.drawCalls <= BUDGET.drawCalls, `High: ${high.drawCalls} draw calls (budget ${BUDGET.drawCalls})`);
    check(high.pointLights <= BUDGET.pointLights, `High: ${high.pointLights} point lights (budget ${BUDGET.pointLights})`);
    check(!(await page.locator('.intro').isVisible().catch(() => false)), 'the title screen is gone after setting sail');
    await page.close();

    // Low graphics, straight into the game.
    const low = await openGame(browser, base, '?seed=smoke-test&quality=low&skipIntro', errors);
    await low.keyboard.press('KeyW');
    await sleep(3000);
    const lowStats = await low.evaluate(() => window.__ghostlight.stats());
    report.low = lowStats;
    await low.screenshot({ path: join(SHOTS, '03-low-graphics.png') });
    check(lowStats.pixelRatio === 1, 'Low graphics uses pixel ratio 1');
    check(lowStats.drawCalls <= BUDGET.drawCalls, `Low: ${lowStats.drawCalls} draw calls (budget ${BUDGET.drawCalls})`);
    await low.close();

    check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 5).join(' | ')}` : ''}`);
  } finally {
    await browser.close();
    server.close();
  }

  console.log(JSON.stringify(report, null, 2));
  console.log(`Screenshots saved to ${SHOTS}`);
  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nSmoke test passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

// Browser smoke test: serves the production build with Vite's preview server (which also serves the
// game API at /api, like Netlify), drives the game in the installed Chrome or Edge, checks it really
// works and stays inside the performance budget, and saves screenshots.
// Usage: npm run build && npm run smoke
import { mkdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const DIST = resolve('dist');
const SHOTS = resolve('Documents', 'screenshots');
const BUDGET = { drawCalls: 150, pointLights: 4 };
const SPAWN = { x: 0, z: 85 };

async function startServer() {
  const server = await preview({ logLevel: 'silent', preview: { port: 4317, strictPort: false, open: false, host: '127.0.0.1' } });
  const url = server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:4317/';
  return { server, base: url.replace(/\/$/, '') };
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
  const { server, base } = await startServer();
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
    const captain = await page.evaluate(() => window.__ghostlight.captain());
    check(captain && captain.online === true && captain.name.length > 1, `a guest captain is created online (${captain?.name})`);
    check(captain && captain.resources.gold === 600, 'a new captain starts with 600 gold');
    await page.reload();
    await page.waitForFunction(() => window.__ghostlight?.ready === true && window.__ghostlight.captain() !== null, null, { timeout: 30000 });
    const again = await page.evaluate(() => window.__ghostlight.captain());
    check(again && captain && again.name === captain.name, 'the captain is remembered after a reload');
    await sleep(1500);
    check(await page.locator('.intro').isVisible(), 'the title screen shows on load');
    check((await page.evaluate(() => window.__ghostlight.mode)) === 'intro', 'the camera circles the ship during the intro');
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

    check((await page.evaluate(() => window.__ghostlight.mode)) === 'sail', 'Set sail hands control to the player');
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

    // With no server, the same rules run in the browser and save to localStorage.
    const offline = await openGame(browser, base, '?seed=smoke-test&skipIntro&offline', errors);
    await offline.waitForFunction(() => window.__ghostlight.captain() !== null, null, { timeout: 15000 }).catch(() => {});
    const local = await offline.evaluate(() => window.__ghostlight.captain());
    check(local && local.online === false && local.resources.gold === 600, 'offline play creates a captain saved on this device');
    check(await offline.locator('.cb-status').textContent().then((t) => t === 'Saved on this device'), 'the HUD says progress is saved on this device');
    await offline.close();

    // A fort battle: sail in at full sail, fire both broadsides, then retreat.
    const fort = await openGame(browser, base, '?seed=smoke-test&scenario=practice-fort', errors);
    check((await fort.evaluate(() => window.__ghostlight.mode)) === 'battle', 'the fort scenario opens a battle');
    await fort.keyboard.press('KeyW');
    await sleep(9000);
    await fort.keyboard.down('KeyQ');
    await fort.keyboard.down('KeyE');
    await fort.keyboard.down('KeyA');
    await sleep(9000);
    const fortBattle = await fort.evaluate(() => window.__ghostlight.battle());
    const fortStats = await fort.evaluate(() => window.__ghostlight.stats());
    report.fort = { ...fortStats, battle: fortBattle };
    await fort.screenshot({ path: join(SHOTS, '04-fort-battle.png') });
    await fort.keyboard.up('KeyQ');
    await fort.keyboard.up('KeyE');
    await fort.keyboard.up('KeyA');
    check(fortBattle && fortBattle.tick > 400, `the fort battle runs (${fortBattle?.tick} ticks)`);
    check(fortBattle && fortBattle.shotsFired >= 2, `the player's inputs are recorded for replay (${fortBattle?.shotsFired} changes)`);
    check(fortStats.drawCalls <= BUDGET.drawCalls, `Fort battle: ${fortStats.drawCalls} draw calls (budget ${BUDGET.drawCalls})`);
    await fort.getByRole('button', { name: 'Retreat' }).click();
    await fort.waitForFunction(() => window.__ghostlight.resultShowing(), null, { timeout: 10000 }).catch(() => {});
    check(await fort.evaluate(() => window.__ghostlight.resultShowing()), 'retreating ends the battle with a result card');
    await fort.screenshot({ path: join(SHOTS, '05-battle-result.png') });
    await fort.getByRole('button', { name: 'Back to the sea' }).click();
    await sleep(500);
    check((await fort.evaluate(() => window.__ghostlight.mode)) === 'sail', 'Back to the sea returns to sailing');
    await fort.close();

    // A siege under the Blood Moon: the ghosts close in on Last Light.
    const siege = await openGame(browser, base, '?seed=smoke-test&scenario=practice-siege', errors);
    await sleep(14000);
    const siegeBattle = await siege.evaluate(() => window.__ghostlight.battle());
    const siegeStats = await siege.evaluate(() => window.__ghostlight.stats());
    report.siege = { ...siegeStats, battle: siegeBattle };
    await siege.screenshot({ path: join(SHOTS, '06-siege.png') });
    check(siegeBattle && siegeBattle.mode === 'siege' && siegeBattle.tick > 300, 'the siege scenario runs');
    check(siegeStats.drawCalls <= BUDGET.drawCalls, `Siege: ${siegeStats.drawCalls} draw calls (budget ${BUDGET.drawCalls})`);
    await siege.close();

    check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 5).join(' | ')}` : ''}`);
  } finally {
    await browser.close();
    await server.close();
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

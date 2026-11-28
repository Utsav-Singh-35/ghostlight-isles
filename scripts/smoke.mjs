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

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Sails a fort battle with the keyboard the way the server tests' autopilot does: circle the
 * island 14 m off its shore with the island to port, both broadsides held. Stops when it ends.
 */
async function sailLikeTheAutopilot(page, timeoutMs) {
  await page.keyboard.down('KeyQ');
  await page.keyboard.down('KeyE');
  let held = null;
  const ends = Date.now() + timeoutMs;
  try {
    while (Date.now() < ends) {
      const s = await page.evaluate(() => ({ ship: window.__ghostlight.ship(), battle: window.__ghostlight.battle() }));
      if (!s.battle || s.battle.result) break;
      const { x, z, heading } = s.ship;
      const ring = s.battle.islandRadius * 0.9 + 4 + 14;
      const error = Math.hypot(x, z) - ring;
      const desired = Math.atan2(x, z) - (Math.PI / 2 + Math.max(-0.6, Math.min(0.9, error * 0.03)));
      const rudder = Math.round(Math.max(-1, Math.min(1, -wrapAngle(desired - heading) * 2.5)));
      const want = rudder > 0 ? 'KeyD' : rudder < 0 ? 'KeyA' : null;
      if (want !== held) {
        if (held) await page.keyboard.up(held);
        if (want) await page.keyboard.down(want);
        held = want;
      }
      await sleep(50);
    }
  } finally {
    if (held) await page.keyboard.up(held);
    await page.keyboard.up('KeyQ');
    await page.keyboard.up('KeyE');
  }
}

/** Opens the game. Pages are calm (no automatic Blood Moon sieges) unless `calm: false`. */
async function openGame(browser, base, query, errors, { calm = true } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  const q = calm ? `${query}${query.includes('?') ? '&' : '?'}calm` : query;
  await page.goto(`${base}/${q}`);
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

    // Capture the first haunted island by solving its Lantern Lines, in the standard sea.
    const cap = await openGame(browser, base, '?skipIntro', errors);
    await cap.waitForFunction(() => window.__ghostlight.captain() !== null, null, { timeout: 15000 });
    await sleep(300);
    const firstOrder = await cap.evaluate(() => window.__ghostlight.orders());
    const orderTitle = await cap.locator('.orders-title').textContent().catch(() => '');
    check(firstOrder.visible && firstOrder.current === 1 && /1 of 7/.test(orderTitle ?? ''), `a new captain sees the first of the captain's orders (${orderTitle})`);
    check((await cap.evaluate(() => window.__ghostlight.sound().state)) === 'waiting', 'no audio starts before the first key press');
    await cap.keyboard.press('KeyW');
    await sleep(400);
    check((await cap.evaluate(() => window.__ghostlight.orders().current)) === 2, 'raising the sails ticks off the first order');
    check((await cap.evaluate(() => window.__ghostlight.sound().state)) === 'running', 'the first key press starts the audio');
    const prompted = await cap
      .waitForFunction(() => /haunted/.test(document.querySelector('.context-prompt:not([hidden]) .cp-title')?.textContent ?? ''), null, { timeout: 30000 })
      .then(() => true)
      .catch(() => false);
    check(prompted, 'sailing toward a haunted island offers to capture it');
    const promptText = await cap.locator('.context-prompt .cp-detail').textContent().catch(() => '');
    check(/Fort level 1 of 5/.test(promptText ?? '') && !(await cap.getByRole('button', { name: /Lantern Lines/ }).count()), `the prompt shows the fort's level and offers only a battle (${promptText})`);
    // The label moves with the camera every frame, so send the click straight to it.
    await cap.locator('.island-label.island-haunted', { hasText: 'Coffin Rock' }).first().dispatchEvent('click');
    await sleep(300);
    const reportTitle = await cap.locator('.context-prompt:not([hidden]) .cp-title').textContent().catch(() => '');
    check(/fort 1 of 5/.test(reportTitle ?? ''), `clicking a fort's name opens its fort report (${reportTitle})`);
    await cap.keyboard.press('KeyS');
    await cap.keyboard.press('Digit1');
    await cap.waitForFunction(() => window.__ghostlight.mode === 'battle', null, { timeout: 10000 }).catch(() => {});
    check((await cap.evaluate(() => window.__ghostlight.mode)) === 'battle', 'pressing 1 starts the battle for the fort');
    await sleep(6000);
    await cap.screenshot({ path: join(SHOTS, '07-capture-battle.png') });
    await sailLikeTheAutopilot(cap, 170000);
    await cap.waitForFunction(() => window.__ghostlight.resultShowing(), null, { timeout: 15000 }).catch(() => {});
    const afterCapture = await cap.evaluate(() => window.__ghostlight.captain());
    check(afterCapture && afterCapture.captured.includes(1), 'breaking the fort in the browser captures the island on the server');
    check(afterCapture && afterCapture.resources.gold > 600, `the capture pays its reward (${afterCapture?.resources.gold} gold)`);
    const rewardText = (await cap.locator('.result-lines').first().textContent().catch(() => '')) ?? '';
    check(/silenced/.test(rewardText) && /In all:/.test(rewardText), 'the result card breaks the reward down, guns silenced and all');
    await cap.screenshot({ path: join(SHOTS, '08-island-captured.png') });
    await cap.getByRole('button', { name: 'Back to the sea' }).click();
    await sleep(1500);
    await cap.screenshot({ path: join(SHOTS, '09-warm-island.png') });
    const ordersAfter = await cap.evaluate(() => window.__ghostlight.orders());
    check(ordersAfter.done.includes('island') && ordersAfter.done.includes('capture'), `the capture ticks off its orders (${ordersAfter.done.join(', ')})`);
    await cap.keyboard.press('KeyM');
    const muted = await cap.evaluate(() => window.__ghostlight.sound());
    const soundLabel = await cap.getByRole('button', { name: /^Sound:/ }).textContent();
    check(!muted.enabled && soundLabel === 'Sound: Off', `M turns the sound off and the HUD says so (${soundLabel})`);
    await cap.getByRole('button', { name: /^Sound:/ }).click();
    check((await cap.evaluate(() => window.__ghostlight.sound().enabled)) === true, 'the HUD button turns it back on');
    await cap.close();

    // Build a Spirit Lantern on Last Light from the base panel.
    const basePage = await openGame(browser, base, '?skipIntro', errors);
    await basePage.waitForFunction(() => window.__ghostlight.captain() !== null, null, { timeout: 15000 });
    await basePage.keyboard.press('Tab');
    const panelOpen = await basePage.locator('.base-panel').isVisible();
    check(panelOpen, 'Tab opens the base panel');
    await basePage.locator('.bp-slot', { hasText: 'Slot 2: empty' }).getByRole('button', { name: /Build Spirit Lantern/ }).click();
    await basePage.waitForFunction(() => window.__ghostlight.captain()?.defenses === 2, null, { timeout: 10000 }).catch(() => {});
    const builder = await basePage.evaluate(() => window.__ghostlight.captain());
    check(builder && builder.defenses === 2, 'building a Spirit Lantern adds it to the base');
    check(builder && builder.resources.gold === 450 && builder.resources.ectoplasm === 10, `the server charges exactly 150 gold and 20 ectoplasm (${builder?.resources.gold} gold, ${builder?.resources.ectoplasm} ectoplasm left)`);
    await sleep(2500);
    await basePage.screenshot({ path: join(SHOTS, '10-base.png') });
    await basePage.getByRole('tab', { name: 'Shipwright' }).click().catch(() => {});
    await sleep(200);
    check(await basePage.locator('.base-panel').textContent().then((t) => /Pumpkin Mortar/.test(t ?? '')), 'the shipwright offers the Pumpkin Mortar');
    await basePage.keyboard.press('Tab');
    check(!(await basePage.locator('.base-panel').isVisible()), 'Tab closes the base panel again');
    await basePage.close();

    // Raid a rival from the raid list, then read the Captain's Log.
    const raidPage = await openGame(browser, base, '?skipIntro', errors);
    await raidPage.waitForFunction(() => window.__ghostlight.captain() !== null, null, { timeout: 15000 });
    await raidPage.keyboard.press('KeyR');
    await raidPage.waitForSelector('.side-panel:not([hidden]) .sp-row', { timeout: 10000 }).catch(() => {});
    const targetCount = await raidPage.locator('.side-panel .sp-row').count();
    check(targetCount === 8, `R lists islands to raid (${targetCount})`);
    await raidPage.screenshot({ path: join(SHOTS, '11-raid-list.png') });
    await raidPage.locator('.side-panel .sp-row').last().getByRole('button').click();
    await raidPage.waitForFunction(() => window.__ghostlight.mode === 'battle', null, { timeout: 10000 }).catch(() => {});
    check((await raidPage.evaluate(() => window.__ghostlight.mode)) === 'battle', 'choosing a target starts the raid battle');
    await sleep(1500);
    await raidPage.getByRole('button', { name: 'Retreat' }).click();
    await raidPage.waitForFunction(() => window.__ghostlight.resultShowing(), null, { timeout: 10000 }).catch(() => {});
    check(await raidPage.locator('.result-title').textContent().then((t) => /held|raided/.test(t ?? '')), 'the raid ends with a result card from the server');
    await raidPage.getByRole('button', { name: 'Back to the sea' }).click();
    await raidPage.keyboard.press('KeyL');
    await raidPage.waitForSelector('.side-panel:not([hidden]) .sp-row-title', { timeout: 10000 }).catch(() => {});
    check(await raidPage.locator('.side-panel .sp-row-title').first().textContent().then((t) => /Raid on/.test(t ?? '')), 'the Captain’s Log reports the raid');
    await raidPage.getByRole('tab', { name: 'Leaderboard' }).click();
    await raidPage.waitForSelector('.sp-rank', { timeout: 10000 }).catch(() => {});
    check((await raidPage.locator('.sp-rank').count()) === 10, 'the leaderboard shows the top 10');
    await raidPage.screenshot({ path: join(SHOTS, '12-leaderboard.png') });
    await raidPage.close();

    // Summon the Blood Moon: the night turns red and the ghost fleet comes for Last Light.
    const moon = await openGame(browser, base, '?skipIntro', errors, { calm: false });
    await moon.waitForFunction(() => window.__ghostlight.captain() !== null, null, { timeout: 15000 });
    await moon.getByRole('button', { name: 'Summon the Blood Moon' }).click();
    await sleep(3000);
    const red = await moon.evaluate(() => window.__ghostlight.moon());
    check(red.red > 0.5 && red.fleetComing, `summoning turns the night red and the fleet sets out (red ${red.red.toFixed(2)})`);
    await moon.screenshot({ path: join(SHOTS, '13-blood-moon.png') });
    await moon.waitForFunction(() => window.__ghostlight.mode === 'battle', null, { timeout: 15000 }).catch(() => {});
    await sleep(10000);
    const siegeState = await moon.evaluate(() => window.__ghostlight.battle());
    check(siegeState && siegeState.mode === 'siege' && siegeState.ghosts > 0, `the fleet arrives and the siege of Last Light begins (${siegeState?.ghosts ?? 0} ghosts afloat)`);
    const strayLabels = await moon.locator('.island-label:not([hidden])').count();
    check(strayLabels === 0, `no island labels hang over the battle (${strayLabels} showing)`);
    await moon.screenshot({ path: join(SHOTS, '14-siege.png') });
    await moon.close();

    // Sink in a raid, wake in Davy Jones' Locker and escape it.
    const deep = await openGame(browser, base, '?skipIntro', errors);
    await deep.waitForFunction(() => window.__ghostlight.captain() !== null, null, { timeout: 15000 });
    await deep.keyboard.press('KeyR');
    await deep.waitForSelector('.side-panel:not([hidden]) .sp-row', { timeout: 10000 });
    const strongest = await deep.$$eval('.side-panel .sp-row .sp-row-detail', (rows) => {
      let best = 0;
      let bestCount = -1;
      rows.forEach((row, i) => {
        const count = Number(/(\d+) defense/.exec(row.textContent ?? '')?.[1] ?? 0);
        if (count > bestCount) {
          best = i;
          bestCount = count;
        }
      });
      return best;
    });
    await deep.locator('.side-panel .sp-row').nth(strongest).getByRole('button').click();
    await deep.waitForFunction(() => window.__ghostlight.mode === 'battle', null, { timeout: 10000 });
    await deep.keyboard.press('KeyW');
    await deep.waitForFunction(() => window.__ghostlight.resultShowing(), null, { timeout: 160000 }).catch(() => {});
    const sankInRaid = await deep.evaluate(() => window.__ghostlight.battle()?.result?.shipSunk === true);
    check(sankInRaid, 'sitting under the guns of a strong island sinks the ship');
    await deep.getByRole('button', { name: 'Back to the sea' }).click();
    await deep.waitForSelector('.locker:not([hidden])', { timeout: 10000 }).catch(() => {});
    const crewAfter = await deep.evaluate(() => window.__ghostlight.captain());
    check(await deep.locator('.locker').isVisible(), "a sunk ship wakes in Davy Jones' Locker");
    check(crewAfter && (crewAfter.crew.gunner === 'ghost' || crewAfter.crew.navigator === 'ghost'), 'one drowned crew member comes back as a ghost');
    await deep.screenshot({ path: join(SHOTS, '15-davy-jones-locker.png') });
    await deep.keyboard.press('Digit1');
    await deep.waitForTimeout(300);
    const shut = !(await deep.locator('.base-panel').isVisible()) && !(await deep.locator('.context-prompt').isVisible());
    check(shut, 'island actions stay shut while the ship lies in the Locker');
    await deep.getByRole('button', { name: /Escape/ }).click();
    await deep.waitForFunction(() => window.__ghostlight.puzzle() !== null, null, { timeout: 10000 }).catch(() => {});
    await deep.screenshot({ path: join(SHOTS, '16-locker-escape.png') });
    for (const m of (await deep.evaluate(() => window.__ghostlight.puzzle())) ?? []) {
      if (m.current !== m.solution) await deep.locator(`[data-cell="${m.cell}"]`).click();
    }
    await deep.waitForFunction(() => window.__ghostlight.resultShowing(), null, { timeout: 10000 }).catch(() => {});
    check(await deep.locator('.result-title').textContent().then((t) => t === 'You rise from the deep'), 'solving the escape frees the ship with nothing lost');
    const freed = await deep.evaluate(() => window.__ghostlight.captain());
    check(freed && freed.sunk === false, 'the server marks the ship afloat again');
    await deep.close();

    // A fort battle: sail in at full sail, fire both broadsides, then retreat.
    const fort = await openGame(browser, base, '?seed=smoke-test&scenario=practice-fort', errors);
    check((await fort.evaluate(() => window.__ghostlight.mode)) === 'battle', 'the fort scenario opens a battle');
    await fort.keyboard.press('KeyW');
    await sleep(9000);
    await fort.keyboard.press('KeyT');
    await sleep(200);
    const locked = await fort.evaluate(() => window.__ghostlight.battle()?.lock ?? 0);
    check(locked > 0, `T locks the guns on a target (id ${locked})`);
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
    const heard = await fort.evaluate(() => window.__ghostlight.sound());
    check(heard.state === 'running' && heard.cues > 0, `the battle is heard: audio ${heard.state}, ${heard.cues} sounds started`);
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

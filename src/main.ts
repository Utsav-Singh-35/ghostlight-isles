import './ui/styles.css';
import { createKeyboardInput } from './game/input';
import { interpolateShip } from './game/interpolate';
import { createFixedLoop } from './game/loop';
import { GameRenderer, type Quality, type RenderStats } from './render/gameRenderer';
import { TICK_SECONDS, WORLD } from './sim/balance';
import { hashSeed } from './sim/rng';
import type { ShipState } from './sim/ship';
import { createWorldState, generateWorld, isAground, stepWorld } from './sim/world';
import { el } from './ui/dom';
import { createHud } from './ui/hud';
import { createIntro } from './ui/intro';
import { createLabels } from './ui/labels';
import { createNotice, showFatal } from './ui/notice';

/** Read-only stats for the smoke test and for curious players. */
export interface DebugApi {
  readonly ready: boolean;
  stats(): RenderStats;
  ship(): ShipState;
  tick(): number;
  mode(): 'intro' | 'chase';
  islands(): ReadonlyArray<{ name: string; kind: string; x: number; z: number; radius: number }>;
}

declare global {
  interface Window {
    __ghostlight?: DebugApi;
  }
}

const QUALITY_KEY = 'ghostlight.quality';
const SLOW_FPS = 40;
const SLOW_SECONDS = 5;

function readOptions(): { quality: Quality; seedText: string; skipIntro: boolean } {
  const params = new URLSearchParams(window.location.search);
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(QUALITY_KEY);
  } catch {
    // Storage can be blocked; fall back to the default.
  }
  const requested = params.get('quality') ?? stored;
  return {
    quality: requested === 'low' ? 'low' : 'high',
    seedText: params.get('seed') || WORLD.defaultSeed,
    skipIntro: params.has('skipIntro'),
  };
}

function hasWebGL2(): boolean {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

function switchQuality(current: Quality): void {
  const next: Quality = current === 'high' ? 'low' : 'high';
  try {
    window.localStorage.setItem(QUALITY_KEY, next);
  } catch {
    // Ignore: the URL parameter below still works.
  }
  const url = new URL(window.location.href);
  url.searchParams.set('quality', next);
  window.location.href = url.toString();
}

function main(): void {
  const app = document.getElementById('app');
  if (!app) return;
  if (!hasWebGL2()) {
    showFatal(
      app,
      'This game needs WebGL 2',
      'Ghostlight Isles draws its 3D sea with WebGL 2. Please open it in a current version of Chrome, Edge, Firefox or Safari, and check that hardware acceleration is turned on in the browser settings.',
    );
    return;
  }

  const options = readOptions();
  const world = generateWorld(hashSeed(options.seedText));
  let previous = createWorldState(world);
  let current = previous;
  const input = createKeyboardInput(window);

  let stopLoop = () => {};
  let renderer: GameRenderer;
  try {
    renderer = new GameRenderer(app, world, options.quality, () => {
      stopLoop();
      showFatal(
        app,
        'The graphics stopped working',
        'The browser lost its WebGL context, which can happen when the graphics driver restarts. Reload the page to keep sailing.',
        true,
      );
    });
  } catch (error) {
    console.error(error);
    showFatal(app, 'The game could not start', 'Your browser could not create a WebGL 2 context. Try another browser or turn on hardware acceleration.', true);
    return;
  }

  const overlay = el('div', 'overlay');
  app.append(overlay);
  const hud = createHud(overlay, options.quality, () => switchQuality(options.quality));
  const labels = createLabels(overlay, world);
  const aground = createNotice(overlay, 'notice-aground');
  const slow = createNotice(overlay, 'notice-slow');

  let mode: 'intro' | 'chase' = 'intro';
  const start = () => {
    if (mode === 'chase') return;
    mode = 'chase';
    intro?.hide();
    input.setEnabled(true);
    hud.setVisible(true);
    labels.setVisible(true);
  };
  input.setEnabled(false);
  input.onFirstGameKey(start);
  const intro = options.skipIntro ? null : createIntro(overlay, start);
  if (options.skipIntro) start();

  let ready = false;
  let time = 0;
  let slowFor = 0;
  let slowShown = false;

  const loop = createFixedLoop({
    tickSeconds: TICK_SECONDS,
    step: () => {
      previous = current;
      current = stepWorld(world, current, input.snapshot(), TICK_SECONDS);
    },
    render: (alpha, frameSeconds) => {
      time += frameSeconds;
      const ship = interpolateShip(previous.ship, current.ship, alpha);
      renderer.render({ ship, time, dt: frameSeconds, mode });
      hud.update(ship, input.sailLevel);
      labels.update(ship, renderer, renderer.labelAnchors);

      const stuck = mode === 'chase' && current.ship.sail > 0.1 ? isAground(world, current.ship) : null;
      aground.show(stuck ? `Aground on ${stuck.name}. Steer away with A or D.` : null);

      if (options.quality === 'high' && !slowShown && time > 3) {
        slowFor = renderer.getStats().fps < SLOW_FPS ? slowFor + frameSeconds : 0;
        if (slowFor > SLOW_SECONDS) {
          slowShown = true;
          slow.show('Running slowly? Low graphics may help.', {
            label: 'Switch to Low',
            run: () => switchQuality(options.quality),
          });
          window.setTimeout(() => slow.show(null), 15000);
        }
      }
      ready = true;
    },
  });
  stopLoop = () => loop.stop();
  loop.start();

  const api: DebugApi = {
    get ready() {
      return ready;
    },
    stats: () => renderer.getStats(),
    ship: () => ({ ...current.ship }),
    tick: () => current.tick,
    mode: () => mode,
    islands: () => world.islands.map(({ name, kind, x, z, radius }) => ({ name, kind, x, z, radius })),
  };
  window.__ghostlight = Object.freeze(api);
}

main();

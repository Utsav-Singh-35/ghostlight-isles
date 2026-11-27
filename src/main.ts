import './ui/styles.css';
import { App } from './game/app';
import type { Quality } from './render/gameRenderer';
import { WORLD } from './sim/balance';
import { showFatal } from './ui/notice';

declare global {
  interface Window {
    /** Read-only stats for the smoke test and for curious players. */
    __ghostlight?: ReturnType<App['debug']>;
  }
}

const QUALITY_KEY = 'ghostlight.quality';

function storedQuality(): string | null {
  try {
    return window.localStorage.getItem(QUALITY_KEY);
  } catch {
    return null;
  }
}

function hasWebGL2(): boolean {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

function main(): void {
  const root = document.getElementById('app');
  if (!root) return;
  if (!hasWebGL2()) {
    showFatal(
      root,
      'This game needs WebGL 2',
      'Ghostlight Isles draws its 3D sea with WebGL 2. Please open it in a current version of Chrome, Edge, Firefox or Safari, and check that hardware acceleration is turned on in the browser settings.',
    );
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('quality') ?? storedQuality();
  const quality: Quality = requested === 'low' ? 'low' : 'high';
  const switchQuality = () => {
    const next: Quality = quality === 'high' ? 'low' : 'high';
    try {
      window.localStorage.setItem(QUALITY_KEY, next);
    } catch {
      // The URL parameter below still works.
    }
    const url = new URL(window.location.href);
    url.searchParams.set('quality', next);
    window.location.href = url.toString();
  };

  let app: App;
  try {
    app = new App(
      root,
      {
        quality,
        seedText: params.get('seed') || WORLD.defaultSeed,
        skipIntro: params.has('skipIntro'),
        scenario: params.get('scenario'),
        offline: params.has('offline'),
      },
      switchQuality,
    );
  } catch (error) {
    console.error(error);
    showFatal(root, 'The game could not start', 'Your browser could not create a WebGL 2 context. Try another browser or turn on hardware acceleration.', true);
    return;
  }
  const debug = app.debug();
  window.__ghostlight = Object.freeze({
    get ready() {
      return app.debug().ready;
    },
    get mode() {
      return app.debug().mode;
    },
    stats: debug.stats,
    ship: debug.ship,
    battle: debug.battle,
    resultShowing: debug.resultShowing,
    captain: debug.captain,
  });
}

main();

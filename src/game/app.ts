import { TICK_SECONDS, WORLD } from '../sim/balance';
import type { BattleResult, BattleSetup, InputEvent, Loadout } from '../sim/battle';
import { fortLayout } from '../sim/layout';
import { hashSeed } from '../sim/rng';
import type { ShipState } from '../sim/ship';
import { createWorldState, generateWorld, isAground, stepWorld, type World, type WorldState } from '../sim/world';
import { Session } from '../net/session';
import type { PublicProfile } from '../sim/profile';
import { GameRenderer, type Quality, type RenderStats } from '../render/gameRenderer';
import { BattleHud } from '../ui/battleHud';
import { CaptainBar } from '../ui/captainBar';
import { el } from '../ui/dom';
import { createHud, type Hud } from '../ui/hud';
import { createIntro, type Intro } from '../ui/intro';
import { createLabels, type Labels } from '../ui/labels';
import { createNotice, showFatal, type Notice } from '../ui/notice';
import { ResultScreen, type ResultInfo } from '../ui/resultScreen';
import { BattleRunner } from './battleRunner';
import { Keyboard } from './input';
import { interpolateShip } from './interpolate';
import { createFixedLoop, type FixedLoop } from './loop';

export type Mode = 'intro' | 'sail' | 'battle';

export interface AppOptions {
  readonly quality: Quality;
  readonly seedText: string;
  readonly skipIntro: boolean;
  readonly scenario: string | null;
  /** Play offline even if a server answers (for testing the offline path). */
  readonly offline: boolean;
}

/** A battle to fight: its setup, what to show, and what to do with the outcome. */
export interface BattleTicket {
  readonly title: string;
  readonly objective: string;
  readonly setup: BattleSetup;
  /** Called with the live result and the recorded inputs; returns the result card to show. */
  readonly finish: (result: BattleResult, inputs: readonly InputEvent[]) => Promise<ResultInfo> | ResultInfo;
}

/** The starting loadout, used for practice battles. */
export const PRACTICE_LOADOUT: Loadout = { hull: 160, cannon: 1, salt: 1, barrel: 1, bats: 1, gunner: 'living', navigator: 'living' };

const SIEGE_FAST_FORWARD = 4;

export class App {
  readonly world: World;
  readonly renderer: GameRenderer;
  readonly keyboard: Keyboard;
  private readonly overlay: HTMLElement;
  private readonly hud: Hud;
  private readonly labels: Labels;
  private readonly aground: Notice;
  private readonly slow: Notice;
  private readonly battleHud: BattleHud;
  private readonly results: ResultScreen;
  private readonly captainBar: CaptainBar;
  private readonly notice: Notice;
  private readonly intro: Intro | null;
  /** The signed-in captain, once the server (or offline save) has answered. */
  session: Session | null = null;
  private readonly loop: FixedLoop;
  private previous: WorldState;
  private current: WorldState;
  private runner: BattleRunner | null = null;
  private ticket: BattleTicket | null = null;
  private finishing = false;
  private mode: Mode = 'intro';
  private time = 0;
  private slowFor = 0;
  private slowShown = false;
  private ready = false;

  constructor(
    root: HTMLElement,
    private readonly options: AppOptions,
    onSwitchQuality: () => void,
  ) {
    this.world = generateWorld(hashSeed(options.seedText));
    this.previous = createWorldState(this.world);
    this.current = this.previous;
    this.keyboard = new Keyboard(window);
    this.renderer = new GameRenderer(root, this.world, options.quality, () => {
      this.loop.stop();
      showFatal(root, 'The graphics stopped working', 'The browser lost its WebGL context, which can happen when the graphics driver restarts. Reload the page to keep sailing.', true);
    });

    this.overlay = el('div', 'overlay');
    root.append(this.overlay);
    this.hud = createHud(this.overlay, options.quality, onSwitchQuality);
    this.labels = createLabels(this.overlay, this.world);
    this.aground = createNotice(this.overlay, 'notice-aground');
    this.slow = createNotice(this.overlay, 'notice-slow');
    this.battleHud = new BattleHud(this.overlay, () => this.keyboard.requestRetreat());
    this.results = new ResultScreen(this.overlay);
    this.captainBar = new CaptainBar(this.overlay);
    this.notice = createNotice(this.overlay, 'notice-info');
    Session.start(options.offline)
      .then((session) => {
        this.session = session;
        session.onChange((profile) => this.onProfile(profile));
      })
      .catch((error: unknown) => {
        console.error(error);
        this.notice.show('Your captain could not be loaded. You can still sail; progress will not be saved.', {
          label: 'Retry',
          run: () => window.location.reload(),
        });
      });
    this.keyboard.on('KeyR', () => {
      if (this.mode === 'battle') this.keyboard.salt = !this.keyboard.salt;
    });

    this.keyboard.setEnabled(false);
    this.keyboard.onFirstSailingKey(() => this.setSail());
    const skip = options.skipIntro || options.scenario !== null;
    this.intro = skip
      ? null
      : createIntro(this.overlay, () => this.setSail(), [
          { label: 'Try a fort battle', run: () => this.startScenario('practice-fort') },
          { label: 'Try defending Last Light', run: () => this.startScenario('practice-siege') },
        ]);
    if (skip) this.setSail();

    this.loop = createFixedLoop({
      tickSeconds: TICK_SECONDS,
      step: () => this.step(),
      render: (alpha, frameSeconds) => this.render(alpha, frameSeconds),
    });
    this.loop.start();
    if (options.scenario) this.startScenario(options.scenario);
  }

  /** Leaves the title screen and hands control to the player. */
  setSail(): void {
    if (this.mode !== 'intro') return;
    this.mode = 'sail';
    this.intro?.hide();
    this.keyboard.setEnabled(true);
    this.hud.setVisible(true);
    this.labels.setVisible(true);
    this.captainBar.setVisible(this.session !== null);
  }

  /** Called whenever the captain's profile changes. */
  private onProfile(profile: PublicProfile): void {
    this.captainBar.set(profile, this.session?.online ?? false);
    this.captainBar.setVisible(this.mode === 'sail');
  }

  private step(): void {
    if (this.mode === 'battle' && this.runner) {
      const runner = this.runner;
      const siegeWithoutShip = runner.current.setup.mode === 'siege' && runner.current.player.sunk;
      const ticks = siegeWithoutShip ? SIEGE_FAST_FORWARD : 1;
      for (let i = 0; i < ticks; i++) runner.step(this.keyboard.battleInput());
      if (runner.result && !this.finishing) this.finishBattle();
      return;
    }
    this.previous = this.current;
    this.current = stepWorld(this.world, this.current, this.keyboard.shipInput(), TICK_SECONDS);
  }

  private render(alpha: number, frameSeconds: number): void {
    this.time += frameSeconds;
    const runner = this.runner;
    if (this.mode === 'battle' && runner) {
      const ship = interpolateShip(runner.prev.player.ship, runner.current.player.ship, alpha);
      this.renderer.render({
        ship,
        time: this.time,
        dt: frameSeconds,
        mode: 'battle',
        bloodMoon: runner.current.setup.mode === 'siege' ? 1 : 0,
        battle: { prev: runner.prev, current: runner.current, alpha, events: runner.takeEvents() },
      });
      const layer = this.renderer.battleLayer;
      if (layer) this.battleHud.update(runner.current, layer, this.renderer, this.keyboard.salt);
    } else {
      const ship = interpolateShip(this.previous.ship, this.current.ship, alpha);
      this.renderer.render({ ship, time: this.time, dt: frameSeconds, mode: this.mode === 'intro' ? 'intro' : 'chase', bloodMoon: 0 });
      this.hud.update(ship, this.keyboard.sailLevel);
      this.labels.update(ship, this.renderer, this.renderer.labelAnchors);
      const stuck = this.mode === 'sail' && this.current.ship.sail > 0.1 ? isAground(this.world, this.current.ship) : null;
      this.aground.show(stuck ? `Aground on ${stuck.name}. Steer away with A or D.` : null);
    }
    this.watchFrameRate(frameSeconds);
    this.ready = true;
  }

  private watchFrameRate(frameSeconds: number): void {
    if (this.options.quality !== 'high' || this.slowShown || this.time < 3) return;
    this.slowFor = this.renderer.getStats().fps < 40 ? this.slowFor + frameSeconds : 0;
    if (this.slowFor <= 5) return;
    this.slowShown = true;
    this.slow.show('Running slowly? Low graphics may help.', { label: 'Switch to Low', run: () => this.switchQuality() });
    window.setTimeout(() => this.slow.show(null), 15000);
  }

  private switchQuality(): void {
    this.hud.setVisible(true);
    const url = new URL(window.location.href);
    url.searchParams.set('quality', this.options.quality === 'high' ? 'low' : 'high');
    window.location.href = url.toString();
  }

  /** Starts a battle. The open sea waits where the player left it. */
  startBattle(ticket: BattleTicket): void {
    if (this.mode === 'battle') return;
    this.intro?.hide();
    this.results.hide();
    this.ticket = ticket;
    this.runner = new BattleRunner(ticket.setup);
    this.finishing = false;
    this.mode = 'battle';
    this.keyboard.setEnabled(true);
    this.keyboard.sailLevel = 1;
    this.keyboard.salt = ticket.setup.mode === 'siege' && ticket.setup.loadout.salt > 0;
    this.hud.setVisible(false);
    this.labels.setVisible(false);
    this.captainBar.setVisible(false);
    this.aground.show(null);
    this.renderer.enterBattle(this.runner.current);
    this.battleHud.show({ title: ticket.title, objective: ticket.objective }, ticket.setup.mode === 'assault');
  }

  private finishBattle(): void {
    const runner = this.runner;
    const ticket = this.ticket;
    if (!runner || !ticket || !runner.result) return;
    this.finishing = true;
    const result = runner.result;
    const inputs = runner.inputs.slice();
    // Let the last explosions play before the result card appears.
    window.setTimeout(async () => {
      let info: ResultInfo;
      try {
        info = await ticket.finish(result, inputs);
      } catch (error) {
        console.error(error);
        info = { title: 'The tide turned', tone: 'neutral', lines: ['The battle could not be saved. Your progress is unchanged.'], actions: [] };
      }
      const actions = info.actions.length ? info.actions : [{ label: 'Back to the sea', primary: true, run: () => this.leaveBattle() }];
      this.results.show({ ...info, actions });
    }, 1400);
  }

  /** Returns from a battle to the open sea. */
  leaveBattle(): void {
    this.results.hide();
    this.battleHud.hide();
    this.renderer.exitBattle();
    this.runner = null;
    this.ticket = null;
    this.mode = 'sail';
    this.keyboard.sailLevel = 0;
    this.keyboard.salt = false;
    this.hud.setVisible(true);
    this.labels.setVisible(true);
    this.captainBar.setVisible(this.session !== null);
  }

  /** Practice battles, for judges and for the title screen's shortcuts. */
  startScenario(name: string): void {
    if (name === 'practice-fort') {
      const island = this.world.islands[1]!;
      const layout = fortLayout(island);
      this.startBattle({
        title: `Practice: the fort on ${island.name}`,
        objective: 'Destroy the ghost light at the island’s heart',
        setup: {
          seed: hashSeed(`practice-${Math.floor(this.time * 1000)}`),
          mode: 'assault',
          island: { radius: island.radius, living: false, level: layout.level, seed: island.seed, slotCount: layout.slotCount, mineSlotCount: layout.mineSlotCount },
          defenses: layout.defenses,
          loadout: PRACTICE_LOADOUT,
          fleet: { count: 0, level: 1 },
          timeLimitSeconds: 150,
        },
        finish: (result) => this.practiceResult(result, name),
      });
    } else if (name === 'practice-siege') {
      this.startBattle({
        title: 'Practice: the ghost fleet comes for Last Light',
        objective: 'Sink every ghost ship before they destroy the lighthouse',
        setup: {
          seed: hashSeed(`siege-${Math.floor(this.time * 1000)}`),
          mode: 'siege',
          island: { radius: WORLD.homeIslandRadius, living: true, level: 1, seed: this.world.islands[0]!.seed, slotCount: 6, mineSlotCount: 3 },
          defenses: [
            { type: 'cannonTower', level: 1, slot: 0 },
            { type: 'spiritLantern', level: 1, slot: 2 },
            { type: 'cannonTower', level: 1, slot: 4 },
            { type: 'mine', level: 1, slot: 1 },
          ],
          loadout: PRACTICE_LOADOUT,
          fleet: { count: 3, level: 1 },
          timeLimitSeconds: 150,
        },
        finish: (result) => this.practiceResult(result, name),
      });
    }
  }

  private practiceResult(result: BattleResult, scenario: string): ResultInfo {
    const lines = battleLines(result);
    const again = { label: 'Try again', run: () => { this.leaveBattle(); this.startScenario(scenario); } };
    const back = { label: 'Back to the sea', primary: true, run: () => this.leaveBattle() };
    if (result.ghostsTotal > 0) {
      const held = !result.keepDestroyed;
      return { title: held ? 'Last Light holds' : 'Last Light has fallen', tone: held ? 'win' : 'loss', lines, actions: [back, again] };
    }
    const won = result.keepDestroyed;
    return { title: won ? 'The fort is broken' : result.shipSunk ? 'Your ship went down' : 'The fort still stands', tone: won ? 'win' : 'loss', stars: result.stars, lines, actions: [back, again] };
  }

  /** Read-only stats for the smoke test. */
  debug() {
    return {
      ready: this.ready,
      mode: this.mode,
      stats: (): RenderStats => this.renderer.getStats(),
      ship: (): ShipState => ({ ...(this.runner ? this.runner.current.player.ship : this.current.ship) }),
      battle: () => {
        const s = this.runner?.current;
        if (!s) return null;
        return {
          mode: s.setup.mode,
          tick: s.tick,
          result: s.result,
          shotsFired: this.runner!.inputs.length,
          structuresStanding: s.structures.filter((x) => !x.destroyed && x.type !== 'mine').length,
          ghosts: s.ghosts.filter((g) => !g.sunk).length,
          hull: s.player.hp,
        };
      },
      resultShowing: () => this.results.visible,
      captain: () => {
        const s = this.session;
        if (!s) return null;
        return { name: s.profile.name, online: s.online, resources: { ...s.profile.resources }, captured: [...s.profile.captured], defenses: s.profile.defenses.length };
      },
    };
  }
}

/** Plain-words summary lines for a finished battle. */
export function battleLines(result: BattleResult): string[] {
  const lines: string[] = [];
  if (result.ghostsTotal > 0) {
    lines.push(`Ghost ships sunk: ${result.ghostsSunk} of ${result.ghostsTotal}`);
    lines.push(`Your island damaged: ${Math.round(result.destruction * 100)}%`);
    if (result.reason === 'dawn') lines.push('Dawn came and the fleet withdrew.');
  } else {
    lines.push(`Island destroyed: ${Math.round(result.destruction * 100)}%`);
    lines.push(result.keepDestroyed ? 'The keep fell.' : 'The keep still stands.');
    if (result.reason === 'retreat') lines.push('You retreated.');
    if (result.reason === 'time') lines.push('Dawn came before the fort fell.');
  }
  lines.push(result.shipSunk ? 'Your ship sank.' : `Your hull: ${Math.ceil(result.hull)} of ${result.maxHull}`);
  return lines;
}

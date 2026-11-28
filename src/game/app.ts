import { Sound } from '../audio/sound';
import type { Effect } from '../audio/synth';
import { SHIP, TICK_SECONDS, WORLD } from '../sim/balance';
import { angleDelta } from '../sim/math';
import { OrdersView } from '../ui/ordersView';
import { ORDERS, currentOrder, observe, readDone, writeDone, type OrderId } from './orders';
import { isRevealed, type BattleMode, type BattleResult, type BattleSetup, type BattleState, type InputEvent, type Loadout } from '../sim/battle';
import type { RewardLine } from '../sim/captureRewards';
import { hashSeed } from '../sim/rng';
import type { ShipState } from '../sim/ship';
import { createWorldState, generateWorld, isAground, stepWorld, type World, type WorldState } from '../sim/world';
import { ApiError } from '../net/backend';
import { Session } from '../net/session';
import { ECONOMY, FORTS, REWARDS } from '../sim/balance';
import { DEFENSE_NAMES, SHIP_PART_NAMES, slotsFor } from '../sim/base';
import { fortDifficulty, fortLayout, fortSetup, mineSlotPosition, slotPosition } from '../sim/layout';
import type { StructureView } from '../render/structureMeshes';
import { BasePanel } from '../ui/basePanel';
import { SidePanel, ago, duration } from '../ui/sidePanel';
import { fortToughness, starText } from '../sim/toughness';
import { LockerView } from '../ui/lockerView';
import { CREW_NAMES } from '../sim/crew';
import type { Resources } from '../sim/economy';
import { bloodMoonAt, fleetCanSail, moonEndsAt, moonIsUp } from '../sim/bloodMoon';
import type { PublicProfile } from '../sim/profile';
import { generatePuzzle, type Orientation } from '../sim/puzzle';
import type { Island } from '../sim/world';
import { ContextPrompt, type PromptAction } from '../ui/prompt';
import { PuzzleView } from '../ui/puzzleView';
import { Toasts } from '../ui/toast';
import { GameRenderer, type Quality, type RenderStats } from '../render/gameRenderer';
import { BattleHud } from '../ui/battleHud';
import { AccountPanel } from '../ui/accountPanel';
import { CaptainBar } from '../ui/captainBar';
import { el } from '../ui/dom';
import { createHud, type Hud } from '../ui/hud';
import { createIntro, type Intro } from '../ui/intro';
import { LABEL_RANGE, createLabels, type Labels } from '../ui/labels';
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
  /** No automatic ghost sieges from the shared Blood Moon (summoning still works). For tests and recording. */
  readonly calm: boolean;
}

/** A battle to fight: its setup, what to show, and what to do with the outcome. */
export interface BattleTicket {
  readonly title: string;
  readonly objective: string;
  readonly setup: BattleSetup;
  /** A haunted fort's level, for drawing its walls; leave out for living islands. */
  readonly fortLevel?: number;
  /** Called with the live result and the recorded inputs; returns the result card to show. */
  readonly finish: (result: BattleResult, inputs: readonly InputEvent[]) => Promise<ResultInfo> | ResultInfo;
}

/** The starting loadout, used for practice battles. */
export const PRACTICE_LOADOUT: Loadout = { hull: 160, cannon: 1, salt: 1, barrel: 1, bats: 1, mortar: 1, gunner: 'living', navigator: 'living' };

const SIEGE_FAST_FORWARD = 4;
/** A haunted island can be attacked once its shore is this close, metres. */
const ATTACK_RANGE = 140;
const ORDERS_KEY = 'ghostlight.orders';
const ORDERS_HIDDEN_KEY = 'ghostlight.orders.hidden';

/** Reads a saved setting; private windows may refuse storage. */
function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // The setting then lasts for this visit only.
  }
}

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
  private readonly prompt: ContextPrompt;
  private readonly puzzle: PuzzleView;
  readonly toasts: Toasts;
  /** Progress only happens in the standard sea; custom seeds are for exploring. */
  private readonly standardSea: boolean;
  /** True while a request to the server is in flight, so keys can't start two things at once. */
  private busy = false;
  private readonly basePanel: BasePanel;
  private readonly side: SidePanel;
  private readonly account: AccountPanel;
  private readonly fleetNotice: Notice;
  private readonly locker: LockerView;
  /** How red the night is right now, easing toward the moon's state. */
  private bloodAmount = 0;
  /** When the ghost fleet reaches Last Light (local milliseconds), or null. */
  private fleetEta: number | null = null;
  private readonly intro: Intro | null;
  readonly sound = new Sound();
  private readonly ordersView: OrdersView;
  private ordersDone: Set<OrderId>;
  private ordersHidden: boolean;
  /** Orders carried out since the last frame (building, starting a siege or a raid). */
  private ordersDid: OrderId[] = [];
  /** True once the captain has loaded, so orders ticked from an old profile don't chime. */
  private ordersPrimed = false;
  /** The island whose fort report the player opened by clicking its label, or null. */
  private selected: number | null = null;
  /** Radians the ship has turned at sea this visit, for the steer order. */
  private turned = 0;
  private lastHeading: number | null = null;
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
    this.hud = createHud(this.overlay, options.quality, onSwitchQuality, [
      { label: 'Base (Tab)', title: 'Build defenses on Last Light and refit your ship', run: () => this.toggleBase() },
      { label: 'Raid (R)', title: "Attack another captain's island while they're away", run: () => void this.openRaids() },
      { label: 'Log (L)', title: 'Reports and the leaderboard', run: () => void this.openLog('reports') },
      { label: 'Summon the Blood Moon', title: 'Call the ghost fleet to Last Light now instead of waiting for the shared Blood Moon', run: () => void this.summon() },
      { label: () => (this.sound.enabled ? 'Sound: On' : 'Sound: Off'), title: 'Turn sound on or off (M)', run: () => this.toggleSound() },
      {
        label: () => (this.session && !this.session.guest ? this.session.profile.username! : 'Account'),
        title: 'Create an account to keep your captain, log in, or log out',
        run: () => this.toggleAccount(),
      },
    ]);
    this.labels = createLabels(this.overlay, this.world, (id) => this.selectIsland(id));
    this.aground = createNotice(this.overlay, 'notice-aground');
    this.slow = createNotice(this.overlay, 'notice-slow');
    this.battleHud = new BattleHud(
      this.overlay,
      () => this.keyboard.requestRetreat(),
      (id) => {
        this.keyboard.lock = this.keyboard.lock === id ? 0 : id;
      },
    );
    this.results = new ResultScreen(this.overlay, (tone) => {
      if (tone !== 'neutral') this.sound.play(tone);
    });
    this.captainBar = new CaptainBar(this.overlay);
    this.notice = createNotice(this.overlay, 'notice-info');
    this.prompt = new ContextPrompt(this.overlay);
    this.puzzle = new PuzzleView(this.overlay, (cue) => this.sound.play(cue));
    this.toasts = new Toasts(this.overlay);
    const command = (path: string, body: Record<string, unknown>, done: string, effect: Effect = 'build') =>
      void this.guarded(async () => {
        await this.session?.request('POST', path, body);
        this.sound.play(effect);
        if (path === '/base/build') this.ordersDid.push('build');
        this.toasts.show(done, 'good', 3);
      });
    this.basePanel = new BasePanel(this.overlay, {
      build: (type, slot) => command('/base/build', { type, slot }, `${DEFENSE_NAMES[type]} built`),
      upgrade: (type, slot) => command('/base/upgrade', { type, slot }, `${DEFENSE_NAMES[type]} upgraded`),
      remove: (type, slot) => command('/base/remove', { type, slot }, `${DEFENSE_NAMES[type]} removed`),
      upgradeHome: () => command('/base/home', {}, 'Last Light grows stronger'),
      upgradeShip: (part) => command('/ship/upgrade', { part }, `${SHIP_PART_NAMES[part]} refitted`),
      cleanse: () => command('/chapel/cleanse', {}, 'The chapel takes the cursed gold', 'coin'),
      keepCrew: (role) => command('/crew/keep', { role }, `Your ghost ${CREW_NAMES[role]} stays aboard`, 'lit'),
      hireCrew: (role) => command('/crew/hire', { role }, `A new ${CREW_NAMES[role]} signs on`, 'coin'),
      close: () => this.toggleBase(false),
    });
    this.fleetNotice = createNotice(this.overlay, 'notice-fleet');
    this.locker = new LockerView(this.overlay, this.renderer.renderer.domElement, {
      escape: () => void this.escapeLocker(),
      pay: () => void this.payFerryman(),
    });
    this.keyboard.on('Tab', () => this.toggleBase());
    this.side = new SidePanel(this.overlay, 'Raids and the Captain’s Log', () => this.side.close());
    this.keyboard.on('KeyR', () => {
      if (this.mode === 'sail') void (this.side.visible ? this.side.close() : this.openRaids());
    });
    this.keyboard.on('KeyL', () => {
      if (this.mode === 'sail') void (this.side.visible ? this.side.close() : this.openLog('reports'));
    });
    this.account = new AccountPanel(this.overlay, {
      register: async (username, password) => {
        await this.session!.register(username, password);
        this.account.close();
        this.toasts.show(`Welcome aboard, ${username}. Your captain is saved to your account.`, 'good', 4);
      },
      login: async (username, password) => {
        await this.session!.login(username, password);
        window.location.reload();
      },
      logout: () => {
        this.session?.logout();
        window.location.reload();
      },
      close: () => this.account.close(),
    });
    this.keyboard.on('Escape', () => {
      this.account.close();
      this.side.close();
      this.toggleBase(false);
      this.selected = null;
    });
    this.keyboard.on('KeyM', () => this.toggleSound());
    this.keyboard.on('KeyT', () => this.cycleLock());
    this.overlay.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('button')) this.sound.play('click');
    });
    this.ordersHidden = readStorage(ORDERS_HIDDEN_KEY) === '1';
    this.ordersDone = readDone(readStorage(ORDERS_KEY));
    this.ordersView = new OrdersView(this.captainBar.column, ORDERS.length, () => this.hideOrders());
    window.setInterval(() => {
      if (this.session) this.captainBar.set(this.session.profile, this.session.online, this.session.now());
    }, 30_000);
    this.standardSea = options.seedText === WORLD.defaultSeed;
    for (const code of ['Digit1', 'Digit2', 'Digit3']) {
      this.keyboard.on(code, () => {
        if (this.mode === 'sail' && !this.puzzle.visible && !this.results.visible && !this.locker.visible) this.prompt.press(code);
      });
    }
    window.setInterval(() => void this.collectTribute(), 60_000);
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
          {
            label: 'Summon the Blood Moon',
            run: () => {
              this.setSail();
              void this.summon();
            },
          },
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

  /** Opens or closes the Account panel. Only while sailing, so it never covers a battle. */
  private toggleAccount(): void {
    if (this.account.visible) {
      this.account.close();
      return;
    }
    const session = this.session;
    if (!session || this.mode !== 'sail') return;
    this.side.close();
    this.toggleBase(false);
    this.account.show({ name: session.profile.name, username: session.profile.username, online: session.online });
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
    this.captainBar.set(profile, this.session?.online ?? false, this.session?.now() ?? Date.now());
    this.captainBar.setVisible(this.mode === 'sail');
    const captured = this.standardSea ? profile.captured : [];
    this.renderer.setCapturedIslands(captured);
    this.labels.setCaptured(captured);
    this.renderer.setHomeDefenses(this.homeViews(profile));
    this.basePanel.update(profile, this.session?.now() ?? Date.now());
    this.checkLocker();
  }

  /** Shows Davy Jones' Locker while the captain's ship lies on the seabed. */
  private checkLocker(): void {
    const sunk = this.session?.profile.sunk ?? false;
    if (sunk && this.mode === 'sail' && !this.puzzle.visible && !this.results.visible) {
      this.toggleBase(false);
      this.side.close();
      this.prompt.hide();
      this.keyboard.sailLevel = 0;
      this.keyboard.setEnabled(false);
      this.locker.show(this.session!.profile.resources);
    } else if (!sunk && this.locker.visible) {
      this.locker.hide();
      this.keyboard.setEnabled(true);
    }
  }

  /** Puts a freed ship back beside Last Light. */
  private washUp(): void {
    this.previous = createWorldState(this.world);
    this.current = this.previous;
    this.keyboard.sailLevel = 0;
    this.keyboard.setEnabled(true);
    this.renderer.rig.snap();
  }

  private async escapeLocker(): Promise<void> {
    const session = this.session;
    if (!session) return;
    await this.guarded(async () => {
      const { ticket } = await session.request<{ ticket: { id: string; puzzleSeed: number; seconds: number } }>('POST', '/locker/escape');
      this.locker.show(session.profile.resources, true);
      const finish = async (orientation: Orientation[]) => {
        await this.guarded(async () => {
          const { outcome } = await session.request<{ outcome: { escaped: boolean; lost: number } }>('POST', '/locker/finish', { id: ticket.id, orientation });
          this.locker.hide();
          this.washUp();
          this.results.show(
            outcome.escaped
              ? { title: 'You rise from the deep', tone: 'win', lines: ['The beam lit every totem and the Ferryman let you go.', 'You wash up beside Last Light with nothing lost.'], actions: [{ label: 'Back to the sea', primary: true, run: () => {} }] }
              : { title: 'The sea took its toll', tone: 'loss', lines: [`You wash up beside Last Light, ${outcome.lost} gold lighter.`], actions: [{ label: 'Back to the sea', primary: true, run: () => {} }] },
          );
        });
        this.checkLocker();
      };
      this.puzzle.open(generatePuzzle(ticket.puzzleSeed), {
        title: "Escape Davy Jones' Locker",
        subtitle: 'Light every totem before the deep keeps you.',
        timeLimitSeconds: ticket.seconds,
        onSolved: (o) => void finish(o),
        onGiveUp: (o) => void finish(o),
        onTimeout: (o) => void finish(o),
      });
    });
  }

  private async payFerryman(): Promise<void> {
    const session = this.session;
    if (!session) return;
    await this.guarded(async () => {
      await session.request('POST', '/locker/pay');
      this.locker.hide();
      this.washUp();
      this.toasts.show('The Ferryman takes his fare and rows you back to Last Light.', 'good', 5);
    });
  }

  /** Calls up a personal Blood Moon; the fleet arrives a few seconds later. */
  private async summon(): Promise<void> {
    const session = this.session;
    if (!session || this.mode === 'battle' || this.locker.visible) return;
    if (!this.standardSea) {
      this.toasts.show('The ghost fleet only sails in the standard sea. Remove ?seed from the address.', 'bad', 6);
      return;
    }
    await this.guarded(async () => {
      await session.request('POST', '/ghosts/summon');
      this.toasts.show('The moon turns red. The ghost fleet is coming for Last Light!', 'bad', 5);
      this.fleetEta = Date.now() + 5000;
      this.sound.play('bell');
    });
  }

  /** Watches the moon: reddens the night, warns of the fleet and starts the siege when it arrives. */
  private watchMoon(frameSeconds: number): void {
    const session = this.session;
    const now = session?.now() ?? Date.now();
    const up = session ? moonIsUp(session.profile, now) && this.standardSea : false;
    this.bloodAmount += ((up ? 1 : 0) - this.bloodAmount) * Math.min(1, frameSeconds * 0.8);
    if (!session) return;
    const moon = bloodMoonAt(now);
    const clock = (ms: number) => {
      const s = Math.max(0, Math.ceil(ms / 1000));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    };
    if (!up) {
      this.captainBar.setMoon(`Blood Moon rises in ${clock(moon.nextStart - now)}`, false);
      this.fleetEta = null;
      this.fleetNotice.show(null);
      return;
    }
    const summoned = session.profile.summonedUntil > now;
    const sail = fleetCanSail(session.profile, now) && (summoned || !this.options.calm);
    if (!sail || session.profile.sunk) {
      this.captainBar.setMoon(`Blood Moon for ${clock(moonEndsAt(session.profile, now) - now)} · Last Light rests`, true);
      this.fleetEta = null;
      this.fleetNotice.show(null);
      return;
    }
    if (this.mode !== 'sail' || this.puzzle.visible || this.results.visible || this.busy) return;
    if (this.fleetEta === null) {
      this.fleetEta = Date.now() + 20_000;
      this.sound.play('bell');
    }
    const left = this.fleetEta - Date.now();
    this.captainBar.setMoon(`Blood Moon · the ghost fleet reaches Last Light in ${clock(left)}`, true);
    this.fleetNotice.show(`The ghost fleet sails for Last Light. It arrives in ${Math.max(0, Math.ceil(left / 1000))} s.`, {
      label: 'Defend now',
      run: () => void this.defend(),
    });
    if (left <= 0) void this.defend();
  }

  /** The siege of Last Light, fought under the Blood Moon. */
  private async defend(): Promise<void> {
    const session = this.session;
    if (!session || this.mode !== 'sail') return;
    this.fleetEta = null;
    this.fleetNotice.show(null);
    this.toggleBase(false);
    this.side.close();
    await this.guarded(async () => {
      const { ticket } = await session.request<{ ticket: { id: string; setup: BattleSetup } }>('POST', '/ghosts/defend');
      this.ordersDid.push('moon');
      this.startBattle({
        title: 'The ghost fleet comes for Last Light',
        objective: 'Sink every ghost before they put out the lighthouse. R loads Salt Shot.',
        setup: ticket.setup,
        finish: async (_live, inputs) => {
          const { outcome } = await session.request<{ outcome: GhostOutcome }>('POST', '/ghosts/finish', { id: ticket.id, inputs });
          const { result, taken, rewards } = outcome;
          const held = !result.keepDestroyed;
          const lines = battleLines(result, 'siege');
          lines.push(`+${rewards.cursedGold} cursed gold, +${rewards.ectoplasm} ectoplasm from the wrecks`);
          if (taken.gold + taken.cursedGold + taken.ectoplasm > 0) lines.push(`The ghosts carried off ${taken.gold + taken.cursedGold} gold and ${taken.ectoplasm} ectoplasm.`);
          lines.push('Last Light rests until the next Blood Moon.');
          return { title: held ? 'Last Light holds' : 'The lighthouse went dark', tone: held ? 'win' : 'loss', lines, actions: [] };
        },
      });
    });
  }

  /** The captain's defenses as they stand on Last Light in the open sea. */
  private homeViews(profile: PublicProfile): StructureView[] {
    const home = this.world.islands[0]!;
    const slots = slotsFor(profile.homeLevel);
    return profile.defenses.map((d) => {
      const mine = d.type === 'mine';
      const p = mine ? mineSlotPosition(home.radius, d.slot, slots.mines) : slotPosition(home.radius, d.slot, slots.towers);
      const x = home.x + p.x;
      const z = home.z + p.z;
      return { type: d.type, level: d.level, x, y: mine ? -0.15 : this.renderer.groundAt(home.id, x, z), z, facing: Math.atan2(p.x, p.z), destroyed: false, visible: true };
    });
  }

  /** Lists islands to raid. */
  private async openRaids(): Promise<void> {
    const session = this.session;
    if (!session || this.mode !== 'sail' || this.puzzle.visible || this.results.visible || this.locker.visible) return;
    this.toggleBase(false);
    await this.guarded(async () => {
      const { targets, now } = await session.request<{ targets: RaidTarget[]; now: number }>('GET', '/raids/targets');
      const rows = targets.map((t) => this.raidRow(t, now));
      const intro = el('p', 'sp-note', 'You fight a copy of their island; they can be away. Half the island earns a star, its lighthouse a second, everything a third. You take up to 30% of their storage.');
      this.side.show('Raid an island', [this.raidSearch(), intro, ...rows]);
    });
  }

  /** One island in the raid list: who, how tough, what it could lose, and a Raid button. */
  private raidRow(t: RaidTarget, now: number): HTMLElement {
    const row = el('div', 'sp-row');
    const who = t.kind === 'rival' ? `Captain ${t.name}` : `Captain ${t.name} (a real player)`;
    const title = el('div', 'sp-row-title', who);
    const stars = el('span', 'toughness', ` ${starText(t.toughness)}`);
    stars.title = `Toughness ${t.toughness} of 5`;
    stars.setAttribute('aria-label', `Toughness ${t.toughness} of 5`);
    title.append(stars);
    row.append(
      title,
      el('p', 'sp-row-detail', `Island level ${t.homeLevel}, ${t.defenses} ${t.defenses === 1 ? 'defense' : 'defenses'}, ${t.infamy} infamy. Could lose up to ${t.loot.gold} gold and ${t.loot.ectoplasm} ectoplasm.`),
    );
    const shielded = (t.protectedUntil ?? 0) > now;
    const raid = el('button', 'bp-action', shielded ? `Protected for ${duration((t.protectedUntil ?? 0) - now)}` : `Raid ${t.name}`);
    raid.type = 'button';
    raid.disabled = shielded;
    raid.addEventListener('click', () => void this.startRaid(t.id));
    row.append(raid);
    return row;
  }

  /** Find a captain by username, to raid them. */
  private raidSearch(): HTMLElement {
    const form = el('form', 'sp-search');
    const input = el('input', 'ac-input');
    input.type = 'search';
    input.placeholder = 'Find a captain by username';
    input.setAttribute('aria-label', 'Find a captain by username');
    input.maxLength = 16;
    input.spellcheck = false;
    const go = el('button', 'ghost-button', 'Find');
    go.type = 'submit';
    const found = el('div', 'sp-found');
    form.append(input, go, found);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const session = this.session;
      const name = input.value.trim();
      if (!session || !name) return;
      session
        .request<{ target: RaidTarget; now: number }>('GET', `/raids/find/${encodeURIComponent(name)}`)
        .then(({ target, now }) => found.replaceChildren(this.raidRow(target, now)))
        .catch((e: unknown) => found.replaceChildren(el('p', 'ac-error', e instanceof Error ? e.message : 'Nobody answered.')));
    });
    return form;
  }

  private async startRaid(targetId: string): Promise<void> {
    const session = this.session;
    if (!session) return;
    this.side.close();
    await this.guarded(async () => {
      const { ticket } = await session.request<{ ticket: { id: string; setup: BattleSetup; targetName: string } }>('POST', '/raids/start', { targetId });
      this.ordersDid.push('raid');
      this.startBattle({
        title: `Raid on Captain ${ticket.targetName}`,
        objective: 'Destroy what you can. The lighthouse counts three times.',
        setup: ticket.setup,
        finish: async (_live, inputs) => {
          const { outcome } = await session.request<{ outcome: RaidOutcome }>('POST', '/raids/finish', { id: ticket.id, inputs });
          const { result, loot } = outcome;
          const lines = battleLines(result, 'assault');
          lines.push(`Loot: ${loot.gold + loot.cursedGold} gold${loot.cursedGold ? ` (${loot.cursedGold} of it cursed)` : ''}, ${loot.ectoplasm} ectoplasm`);
          lines.push(`Infamy +${REWARDS.infamyPerStar * result.stars}`);
          return {
            title: result.stars > 0 ? `You raided Captain ${outcome.targetName}` : `Captain ${outcome.targetName}'s island held`,
            tone: result.stars > 0 ? 'win' : 'loss',
            stars: result.stars,
            lines,
            actions: [],
          };
        },
      });
    });
  }

  /** The Captain's Log: reports and the leaderboard. */
  private async openLog(tab: 'reports' | 'leaderboard'): Promise<void> {
    const session = this.session;
    if (!session || this.mode !== 'sail' || this.locker.visible) return;
    this.toggleBase(false);
    const tabs = [
      { id: 'reports', label: 'Reports' },
      { id: 'leaderboard', label: 'Leaderboard' },
    ];
    const switchTab = (id: string) => void this.openLog(id === 'leaderboard' ? 'leaderboard' : 'reports');
    if (tab === 'reports') {
      const now = session.now();
      const reports = session.profile.reports;
      const rows = reports.length
        ? reports.map((r) => {
            const row = el('div', `sp-row sp-row-${r.tone}`);
            row.append(el('div', 'sp-row-title', r.title), el('p', 'sp-row-detail', `${r.detail} (${ago(now - r.at)})`));
            if (r.from) {
              const back = el('button', 'bp-action', `Raid ${r.from.name} back`);
              back.type = 'button';
              back.addEventListener('click', () => void this.startRaid(r.from!.id));
              row.append(back);
            }
            return row;
          })
        : [el('p', 'sp-note', 'Nothing yet. Capture an island, raid a rival or survive a Blood Moon, and it will be written here.')];
      this.side.show('Captain’s Log', rows, tabs, 'reports', switchTab);
      return;
    }
    await this.guarded(async () => {
      const board = await session.request<{ entries: LeaderboardEntry[]; you: { rank: number; infamy: number; of: number } }>('GET', '/leaderboard');
      const rows: Node[] = board.entries.map((e) => {
        const row = el('div', `sp-rank${e.you ? ' sp-rank-you' : ''}`);
        row.append(el('span', undefined, `${e.rank}.`), el('span', undefined, `Captain ${e.name}${e.kind === 'rival' ? '' : ' (player)'}${e.you ? ' (you)' : ''}`), el('span', undefined, `${e.infamy} infamy`));
        return row;
      });
      rows.push(el('p', 'sp-note', `You are number ${board.you.rank} of ${board.you.of} with ${board.you.infamy} infamy. Infamy comes from captures (+${REWARDS.infamyPerCapture}), raid stars (+${REWARDS.infamyPerStar} each) and sinking ghost ships.`));
      this.side.show('Captain’s Log', rows, tabs, 'leaderboard', switchTab);
    });
  }

  /** Opens or closes the base panel. The camera flies to Last Light while it is open. */
  toggleBase(open = !this.basePanel.visible): void {
    if (open) {
      if (this.mode !== 'sail' || !this.session || this.puzzle.visible || this.results.visible || this.locker.visible) return;
      this.side.close();
      this.keyboard.sailLevel = 0;
      this.keyboard.setEnabled(false);
      this.prompt.hide();
      this.labels.setVisible(false);
      this.renderer.rig.setView(0.75, 70);
      this.basePanel.open(this.session.profile, this.session.now());
    } else if (this.basePanel.visible) {
      this.basePanel.close();
      this.keyboard.setEnabled(true);
      this.labels.setVisible(true);
      this.renderer.rig.setView(0.3, 30);
    }
  }

  /** A message that is safe to show for a failed request. */
  private messageOf(error: unknown): string {
    if (error instanceof ApiError) return error.message;
    console.error(error);
    return 'The tide turned and the message was lost. Try again.';
  }

  /** Runs a server request with the busy flag set, showing any failure as a toast. */
  private async guarded(action: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await action();
    } catch (error) {
      this.toasts.show(this.messageOf(error), 'bad', 6);
    } finally {
      this.busy = false;
    }
  }

  private async collectTribute(): Promise<void> {
    const session = this.session;
    if (!session || session.profile.captured.length === 0 || this.busy) return;
    try {
      const { gold } = await session.request<{ gold: number }>('POST', '/collect');
      if (gold > 0) {
        this.sound.play('coin');
        this.toasts.show(`+${gold} gold in tribute from your islands`, 'good');
      }
    } catch {
      // Tribute waits for the next minute.
    }
  }

  /** The island whose shore is nearest, if within reach. */
  private nearbyIsland(): Island | null {
    const ship = this.current.ship;
    let best: Island | null = null;
    let bestDistance = ATTACK_RANGE;
    for (const island of this.world.islands) {
      const d = Math.hypot(island.x - ship.x, island.z - ship.z) - island.radius;
      if (d < bestDistance) {
        best = island;
        bestDistance = d;
      }
    }
    return best;
  }

  /** Shows what the captain can do at the nearest island. */
  private updatePrompt(): void {
    if (this.mode !== 'sail' || this.puzzle.visible || this.results.visible || this.basePanel.visible || this.locker.visible) {
      this.prompt.hide();
      return;
    }
    // A fort report the player opened by clicking a label comes first.
    if (this.showFortReport()) return;
    const island = this.nearbyIsland();
    const session = this.session;
    if (!island) {
      this.prompt.hide();
      return;
    }
    const actions: PromptAction[] = [];
    if (island.kind === 'home') {
      this.prompt.show('Last Light, your home', 'The lighthouse keeps the dead away while its lanterns burn.', this.homeActions());
      return;
    }
    if (!session) {
      this.prompt.show(island.name, 'Your captain is still being loaded…', actions);
      return;
    }
    if (!this.standardSea) {
      this.prompt.show(island.name, 'Captures need the standard sea. Remove ?seed from the address to play for real.', actions);
      return;
    }
    if (session.profile.captured.includes(island.id)) {
      this.prompt.show(`${island.name}, yours`, `Pays ${ECONOMY.tributePerMinute} gold a minute in tribute.`, actions);
      return;
    }
    if (session.profile.sunk) {
      this.prompt.show(island.name, "Your ship lies in Davy Jones' Locker.", actions);
      return;
    }
    actions.push({ code: 'Digit1', key: '1', label: 'Attack the fort', run: () => void this.captureFort(island) });
    this.prompt.show(`${island.name}, haunted`, [fortDetail(island), 'Click its name for the full fort report.'], actions);
  }

  /** Clicking a haunted island's label opens its fort report; clicking it again closes it. */
  private selectIsland(id: number): void {
    if (this.mode !== 'sail') return;
    this.selected = this.selected === id ? null : id;
  }

  /** The fort report for the selected island, if it is still worth showing. Returns false when there is none. */
  private showFortReport(): boolean {
    const id = this.selected;
    const session = this.session;
    const island = id === null ? undefined : this.world.islands[id];
    if (!island || !session || island.kind !== 'haunted' || !this.standardSea || session.profile.captured.includes(island.id)) {
      this.selected = null;
      return false;
    }
    const ship = this.current.ship;
    const away = Math.hypot(island.x - ship.x, island.z - ship.z) - island.radius;
    if (away > LABEL_RANGE) {
      this.selected = null;
      return false;
    }
    const lines = fortReport(island);
    const actions: PromptAction[] = [];
    if (session.profile.sunk) lines.push("Your ship lies in Davy Jones' Locker.");
    else if (away <= ATTACK_RANGE) actions.push({ code: 'Digit1', key: '1', label: 'Attack the fort', run: () => void this.captureFort(island) });
    else lines.push(`Sail ${Math.ceil((away - ATTACK_RANGE) / 10) * 10} m closer to attack.`);
    this.prompt.show(`${island.name} · fort ${fortDifficulty(island)} of ${FORTS.levels}`, lines, actions);
    return true;
  }

  /** Ticks off the captain's orders from what happened this frame, and shows the next one. */
  private updateOrders(): void {
    if (this.ordersHidden || !this.standardSea || this.mode !== 'sail') {
      this.ordersView.hide();
      return;
    }
    const ship = this.current.ship;
    if (this.lastHeading !== null) this.turned += Math.abs(angleDelta(this.lastHeading, ship.heading));
    this.lastHeading = ship.heading;
    const session = this.session;
    const profile = session?.profile ?? null;
    const island = this.nearbyIsland();
    const nearHaunted = island !== null && island.kind === 'haunted' && profile !== null && !profile.captured.includes(island.id);
    const next = observe(this.ordersDone, {
      sailLevel: this.keyboard.sailLevel,
      turned: this.turned,
      nearHaunted,
      did: this.ordersDid,
      captain: profile
        ? {
            captured: profile.captured.length,
            defenses: profile.defenses.length,
            raidsWon: profile.stats.raidsWon,
            ghostRaidsRepelled: profile.stats.ghostRaidsRepelled,
            ghostShipsSunk: profile.stats.ghostShipsSunk,
          }
        : null,
    });
    this.ordersDid = [];
    if (next.size !== this.ordersDone.size) {
      this.ordersDone = next;
      writeStorage(ORDERS_KEY, writeDone(next));
      if (this.ordersPrimed) this.sound.play('order');
    }
    if (session) this.ordersPrimed = true;
    const current = currentOrder(this.ordersDone);
    if (current) this.ordersView.show(current.number, ORDERS.length, current.order.text, ORDERS.map((o) => this.ordersDone.has(o.id)));
    else this.ordersView.finish(() => this.hideOrders());
  }

  private hideOrders(): void {
    this.ordersHidden = true;
    writeStorage(ORDERS_HIDDEN_KEY, '1');
  }

  /** T in battle: lock the next target by distance from the ship; after the last one, let go. */
  private cycleLock(): void {
    const state = this.runner?.current;
    if (this.mode !== 'battle' || !state) return;
    const p = state.player.ship;
    const away = (t: { x: number; z: number }) => Math.hypot(t.x - p.x, t.z - p.z);
    const targets = lockable(state, true).sort((a, b) => away(a) - away(b) || a.id - b.id);
    const i = targets.findIndex((t) => t.id === this.keyboard.lock);
    this.keyboard.lock = i < 0 ? (targets[0]?.id ?? 0) : (targets[i + 1]?.id ?? 0);
  }

  private toggleSound(): void {
    const on = this.sound.toggle();
    this.toasts.show(on ? 'Sound on. Press M to turn it off.' : 'Sound off. Press M to turn it on.', 'neutral', 2.5);
  }

  /** Actions at Last Light. */
  protected homeActions(): PromptAction[] {
    return [{ code: 'Digit1', key: '1', label: 'Open your base', run: () => this.toggleBase(true) }];
  }

  private async captureFort(island: Island): Promise<void> {
    const session = this.session;
    if (!session) return;
    await this.guarded(async () => {
      const { ticket } = await session.request<{ ticket: { id: string; setup: BattleSetup } }>('POST', '/captures/start', { islandId: island.id });
      this.startBattle({
        title: `Assault on ${island.name}, a level ${fortDifficulty(island)} fort`,
        objective: fortObjective(ticket.setup),
        setup: ticket.setup,
        fortLevel: fortDifficulty(island),
        finish: async (_live, inputs) => {
          const { outcome } = await session.request<{ outcome: CaptureOutcome }>('POST', '/captures/finish', { id: ticket.id, inputs });
          return this.captureResult(island, outcome);
        },
      });
    });
  }

  private captureResult(island: Island, outcome: CaptureOutcome): ResultInfo {
    const lines = battleLines(outcome.result, 'assault');
    if (outcome.won) {
      const { rewards } = outcome;
      // Each part of the reward on its own line, as the server worked it out from its replay.
      const parts = rewards.lines.map((l) => `${l.label}: +${l.gold} gold${l.ectoplasm ? `, +${l.ectoplasm} ectoplasm` : ''}`);
      return {
        title: `${island.name} is yours`,
        tone: 'win',
        stars: outcome.result.stars,
        lines: [
          ...lines,
          ...parts,
          `In all: +${rewards.gold} gold, +${rewards.ectoplasm} ectoplasm${rewards.full ? ' (your storage is full, so some was left behind)' : ''}`,
          `It pays ${ECONOMY.tributePerMinute} gold a minute in tribute.`,
        ],
        actions: [],
      };
    }
    return { title: `${island.name} stays haunted`, tone: 'loss', stars: outcome.result.stars, lines, actions: [] };
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
      const events = runner.takeEvents();
      const blood = runner.current.setup.mode === 'siege' ? 1 : 0;
      this.renderer.render({
        ship,
        time: this.time,
        dt: frameSeconds,
        mode: 'battle',
        bloodMoon: blood,
        battle: { prev: runner.prev, current: runner.current, alpha, events },
      });
      const right = this.renderer.screenRight();
      this.sound.battle(events, { x: ship.x, z: ship.z, rightX: right.x, rightZ: right.z }, runner.current.setup.island.radius);
      this.sound.frame({ dt: frameSeconds, speed: runner.current.player.sunk ? 0 : ship.speed / SHIP.maxSpeed, blood, underwater: false });
      // A lock on something destroyed or sunk lets go. (A ghost that slips into the fog stays locked.)
      const lock = this.keyboard.lock;
      if (lock && !lockable(runner.current, false).some((t) => t.id === lock)) this.keyboard.lock = 0;
      const layer = this.renderer.battleLayer;
      layer?.setLock(this.keyboard.lock);
      if (layer) this.battleHud.update(runner.current, layer, this.renderer, this.keyboard.salt, this.keyboard.lock);
    } else {
      const ship = interpolateShip(this.previous.ship, this.current.ship, alpha);
      const home = this.world.islands[0]!;
      const base = this.basePanel.visible;
      this.renderer.render({
        ship,
        time: this.time,
        dt: frameSeconds,
        mode: this.mode === 'intro' ? 'intro' : base ? 'base' : 'chase',
        ...(base ? { cameraTarget: { x: home.x + 20, z: home.z, heading: 0, speed: 0 } } : {}),
        bloodMoon: this.bloodAmount,
      });
      this.watchMoon(frameSeconds);
      this.sound.frame({ dt: frameSeconds, speed: ship.speed / SHIP.maxSpeed, blood: this.bloodAmount, underwater: this.locker.visible });
      this.hud.update(ship, this.keyboard.sailLevel);
      this.labels.update(ship, this.renderer, this.renderer.labelAnchors, this.selected);
      const stuck = this.mode === 'sail' && this.current.ship.sail > 0.1 ? isAground(this.world, this.current.ship) : null;
      this.aground.show(stuck ? `Aground on ${stuck.name}. Steer away with A or D.` : null);
      this.updatePrompt();
      this.updateOrders();
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
    this.toggleBase(false);
    this.intro?.hide();
    this.results.hide();
    this.ticket = ticket;
    this.runner = new BattleRunner(ticket.setup);
    this.finishing = false;
    this.mode = 'battle';
    this.keyboard.setEnabled(true);
    this.keyboard.sailLevel = 1;
    this.keyboard.salt = ticket.setup.mode === 'siege' && ticket.setup.loadout.salt > 0;
    this.keyboard.lock = 0;
    this.hud.setVisible(false);
    this.labels.setVisible(false);
    this.captainBar.setVisible(false);
    this.prompt.hide();
    this.aground.show(null);
    this.renderer.enterBattle(this.runner.current, ticket.fortLevel ?? 0);
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
    this.keyboard.lock = 0;
    this.hud.setVisible(true);
    this.labels.setVisible(true);
    this.captainBar.setVisible(this.session !== null);
    this.checkLocker();
  }

  /** Practice battles, for judges and for the title screen's shortcuts. `practice-fort-3` practises on the first fort of level 3. */
  startScenario(name: string): void {
    const fort = /^practice-fort(?:-([1-5]))?$/.exec(name);
    if (fort) {
      const level = Number(fort[1] ?? 0);
      const island = this.world.islands.find((i) => i.kind === 'haunted' && fortDifficulty(i) === level) ?? this.world.islands[1]!;
      const setup = fortSetup(island, PRACTICE_LOADOUT, hashSeed(`practice-${Math.floor(this.time * 1000)}`));
      this.startBattle({
        title: `Practice: the level ${fortDifficulty(island)} fort on ${island.name}`,
        objective: fortObjective(setup),
        setup,
        fortLevel: fortDifficulty(island),
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
    const siege = scenario === 'practice-siege';
    const lines = battleLines(result, siege ? 'siege' : 'assault');
    const again = { label: 'Try again', run: () => { this.leaveBattle(); this.startScenario(scenario); } };
    const back = { label: 'Back to the sea', primary: true, run: () => this.leaveBattle() };
    if (siege) {
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
          islandRadius: s.setup.island.radius,
          lock: this.keyboard.lock,
          bonusTargets: s.structures.filter((x) => x.type === 'vault' || x.type === 'powder').length,
        };
      },
      resultShowing: () => this.results.visible,
      puzzle: () => this.puzzle.debugState(),
      moon: () => ({ red: this.bloodAmount, fleetComing: this.fleetEta !== null }),
      sound: () => this.sound.debug(),
      orders: () => ({ visible: this.ordersView.visible, current: currentOrder(this.ordersDone)?.number ?? null, done: [...this.ordersDone] }),
      captain: () => {
        const s = this.session;
        if (!s) return null;
        return {
          name: s.profile.name,
          username: s.profile.username ?? null,
          online: s.online,
          resources: { ...s.profile.resources },
          captured: [...s.profile.captured],
          defenses: s.profile.defenses.length,
          sunk: s.profile.sunk,
          crew: { gunner: s.profile.crew.gunner.state, navigator: s.profile.crew.navigator.state },
        };
      },
    };
  }
}

export interface GhostOutcome {
  readonly result: BattleResult;
  readonly taken: Resources;
  readonly rewards: { readonly cursedGold: number; readonly ectoplasm: number };
}

export interface RaidTarget {
  readonly id: string;
  readonly name: string;
  readonly kind: 'captain' | 'rival';
  readonly homeLevel: number;
  readonly defenses: number;
  readonly infamy: number;
  readonly loot: { readonly gold: number; readonly ectoplasm: number };
  /** 1 to 5 stars. */
  readonly toughness: number;
  readonly protectedUntil?: number;
}

export interface RaidOutcome {
  readonly result: BattleResult;
  readonly loot: Resources;
  readonly targetName: string;
}

export interface LeaderboardEntry {
  readonly rank: number;
  readonly name: string;
  readonly infamy: number;
  readonly kind: 'captain' | 'rival';
  readonly you: boolean;
}

/** The server's answer when a capture finishes. Its `result` is the server's own replay. */
export interface CaptureOutcome {
  readonly won: boolean;
  readonly islandId: number;
  readonly result: BattleResult;
  readonly rewards: { readonly gold: number; readonly ectoplasm: number; readonly lines: readonly RewardLine[]; readonly full: boolean };
}

/** Plain-words summary lines for a finished battle. */
export function battleLines(result: BattleResult, mode: BattleMode): string[] {
  const lines: string[] = [];
  if (mode === 'siege') {
    lines.push(`Ghost ships sunk: ${result.ghostsSunk} of ${result.ghostsTotal}`);
    lines.push(`Your island damaged: ${Math.round(result.destruction * 100)}%`);
    if (result.reason === 'dawn') lines.push('Dawn came and the fleet withdrew.');
  } else {
    lines.push(`Island destroyed: ${Math.round(result.destruction * 100)}%`);
    lines.push(result.keepDestroyed ? 'The keep fell.' : 'The keep still stands.');
    if (result.ghostsTotal > 0) lines.push(`The island's ghost ships sunk: ${result.ghostsSunk} of ${result.ghostsTotal}`);
    if (result.reason === 'retreat') lines.push('You retreated.');
    if (result.reason === 'time') lines.push('Dawn came before the fort fell.');
  }
  lines.push(result.shipSunk ? 'Your ship sank.' : `Your hull: ${Math.ceil(result.hull)} of ${result.maxHull}`);
  return lines;
}

/**
 * What the player can lock in this battle: standing structures in an assault, and ghost ships.
 * When choosing a new lock only revealed ghosts count, since veiled ones can't be aimed at.
 */
export function lockable(state: BattleState, revealedOnly: boolean): { id: number; x: number; z: number }[] {
  const out: { id: number; x: number; z: number }[] = [];
  if (state.setup.mode === 'assault') {
    for (const s of state.structures) if (!s.destroyed && s.type !== 'mine') out.push({ id: s.id, x: s.x, z: s.z });
  }
  for (const g of state.ghosts) if (!g.sunk && (!revealedOnly || isRevealed(state, g))) out.push({ id: g.id, x: g.ship.x, z: g.ship.z });
  return out;
}

/** "a", "a and b", "a, b and c". */
function listInWords(items: readonly string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Seconds as m:ss. */
function clockText(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** What defends a haunted island and what taking it pays, in words, from its fort level. */
export function fortDetail(island: Island): string {
  const level = fortDifficulty(island);
  const i = level - 1;
  const mines = FORTS.mines[i]!;
  const ghosts = FORTS.ghosts[i]!.count;
  const parts = [`${FORTS.towers[i]} towers`];
  if (mines > 0) parts.push(`${mines} ${mines === 1 ? 'mine' : 'mines'}`);
  if (ghosts > 0) parts.push(`${ghosts} ghost ${ghosts === 1 ? 'ship' : 'ships'}`);
  return `Fort level ${level} of ${FORTS.levels}: ${listInWords(parts)}. Break it within ${clockText(FORTS.timeLimitSeconds[i]!)} for ${REWARDS.captureGold[i]} gold and ${ECONOMY.tributePerMinute} gold a minute.`;
}

/** A haunted fort's full report, in words: what defends it, its treasure, its clock and every part of its reward. */
export function fortReport(island: Island): string[] {
  const level = fortDifficulty(island);
  const i = level - 1;
  const counts = new Map<string, number>();
  for (const d of fortLayout(island).defenses) {
    if (d.type !== 'mine') counts.set(DEFENSE_NAMES[d.type], (counts.get(DEFENSE_NAMES[d.type]) ?? 0) + 1);
  }
  const towers = [...counts].map(([name, n]) => `${n} ${name}${n === 1 ? '' : 's'}`);
  const mines = FORTS.mines[i]!;
  const ghosts = FORTS.ghosts[i]!.count;
  const vaults = FORTS.vaults[i]!;
  const powder = FORTS.powderStores[i]!;
  const base = REWARDS.captureGold[i]!;
  const lines = [`Toughness ${starText(fortToughness(level))} (${fortToughness(level)} of 5).`, `Defended by ${listInWords(towers)}${mines > 0 ? ` and ${mines} ${mines === 1 ? 'mine' : 'mines'}` : ''}.`];
  if (ghosts > 0) lines.push(`${ghosts} ghost ${ghosts === 1 ? 'ship rises' : 'ships rise'} from the island to hunt you.`);
  lines.push(
    `Treasure: ${vaults} ${vaults === 1 ? 'vault' : 'vaults'} worth ${FORTS.vaultGold[i]} gold each${powder > 0 ? `. Powder: ${powder} ${powder === 1 ? 'store that blows' : 'stores that blow'} up the towers beside ${powder === 1 ? 'it' : 'them'}` : ''}.`,
  );
  lines.push(`The fort must fall within ${clockText(FORTS.timeLimitSeconds[i]!)}.`);
  lines.push(
    `Pays ${base} gold and ${REWARDS.captureEctoplasm[i]} ectoplasm, plus ${REWARDS.towerBounty} gold per level of every tower destroyed, up to ${Math.floor(base * REWARDS.speedBonus)} for speed${ghosts > 0 ? `, ${REWARDS.islandGhostGold} gold and ${REWARDS.ghostShipEctoplasm} ectoplasm per ghost ship sunk,` : ''} and the vaults' gold.`,
  );
  return lines;
}

/** The battle's objective line for a fort assault. */
export function fortObjective(setup: BattleSetup): string {
  const ghosts = setup.fleet.count;
  return ghosts > 0
    ? `Destroy the ghost light at the island’s heart before dawn. Its ${ghosts === 1 ? 'ghost ship hunts' : `${ghosts} ghost ships hunt`} you: R loads Salt Shot.`
    : 'Destroy the ghost light at the island’s heart before dawn. Q and E fire your broadsides.';
}

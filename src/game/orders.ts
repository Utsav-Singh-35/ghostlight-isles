import { createProfile } from '../sim/profile';

export type OrderId = 'sail' | 'steer' | 'island' | 'capture' | 'build' | 'moon' | 'raid';

export interface Order {
  readonly id: OrderId;
  readonly text: string;
}

/** The tutorial, in the order a new captain needs it. */
export const ORDERS: readonly Order[] = [
  { id: 'sail', text: 'Press W to raise the sails. Press it again for full sail.' },
  { id: 'steer', text: 'Steer with A and D.' },
  { id: 'island', text: 'Sail to a haunted island. Their names glow green.' },
  { id: 'capture', text: 'Take the island: press 1, then sail around its fort firing Q and E until the ghost light falls.' },
  { id: 'build', text: 'Press Tab and build a defense on Last Light, your home.' },
  { id: 'moon', text: 'Press "Summon the Blood Moon" and hold Last Light against the ghost fleet.' },
  { id: 'raid', text: "Press R and raid a rival captain's island." },
];

const IDS: ReadonlySet<string> = new Set(ORDERS.map((o) => o.id));
const isOrderId = (value: unknown): value is OrderId => typeof value === 'string' && IDS.has(value);

/** The steer order is done once the ship has turned this far in total, radians (60°). */
export const STEER_RADIANS = Math.PI / 3;
/** Defenses a new captain starts with. */
const STARTING_DEFENSES = createProfile('', '', '', 0).defenses.length;

/** What the game saw since it last looked. */
export interface Sighting {
  readonly sailLevel: number;
  /** Radians the ship has turned in total this visit. */
  readonly turned: number;
  /** True while a haunted island is close enough to act on. */
  readonly nearHaunted: boolean;
  /** Orders the player just carried out: building, starting a siege, starting a raid. */
  readonly did: readonly OrderId[];
  readonly captain: {
    readonly captured: number;
    readonly defenses: number;
    readonly raidsWon: number;
    readonly ghostRaidsRepelled: number;
    readonly ghostShipsSunk: number;
  } | null;
}

/** Adds every order the sighting shows is done. Done orders stay done. */
export function observe(done: ReadonlySet<OrderId>, s: Sighting): Set<OrderId> {
  const next = new Set(done);
  if (s.sailLevel >= 1) next.add('sail');
  if (s.turned >= STEER_RADIANS) next.add('steer');
  if (s.nearHaunted) next.add('island');
  for (const id of s.did) if (isOrderId(id)) next.add(id);
  const c = s.captain;
  if (c) {
    if (c.captured > 0) {
      next.add('island');
      next.add('capture');
    }
    if (c.defenses > STARTING_DEFENSES) next.add('build');
    if (c.ghostRaidsRepelled > 0 || c.ghostShipsSunk > 0) next.add('moon');
    if (c.raidsWon > 0) next.add('raid');
  }
  return next;
}

/** The first order not yet done and its number from 1, or null when every order is done. */
export function currentOrder(done: ReadonlySet<OrderId>): { readonly order: Order; readonly number: number } | null {
  const index = ORDERS.findIndex((o) => !done.has(o.id));
  return index < 0 ? null : { order: ORDERS[index]!, number: index + 1 };
}

/** Reads a saved done set. Anything unreadable counts as nothing done. */
export function readDone(text: string | null): Set<OrderId> {
  if (!text) return new Set();
  try {
    const list: unknown = JSON.parse(text);
    return new Set(Array.isArray(list) ? list.filter(isOrderId) : []);
  } catch {
    return new Set();
  }
}

/** The text `readDone` reads back. */
export function writeDone(done: ReadonlySet<OrderId>): string {
  return JSON.stringify(ORDERS.map((o) => o.id).filter((id) => done.has(id)));
}

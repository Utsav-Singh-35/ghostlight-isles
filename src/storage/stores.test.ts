import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';
import { MemoryStore } from '../server/memoryStore';
import type { Store } from '../server/router';
import { MongoStore, closeMongoClients, locate } from './mongoStore';

type Op = { op: 'set' | 'create'; key: string; value: string } | { op: 'list'; prefix: string };

const kinds = ['player', 'user', 'index', 'rival', 'battle'] as const;
const keys = fc.tuple(fc.constantFrom(...kinds), fc.stringMatching(/^[a-z0-9]{1,4}$/)).map(([kind, id]) => `${kind}:${id}`);
const values = fc.oneof(
  fc.jsonValue().map((v) => JSON.stringify(v)),
  fc.constantFrom('not json', '{"a":1}', '[]', '"text"'),
);
const ops = fc.array(
  fc.oneof(
    fc.record({ op: fc.constantFrom('set' as const, 'create' as const), key: keys, value: values }),
    fc.record({ op: fc.constant('list' as const), prefix: fc.constantFrom(...kinds).map((k) => `${k}:`) }),
  ),
  { minLength: 1, maxLength: 25 },
);

/** Values read back mean the same JSON; text that isn't JSON comes back exactly. */
function same(actual: string | null, expected: string): void {
  expect(actual).not.toBeNull();
  let parsed: unknown;
  try {
    parsed = JSON.parse(expected);
  } catch {
    expect(actual).toBe(expected);
    return;
  }
  expect(JSON.parse(actual!)).toEqual(parsed);
}

async function runContract(fresh: () => Promise<Store>, sequence: readonly Op[]): Promise<void> {
  const store = await fresh();
  const model = new Map<string, string>();
  for (const step of sequence) {
    if (step.op === 'set') {
      await store.set(step.key, step.value);
      model.set(step.key, step.value);
    } else if (step.op === 'create') {
      const created = await store.create(step.key, step.value);
      expect(created).toBe(!model.has(step.key));
      if (created) model.set(step.key, step.value);
    } else if (step.op === 'list') {
      const listed = new Map(await store.list(step.prefix));
      const expected = [...model.keys()].filter((k) => k.startsWith(step.prefix)).sort();
      expect([...listed.keys()].sort()).toEqual(expected);
      for (const k of expected) same(listed.get(k)!, model.get(k)!);
    }
  }
  for (const [k, v] of model) same(await store.get(k), v);
}

describe('accounts spec: stores', () => {
  // Feature: accounts, Property 7. Validates: Requirements 4.2, 4.3
  it('Property 7: stores keep the contract (memory)', async () => {
    await fc.assert(
      fc.asyncProperty(ops, (sequence) => runContract(async () => new MemoryStore(), sequence)),
      { numRuns: 200 },
    );
  });

  // Runs only against a throwaway database: set MONGODB_TEST_URI to try it. Never the game's real one.
  const testUri = process.env.MONGODB_TEST_URI;
  it.skipIf(!testUri)(
    'Property 7: stores keep the contract (MongoDB)',
    async () => {
      const prefix = `ghostlight_test_${Date.now().toString(36)}`;
      await fc.assert(
        fc.asyncProperty(ops, (sequence) =>
          runContract(async () => {
            const store = new MongoStore(testUri!, `${prefix}_${created.length}`);
            created.push(store);
            return store;
          }, sequence),
        ),
        { numRuns: 8 },
      );
    },
    120_000,
  );

  const created: MongoStore[] = [];
  afterAll(async () => {
    for (const store of created) await store.dropDatabase().catch(() => {});
    await closeMongoClients();
  });

  it('puts each kind of record in its own collection', () => {
    expect(locate('player:0123456789abcdef')).toEqual({ collection: 'players', id: '0123456789abcdef' });
    expect(locate('user:mara_vane')).toEqual({ collection: 'usernames', id: 'mara_vane' });
    expect(locate('index:0123456789abcdef')).toEqual({ collection: 'leaderboard', id: '0123456789abcdef' });
    expect(locate('rival:7')).toEqual({ collection: 'rivals', id: '7' });
    expect(locate('index')).toEqual({ collection: 'misc', id: 'index' });
    expect(locate('battle:x')).toEqual({ collection: 'misc', id: 'battle:x' });
  });
});

import type { Store } from './router';

/** A Store in memory, for tests and the dev server. */
export class MemoryStore implements Store {
  readonly data = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  /** A copy of everything stored, for checking that nothing changed. */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.data);
  }
}

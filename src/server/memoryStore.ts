import { isListPrefix, type Store } from './router';

/** A Store in memory, for tests and the preview server. */
export class MemoryStore implements Store {
  readonly data = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async create(key: string, value: string): Promise<boolean> {
    if (this.data.has(key)) return false;
    this.data.set(key, value);
    return true;
  }

  async list(prefix: string): Promise<Array<[string, string]>> {
    if (!isListPrefix(prefix)) throw new Error(`Bad list prefix: ${prefix}`);
    return [...this.data].filter(([key]) => key.startsWith(prefix));
  }

  /** A copy of everything stored, for checking that nothing changed. */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.data);
  }
}

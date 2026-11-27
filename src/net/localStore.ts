import type { Store } from '../server/router';

const PREFIX = 'ghostlight.db.';

/** A Store in localStorage, for playing offline. Falls back to memory if storage is blocked. */
export class LocalStore implements Store {
  private readonly memory = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    try {
      return window.localStorage.getItem(PREFIX + key);
    } catch {
      return this.memory.get(key) ?? null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      window.localStorage.setItem(PREFIX + key, value);
    } catch {
      this.memory.set(key, value);
    }
  }
}

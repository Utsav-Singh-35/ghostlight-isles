import { isListPrefix, type Store } from '../server/router';

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

  // One page runs one handler at a time, so check-then-set is safe here.
  async create(key: string, value: string): Promise<boolean> {
    if ((await this.get(key)) !== null) return false;
    await this.set(key, value);
    return true;
  }

  async list(prefix: string): Promise<Array<[string, string]>> {
    if (!isListPrefix(prefix)) throw new Error(`Bad list prefix: ${prefix}`);
    const out: Array<[string, string]> = [];
    try {
      const storage = window.localStorage;
      for (let i = 0; i < storage.length; i++) {
        const full = storage.key(i);
        if (!full || !full.startsWith(PREFIX + prefix)) continue;
        const value = storage.getItem(full);
        if (value !== null) out.push([full.slice(PREFIX.length), value]);
      }
    } catch {
      for (const [key, value] of this.memory) if (key.startsWith(prefix)) out.push([key, value]);
    }
    return out;
  }
}

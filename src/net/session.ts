import type { PublicProfile } from '../sim/profile';
import { ApiError, connectBackend, type Backend } from './backend';

/** The token in use, and this device's guest token (kept while a registered captain is logged in, to return to). */
const tokenKey = (kind: Backend['kind']) => `ghostlight.token.${kind}`;
const guestKey = (kind: Backend['kind']) => `ghostlight.guestToken.${kind}`;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the captain lasts for this visit only.
  }
}

const readToken = (kind: Backend['kind']) => read(tokenKey(kind));
const writeToken = (kind: Backend['kind'], token: string) => write(tokenKey(kind), token);

/** The signed-in captain: their token, their latest profile and the server's clock. */
export class Session {
  private readonly listeners = new Set<(profile: PublicProfile) => void>();
  /** Server time minus local time, milliseconds. */
  private offset = 0;

  private constructor(
    readonly backend: Backend,
    private token: string,
    private current: PublicProfile,
  ) {}

  /** True for a captain without a username. */
  get guest(): boolean {
    return !this.current.username;
  }

  /** Gives this guest a username and password. Their progress stays; only the login changes. */
  async register(username: string, password: string): Promise<void> {
    const { token, profile } = await this.backend.request<{ token: string; profile: PublicProfile }>('POST', '/register', { username, password }, this.token);
    this.token = token;
    writeToken(this.backend.kind, token);
    // The guest is now this account, so there is no separate guest to come back to.
    write(guestKey(this.backend.kind), null);
    this.current = profile;
    for (const listener of this.listeners) listener(this.current);
  }

  /**
   * Logs in as a registered captain and saves the token. A guest's token is kept so logging out
   * returns to them. The caller reloads the page, since the captain has changed.
   */
  async login(username: string, password: string): Promise<void> {
    const { token } = await this.backend.request<{ token: string }>('POST', '/login', { username, password }, null);
    if (this.guest) write(guestKey(this.backend.kind), this.token);
    writeToken(this.backend.kind, token);
  }

  /** Forgets this login and goes back to this device's guest, or a new one. The caller reloads the page. */
  logout(): void {
    const guest = read(guestKey(this.backend.kind));
    write(tokenKey(this.backend.kind), guest);
    write(guestKey(this.backend.kind), null);
  }

  /** Connects, then loads the saved captain or creates a guest. */
  static async start(forceOffline = false): Promise<Session> {
    const backend = await connectBackend(forceOffline);
    const saved = readToken(backend.kind);
    if (saved) {
      try {
        const { profile, now } = await backend.request<{ profile: PublicProfile; now: number }>('GET', '/profile', undefined, saved);
        const session = new Session(backend, saved, profile);
        session.offset = now - Date.now();
        return session;
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
        // The saved captain is gone: make a new one below.
      }
    }
    const { token, profile } = await backend.request<{ token: string; profile: PublicProfile }>('POST', '/guest', {}, null);
    writeToken(backend.kind, token);
    return new Session(backend, token, profile);
  }

  get profile(): PublicProfile {
    return this.current;
  }

  get online(): boolean {
    return this.backend.kind === 'online';
  }

  /** The server's clock, in milliseconds. */
  now(): number {
    return Date.now() + this.offset;
  }

  onChange(listener: (profile: PublicProfile) => void): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }

  /** Calls the server as this captain. A profile in the answer becomes the current profile. */
  async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const data = await this.backend.request<T>(method, path, body ?? {}, this.token);
    if (data && typeof data === 'object') {
      const record = data as { profile?: PublicProfile; now?: number };
      if (typeof record.now === 'number') this.offset = record.now - Date.now();
      if (record.profile && record.profile.id === this.current.id) {
        this.current = record.profile;
        for (const listener of this.listeners) listener(this.current);
      }
    }
    return data;
  }
}

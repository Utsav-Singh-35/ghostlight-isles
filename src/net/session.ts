import type { PublicProfile } from '../sim/profile';
import { ApiError, connectBackend, type Backend } from './backend';

const tokenKey = (kind: Backend['kind']) => `ghostlight.token.${kind}`;

function readToken(kind: Backend['kind']): string | null {
  try {
    return window.localStorage.getItem(tokenKey(kind));
  } catch {
    return null;
  }
}

function writeToken(kind: Backend['kind'], token: string): void {
  try {
    window.localStorage.setItem(tokenKey(kind), token);
  } catch {
    // Storage blocked: the captain lasts for this visit only.
  }
}

/** The signed-in captain: their token, their latest profile and the server's clock. */
export class Session {
  private readonly listeners = new Set<(profile: PublicProfile) => void>();
  /** Server time minus local time, milliseconds. */
  private offset = 0;

  private constructor(
    readonly backend: Backend,
    private readonly token: string,
    private current: PublicProfile,
  ) {}

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

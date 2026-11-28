/**
 * The game's Store on MongoDB. Node only: used by the Netlify Function and by `npm run dev`,
 * never by the browser. Each kind of key gets its own collection of readable documents.
 */
import { MongoClient, MongoServerError, type Collection, type Db } from 'mongodb';
import { isListPrefix, type Store } from '../server/router';

interface Doc {
  _id: string;
  /** The record, parsed from JSON so Atlas shows it as a document. */
  data?: unknown;
  /** Only for values that aren't JSON. */
  text?: string;
  updatedAt: Date;
}

/** Collection for each kind of key; anything else goes to `misc` under its whole key. */
const COLLECTIONS: Readonly<Record<string, string>> = {
  player: 'players',
  user: 'usernames',
  index: 'leaderboard',
  rival: 'rivals',
};

/** Where a key lives: its collection and its `_id` there. */
export function locate(key: string): { collection: string; id: string } {
  const colon = key.indexOf(':');
  const kind = colon > 0 ? key.slice(0, colon) : '';
  const collection = COLLECTIONS[kind];
  return collection ? { collection, id: key.slice(colon + 1) } : { collection: 'misc', id: key };
}

function toDoc(id: string, value: string): Doc {
  try {
    return { _id: id, data: JSON.parse(value), updatedAt: new Date() };
  } catch {
    return { _id: id, text: value, updatedAt: new Date() };
  }
}

function fromDoc(doc: Doc | null): string | null {
  if (!doc) return null;
  return doc.text !== undefined ? doc.text : JSON.stringify(doc.data ?? null);
}

/** One client per process, so a warm Netlify Function reuses its connection. */
const clients = new Map<string, Promise<MongoClient>>();

function connect(uri: string): Promise<MongoClient> {
  let client = clients.get(uri);
  if (!client) {
    client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 }).connect();
    client.catch(() => clients.delete(uri));
    clients.set(uri, client);
  }
  return client;
}

export class MongoStore implements Store {
  private readonly db: Promise<Db>;

  constructor(uri: string, dbName = 'ghostlight') {
    this.db = connect(uri).then((client) => client.db(dbName));
  }

  private async collection(name: string): Promise<Collection<Doc>> {
    return (await this.db).collection<Doc>(name);
  }

  async get(key: string): Promise<string | null> {
    const { collection, id } = locate(key);
    return fromDoc(await (await this.collection(collection)).findOne({ _id: id }));
  }

  async set(key: string, value: string): Promise<void> {
    const { collection, id } = locate(key);
    await (await this.collection(collection)).replaceOne({ _id: id }, toDoc(id, value), { upsert: true });
  }

  async create(key: string, value: string): Promise<boolean> {
    const { collection, id } = locate(key);
    try {
      await (await this.collection(collection)).insertOne(toDoc(id, value));
      return true;
    } catch (error) {
      // 11000: duplicate key. `_id` is always unique, so two players can't both claim one name.
      if (error instanceof MongoServerError && error.code === 11000) return false;
      throw error;
    }
  }

  async list(prefix: string): Promise<Array<[string, string]>> {
    if (!isListPrefix(prefix)) throw new Error(`Bad list prefix: ${prefix}`);
    const { collection } = locate(prefix);
    const docs = await (await this.collection(collection)).find(collection === 'misc' ? { _id: { $regex: `^${prefix}` } } : {}).toArray();
    return docs.map((doc) => [collection === 'misc' ? doc._id : prefix + doc._id, fromDoc(doc) ?? 'null']);
  }

  /** Checks the database answers. */
  async ping(): Promise<void> {
    await (await this.db).command({ ping: 1 });
  }

  /** Deletes the whole database. Only for throwaway test databases. */
  async dropDatabase(): Promise<void> {
    await (await this.db).dropDatabase();
  }
}

/** Closes every client, for tests and scripts. */
export async function closeMongoClients(): Promise<void> {
  const all = [...clients.values()];
  clients.clear();
  for (const client of all) await (await client.catch(() => null))?.close();
}

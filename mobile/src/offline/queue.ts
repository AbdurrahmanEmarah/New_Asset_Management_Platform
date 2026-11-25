import { OfflineError, type JobChange, type SendResult } from '@/api/types';

/** The part of AsyncStorage the queue needs, so tests can pass a plain object. */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export type QueuedChange = {
  id: string;
  change: JobChange;
  /** ISO time it was saved on the phone. */
  savedAt: string;
  /** Failed send attempts so far. */
  attempts: number;
  lastError?: string;
};

/** A change the server refused; shown to the technician with the server's sentence. */
export type Conflict = {
  id: string;
  change: JobChange;
  message: string;
  at: string;
};

export type QueueState = {
  pending: QueuedChange[];
  conflicts: Conflict[];
  /** True while a flush is running. */
  sending: boolean;
  /** True when the last attempt to send could not reach the server. */
  offline: boolean;
};

export type FlushResult = {
  sent: number;
  conflicts: number;
  remaining: number;
  offline: boolean;
};

export type Sender = (change: JobChange) => Promise<SendResult>;

export const QUEUE_STORAGE_KEY = 'inventra.field.queue';

type Stored = { pending: QueuedChange[]; conflicts: Conflict[] };

/**
 * Changes are saved on the phone first, then sent in the order they were made.
 * - A change that can't reach the server stays first in line and is retried later,
 *   so nothing after it overtakes it.
 * - A change the server refuses (conflict) leaves the line and is reported, and the rest carry on.
 */
export class OfflineQueue {
  private state: QueueState = { pending: [], conflicts: [], sending: false, offline: false };
  private listeners = new Set<() => void>();
  private flushing: Promise<FlushResult> | null = null;
  private loaded: Promise<void> | null = null;
  private counter = 0;

  constructor(
    private readonly storage: KeyValueStore,
    private readonly options: { key?: string; now?: () => Date } = {},
  ) {}

  private get key() {
    return this.options.key ?? QUEUE_STORAGE_KEY;
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  /** Reads what was saved on the phone. Safe to call more than once. */
  load(): Promise<void> {
    this.loaded ??= (async () => {
      try {
        const raw = await this.storage.getItem(this.key);
        if (raw) {
          const stored = JSON.parse(raw) as Partial<Stored>;
          this.set({ pending: stored.pending ?? [], conflicts: stored.conflicts ?? [] });
        }
      } catch {
        // Unreadable storage: start empty rather than block the app.
      }
    })();
    return this.loaded;
  }

  getState = (): QueueState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Saves a change on the phone. Resolves once it is stored. */
  async enqueue(change: JobChange): Promise<QueuedChange> {
    await this.load();
    const item: QueuedChange = {
      id: `${this.now().getTime().toString(36)}-${(this.counter++).toString(36)}`,
      change,
      savedAt: this.now().toISOString(),
      attempts: 0,
    };
    this.set({ pending: [...this.state.pending, item] });
    await this.persist();
    return item;
  }

  /** Sends pending changes in order. Concurrent calls share one run. */
  flush(send: Sender): Promise<FlushResult> {
    this.flushing ??= this.run(send).finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  async dismissConflict(id: string): Promise<void> {
    this.set({ conflicts: this.state.conflicts.filter((c) => c.id !== id) });
    await this.persist();
  }

  private async run(send: Sender): Promise<FlushResult> {
    await this.load();
    this.set({ sending: true });
    let sent = 0;
    let conflicts = 0;
    let offline = false;
    try {
      // Re-read the line after every await: changes can be saved while a send is in flight.
      let head: QueuedChange | undefined;
      while ((head = this.state.pending[0])) {
        const current = head;
        const without = () => this.state.pending.filter((p) => p.id !== current.id);
        let result: SendResult;
        try {
          result = await send(current.change);
        } catch (error) {
          offline = error instanceof OfflineError;
          const message = error instanceof Error ? error.message : String(error);
          this.set({
            pending: this.state.pending.map((p) =>
              p.id === current.id ? { ...p, attempts: p.attempts + 1, lastError: message } : p,
            ),
          });
          await this.persist();
          break;
        }
        if (result.status === 'conflict') {
          conflicts++;
          this.set({
            pending: without(),
            conflicts: [...this.state.conflicts, { id: current.id, change: current.change, message: result.message, at: this.now().toISOString() }],
          });
        } else {
          sent++;
          this.set({ pending: without() });
        }
        await this.persist();
      }
    } finally {
      this.set({ sending: false, offline });
    }
    return { sent, conflicts, remaining: this.state.pending.length, offline };
  }

  private set(patch: Partial<QueueState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private async persist(): Promise<void> {
    const stored: Stored = { pending: this.state.pending, conflicts: this.state.conflicts };
    await this.storage.setItem(this.key, JSON.stringify(stored));
  }
}

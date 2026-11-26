import { OfflineError, type Change as JobChange, type SendResult } from '@/api/types';
import { OfflineQueue, QUEUE_STORAGE_KEY, type KeyValueStore } from './queue';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
  };
}

const step = (stepId: string, done = true): JobChange => ({ kind: 'checklist.set', jobId: 'WO-1', stepId, done });

describe('OfflineQueue', () => {
  it('saves a change on the phone before anything is sent', async () => {
    const store = memoryStore();
    const queue = new OfflineQueue(store);
    await queue.enqueue(step('s1'));

    expect(queue.getState().pending).toHaveLength(1);
    expect(JSON.parse(store.data.get(QUEUE_STORAGE_KEY)!).pending[0].change).toEqual(step('s1'));

    // A new app start reads it back.
    const reopened = new OfflineQueue(store);
    await reopened.load();
    expect(reopened.getState().pending.map((p) => p.change)).toEqual([step('s1')]);
  });

  it('sends changes in the order they were made', async () => {
    const queue = new OfflineQueue(memoryStore());
    await queue.enqueue(step('s1'));
    await queue.enqueue(step('s2'));
    await queue.enqueue({ kind: 'job.complete', jobId: 'WO-1' });
    const order: JobChange[] = [];

    const result = await queue.flush(async (c) => {
      order.push(c);
      return { status: 'sent' };
    });

    expect(order).toEqual([step('s1'), step('s2'), { kind: 'job.complete', jobId: 'WO-1' }]);
    expect(result).toEqual({ sent: 3, conflicts: 0, remaining: 0, offline: false });
    expect(queue.getState().pending).toEqual([]);
  });

  it('keeps a change first in line when the server cannot be reached, and retries it later', async () => {
    const store = memoryStore();
    const queue = new OfflineQueue(store);
    await queue.enqueue(step('s1'));
    await queue.enqueue(step('s2'));
    const send = jest.fn<Promise<SendResult>, [JobChange]>().mockRejectedValueOnce(new OfflineError());

    const first = await queue.flush(send);
    expect(first).toEqual({ sent: 0, conflicts: 0, remaining: 2, offline: true });
    expect(send).toHaveBeenCalledTimes(1); // s2 did not overtake s1
    expect(queue.getState().offline).toBe(true);
    expect(queue.getState().pending[0]).toMatchObject({ change: step('s1'), attempts: 1, lastError: 'No connection.' });
    expect(JSON.parse(store.data.get(QUEUE_STORAGE_KEY)!).pending[0].attempts).toBe(1);

    send.mockResolvedValue({ status: 'sent' });
    const second = await queue.flush(send);
    expect(second).toEqual({ sent: 2, conflicts: 0, remaining: 0, offline: false });
    expect(send.mock.calls.map((c) => c[0])).toEqual([step('s1'), step('s1'), step('s2')]);
    expect(queue.getState().offline).toBe(false);
  });

  it('reports a conflict with the server’s sentence and carries on with the rest', async () => {
    const queue = new OfflineQueue(memoryStore(), { now: () => new Date('2026-11-24T10:00:00Z') });
    await queue.enqueue(step('s1'));
    await queue.enqueue({ kind: 'job.complete', jobId: 'WO-1' });
    await queue.enqueue(step('s3'));
    const message = 'Job WO-1 was already completed, so this change was not saved.';

    const result = await queue.flush(async (c) =>
      c.kind === 'job.complete' ? { status: 'conflict', message } : { status: 'sent' },
    );

    expect(result).toEqual({ sent: 2, conflicts: 1, remaining: 0, offline: false });
    expect(queue.getState().conflicts).toEqual([
      expect.objectContaining({ change: { kind: 'job.complete', jobId: 'WO-1' }, message, at: '2026-11-24T10:00:00.000Z' }),
    ]);

    await queue.dismissConflict(queue.getState().conflicts[0]!.id);
    expect(queue.getState().conflicts).toEqual([]);
  });

  it('runs one flush at a time', async () => {
    const queue = new OfflineQueue(memoryStore());
    await queue.enqueue(step('s1'));
    let release!: () => void;
    const send = jest.fn(() => new Promise<SendResult>((r) => (release = () => r({ status: 'sent' }))));

    const a = queue.flush(send);
    const b = queue.flush(send);
    for (let i = 0; i < 20 && send.mock.calls.length === 0; i++) await Promise.resolve();
    expect(queue.getState().sending).toBe(true);
    release();

    expect(await a).toBe(await b);
    expect(send).toHaveBeenCalledTimes(1);
    expect(queue.getState().sending).toBe(false);
  });

  it('keeps a change saved while another is being sent', async () => {
    const queue = new OfflineQueue(memoryStore());
    await queue.enqueue(step('s1'));
    let fail!: () => void;
    const send = jest.fn(() => new Promise<SendResult>((_resolve, reject) => (fail = () => reject(new OfflineError()))));

    const running = queue.flush(send);
    for (let i = 0; i < 20 && send.mock.calls.length === 0; i++) await Promise.resolve();
    await queue.enqueue(step('s2'));
    fail();
    await running;

    expect(queue.getState().pending.map((p) => p.change)).toEqual([step('s1'), step('s2')]);
  });

  it('sends a change saved during a flush in the same run', async () => {
    const queue = new OfflineQueue(memoryStore());
    await queue.enqueue(step('s1'));
    const sent: JobChange[] = [];
    const result = await queue.flush(async (c) => {
      if (sent.length === 0) await queue.enqueue(step('s2'));
      sent.push(c);
      return { status: 'sent' };
    });
    expect(sent).toEqual([step('s1'), step('s2')]);
    expect(result.remaining).toBe(0);
  });

  it('notifies subscribers when the line changes', async () => {
    const queue = new OfflineQueue(memoryStore());
    const listener = jest.fn();
    queue.subscribe(listener);
    await queue.enqueue(step('s1'));
    expect(listener).toHaveBeenCalled();
  });
});

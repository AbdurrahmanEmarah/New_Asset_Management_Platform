import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { api, type JobChange } from '@/api';
import { OfflineQueue, type QueueState, type Sender } from './queue';

/** How often waiting changes are retried while there are any. */
export const RETRY_MS = 15_000;

type OfflineValue = {
  state: QueueState;
  /** Saves the change on the phone, then tries to send everything waiting. */
  saveChange: (change: JobChange) => Promise<void>;
  sendNow: () => void;
  dismissConflict: (id: string) => void;
};

const OfflineContext = createContext<OfflineValue | null>(null);

const defaultQueue = new OfflineQueue(AsyncStorage);
const defaultSend: Sender = (change) => api.send(change);

export function OfflineProvider({
  children,
  queue = defaultQueue,
  send = defaultSend,
}: {
  children: ReactNode;
  queue?: OfflineQueue;
  send?: Sender;
}) {
  const state = useSyncExternalStore(queue.subscribe, queue.getState, queue.getState);

  const sendNow = useCallback(() => {
    void queue.flush(send);
  }, [queue, send]);

  useEffect(() => {
    void queue.load().then(() => queue.flush(send));
  }, [queue, send]);

  const waiting = state.pending.length > 0;
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(sendNow, RETRY_MS);
    return () => clearInterval(id);
  }, [waiting, sendNow]);

  const value = useMemo<OfflineValue>(
    () => ({
      state,
      saveChange: async (change) => {
        await queue.enqueue(change);
        sendNow();
      },
      sendNow,
      dismissConflict: (id) => void queue.dismissConflict(id),
    }),
    [state, queue, sendNow],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

export function useOffline(): OfflineValue {
  const value = useContext(OfflineContext);
  if (!value) throw new Error('useOffline must be used inside <OfflineProvider>.');
  return value;
}

/** The banner text, or null when nothing is waiting. */
export function bannerText(state: QueueState): string | null {
  const n = state.pending.length;
  if (n === 0) return null;
  const changes = n === 1 ? '1 change' : `${n} changes`;
  if (state.offline) return `Offline: ${changes} saved on this phone. They will be sent when you are back online.`;
  return `Sending ${changes} saved on this phone…`;
}

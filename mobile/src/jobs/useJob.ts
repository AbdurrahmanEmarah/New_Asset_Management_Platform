import { useState } from 'react';
import { api, type Job, type JobChange } from '@/api';
import { useLoad, type Loadable } from '@/hooks';
import { useOffline } from '@/offline/OfflineProvider';
import { applyChanges } from './jobs';
import { loadJob } from './repository';

/**
 * One job as the technician sees it, with their changes applied straight away.
 * Each change is saved on the phone first and sent by the offline queue.
 */
export function useJob(id: string): {
  load: Loadable<Job | null>;
  reload: () => void;
  job: Job | null;
  change: (change: JobChange) => Promise<void>;
} {
  const [load, reload] = useLoad(() => loadJob(api, id), [id]);
  const { state, saveChange } = useOffline();
  // Changes made on this screen stay applied after they are sent (the loaded copy is older).
  const [made, setMade] = useState<JobChange[]>([]);

  const server = load.data ?? null;
  const job = server ? applyChanges(server, [...state.pending.map((p) => p.change), ...made]) : null;

  return {
    load,
    reload,
    job,
    change: async (change) => {
      setMade((m) => [...m, change]);
      await saveChange(change);
    },
  };
}

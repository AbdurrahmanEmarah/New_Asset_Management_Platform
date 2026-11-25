import AsyncStorage from '@react-native-async-storage/async-storage';
import { OfflineError, type Job, type WorkOrdersApi } from '@/api/types';
import type { KeyValueStore } from '@/offline/queue';

export const JOBS_CACHE_KEY = 'inventra.field.jobs';

export type MyJobs = {
  jobs: Job[];
  /** Set when the server could not be reached and the copy saved on the phone is shown. */
  savedAt: string | null;
};

/** Loads my jobs and keeps a copy on the phone, so the list still opens without signal. */
export async function loadMyJobs(api: WorkOrdersApi, storage: KeyValueStore = AsyncStorage): Promise<MyJobs> {
  try {
    const jobs = await api.listMyJobs();
    try {
      await storage.setItem(JOBS_CACHE_KEY, JSON.stringify({ jobs, savedAt: new Date().toISOString() }));
    } catch {
      // Not being able to cache is not a reason to hide the list.
    }
    return { jobs, savedAt: null };
  } catch (error) {
    if (!(error instanceof OfflineError)) throw error;
    const cached = await readCache(storage);
    if (!cached) throw new OfflineError('No connection, and no jobs are saved on this phone yet. Find signal and try again.');
    return cached;
  }
}

/** One job, from the server or (without signal) from the copy saved on the phone. */
export async function loadJob(api: WorkOrdersApi, id: string, storage: KeyValueStore = AsyncStorage): Promise<Job | null> {
  try {
    return await api.getJob(id);
  } catch (error) {
    if (!(error instanceof OfflineError)) throw error;
    const cached = await readCache(storage);
    const job = cached?.jobs.find((j) => j.id === id);
    if (!job) throw new OfflineError('No connection, and this job is not saved on this phone. Find signal and try again.');
    return job;
  }
}

async function readCache(storage: KeyValueStore): Promise<MyJobs | null> {
  try {
    const raw = await storage.getItem(JOBS_CACHE_KEY);
    return raw ? (JSON.parse(raw) as MyJobs) : null;
  } catch {
    return null;
  }
}

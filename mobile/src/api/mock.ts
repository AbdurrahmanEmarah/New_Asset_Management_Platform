import { OfflineError, type Job, type JobChange, type SendResult, type WorkOrdersApi } from './types';

const sampleJobs: Job[] = [
  {
    id: 'WO-2285',
    title: 'Fire pump FP-1 fails to start on test',
    state: 'in_progress',
    priority: 'critical',
    due: '2026-11-23',
    asset: { id: 'a-102', tag: 'INV-00102', name: 'Fire pump FP-1', location: 'Tower B · Basement 2' },
    checklist: [
      { id: 's1', label: 'Check the controller for alarms', done: true },
      { id: 's2', label: 'Test the jockey pump', done: false },
      { id: 's3', label: 'Run a manual start test', done: false },
    ],
    readings: [{ id: 'r1', label: 'Discharge pressure', unit: 'bar', min: 6, value: '' }],
    parts: [],
    version: 4,
  },
  {
    id: 'WO-2291',
    title: 'Condenser fan 2 vibration high',
    state: 'assigned',
    priority: 'high',
    due: '2026-11-26',
    asset: { id: 'a-417', tag: 'INV-00417', name: 'Chiller CH-2', location: 'Tower B · Roof' },
    checklist: [
      { id: 's1', label: 'Isolate power and lock out', done: true },
      { id: 's2', label: 'Inspect fan 2 mounts and blades', done: true },
      { id: 's3', label: 'Measure vibration after the fix', done: false },
      { id: 's4', label: 'Check condenser coil for debris', done: false },
      { id: 's5', label: 'Restore power and run for 10 minutes', done: false },
    ],
    readings: [{ id: 'r1', label: 'Fan 2 vibration', unit: 'mm/s', max: 7.1, value: '8.4' }],
    parts: [{ partNumber: 'PRT-0881', name: 'Fan motor mount kit', quantity: 1 }],
    version: 2,
  },
  {
    id: 'WO-2302',
    title: 'Quarterly service: Chiller CH-3',
    state: 'assigned',
    priority: 'planned',
    due: '2026-11-28',
    asset: { id: 'a-418', tag: 'INV-00418', name: 'Chiller CH-3', location: 'Tower B · Roof' },
    checklist: [
      { id: 's1', label: 'Check refrigerant pressures', done: false },
      { id: 's2', label: 'Clean the condenser coil', done: false },
    ],
    readings: [
      { id: 'r1', label: 'Suction pressure', unit: 'bar', min: 3, max: 6, value: '' },
      { id: 'r2', label: 'Leaving water temperature', unit: '°C', min: 5, max: 9, value: '' },
    ],
    parts: [],
    version: 1,
  },
];

export type MockOptions = {
  /** Milliseconds of fake network delay. */
  latency?: number;
  jobs?: Job[];
};

/**
 * Sample Work Orders API kept in memory. `setOnline(false)` makes every call fail like a
 * phone with no signal, so the offline queue can be tried without leaving the building.
 */
export class MockWorkOrdersApi implements WorkOrdersApi {
  private jobs: Job[];
  private online = true;
  private readonly latency: number;

  constructor(options: MockOptions = {}) {
    this.jobs = structuredClone(options.jobs ?? sampleJobs);
    this.latency = options.latency ?? 300;
  }

  setOnline(online: boolean): void {
    this.online = online;
  }

  isOnline(): boolean {
    return this.online;
  }

  async listMyJobs(): Promise<Job[]> {
    await this.wait();
    return structuredClone(this.jobs);
  }

  async getJob(id: string): Promise<Job | null> {
    await this.wait();
    const job = this.jobs.find((j) => j.id === id);
    return job ? structuredClone(job) : null;
  }

  async findAsset(tag: string) {
    await this.wait();
    const wanted = normalizeTag(tag);
    const jobs = this.jobs.filter((j) => normalizeTag(j.asset.tag) === wanted);
    if (jobs.length === 0) return null;
    return { asset: structuredClone(jobs[0]!.asset), jobs: structuredClone(jobs.filter((j) => j.state !== 'completed')) };
  }

  async send(change: JobChange): Promise<SendResult> {
    await this.wait();
    const job = this.jobs.find((j) => j.id === change.jobId);
    if (!job) return { status: 'conflict', message: `Job ${change.jobId} was removed in the office, so this change could not be saved.` };
    if (job.state === 'completed') {
      return { status: 'conflict', message: `Job ${job.id} was already completed, so this change was not saved. Ask the planner to reopen it.` };
    }
    switch (change.kind) {
      case 'checklist.set': {
        const step = job.checklist.find((s) => s.id === change.stepId);
        if (step) step.done = change.done;
        if (job.state === 'assigned') job.state = 'in_progress';
        break;
      }
      case 'reading.set': {
        const reading = job.readings.find((r) => r.id === change.readingId);
        if (reading) reading.value = change.value;
        break;
      }
      case 'job.complete':
        job.state = 'completed';
        break;
    }
    job.version += 1;
    return { status: 'sent' };
  }

  private async wait(): Promise<void> {
    if (this.latency > 0) await new Promise((resolve) => setTimeout(resolve, this.latency));
    if (!this.online) throw new OfflineError();
  }
}

export function normalizeTag(tag: string): string {
  return tag.trim().toUpperCase().replace(/\s+/g, '');
}

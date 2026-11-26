import type { Change, Job, JobState, Priority, Reading, StatusKind } from '@/api/types';

/** The job as the technician sees it: the server's copy with changes still waiting on the phone applied. */
export function applyChanges(job: Job, changes: Change[]): Job {
  let next = job;
  for (const change of changes) {
    if (change.kind === 'asset.photo' || change.jobId !== job.id) continue;
    switch (change.kind) {
      case 'checklist.set':
        next = {
          ...next,
          state: next.state === 'assigned' ? 'in_progress' : next.state,
          checklist: next.checklist.map((s) => (s.id === change.stepId ? { ...s, done: change.done } : s)),
        };
        break;
      case 'reading.set':
        next = { ...next, readings: next.readings.map((r) => (r.id === change.readingId ? { ...r, value: change.value } : r)) };
        break;
      case 'job.complete':
        next = { ...next, state: 'completed' };
        break;
    }
  }
  return next;
}

/** Null when the job can be completed, otherwise the reason it can't, as a sentence. */
export function cannotCompleteReason(job: Job): string | null {
  if (job.state === 'completed') return 'This job is already completed.';
  const open = job.checklist.filter((s) => !s.done).length;
  if (open > 0) {
    return `Finish the checklist first: ${open} of ${job.checklist.length} ${job.checklist.length === 1 ? 'step is' : 'steps are'} not done.`;
  }
  const missing = job.readings.filter((r) => r.value.trim() === '');
  if (missing.length > 0) return `Enter the ${missing.map((r) => r.label.toLowerCase()).join(' and ')} reading first.`;
  const unreadable = job.readings.find((r) => parseReading(r.value) === null);
  if (unreadable) return `The ${unreadable.label.toLowerCase()} reading is not a number. Use digits, like 6.5.`;
  return null;
}

/** Accepts "8.4" and "8,4". Null when it isn't a number. */
export function parseReading(value: string): number | null {
  const trimmed = value.trim().replace(',', '.');
  if (trimmed === '' || !/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** A plain-language warning when a reading is outside the asset type's limits, else null. */
export function readingWarning(reading: Reading): string | null {
  if (reading.value.trim() === '') return null;
  const n = parseReading(reading.value);
  if (n === null) return 'Use a number, like 6.5.';
  if (reading.max !== undefined && n > reading.max) return `Above the ${reading.max} ${reading.unit} limit set for this asset type.`;
  if (reading.min !== undefined && n < reading.min) return `Below the ${reading.min} ${reading.unit} minimum set for this asset type.`;
  return null;
}

export function readingRange(reading: Reading): string | null {
  if (reading.min !== undefined && reading.max !== undefined) return `Expected ${reading.min} to ${reading.max} ${reading.unit}`;
  if (reading.max !== undefined) return `Limit ${reading.max} ${reading.unit}`;
  if (reading.min !== undefined) return `Minimum ${reading.min} ${reading.unit}`;
  return null;
}

export const stateLabel: Record<JobState, { label: string; kind: StatusKind }> = {
  assigned: { label: 'Assigned', kind: 'info' },
  in_progress: { label: 'In progress', kind: 'ok' },
  on_hold: { label: 'On hold', kind: 'warn' },
  completed: { label: 'Completed', kind: 'none' },
};

export const priorityLabel: Record<Priority, { label: string; kind: StatusKind }> = {
  critical: { label: 'P1 · Critical', kind: 'fault' },
  high: { label: 'P2 · High', kind: 'warn' },
  normal: { label: 'P3 · Normal', kind: 'info' },
  planned: { label: 'Planned', kind: 'none' },
};

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Overdue", "Today" or "26 Nov". */
export function dueLabel(due: string, today: Date = new Date()): string {
  const [y, m, d] = due.split('-').map(Number) as [number, number, number];
  const dueDay = Date.UTC(y, m - 1, d);
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (dueDay < todayDay) return 'Overdue';
  if (dueDay === todayDay) return 'Today';
  return `${d} ${months[m - 1]}`;
}

export function describeChange(change: Change): string {
  switch (change.kind) {
    case 'asset.photo':
      return `${change.assetTag}: photo ${change.fileName}`;
    case 'checklist.set':
      return `${change.jobId}: checklist step ${change.done ? 'ticked' : 'unticked'}`;
    case 'reading.set':
      return `${change.jobId}: reading set to ${change.value || '(blank)'}`;
    case 'job.complete':
      return `${change.jobId}: completed`;
  }
}

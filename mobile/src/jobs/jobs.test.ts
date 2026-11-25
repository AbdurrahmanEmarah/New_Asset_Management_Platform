import type { Job } from '@/api/types';
import { applyChanges, cannotCompleteReason, dueLabel, readingWarning } from './jobs';

const job: Job = {
  id: 'WO-1',
  title: 'Test',
  state: 'assigned',
  priority: 'high',
  due: '2026-11-26',
  asset: { id: 'a', tag: 'INV-1', name: 'Pump', location: 'Roof' },
  checklist: [
    { id: 's1', label: 'One', done: true },
    { id: 's2', label: 'Two', done: false },
  ],
  readings: [{ id: 'r1', label: 'Vibration', unit: 'mm/s', max: 7.1, value: '' }],
  parts: [],
  version: 1,
};

describe('jobs', () => {
  it('shows changes still waiting on the phone', () => {
    const seen = applyChanges(job, [
      { kind: 'checklist.set', jobId: 'WO-1', stepId: 's2', done: true },
      { kind: 'reading.set', jobId: 'WO-1', readingId: 'r1', value: '6.2' },
      { kind: 'checklist.set', jobId: 'WO-other', stepId: 's1', done: false },
    ]);
    expect(seen.checklist.every((s) => s.done)).toBe(true);
    expect(seen.readings[0]!.value).toBe('6.2');
    expect(seen.state).toBe('in_progress');
    expect(job.checklist[1]!.done).toBe(false); // not mutated
  });

  it('explains why a job cannot be completed yet', () => {
    expect(cannotCompleteReason(job)).toBe('Finish the checklist first: 1 of 2 steps are not done.');
    const ticked = applyChanges(job, [{ kind: 'checklist.set', jobId: 'WO-1', stepId: 's2', done: true }]);
    expect(cannotCompleteReason(ticked)).toBe('Enter the vibration reading first.');
    const read = applyChanges(ticked, [{ kind: 'reading.set', jobId: 'WO-1', readingId: 'r1', value: 'abc' }]);
    expect(cannotCompleteReason(read)).toBe('The vibration reading is not a number. Use digits, like 6.5.');
    const ready = applyChanges(ticked, [{ kind: 'reading.set', jobId: 'WO-1', readingId: 'r1', value: '8,4' }]);
    expect(cannotCompleteReason(ready)).toBeNull();
  });

  it('warns when a reading is outside the limit', () => {
    const r = job.readings[0]!;
    expect(readingWarning({ ...r, value: '8.4' })).toBe('Above the 7.1 mm/s limit set for this asset type.');
    expect(readingWarning({ ...r, value: '7.1' })).toBeNull();
    expect(readingWarning({ ...r, min: 2, value: '1' })).toBe('Below the 2 mm/s minimum set for this asset type.');
    expect(readingWarning({ ...r, value: '' })).toBeNull();
  });

  it('labels due dates', () => {
    const today = new Date(2026, 10, 24);
    expect(dueLabel('2026-11-23', today)).toBe('Overdue');
    expect(dueLabel('2026-11-24', today)).toBe('Today');
    expect(dueLabel('2026-11-26', today)).toBe('26 Nov');
  });
});

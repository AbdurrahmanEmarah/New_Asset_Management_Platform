/**
 * Shapes the field app expects from the Work Orders API (phase 3).
 * Until that API exists, mock.ts serves these from typed sample data.
 */
export type StatusKind = 'ok' | 'warn' | 'fault' | 'info' | 'none';

export type JobState = 'assigned' | 'in_progress' | 'on_hold' | 'completed';

export type Priority = 'critical' | 'high' | 'normal' | 'planned';

export type ChecklistStep = {
  id: string;
  label: string;
  done: boolean;
};

export type Reading = {
  id: string;
  label: string;
  unit: string;
  /** Upper limit set on the asset type. A value above it shows a warning. */
  max?: number;
  /** Lower limit set on the asset type. */
  min?: number;
  /** As typed by the technician, so "8,4" or "" survive until it is parsed. */
  value: string;
};

export type PartUsed = {
  partNumber: string;
  name: string;
  quantity: number;
};

export type AssetSummary = {
  id: string;
  /** The code printed on the asset's QR tag, e.g. INV-00417. */
  tag: string;
  name: string;
  location: string;
};

export type Job = {
  id: string;
  title: string;
  state: JobState;
  priority: Priority;
  /** ISO date (yyyy-mm-dd). */
  due: string;
  asset: AssetSummary;
  checklist: ChecklistStep[];
  readings: Reading[];
  parts: PartUsed[];
  /** Server concurrency token; sent back with each change so the server can detect conflicts. */
  version: number;
};

/** A change made on the phone. Saved in the offline queue first, then sent. */
export type JobChange =
  | { kind: 'checklist.set'; jobId: string; stepId: string; done: boolean }
  | { kind: 'reading.set'; jobId: string; readingId: string; value: string }
  | { kind: 'job.complete'; jobId: string };

/** A photo taken on the phone, to be attached to an asset (POST /api/documents/assets/{id}/documents). */
export type AssetPhotoChange = {
  kind: 'asset.photo';
  assetId: string;
  assetTag: string;
  uri: string;
  fileName: string;
  contentType: string;
  sizeBytes?: number;
};

/** Anything the offline queue can hold. */
export type Change = JobChange | AssetPhotoChange;

export function isJobChange(change: Change): change is JobChange {
  return change.kind !== 'asset.photo';
}

/** What the server said about one change. */
export type SendResult =
  | { status: 'sent' }
  /** The server refused it for a reason the technician must see (HTTP 409 with a plain-language detail). */
  | { status: 'conflict'; message: string };

/** Thrown when the server can't be reached; the change stays queued and is retried. */
export class OfflineError extends Error {
  constructor(message = 'No connection.') {
    super(message);
    this.name = 'OfflineError';
  }
}

/** Thrown for any other failure, with a message that can be shown as-is. */
export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface WorkOrdersApi {
  listMyJobs(): Promise<Job[]>;
  getJob(id: string): Promise<Job | null>;
  /** Finds the asset whose QR tag (or typed code) is `tag`, with its open jobs for me. */
  findAsset(tag: string): Promise<{ asset: AssetSummary; jobs: Job[] } | null>;
  send(change: JobChange): Promise<SendResult>;
}

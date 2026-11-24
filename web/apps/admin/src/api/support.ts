/**
 * Support access, served by the Access service through the gateway at /api/access.
 * Types and client in one file, to align with docs/contracts/access.openapi.json once it exists.
 */
import { createHttp, type TokenSource } from '../../../../shared/api/http';
import type { StatusKind } from '../../../../shared/ui';

export type SupportAccessLevel = 'read' | 'read_write';
export type SupportSessionStatus = 'pending_approval' | 'active' | 'ended' | 'expired' | 'denied';

export interface SupportSession {
  id: string;
  clientId: string;
  clientName: string;
  requestedByName: string;
  reason: string;
  access: SupportAccessLevel;
  durationMinutes: number;
  status: SupportSessionStatus;
  requestedAt: string;
  startedAt: string | null;
  endsAt: string | null;
  endedAt: string | null;
  /** Null when the signed-in staff member may end it now; otherwise a sentence. */
  cannotEndReason: string | null;
}

export interface NewSupportSession {
  clientId: string;
  reason: string;
  durationMinutes: number;
  access: SupportAccessLevel;
}

export interface SupportApi {
  /** "active" = pending approval or running; "past" = ended, expired or denied. Newest first. */
  list(state: 'active' | 'past'): Promise<SupportSession[]>;
  request(body: NewSupportSession): Promise<SupportSession>;
  end(id: string): Promise<SupportSession>;
}

export function createSupportApi(gatewayUrl: string, getToken: TokenSource): SupportApi {
  const request = createHttp(`${gatewayUrl.replace(/\/$/, '')}/api/access`, getToken);
  return {
    list: (state) => request(`/support-sessions?state=${state}`),
    request: (body) => request('/support-sessions', { method: 'POST', body: JSON.stringify(body) }),
    end: (id) => request(`/support-sessions/${id}/end`, { method: 'POST' }),
  };
}

export const DURATIONS = [
  { minutes: 30, label: '30 minutes', adjective: '30-minute' },
  { minutes: 60, label: '60 minutes', adjective: '60-minute' },
  { minutes: 240, label: '4 hours', adjective: '4-hour' },
];

export const ACCESS_LABELS: Record<SupportAccessLevel, string> = {
  read: 'Read-only',
  read_write: 'Read and write',
};

export const SESSION_STATUS: Record<SupportSessionStatus, { label: string; kind: StatusKind }> = {
  pending_approval: { label: 'Waiting for client approval', kind: 'warn' },
  active: { label: 'Active', kind: 'ok' },
  ended: { label: 'Ended', kind: 'none' },
  expired: { label: 'Expired', kind: 'none' },
  denied: { label: 'Denied by client', kind: 'fault' },
};

/**
 * Support passes and the first Owner's invitation, served by the Access service at
 * /api/access/platform/clients/{clientId}/… (docs/contracts/access.openapi.json).
 */
import { createHttp, type TokenSource } from '../../../../shared/api/http';
import type { StatusKind } from '../../../../shared/ui';

export type SupportAccess = 'read' | 'change';
export type SupportPassStatus = 'active' | 'expired' | 'ended';

export interface SupportPass {
  id: string;
  clientId: string;
  requestedByName: string;
  reason: string;
  access: SupportAccess;
  status: SupportPassStatus;
  startedAt: string;
  expiresAt: string;
  endedAt: string | null;
  endedByName: string | null;
  actionCount: number;
}

export interface NewSupportPass { reason: string; minutes: number; access: SupportAccess }

/** headerName/headerValue let the console act inside the client's workspace while the pass lasts. */
export interface StartedSupportPass { pass: SupportPass; headerName: string; headerValue: string }

export interface OwnerInvitation {
  clientId: string;
  email: string;
  name: string;
  status: 'invited' | 'active' | 'deactivated';
  expiresAt: string | null;
  /** Only present right after a new link is made. */
  acceptUrl: string | null;
}

export interface SupportApi {
  passes(clientId: string): Promise<SupportPass[]>;
  start(clientId: string, body: NewSupportPass): Promise<StartedSupportPass>;
  end(clientId: string, passId: string): Promise<SupportPass>;
  ownerInvitation(clientId: string): Promise<OwnerInvitation>;
  reissueOwnerInvitation(clientId: string): Promise<OwnerInvitation>;
}

export function createSupportApi(gatewayUrl: string, getToken: TokenSource): SupportApi {
  const request = createHttp(`${gatewayUrl.replace(/\/$/, '')}/api/access/platform/clients`, getToken);
  const post = <T,>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
  return {
    passes: (clientId) => request(`/${clientId}/support-passes`),
    start: (clientId, body) => post(`/${clientId}/support-passes`, body),
    end: (clientId, passId) => post(`/${clientId}/support-passes/${passId}/end`),
    ownerInvitation: (clientId) => request(`/${clientId}/owner-invitation`),
    reissueOwnerInvitation: (clientId) => post(`/${clientId}/owner-invitation`),
  };
}

/** The server allows 15 minutes to 8 hours; these are the choices offered. */
export const DURATIONS = [
  { minutes: 30, label: '30 minutes', adjective: '30-minute' },
  { minutes: 60, label: '60 minutes', adjective: '60-minute' },
  { minutes: 240, label: '4 hours', adjective: '4-hour' },
];

export const ACCESS_LABELS: Record<SupportAccess, string> = { read: 'Read-only', change: 'Read and change' };

export const PASS_STATUS: Record<SupportPassStatus, { label: string; kind: StatusKind }> = {
  active: { label: 'Active', kind: 'ok' },
  expired: { label: 'Expired', kind: 'none' },
  ended: { label: 'Ended', kind: 'none' },
};

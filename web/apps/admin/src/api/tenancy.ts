import { createHttp, type TokenSource } from '../../../../shared/api/http';
import type { UsageState } from '../../../../shared/ui';

export type ClientStatus = 'trial' | 'active' | 'payment_due' | 'suspended' | 'closed';
export type ClientFilter = 'all' | 'active' | 'attention' | 'suspended';

export interface UsageLine { used: number; limit: number; state: UsageState }

export interface Client {
  id: string;
  name: string;
  slug: string;
  region: string;
  regionName: string;
  plan: { key: string; name: string };
  status: ClientStatus;
  ownerName: string;
  ownerEmail: string;
  createdAt: string;
  trialEndsAt: string | null;
  suspendedReason: string | null;
  usage: { users: UsageLine; assets: UsageLine; storageMb: UsageLine };
}

export interface ClientSummary { active: number; trial: number; suspended: number; nearLimit: number; seatsInUse: number }
export interface Plan { key: string; name: string; maxUsers: number; maxAssets: number; storageGb: number; modules: string[]; isTrial: boolean }
export interface Region { key: string; name: string }
export interface AuditEntry { id: number; at: string; actorName: string; action: string; clientId: string | null; clientName: string | null; details: string }
export interface Me { id: string; name: string; email: string | null; roles: string[]; canManageClients: boolean; canManageBilling: boolean }

export interface NewClient { name: string; slug: string; region: string; planKey: string; ownerName: string; ownerEmail: string }

export interface TenancyApi {
  me(): Promise<Me>;
  listClients(filter: ClientFilter, search: string): Promise<Client[]>;
  summary(): Promise<ClientSummary>;
  createClient(body: NewClient): Promise<Client>;
  suspend(id: string, reason: string): Promise<Client>;
  reactivate(id: string): Promise<Client>;
  changePlan(id: string, planKey: string): Promise<Client>;
  plans(): Promise<Plan[]>;
  regions(): Promise<Region[]>;
  audit(clientId?: string): Promise<AuditEntry[]>;
}

export function createTenancyApi(gatewayUrl: string, getToken: TokenSource): TenancyApi {
  const request = createHttp(`${gatewayUrl.replace(/\/$/, '')}/api/tenancy`, getToken);
  const post = <T,>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

  return {
    me: () => request('/me'),
    listClients: (filter, search) => {
      const params = new URLSearchParams();
      if (filter !== 'all') params.set('status', filter);
      if (search.trim()) params.set('search', search.trim());
      const qs = params.toString();
      return request(`/clients${qs ? `?${qs}` : ''}`);
    },
    summary: () => request('/clients/summary'),
    createClient: (body) => post('/clients', body),
    suspend: (id, reason) => post(`/clients/${id}/suspend`, { reason }),
    reactivate: (id) => post(`/clients/${id}/reactivate`),
    changePlan: (id, planKey) => request(`/clients/${id}/plan`, { method: 'PUT', body: JSON.stringify({ planKey }) }),
    plans: () => request('/plans'),
    regions: () => request('/regions'),
    audit: (clientId) => request(`/audit${clientId ? `?clientId=${clientId}` : ''}`),
  };
}

export const STATUS_LABELS: Record<ClientStatus, { label: string; kind: 'ok' | 'warn' | 'fault' | 'info' | 'none' }> = {
  active: { label: 'Active', kind: 'ok' },
  trial: { label: 'Trial', kind: 'info' },
  payment_due: { label: 'Payment due', kind: 'warn' },
  suspended: { label: 'Suspended', kind: 'fault' },
  closed: { label: 'Closed', kind: 'none' },
};

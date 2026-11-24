import { vi } from 'vitest';
import type { StartedSupportPass, SupportApi, SupportPass } from './api/support';
import type { Client, Me, Plan, TenancyApi } from './api/tenancy';

export const OWNER: Me = { id: 'o1', name: 'Platform Owner', email: 'owner@inventra.local', roles: ['platform-owner'], canManageClients: true, canManageBilling: true };
export const SUPPORT: Me = { id: 's1', name: 'Support Agent', email: 'support@inventra.local', roles: ['platform-support'], canManageClients: false, canManageBilling: false };

export const PLANS: Plan[] = [
  { key: 'trial', name: 'Trial', maxUsers: 10, maxAssets: 500, storageGb: 5, modules: ['assets', 'maintenance'], isTrial: true },
  { key: 'starter', name: 'Starter', maxUsers: 25, maxAssets: 2000, storageGb: 20, modules: ['assets', 'maintenance'], isTrial: false },
  { key: 'business', name: 'Business', maxUsers: 200, maxAssets: 10000, storageGb: 100, modules: ['assets', 'maintenance', 'inventory', 'integrations'], isTrial: false },
];

export function client(overrides: Partial<Client> = {}): Client {
  return {
    id: 'c1', name: 'Gulf Facilities Co.', slug: 'gulf-fm', region: 'uae-north', regionName: 'UAE North',
    plan: { key: 'business', name: 'Business' }, status: 'active', ownerName: 'Mona Haddad', ownerEmail: 'mona@gulf-fm.example',
    createdAt: '2026-11-24T09:00:00Z', trialEndsAt: null, suspendedReason: null,
    usage: { users: { used: 171, limit: 200, state: 'warn' }, assets: { used: 8412, limit: 10000, state: 'warn' }, storageMb: { used: 0, limit: 102400, state: 'ok' } },
    ...overrides,
  };
}

export function fakeApi(overrides: Partial<TenancyApi> = {}): TenancyApi {
  return {
    me: vi.fn().mockResolvedValue(OWNER),
    listClients: vi.fn().mockResolvedValue([client()]),
    summary: vi.fn().mockResolvedValue({ active: 1, trial: 0, suspended: 0, nearLimit: 1, seatsInUse: 171 }),
    createClient: vi.fn(),
    suspend: vi.fn(),
    reactivate: vi.fn(),
    changePlan: vi.fn(),
    plans: vi.fn().mockResolvedValue(PLANS),
    regions: vi.fn().mockResolvedValue([{ key: 'uae-north', name: 'UAE North' }, { key: 'west-europe', name: 'West Europe' }]),
    audit: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

export const BILLING: Me = { id: 'b1', name: 'Billing Clerk', email: 'billing@inventra.local', roles: ['platform-billing'], canManageClients: false, canManageBilling: true };

export function pass(overrides: Partial<SupportPass> = {}): SupportPass {
  return {
    id: 'p1', clientId: 'c1', requestedByName: 'Support Agent', reason: 'Ticket #4182: imported assets are missing their location.',
    access: 'read', status: 'active', startedAt: '2026-11-24T09:00:00Z', expiresAt: '2026-11-24T10:00:00Z', endedAt: null, endedByName: null, actionCount: 2,
    ...overrides,
  };
}

export function started(overrides: Partial<SupportPass> = {}): StartedSupportPass {
  return { pass: pass(overrides), headerName: 'X-Support-Pass', headerValue: 'secret' };
}

export function fakeSupport(overrides: Partial<SupportApi> = {}): SupportApi {
  return {
    passes: vi.fn().mockResolvedValue([pass(), pass({ id: 'p0', status: 'expired', reason: 'Ticket #4011: roles help', endedAt: '2026-11-10T09:30:00Z' })]),
    start: vi.fn(),
    end: vi.fn(),
    ownerInvitation: vi.fn().mockResolvedValue({ clientId: 'c1', email: 'mona@gulf-fm.example', name: 'Mona Haddad', status: 'invited', expiresAt: '2026-12-01T09:00:00Z', acceptUrl: null }),
    reissueOwnerInvitation: vi.fn().mockResolvedValue({ clientId: 'c1', email: 'mona@gulf-fm.example', name: 'Mona Haddad', status: 'invited', expiresAt: '2026-12-01T09:00:00Z', acceptUrl: 'http://localhost:5174/join#abc' }),
    ...overrides,
  };
}

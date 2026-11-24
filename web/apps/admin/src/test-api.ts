import { vi } from 'vitest';
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

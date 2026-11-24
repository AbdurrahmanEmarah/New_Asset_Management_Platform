/**
 * The Access API as the client web app uses it: types and the HTTP client in one file, so it is easy
 * to align with docs/contracts/access.openapi.json once the Backend publishes it.
 * Every route goes through the gateway at /api/access.
 */
import { createHttp, type TokenSource } from '../../../../shared/api/http';
import type { StatusKind } from '../../../../shared/ui';

export interface Ref { id: string; name: string }

export interface AccessMe {
  id: string;
  name: string;
  email: string;
  company: { id: string; name: string; slug: string };
  roles: Ref[];
  /** Effective permission keys, `area.action`. */
  permissions: string[];
}

export type UserStatus = 'active' | 'invited' | 'deactivated';
export type UserFilter = 'all' | UserStatus;

export interface User {
  id: string;
  /** Null until an invited person accepts and sets their name. */
  name: string | null;
  email: string;
  status: UserStatus;
  roles: Ref[];
  /** Sites this person works at. Empty means every site their roles allow. */
  siteIds: string[];
  lastActiveAt: string | null;
  invitedAt: string | null;
  /** Null when allowed; otherwise a sentence the UI shows as-is (e.g. "The last Owner can't be removed."). */
  cannotDeactivateReason: string | null;
  cannotResendInviteReason: string | null;
}

export interface UserList {
  items: User[];
  seats: { used: number; limit: number };
}

export interface UserQuery { status: UserFilter; search: string; roleId: string | null }

export interface NewInvite { email: string; roleIds: string[]; siteIds: string[] }

export interface PermissionArea {
  key: string;
  label: string;
  permissions: { key: string; label: string }[];
}

export interface Role {
  id: string;
  name: string;
  description: string;
  builtIn: boolean;
  /** The Owner role: always has every permission and can't be edited. */
  locked: boolean;
  memberCount: number;
  permissions: string[];
  /** Sites the role applies at. Empty means all sites. */
  siteIds: string[];
  /** Concurrency token: sent back on save so two admins can't overwrite each other. */
  version: string;
  cannotEditReason: string | null;
  cannotDeleteReason: string | null;
}

export interface RoleInput {
  name: string;
  description: string;
  permissions: string[];
  siteIds: string[];
}

export type Site = Ref;

export interface AccessApi {
  me(): Promise<AccessMe>;
  listUsers(query: UserQuery): Promise<UserList>;
  invite(body: NewInvite): Promise<User>;
  deactivate(id: string): Promise<User>;
  reactivate(id: string): Promise<User>;
  resendInvite(id: string): Promise<User>;
  permissions(): Promise<PermissionArea[]>;
  roles(): Promise<Role[]>;
  createRole(body: RoleInput & { copyFromRoleId?: string }): Promise<Role>;
  updateRole(id: string, body: RoleInput & { version: string }): Promise<Role>;
  deleteRole(id: string): Promise<void>;
  sites(): Promise<Site[]>;
}

export function createAccessApi(gatewayUrl: string, getToken: TokenSource): AccessApi {
  const request = createHttp(`${gatewayUrl.replace(/\/$/, '')}/api/access`, getToken);
  const send = <T,>(method: string, path: string, body?: unknown) =>
    request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

  return {
    me: () => request('/me'),
    listUsers: ({ status, search, roleId }) => {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      if (search.trim()) params.set('search', search.trim());
      if (roleId) params.set('roleId', roleId);
      const qs = params.toString();
      return request(`/users${qs ? `?${qs}` : ''}`);
    },
    invite: (body) => send('POST', '/users/invites', body),
    deactivate: (id) => send('POST', `/users/${id}/deactivate`),
    reactivate: (id) => send('POST', `/users/${id}/reactivate`),
    resendInvite: (id) => send('POST', `/users/${id}/resend-invite`),
    permissions: () => request('/permissions'),
    roles: () => request('/roles'),
    createRole: (body) => send('POST', '/roles', body),
    updateRole: (id, body) => send('PUT', `/roles/${id}`, body),
    deleteRole: (id) => send('DELETE', `/roles/${id}`),
    sites: () => request('/sites'),
  };
}

export const USER_STATUS: Record<UserStatus, { label: string; kind: StatusKind }> = {
  active: { label: 'Active', kind: 'ok' },
  invited: { label: 'Invite sent', kind: 'info' },
  deactivated: { label: 'Deactivated', kind: 'none' },
};

/** Permission keys the screens check. The server checks again. */
export const PERMISSIONS = {
  manageUsers: 'users.manage',
  manageRoles: 'roles.manage',
} as const;

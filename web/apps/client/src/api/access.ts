/**
 * The Access API as the client web app uses it: types and the HTTP client in one file.
 * Source of truth: docs/contracts/access.openapi.json (Backend, branch claude/backend-access).
 * Every route goes through the gateway at /api/access.
 *
 * Site scope lives on each person's role ASSIGNMENT, never on the role: users carry
 * roles [{ id, name, kind, allSites, siteIds }], and invites and role changes send
 * roles [{ roleId, siteIds }] (field errors come under "roles").
 */
import { createHttp, type TokenSource } from '../../../../shared/api/http';
import type { ThemeMode } from '../../../../shared/theme/theme';
import type { StatusKind, UsageState } from '../../../../shared/ui';

export interface Ref { id: string; name: string }

/** A role given to a person, with the sites it applies at for them. */
export interface RoleAssignment extends Ref { kind: RoleKind; allSites: boolean; siteIds: string[] }
/** Empty siteIds = all sites. The Owner role always applies at all sites. */
export interface AssignmentInput { roleId: string; siteIds: string[] }

export interface MeRole extends RoleAssignment { permissions: string[] }
export type SupportAccess = 'read' | 'change';

export interface AccessMe {
  userId: string | null;
  name: string;
  email: string | null;
  theme: ThemeMode;
  company: { id: string; name: string; slug: string };
  isOwner: boolean;
  /** Effective permission keys, `area.action`. */
  permissions: string[];
  roles: MeRole[];
  /** Set when platform support staff are inside this company on a support pass. */
  supportSession: { passId: string; access: SupportAccess; expiresAt: string } | null;
}

export type UserStatus = 'active' | 'invited' | 'deactivated';
export type UserFilter = 'all' | UserStatus;

export interface User {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  isOwner: boolean;
  roles: RoleAssignment[];
  invitedAt: string;
  invitedByName: string;
  invitationExpiresAt: string | null;
  joinedAt: string | null;
  deactivatedAt: string | null;
  deactivatedByName: string | null;
  /** Null when allowed; otherwise a sentence the UI shows as-is (e.g. "The last Owner can't be removed."). */
  cannotDeactivateReason: string | null;
  cannotChangeRolesReason: string | null;
}

export interface SeatSummary { seats: number; active: number; invited: number; deactivated: number; limit: number; state: UsageState }

export interface NewInvite { email: string; name: string; roles: AssignmentInput[] }

/** The join link. There's no email yet, so it is shown once for the admin to pass on. */
export interface InvitationLink { user: User; acceptUrl: string; expiresAt: string }

export interface PermissionArea {
  key: string;
  title: string;
  permissions: { key: string; label: string }[];
}

export type RoleKind = 'owner' | 'built_in' | 'custom';

export interface Role {
  id: string;
  name: string;
  description: string;
  /** owner: always every permission, can't be edited. built_in: editable, can't be deleted. */
  kind: RoleKind;
  builtInKey: string | null;
  memberCount: number;
  permissions: string[];
  cannotEditReason: string | null;
  cannotDeleteReason: string | null;
  updatedAt: string;
}

export interface RoleInput { name: string; description: string; permissions: string[] }

export interface Site { id: string; name: string; code: string; isActive: boolean }
export interface SiteInput { name: string; code: string; isActive: boolean }

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

export interface InvitationPreview {
  clientId: string;
  companyName: string;
  email: string;
  name: string;
  invitedByName: string;
  roles: string[];
  expiresAt: string;
  cannotAcceptReason: string | null;
}

export interface AcceptedInvitation { clientId: string; companyName: string; userId: string; signInAgain: boolean }

export interface AccessApi {
  me(): Promise<AccessMe>;
  savePreferences(theme: ThemeMode): Promise<AccessMe>;
  listUsers(status: UserFilter, search: string): Promise<User[]>;
  seatSummary(): Promise<SeatSummary>;
  invite(body: NewInvite): Promise<InvitationLink>;
  reissueInvitation(userId: string): Promise<InvitationLink>;
  cancelInvitation(userId: string): Promise<void>;
  deactivate(userId: string): Promise<User>;
  reactivate(userId: string): Promise<User>;
  setRoles(userId: string, roles: AssignmentInput[]): Promise<User>;
  permissions(): Promise<PermissionArea[]>;
  roles(): Promise<Role[]>;
  createRole(body: RoleInput): Promise<Role>;
  updateRole(id: string, body: RoleInput): Promise<Role>;
  copyRole(id: string, name: string): Promise<Role>;
  deleteRole(id: string): Promise<void>;
  sites(): Promise<Site[]>;
  createSite(body: SiteInput): Promise<Site>;
  updateSite(id: string, body: SiteInput): Promise<Site>;
  supportPasses(): Promise<SupportPass[]>;
  endSupportPass(id: string): Promise<SupportPass>;
  previewInvitation(token: string): Promise<InvitationPreview>;
  acceptInvitation(token: string): Promise<AcceptedInvitation>;
}

export function createAccessApi(gatewayUrl: string, getToken: TokenSource): AccessApi {
  const request = createHttp(`${gatewayUrl.replace(/\/$/, '')}/api/access`, getToken);
  const send = <T,>(method: string, path: string, body?: unknown) =>
    request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

  return {
    me: () => request('/me'),
    savePreferences: (theme) => send('PUT', '/me/preferences', { theme }),
    listUsers: (status, search) => {
      const params = new URLSearchParams();
      if (status !== 'all') params.set('status', status);
      if (search.trim()) params.set('search', search.trim());
      const qs = params.toString();
      return request(`/users${qs ? `?${qs}` : ''}`);
    },
    seatSummary: () => request('/users/summary'),
    invite: (body) => send('POST', '/users', body),
    reissueInvitation: (id) => send('POST', `/users/${id}/invitation`),
    cancelInvitation: (id) => send('DELETE', `/users/${id}/invitation`),
    deactivate: (id) => send('POST', `/users/${id}/deactivate`),
    reactivate: (id) => send('POST', `/users/${id}/reactivate`),
    setRoles: (id, roles) => send('PUT', `/users/${id}/roles`, { roles }),
    permissions: () => request('/permissions'),
    roles: () => request('/roles'),
    createRole: (body) => send('POST', '/roles', body),
    updateRole: (id, body) => send('PUT', `/roles/${id}`, body),
    copyRole: (id, name) => send('POST', `/roles/${id}/copy`, { name }),
    deleteRole: (id) => send('DELETE', `/roles/${id}`),
    sites: () => request('/sites'),
    createSite: (body) => send('POST', '/sites', body),
    updateSite: (id, body) => send('PUT', `/sites/${id}`, body),
    supportPasses: () => request('/support-passes'),
    endSupportPass: (id) => send('POST', `/support-passes/${id}/end`),
    previewInvitation: (token) => send('POST', '/invitations/preview', { token }),
    acceptInvitation: (token) => send('POST', '/invitations/accept', { token }),
  };
}

export const USER_STATUS: Record<UserStatus, { label: string; kind: StatusKind }> = {
  active: { label: 'Active', kind: 'ok' },
  invited: { label: 'Invite sent', kind: 'info' },
  deactivated: { label: 'Deactivated', kind: 'none' },
};

export const PASS_STATUS: Record<SupportPassStatus, { label: string; kind: StatusKind }> = {
  active: { label: 'Active', kind: 'warn' },
  expired: { label: 'Expired', kind: 'none' },
  ended: { label: 'Ended', kind: 'none' },
};

export const ACCESS_LABELS: Record<SupportAccess, string> = { read: 'Read-only', change: 'Read and change' };

/** Permission keys the screens check. The server checks again. */
export const PERMISSIONS = {
  manageUsers: 'users.manage',
  manageRoles: 'roles.manage',
  manageSettings: 'settings.manage',
} as const;

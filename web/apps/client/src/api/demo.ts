/**
 * An in-memory Access API with the rules the server enforces, shaped like
 * docs/contracts/access.openapi.json. Used by the tests, and by `npm run dev:client:demo`
 * so the screens can be tried before the Access service is running.
 * Its data matches the Roles mockup on the design canvas.
 */
import { ApiError } from '../../../../shared/api/http';
import type {
  AccessApi, AccessMe, AssignmentInput, InvitationLink, NewInvite, PermissionArea, Role, RoleInput, Site, SiteInput, SupportPass, User,
} from './access';

const invalid = (errors: Record<string, string[]>) => new ApiError(400, 'Fix the highlighted fields and try again.', errors);

export const CATALOG: PermissionArea[] = [
  { key: 'assets', title: 'Assets', permissions: [
    { key: 'assets.read', label: 'View assets' }, { key: 'assets.write', label: 'Create and edit assets' },
    { key: 'assets.transfer', label: 'Transfer between sites' }, { key: 'assets.dispose', label: 'Retire or dispose' }] },
  { key: 'workorders', title: 'Work orders', permissions: [
    { key: 'workorders.read', label: 'View work orders' }, { key: 'workorders.create', label: 'Raise requests and work orders' },
    { key: 'workorders.assign', label: 'Assign technicians' }, { key: 'workorders.complete', label: 'Complete and sign off' }] },
  { key: 'maintenance', title: 'Maintenance', permissions: [
    { key: 'pm.manage', label: 'Manage preventive schedules' }, { key: 'checklists.manage', label: 'Edit inspection checklists' }] },
  { key: 'inventory', title: 'Inventory', permissions: [
    { key: 'inventory.read', label: 'View parts and stock' }, { key: 'inventory.write', label: 'Receive and issue parts' }] },
  { key: 'reports', title: 'Reports & audit', permissions: [
    { key: 'reports.view', label: 'View reports' }, { key: 'audit.view', label: 'View the audit log' }] },
  { key: 'administration', title: 'Administration', permissions: [
    { key: 'users.manage', label: 'Invite and manage users' }, { key: 'roles.manage', label: 'Edit roles' },
    { key: 'settings.manage', label: 'Asset types, sites, modules' }, { key: 'integrations.manage', label: 'Integrations and API keys' }] },
];

export const ALL_PERMISSIONS = CATALOG.flatMap((a) => a.permissions.map((p) => p.key));

export const SITES: Site[] = [
  { id: 'hq', name: 'HQ Tower', code: 'HQ', isActive: true },
  { id: 'tower-b', name: 'Tower B', code: 'TWB', isActive: true },
  { id: 'north', name: 'North depot', code: 'NDP', isActive: true },
  { id: 'wh1', name: 'Warehouse 1', code: 'WH1', isActive: true },
  { id: 'yard', name: 'Plant yard', code: 'YRD', isActive: false },
];

type StoredRole = Omit<Role, 'memberCount' | 'cannotEditReason' | 'cannotDeleteReason'>;
const UPDATED = '2026-11-20T09:00:00Z';
const builtIn = (id: string, name: string, permissions: string[], description: string): StoredRole =>
  ({ id, name, description, kind: 'built_in', builtInKey: id, permissions, updatedAt: UPDATED });

const ROLE_SEEDS: StoredRole[] = [
  { id: 'owner', name: 'Owner', kind: 'owner', builtInKey: 'owner', permissions: ALL_PERMISSIONS, updatedAt: UPDATED,
    description: 'Full control of the company account, including subscription, single sign-on and ownership transfer.' },
  builtIn('admin', 'Admin', ALL_PERMISSIONS, 'Runs the workspace: users, roles, sites, asset types, modules and integrations.'),
  builtIn('assetmgr', 'Asset Manager', ['assets.read', 'assets.write', 'assets.transfer', 'assets.dispose', 'workorders.read', 'inventory.read', 'reports.view'],
    'Owns the asset register: adds, edits, moves and retires assets.'),
  builtIn('planner', 'Maintenance Planner', ['assets.read', 'workorders.read', 'workorders.create', 'workorders.assign', 'workorders.complete', 'pm.manage', 'checklists.manage', 'inventory.read', 'reports.view'],
    'Plans the work: raises and assigns work orders and keeps preventive schedules up to date.'),
  builtIn('tech', 'Technician', ['assets.read', 'workorders.read', 'workorders.complete', 'inventory.read'],
    'Does the work, mostly in the field app: sees their own jobs, records readings and completes them.'),
  builtIn('store', 'Storekeeper', ['assets.read', 'workorders.read', 'inventory.read', 'inventory.write'],
    'Looks after parts: receives deliveries, issues parts to jobs and keeps stock counts right.'),
  builtIn('req', 'Requester', ['assets.read', 'workorders.create'], 'Anyone who reports a fault. They can see assets and raise a request, nothing more.'),
  builtIn('viewer', 'Viewer / Auditor', ['assets.read', 'workorders.read', 'inventory.read', 'reports.view', 'audit.view'],
    'Read-only access to the register, work history, reports and the audit log.'),
];

interface StoredUser {
  id: string; name: string; email: string; status: User['status']; roles: AssignmentInput[];
  invitedAt: string; invitedByName: string; invitationExpiresAt: string | null; joinedAt: string | null;
  deactivatedAt: string | null; deactivatedByName: string | null;
}

const joined = (id: string, name: string, email: string, roleId: string, siteIds: string[], joinedAt: string): StoredUser => ({
  id, name, email, status: 'active', roles: [{ roleId, siteIds }], invitedAt: '2026-10-01T09:00:00Z', invitedByName: 'Mona Haddad',
  invitationExpiresAt: null, joinedAt, deactivatedAt: null, deactivatedByName: null,
});

const USER_SEEDS: StoredUser[] = [
  joined('u-mona', 'Mona Haddad', 'mona@gulf-fm.example', 'owner', [], '2026-10-01T09:00:00Z'),
  joined('u-omar', 'Omar Fathi', 'omar@gulf-fm.example', 'admin', [], '2026-10-02T10:00:00Z'),
  joined('u-sara', 'Sara Nasser', 'sara@gulf-fm.example', 'planner', ['hq', 'tower-b'], '2026-10-05T08:00:00Z'),
  joined('u-yusuf', 'Yusuf Rahman', 'yusuf@gulf-fm.example', 'tech', ['tower-b', 'north'], '2026-10-06T08:00:00Z'),
  { id: 'u-layla', name: 'Layla Aziz', email: 'layla@gulf-fm.example', status: 'invited', roles: [{ roleId: 'store', siteIds: ['wh1'] }],
    invitedAt: '2026-11-21T09:00:00Z', invitedByName: 'Omar Fathi', invitationExpiresAt: '2026-11-28T09:00:00Z', joinedAt: null, deactivatedAt: null, deactivatedByName: null },
  { ...joined('u-karim', 'Karim Saleh', 'karim@gulf-fm.example', 'req', [], '2026-10-07T08:00:00Z'),
    status: 'deactivated', deactivatedAt: '2026-11-02T10:00:00Z', deactivatedByName: 'Omar Fathi' },
];

const PASS_SEEDS: SupportPass[] = [
  { id: 'p1', clientId: 'c1', requestedByName: 'Support Agent', reason: 'Ticket #4182: imported assets are missing their location.', access: 'read',
    status: 'active', startedAt: '2026-11-24T11:30:00Z', expiresAt: '2026-11-24T12:30:00Z', endedAt: null, endedByName: null, actionCount: 3 },
  { id: 'p0', clientId: 'c1', requestedByName: 'Support Agent', reason: 'Ticket #4011: help setting up roles.', access: 'read',
    status: 'expired', startedAt: '2026-11-10T09:00:00Z', expiresAt: '2026-11-10T09:30:00Z', endedAt: '2026-11-10T09:30:00Z', endedByName: null, actionCount: 0 },
];

export interface DemoOptions {
  meId?: string;
  /** Permissions removed from the signed-in person, to try the read-only screens. */
  withoutPermissions?: string[];
  seatLimit?: number;
  now?: () => Date;
}

const clone = <T,>(v: T): T => structuredClone(v);

export function createDemoAccessApi(options: DemoOptions = {}): AccessApi {
  const meId = options.meId ?? 'u-mona';
  const seatLimit = options.seatLimit ?? 25;
  const now = options.now ?? (() => new Date());
  let roles: StoredRole[] = clone(ROLE_SEEDS);
  let users: StoredUser[] = clone(USER_SEEDS);
  let sites: Site[] = clone(SITES);
  const passes: SupportPass[] = clone(PASS_SEEDS);
  let theme: AccessMe['theme'] = 'system';
  let nextId = 1;

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;
  const hasRole = (u: StoredUser, roleId: string) => u.roles.some((a) => a.roleId === roleId);
  const activeOwners = () => users.filter((u) => u.status === 'active' && hasRole(u, 'owner'));
  const seatsUsed = () => users.filter((u) => u.status !== 'deactivated').length;
  const me = () => users.find((u) => u.id === meId)!;
  const isOwner = (u: StoredUser) => hasRole(u, 'owner');
  const seatsFull = () => `All ${seatLimit} seats on your plan are in use. Deactivate someone or ask Inventra to raise your plan.`;

  function deactivateReason(u: StoredUser): string | null {
    if (u.status === 'deactivated') return 'This person is already deactivated.';
    if (u.id === meId) return "You can't deactivate your own account. Ask another admin.";
    if (isOwner(u) && activeOwners().length <= 1) return "The last Owner can't be removed. Make someone else an Owner first.";
    if (isOwner(u) && !isOwner(me())) return 'Only an Owner can deactivate another Owner.';
    return null;
  }

  function changeRolesReason(u: StoredUser): string | null {
    if (u.status === 'deactivated') return 'Reactivate this person before changing their roles.';
    if (isOwner(u) && !isOwner(me())) return "Only an Owner can change another Owner's roles.";
    return null;
  }

  const toUser = (u: StoredUser): User => ({
    ...clone(u), isOwner: isOwner(u),
    roles: u.roles.map((a) => ({ id: a.roleId, name: roleName(a.roleId), siteIds: [...a.siteIds] })),
    cannotDeactivateReason: deactivateReason(u), cannotChangeRolesReason: changeRolesReason(u),
  });

  const toRole = (r: StoredRole): Role => {
    const memberCount = users.filter((u) => u.status !== 'deactivated' && hasRole(u, r.id)).length;
    return {
      ...clone(r), memberCount,
      cannotEditReason: r.kind === 'owner' ? "The Owner role always has every permission and can't be edited." : null,
      cannotDeleteReason: r.kind !== 'custom' ? "Built-in roles can't be deleted. Copy one to make your own version."
        : memberCount > 0 ? `${memberCount} ${memberCount === 1 ? 'person has' : 'people have'} this role. Give them another role first.` : null,
    };
  };

  const findUser = (id: string) => {
    const u = users.find((x) => x.id === id);
    if (!u) throw new ApiError(404, 'No user has this id.');
    return u;
  };

  function checkAssignments(list: AssignmentInput[]) {
    if (list.length === 0) throw invalid({ roles: ['Choose at least one role.'] });
    if (list.some((a) => a.roleId === 'owner') && !isOwner(me())) throw new ApiError(403, 'Only an Owner can make someone else an Owner.');
  }

  function link(u: StoredUser): InvitationLink {
    const at = now();
    u.invitedAt = at.toISOString();
    u.invitationExpiresAt = new Date(at.getTime() + 7 * 86_400_000).toISOString();
    return { user: toUser(u), acceptUrl: `http://localhost:5174/join#tok-${u.id}-${nextId++}`, expiresAt: u.invitationExpiresAt };
  }

  function checkRole(body: RoleInput, exceptId?: string) {
    const name = body.name.trim();
    if (!name) throw invalid({ name: ['Role name is required.'] });
    if (roles.some((r) => r.id !== exceptId && r.name.toLowerCase() === name.toLowerCase())) throw invalid({ name: [`A role called "${name}" already exists. Choose another name.`] });
  }

  function checkSite(body: SiteInput, exceptId?: string) {
    const errors: Record<string, string[]> = {};
    if (!body.name.trim()) errors.name = ['Site name is required.'];
    if (!/^[A-Z0-9-]{2,12}$/.test(body.code.trim())) errors.code = ['Use 2 to 12 capital letters, numbers or dashes, e.g. HQ or WH-1.'];
    else if (sites.some((s) => s.id !== exceptId && s.code === body.code.trim())) errors.code = [`Another site already uses the code ${body.code.trim()}.`];
    if (Object.keys(errors).length) throw invalid(errors);
  }

  async function buildMe(): Promise<AccessMe> {
    const u = me();
    const removed = new Set(options.withoutPermissions ?? []);
    const grants = u.roles.map((a) => {
      const r = roles.find((x) => x.id === a.roleId)!;
      return { roleId: r.id, roleName: r.name, permissions: [...r.permissions], allSites: a.siteIds.length === 0, siteIds: [...a.siteIds] };
    });
    const permissions = [...new Set(grants.flatMap((g) => g.permissions))].filter((p) => !removed.has(p));
    return { userId: u.id, name: u.name, email: u.email, theme, company: { id: 'c1', name: 'Gulf Facilities Co.', slug: 'gulf-fm' }, isOwner: isOwner(u), permissions, grants, supportSession: null };
  }

  return {
    me: buildMe,
    savePreferences: async (t) => {
      theme = t;
      return buildMe();
    },
    listUsers: async (status, search) => {
      const q = search.trim().toLowerCase();
      return users
        .filter((u) => status === 'all' || u.status === status)
        .filter((u) => !q || u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
        .map(toUser);
    },
    seatSummary: async () => {
      const used = seatsUsed();
      return {
        seats: used, active: users.filter((u) => u.status === 'active').length, invited: users.filter((u) => u.status === 'invited').length,
        deactivated: users.filter((u) => u.status === 'deactivated').length, limit: seatLimit,
        state: used >= seatLimit ? 'blocked' : used / seatLimit >= 0.8 ? 'warn' : 'ok',
      };
    },
    invite: async (body: NewInvite) => {
      const email = body.email.trim().toLowerCase();
      const errors: Record<string, string[]> = {};
      if (!body.name.trim()) errors.name = ['Name is required.'];
      if (users.some((u) => u.email.toLowerCase() === email)) errors.email = [`${email} is already in this company. Find them in the list instead.`];
      if (Object.keys(errors).length) throw invalid(errors);
      checkAssignments(body.roles);
      if (seatsUsed() >= seatLimit) throw new ApiError(409, seatsFull());
      const u: StoredUser = {
        id: `u-new-${nextId++}`, name: body.name.trim(), email, status: 'invited', roles: clone(body.roles), invitedAt: now().toISOString(),
        invitedByName: me().name, invitationExpiresAt: null, joinedAt: null, deactivatedAt: null, deactivatedByName: null,
      };
      users = [...users, u];
      return link(u);
    },
    reissueInvitation: async (id) => {
      const u = findUser(id);
      if (u.status !== 'invited') throw new ApiError(409, `${u.name} has already joined, so there's no invitation to send again.`);
      return link(u);
    },
    cancelInvitation: async (id) => {
      const u = findUser(id);
      if (u.status !== 'invited') throw new ApiError(409, `${u.name} has already joined. Deactivate them instead.`);
      users = users.filter((x) => x.id !== id);
    },
    deactivate: async (id) => {
      const u = findUser(id);
      const reason = deactivateReason(u);
      if (reason) throw new ApiError(409, reason);
      Object.assign(u, { status: 'deactivated', deactivatedAt: now().toISOString(), deactivatedByName: me().name });
      return toUser(u);
    },
    reactivate: async (id) => {
      const u = findUser(id);
      if (u.status !== 'deactivated') throw new ApiError(409, 'This person is already active.');
      if (seatsUsed() >= seatLimit) throw new ApiError(409, seatsFull());
      Object.assign(u, { status: u.joinedAt ? 'active' : 'invited', deactivatedAt: null, deactivatedByName: null });
      return toUser(u);
    },
    setRoles: async (id, list) => {
      const u = findUser(id);
      const reason = changeRolesReason(u);
      if (reason) throw new ApiError(409, reason);
      checkAssignments(list);
      if (isOwner(u) && !list.some((a) => a.roleId === 'owner') && activeOwners().length <= 1) {
        throw new ApiError(409, "The last Owner can't lose the Owner role. Make someone else an Owner first.");
      }
      u.roles = clone(list);
      return toUser(u);
    },
    permissions: async () => clone(CATALOG),
    roles: async () => roles.map(toRole),
    createRole: async (body) => {
      checkRole(body);
      const r: StoredRole = { id: `r-${nextId++}`, name: body.name.trim(), description: body.description.trim(), kind: 'custom', builtInKey: null, permissions: [...body.permissions], updatedAt: now().toISOString() };
      roles = [...roles, r];
      return toRole(r);
    },
    updateRole: async (id, body) => {
      const r = roles.find((x) => x.id === id);
      if (!r) throw new ApiError(404, 'No role has this id.');
      if (r.kind === 'owner') throw new ApiError(409, "The Owner role always has every permission and can't be edited.");
      checkRole(body, id);
      Object.assign(r, { name: body.name.trim(), description: body.description.trim(), permissions: [...body.permissions], updatedAt: now().toISOString() });
      return toRole(r);
    },
    copyRole: async (id, name) => {
      const source = roles.find((x) => x.id === id);
      if (!source) throw new ApiError(404, 'No role has this id.');
      const body = { name: name.trim() || `${source.name} (copy)`, description: source.description, permissions: [...source.permissions] };
      checkRole(body);
      const r: StoredRole = { ...body, id: `r-${nextId++}`, kind: 'custom', builtInKey: null, updatedAt: now().toISOString() };
      roles = [...roles, r];
      return toRole(r);
    },
    deleteRole: async (id) => {
      const r = roles.find((x) => x.id === id);
      if (!r) throw new ApiError(404, 'No role has this id.');
      const reason = toRole(r).cannotDeleteReason;
      if (reason) throw new ApiError(409, reason);
      roles = roles.filter((x) => x.id !== id);
    },
    sites: async () => clone(sites),
    createSite: async (body) => {
      checkSite(body);
      const s: Site = { id: `s-${nextId++}`, name: body.name.trim(), code: body.code.trim(), isActive: body.isActive };
      sites = [...sites, s];
      return clone(s);
    },
    updateSite: async (id, body) => {
      const s = sites.find((x) => x.id === id);
      if (!s) throw new ApiError(404, 'No site has this id.');
      checkSite(body, id);
      Object.assign(s, { name: body.name.trim(), code: body.code.trim(), isActive: body.isActive });
      return clone(s);
    },
    supportPasses: async () => clone(passes),
    endSupportPass: async (id) => {
      const p = passes.find((x) => x.id === id);
      if (!p) throw new ApiError(404, 'No support pass has this id.');
      if (p.status !== 'active') throw new ApiError(409, 'This support pass has already ended.');
      Object.assign(p, { status: 'ended', endedAt: now().toISOString(), endedByName: me().name });
      return clone(p);
    },
    previewInvitation: async (token) => {
      const u = users.find((x) => token.startsWith(`tok-${x.id}-`));
      if (!u) throw new ApiError(404, "This invitation link isn't valid. Ask your company's Admin to send you a new invitation.");
      return {
        clientId: 'c1', companyName: 'Gulf Facilities Co.', email: u.email, name: u.name, invitedByName: u.invitedByName,
        roles: u.roles.map((a) => roleName(a.roleId)), expiresAt: u.invitationExpiresAt ?? now().toISOString(),
        cannotAcceptReason: u.status === 'invited' ? null : 'This invitation has already been used. Sign in instead.',
      };
    },
    acceptInvitation: async (token) => {
      const u = users.find((x) => token.startsWith(`tok-${x.id}-`));
      if (!u) throw new ApiError(404, "This invitation link isn't valid. Ask your company's Admin to send you a new invitation.");
      if (u.status !== 'invited') throw new ApiError(409, 'This invitation has already been used. Sign in instead.');
      Object.assign(u, { status: 'active', joinedAt: now().toISOString(), invitationExpiresAt: null });
      return { clientId: 'c1', companyName: 'Gulf Facilities Co.', userId: u.id, signInAgain: true };
    },
  };

}

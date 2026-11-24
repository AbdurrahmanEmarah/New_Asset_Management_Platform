/**
 * An in-memory Access API with the rules the server enforces. Used by the tests, and by
 * `npm run dev:client` when VITE_DEMO_API=true, so the screens can be tried before the
 * Access service is running. Its data matches the Roles mockup on the design canvas.
 */
import { ApiError } from '../../../../shared/api/http';
import type { AccessApi, AccessMe, NewInvite, PermissionArea, Role, RoleInput, Site, User, UserList, UserQuery } from './access';

export const CATALOG: PermissionArea[] = [
  { key: 'assets', label: 'Assets', permissions: [
    { key: 'assets.read', label: 'View assets' }, { key: 'assets.write', label: 'Create and edit assets' },
    { key: 'assets.transfer', label: 'Transfer between sites' }, { key: 'assets.dispose', label: 'Retire or dispose' }] },
  { key: 'workorders', label: 'Work orders', permissions: [
    { key: 'workorders.read', label: 'View work orders' }, { key: 'workorders.create', label: 'Raise requests and work orders' },
    { key: 'workorders.assign', label: 'Assign technicians' }, { key: 'workorders.complete', label: 'Complete and sign off' }] },
  { key: 'maintenance', label: 'Maintenance', permissions: [
    { key: 'pm.manage', label: 'Manage preventive schedules' }, { key: 'checklists.manage', label: 'Edit inspection checklists' }] },
  { key: 'inventory', label: 'Inventory', permissions: [
    { key: 'inventory.read', label: 'View parts and stock' }, { key: 'inventory.write', label: 'Receive and issue parts' }] },
  { key: 'reports', label: 'Reports & audit', permissions: [
    { key: 'reports.view', label: 'View reports' }, { key: 'audit.view', label: 'View the audit log' }] },
  { key: 'admin', label: 'Administration', permissions: [
    { key: 'users.manage', label: 'Invite and manage users' }, { key: 'roles.manage', label: 'Edit roles' },
    { key: 'settings.manage', label: 'Asset types, sites, modules' }, { key: 'integrations.manage', label: 'Integrations and API keys' }] },
];

export const ALL_PERMISSIONS = CATALOG.flatMap((a) => a.permissions.map((p) => p.key));

export const SITES: Site[] = [
  { id: 'hq', name: 'HQ Tower' }, { id: 'tower-b', name: 'Tower B' }, { id: 'north', name: 'North depot' },
  { id: 'wh1', name: 'Warehouse 1' }, { id: 'yard', name: 'Plant yard' },
];

type RoleSeed = Omit<Role, 'memberCount' | 'version' | 'cannotEditReason' | 'cannotDeleteReason'>;

const ROLE_SEEDS: RoleSeed[] = [
  { id: 'owner', name: 'Owner', builtIn: true, locked: true, siteIds: [], permissions: ALL_PERMISSIONS,
    description: 'Full control of the company account, including subscription, single sign-on and ownership transfer.' },
  { id: 'admin', name: 'Admin', builtIn: true, locked: false, siteIds: [], permissions: ALL_PERMISSIONS,
    description: 'Runs the workspace: users, roles, sites, asset types, modules and integrations.' },
  { id: 'assetmgr', name: 'Asset Manager', builtIn: true, locked: false, siteIds: [],
    permissions: ['assets.read', 'assets.write', 'assets.transfer', 'assets.dispose', 'workorders.read', 'inventory.read', 'reports.view'],
    description: 'Owns the asset register: adds, edits, moves and retires assets.' },
  { id: 'planner', name: 'Maintenance Planner', builtIn: true, locked: false, siteIds: [],
    permissions: ['assets.read', 'workorders.read', 'workorders.create', 'workorders.assign', 'workorders.complete', 'pm.manage', 'checklists.manage', 'inventory.read', 'reports.view'],
    description: 'Plans the work: raises and assigns work orders and keeps preventive schedules up to date.' },
  { id: 'tech', name: 'Technician', builtIn: true, locked: false, siteIds: ['tower-b', 'north'],
    permissions: ['assets.read', 'workorders.read', 'workorders.complete', 'inventory.read'],
    description: 'Does the work, mostly in the field app: sees their own jobs, records readings and completes them.' },
  { id: 'store', name: 'Storekeeper', builtIn: true, locked: false, siteIds: [],
    permissions: ['assets.read', 'workorders.read', 'inventory.read', 'inventory.write'],
    description: 'Looks after parts: receives deliveries, issues parts to jobs and keeps stock counts right.' },
  { id: 'req', name: 'Requester', builtIn: true, locked: false, siteIds: [], permissions: ['assets.read', 'workorders.create'],
    description: 'Anyone who reports a fault. They can see assets and raise a request, nothing more.' },
  { id: 'viewer', name: 'Viewer / Auditor', builtIn: true, locked: false, siteIds: [],
    permissions: ['assets.read', 'workorders.read', 'inventory.read', 'reports.view', 'audit.view'],
    description: 'Read-only access to the register, work history, reports and the audit log.' },
];

interface StoredUser { id: string; name: string | null; email: string; status: User['status']; roleIds: string[]; siteIds: string[]; lastActiveAt: string | null; invitedAt: string | null }

const USER_SEEDS: StoredUser[] = [
  { id: 'u-mona', name: 'Mona Haddad', email: 'mona@gulf-fm.example', status: 'active', roleIds: ['owner'], siteIds: [], lastActiveAt: '2026-11-24T08:10:00Z', invitedAt: null },
  { id: 'u-omar', name: 'Omar Fathi', email: 'omar@gulf-fm.example', status: 'active', roleIds: ['admin'], siteIds: [], lastActiveAt: '2026-11-23T15:42:00Z', invitedAt: null },
  { id: 'u-sara', name: 'Sara Nasser', email: 'sara@gulf-fm.example', status: 'active', roleIds: ['planner'], siteIds: ['hq', 'tower-b'], lastActiveAt: '2026-11-24T07:02:00Z', invitedAt: null },
  { id: 'u-yusuf', name: 'Yusuf Rahman', email: 'yusuf@gulf-fm.example', status: 'active', roleIds: ['tech'], siteIds: ['tower-b'], lastActiveAt: '2026-11-22T11:30:00Z', invitedAt: null },
  { id: 'u-layla', name: null, email: 'layla@gulf-fm.example', status: 'invited', roleIds: ['store'], siteIds: ['wh1'], lastActiveAt: null, invitedAt: '2026-11-21T09:00:00Z' },
  { id: 'u-karim', name: 'Karim Saleh', email: 'karim@gulf-fm.example', status: 'deactivated', roleIds: ['req'], siteIds: [], lastActiveAt: '2026-09-02T10:00:00Z', invitedAt: null },
];

export interface DemoOptions {
  meId?: string;
  /** Extra permissions removed from the signed-in user, to try the read-only screens. */
  withoutPermissions?: string[];
  seatLimit?: number;
  now?: () => Date;
}

const clone = <T,>(v: T): T => structuredClone(v);

export function createDemoAccessApi(options: DemoOptions = {}): AccessApi {
  const meId = options.meId ?? 'u-mona';
  const seatLimit = options.seatLimit ?? 25;
  const now = options.now ?? (() => new Date());
  let roles: (RoleSeed & { version: number })[] = ROLE_SEEDS.map((r) => ({ ...clone(r), version: 1 }));
  let users: StoredUser[] = clone(USER_SEEDS);
  let nextId = 1;

  const roleName = (id: string) => roles.find((r) => r.id === id)?.name ?? id;
  const activeOwners = () => users.filter((u) => u.status === 'active' && u.roleIds.includes('owner'));
  const seatsUsed = () => users.filter((u) => u.status !== 'deactivated').length;

  function deactivateReason(u: StoredUser): string | null {
    if (u.status === 'deactivated') return 'This person is already deactivated.';
    if (u.id === meId) return "You can't deactivate your own account. Ask another admin.";
    if (u.roleIds.includes('owner') && activeOwners().length <= 1) return "The last Owner can't be removed. Make someone else an Owner first.";
    return null;
  }

  function resendReason(u: StoredUser): string | null {
    if (u.status !== 'invited') return 'Only people who haven\'t accepted their invite yet can be sent it again.';
    return null;
  }

  const toUser = (u: StoredUser): User => ({
    id: u.id, name: u.name, email: u.email, status: u.status,
    roles: u.roleIds.map((id) => ({ id, name: roleName(id) })), siteIds: [...u.siteIds],
    lastActiveAt: u.lastActiveAt, invitedAt: u.invitedAt,
    cannotDeactivateReason: deactivateReason(u), cannotResendInviteReason: resendReason(u),
  });

  const toRole = (r: RoleSeed & { version: number }): Role => {
    const memberCount = users.filter((u) => u.status !== 'deactivated' && u.roleIds.includes(r.id)).length;
    return {
      ...clone(r), version: String(r.version), memberCount,
      cannotEditReason: r.locked ? "The Owner role always has every permission and can't be edited." : null,
      cannotDeleteReason: r.builtIn ? "Built-in roles can't be deleted. Duplicate one to make your own version."
        : memberCount > 0 ? `${memberCount} ${memberCount === 1 ? 'person has' : 'people have'} this role. Give them another role first.` : null,
    };
  };

  const find = (id: string) => {
    const u = users.find((x) => x.id === id);
    if (!u) throw new ApiError(404, 'That person no longer exists. Refresh the list.');
    return u;
  };

  function checkRole(body: RoleInput, exceptId?: string) {
    const errors: Record<string, string[]> = {};
    const name = body.name.trim();
    if (!name) errors.name = ['Give the role a name.'];
    else if (name.length > 60) errors.name = ['Use 60 characters or fewer.'];
    else if (roles.some((r) => r.id !== exceptId && r.name.toLowerCase() === name.toLowerCase())) errors.name = [`A role called "${name}" already exists. Choose another name.`];
    if (Object.keys(errors).length) throw new ApiError(400, 'Fix the highlighted fields and try again.', errors);
  }

  const delay = <T,>(value: T) => Promise.resolve(value);

  return {
    me: async (): Promise<AccessMe> => {
      const u = find(meId);
      const removed = new Set(options.withoutPermissions ?? []);
      const permissions = [...new Set(u.roleIds.flatMap((id) => roles.find((r) => r.id === id)?.permissions ?? []))].filter((p) => !removed.has(p));
      return delay({ id: u.id, name: u.name ?? u.email, email: u.email, company: { id: 'c1', name: 'Gulf Facilities Co.', slug: 'gulf-fm' }, roles: u.roleIds.map((id) => ({ id, name: roleName(id) })), permissions });
    },
    listUsers: async ({ status, search, roleId }: UserQuery): Promise<UserList> => {
      const q = search.trim().toLowerCase();
      const items = users
        .filter((u) => status === 'all' || u.status === status)
        .filter((u) => !roleId || u.roleIds.includes(roleId))
        .filter((u) => !q || u.email.toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q))
        .map(toUser);
      return delay({ items, seats: { used: seatsUsed(), limit: seatLimit } });
    },
    invite: async (body: NewInvite) => {
      const email = body.email.trim().toLowerCase();
      if (users.some((u) => u.email.toLowerCase() === email)) throw new ApiError(400, 'Fix the highlighted fields and try again.', { email: [`${email} already has an account here. Find them in the list instead.`] });
      if (body.roleIds.length === 0) throw new ApiError(400, 'Fix the highlighted fields and try again.', { roleIds: ['Choose at least one role.'] });
      if (seatsUsed() >= seatLimit) throw new ApiError(409, `All ${seatLimit} seats on your plan are in use. Deactivate someone or ask Inventra to raise your plan.`);
      const u: StoredUser = { id: `u-new-${nextId++}`, name: null, email, status: 'invited', roleIds: [...body.roleIds], siteIds: [...body.siteIds], lastActiveAt: null, invitedAt: now().toISOString() };
      users = [...users, u];
      return delay(toUser(u));
    },
    deactivate: async (id) => {
      const u = find(id);
      const reason = deactivateReason(u);
      if (reason) throw new ApiError(409, reason);
      u.status = 'deactivated';
      return delay(toUser(u));
    },
    reactivate: async (id) => {
      const u = find(id);
      if (u.status !== 'deactivated') throw new ApiError(409, 'This person is already active.');
      if (seatsUsed() >= seatLimit) throw new ApiError(409, `All ${seatLimit} seats on your plan are in use. Deactivate someone or ask Inventra to raise your plan.`);
      u.status = u.lastActiveAt ? 'active' : 'invited';
      return delay(toUser(u));
    },
    resendInvite: async (id) => {
      const u = find(id);
      const reason = resendReason(u);
      if (reason) throw new ApiError(409, reason);
      u.invitedAt = now().toISOString();
      return delay(toUser(u));
    },
    permissions: async () => delay(clone(CATALOG)),
    roles: async () => delay(roles.map(toRole)),
    createRole: async (body) => {
      checkRole(body);
      const r = { id: `r-${nextId++}`, name: body.name.trim(), description: body.description.trim(), builtIn: false, locked: false, permissions: [...body.permissions], siteIds: [...body.siteIds], version: 1 };
      roles = [...roles, r];
      return delay(toRole(r));
    },
    updateRole: async (id, body) => {
      const r = roles.find((x) => x.id === id);
      if (!r) throw new ApiError(404, 'That role no longer exists. Refresh the list.');
      if (r.locked) throw new ApiError(409, "The Owner role always has every permission and can't be edited.");
      if (String(r.version) !== body.version) throw new ApiError(409, 'Someone else changed this role while you were editing. Discard your changes to see theirs, then try again.');
      checkRole(body, id);
      Object.assign(r, { name: body.name.trim(), description: body.description.trim(), permissions: [...body.permissions], siteIds: [...body.siteIds], version: r.version + 1 });
      return delay(toRole(r));
    },
    deleteRole: async (id) => {
      const r = roles.find((x) => x.id === id);
      if (!r) throw new ApiError(404, 'That role no longer exists. Refresh the list.');
      const reason = toRole(r).cannotDeleteReason;
      if (reason) throw new ApiError(409, reason);
      roles = roles.filter((x) => x.id !== id);
    },
    sites: async () => delay(clone(SITES)),
  };
}

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { errorText } from '../../../../shared/errors';
import { useDebounced, useLoad } from '../../../../shared/hooks';
import { Button, Notice, PlusIcon, StatusPill, UsageMeter } from '../../../../shared/ui';
import { PERMISSIONS, USER_STATUS, type InvitationLink, type User, type UserFilter } from '../api/access';
import { useApi } from '../api/context';
import { siteNames } from '../components/SiteChips';
import { needs, useMe } from '../me';
import { InviteDialog } from './InviteDialog';
import { ChangeRolesDialog, ConfirmDialog, LinkDialog } from './UserDialogs';

const FILTERS: { value: UserFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'invited', label: 'Invite sent' },
  { value: 'deactivated', label: 'Deactivated' },
];

const day = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const fmt = (iso: string) => day.format(new Date(iso));

type Open =
  | { kind: 'invite' }
  | { kind: 'link'; link: InvitationLink }
  | { kind: 'roles'; user: User }
  | { kind: 'deactivate'; user: User }
  | { kind: 'cancel'; user: User }
  | null;

function statusNote(u: User): string {
  if (u.status === 'invited') return `Invited by ${u.invitedByName}${u.invitationExpiresAt ? ` · link expires ${fmt(u.invitationExpiresAt)}` : ''}`;
  if (u.status === 'deactivated') return `By ${u.deactivatedByName ?? 'an admin'}${u.deactivatedAt ? ` on ${fmt(u.deactivatedAt)}` : ''}`;
  return u.joinedAt ? `Joined ${fmt(u.joinedAt)}` : '';
}

export function UsersPage() {
  const api = useApi();
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const roleId = params.get('role');
  const [filter, setFilter] = useState<UserFilter>('all');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [users, reload] = useLoad(() => api.listUsers(filter, debounced), [api, filter, debounced]);
  const [summary, reloadSummary] = useLoad(() => api.seatSummary(), [api]);
  const [options] = useLoad(() => Promise.all([api.roles(), api.sites()]), [api]);
  const [open, setOpen] = useState<Open>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Someone may accept an invitation while this page is open: refresh when the window regains
  // focus, and every 10 s while invited people are listed.
  const showsInvited = (users.data ?? []).some((u) => u.status === 'invited');
  useEffect(() => {
    const onFocus = () => { reload(); reloadSummary(); };
    window.addEventListener('focus', onFocus);
    const timer = showsInvited ? window.setInterval(onFocus, 10_000) : undefined;
    return () => {
      window.removeEventListener('focus', onFocus);
      if (timer) window.clearInterval(timer);
    };
  }, [showsInvited, reload, reloadSummary]);

  const roles = options.data?.[0] ?? [];
  const sites = options.data?.[1] ?? [];
  const roleFilterName = roleId ? roles.find((r) => r.id === roleId)?.name ?? 'this role' : null;
  const rows = (users.data ?? []).filter((u) => !roleId || u.roles.some((r) => r.id === roleId));
  const seats = summary.data;
  const manageReason = needs(me, PERMISSIONS.manageUsers, 'manage users');
  const seatsFull = seats?.state === 'blocked';
  // Same sentence as the server's refusal (Access ClientAccount), unless the summary carries its own.
  const fullReason = seats ? seats.blockedReason ?? `Your plan allows ${seats.limit} users and all ${seats.limit} are in use (active users and open invitations). Deactivate someone or cancel an invitation, or ask your Owner about a bigger plan.` : null;
  const inviteReason = manageReason ?? (seatsFull ? fullReason : null);
  const filtering = filter !== 'all' || debounced.trim() !== '' || roleId !== null;

  const refresh = () => {
    reload();
    reloadSummary();
  };
  const done = (text: string) => {
    setOpen(null);
    setMessage(text);
    setActionError(null);
    refresh();
  };

  async function act<T>(user: User, run: () => Promise<T>, then: (result: T) => void) {
    setActionError(null);
    setMessage(null);
    setBusyId(user.id);
    try {
      then(await run());
      refresh();
    } catch (err) {
      setActionError(errorText(err, 'That didn\'t work. Try again.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div style={{ flexGrow: 1 }}>
          <div className="eyebrow">Settings · Users</div>
          <h1>Users</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Everyone who can sign in to your company's workspace. What each person can do comes from their roles.</p>
        </div>
        {seats ? (
          <div style={{ minWidth: 180 }}>
            <span className="tile-label">Seats on your plan</span>
            <UsageMeter label="Seats" used={seats.seats} limit={seats.limit} state={seats.state} />
          </div>
        ) : null}
        <Button variant="primary" onClick={() => setOpen({ kind: 'invite' })} disabledReason={inviteReason}>
          <PlusIcon /> Invite people
        </Button>
      </div>

      {message ? <Notice kind="ok" action={<Button size="sm" onClick={() => setMessage(null)}>Dismiss</Button>}>{message}</Notice> : null}
      {actionError ? <Notice kind="error" action={<Button size="sm" onClick={() => setActionError(null)}>Dismiss</Button>}>{actionError}</Notice> : null}

      <section className="card" aria-label="People">
        <div className="toolbar">
          <label htmlFor="user-search" className="visually-hidden">Search people</label>
          <input id="user-search" className="input" style={{ maxWidth: 320 }} placeholder="Search by name or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div role="group" aria-label="Filter by status" className="filters">
            {FILTERS.map((f) => (
              <Button key={f.value} size="sm" variant={filter === f.value ? 'primary' : 'ghost'} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
                {f.label}
              </Button>
            ))}
          </div>
          {roleFilterName ? (
            <Button size="sm" onClick={() => setParams({})} aria-label={`Stop showing only ${roleFilterName}`}>
              Role: {roleFilterName} ×
            </Button>
          ) : null}
        </div>

        {users.status === 'error' ? (
          <div style={{ padding: 16 }}>
            <Notice kind="error" action={<Button size="sm" onClick={reload}>Try again</Button>}>People didn't load: {users.error.message}</Notice>
          </div>
        ) : null}

        {users.status === 'loading' && rows.length === 0 ? <p className="muted" style={{ padding: 16, margin: 0 }}>Loading people…</p> : null}

        {users.status === 'ready' && rows.length === 0 ? (
          <div className="empty">
            <strong>{filtering ? 'Nobody matches' : 'Nobody here yet'}</strong>
            <span>{filtering ? 'Try another search or filter.' : 'Invite your colleagues. You get a link to send each of them.'}</span>
          </div>
        ) : null}

        {rows.length > 0 ? (
          <div className="table-scroll">
            <table className="data" style={{ minWidth: 960 }}>
              <thead>
                <tr><th>Person</th><th>Roles and sites</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const status = USER_STATUS[u.status];
                  const busy = busyId === u.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <strong>{u.name}</strong>
                          <span className="mono muted" style={{ fontSize: 12 }}>{u.email}{u.id === me.userId ? ' · you' : ''}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                          {u.roles.map((r) => <span key={r.id} className="role-chip">{r.name} · {siteNames(sites, r.siteIds, r.allSites)}</span>)}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                          <StatusPill kind={status.kind}>{status.label}</StatusPill>
                          <span className="muted" style={{ fontSize: 12 }}>{statusNote(u)}</span>
                        </div>
                      </td>
                      <td>
                        <div className="row-actions">
                          {u.status === 'invited' ? (
                            <>
                              <Button size="sm" busy={busy} aria-label={`New invitation link for ${u.name}`} disabledReason={manageReason}
                                onClick={() => act(u, () => api.reissueInvitation(u.id), (link) => setOpen({ kind: 'link', link }))}>
                                New link
                              </Button>
                              <Button size="sm" variant="danger" aria-label={`Cancel invitation for ${u.name}`} disabledReason={manageReason}
                                onClick={() => setOpen({ kind: 'cancel', user: u })}>
                                Cancel invite
                              </Button>
                            </>
                          ) : null}
                          {u.status === 'active' ? (
                            <Button size="sm" aria-label={`Change roles for ${u.name}`} disabledReason={manageReason ?? u.cannotChangeRolesReason}
                              onClick={() => setOpen({ kind: 'roles', user: u })}>
                              Roles
                            </Button>
                          ) : null}
                          {u.status === 'deactivated' ? (
                            <Button size="sm" busy={busy} aria-label={`Reactivate ${u.name}`} disabledReason={manageReason ?? (seatsFull ? fullReason : null)}
                              onClick={() => act(u, () => api.reactivate(u.id), () => setMessage(`${u.name} can sign in again.`))}>
                              Reactivate
                            </Button>
                          ) : u.status === 'active' ? (
                            <Button size="sm" variant="danger" aria-label={`Deactivate ${u.name}`} disabledReason={manageReason ?? u.cannotDeactivateReason}
                              onClick={() => setOpen({ kind: 'deactivate', user: u })}>
                              Deactivate
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="muted foot-note">Deactivated people can't sign in and don't use a seat. Their history stays, and you can reactivate them later. A company always keeps at least one Owner.</p>
      </section>

      {open?.kind === 'invite' ? (
        <InviteDialog roles={roles} sites={sites} onClose={() => setOpen(null)} onInvited={(link) => { setOpen({ kind: 'link', link }); setMessage(`${link.user.name} is invited. Send them the link.`); refresh(); }} />
      ) : null}
      {open?.kind === 'link' ? <LinkDialog link={open.link} onClose={() => setOpen(null)} /> : null}
      {open?.kind === 'roles' ? (
        <ChangeRolesDialog user={open.user} roles={roles} sites={sites} onClose={() => setOpen(null)} onDone={(u) => done(`${u.name}'s roles are saved.`)} />
      ) : null}
      {open?.kind === 'deactivate' ? (
        <ConfirmDialog title={`Deactivate ${open.user.name}?`} action="Deactivate" danger onClose={() => setOpen(null)}
          description="They're signed out straight away and can't sign in again. Their work history stays, and the seat is freed. You can reactivate them later."
          run={async () => { const u = await api.deactivate(open.user.id); done(`${u.name} is deactivated.`); }} />
      ) : null}
      {open?.kind === 'cancel' ? (
        <ConfirmDialog title={`Cancel ${open.user.name}'s invitation?`} action="Cancel invitation" danger onClose={() => setOpen(null)}
          description="Their link stops working and the seat is freed. You can invite them again later."
          run={async () => { await api.cancelInvitation(open.user.id); done(`${open.user.name}'s invitation is cancelled.`); }} />
      ) : null}
    </div>
  );
}

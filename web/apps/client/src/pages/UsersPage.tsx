import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { errorText } from '../../../../shared/errors';
import { useDebounced, useLoad } from '../../../../shared/hooks';
import { Button, Dialog, Notice, PlusIcon, StatusPill, UsageMeter } from '../../../../shared/ui';
import { PERMISSIONS, USER_STATUS, type User, type UserFilter } from '../api/access';
import { useApi } from '../api/context';
import { siteNames } from '../components/SiteChips';
import { needs, useMe } from '../me';
import { InviteDialog } from './InviteDialog';

const FILTERS: { value: UserFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'invited', label: 'Invite sent' },
  { value: 'deactivated', label: 'Deactivated' },
];

const when = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export function UsersPage() {
  const api = useApi();
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const roleId = params.get('role');
  const [filter, setFilter] = useState<UserFilter>('all');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [users, reload] = useLoad(() => api.listUsers({ status: filter, search: debounced, roleId }), [api, filter, debounced, roleId]);
  const [options] = useLoad(() => Promise.all([api.roles(), api.sites()]), [api]);
  const [open, setOpen] = useState<{ kind: 'invite' } | { kind: 'deactivate'; user: User } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const roles = options.data?.[0] ?? [];
  const sites = options.data?.[1] ?? [];
  const roleFilterName = roleId ? roles.find((r) => r.id === roleId)?.name ?? 'this role' : null;
  const rows = users.data?.items ?? [];
  const seats = users.data?.seats;
  const manageReason = needs(me, PERMISSIONS.manageUsers, 'manage users');
  const seatsFull = seats ? seats.used >= seats.limit : false;
  const inviteReason = manageReason
    ?? (seatsFull && seats ? `All ${seats.limit} seats on your plan are in use. Deactivate someone, or ask Inventra to raise your plan.` : null);
  const filtering = filter !== 'all' || debounced.trim() !== '' || roleId !== null;

  const done = (text: string) => {
    setOpen(null);
    setMessage(text);
    setActionError(null);
    reload();
  };

  async function act(user: User, run: () => Promise<User>, success: string) {
    setActionError(null);
    setMessage(null);
    setBusyId(user.id);
    try {
      await run();
      done(success);
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
            <UsageMeter label="Seats" used={seats.used} limit={seats.limit} state={seatsFull ? 'blocked' : seats.used / seats.limit >= 0.8 ? 'warn' : 'ok'} />
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
            <span>{filtering ? 'Try another search or filter.' : 'Invite your colleagues by email. They choose their own password when they accept.'}</span>
          </div>
        ) : null}

        {rows.length > 0 ? (
          <div className="table-scroll">
            <table className="data" style={{ minWidth: 900 }}>
              <thead>
                <tr><th>Person</th><th>Roles</th><th>Sites</th><th>Status</th><th>Last active</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
              </thead>
              <tbody>
                {rows.map((u) => {
                  const label = u.name ?? u.email;
                  const status = USER_STATUS[u.status];
                  const busy = busyId === u.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <strong>{u.name ?? <span className="muted">Not accepted yet</span>}</strong>
                          <span className="mono muted" style={{ fontSize: 12 }}>{u.email}{u.id === me.id ? ' · you' : ''}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {u.roles.map((r) => <span key={r.id} className="role-chip">{r.name}</span>)}
                        </div>
                      </td>
                      <td className="muted">{siteNames(sites, u.siteIds)}</td>
                      <td><StatusPill kind={status.kind}>{status.label}</StatusPill></td>
                      <td className="mono muted" style={{ whiteSpace: 'nowrap' }}>
                        {u.lastActiveAt ? when.format(new Date(u.lastActiveAt)) : u.invitedAt ? `Invited ${when.format(new Date(u.invitedAt))}` : '–'}
                      </td>
                      <td>
                        <div className="row-actions">
                          {u.status === 'invited' ? (
                            <Button size="sm" busy={busy} aria-label={`Resend invite to ${label}`} disabledReason={manageReason ?? u.cannotResendInviteReason}
                              onClick={() => act(u, () => api.resendInvite(u.id), `The invite was sent to ${u.email} again.`)}>
                              Resend invite
                            </Button>
                          ) : null}
                          {u.status === 'deactivated' ? (
                            <Button size="sm" busy={busy} aria-label={`Reactivate ${label}`} disabledReason={manageReason ?? (seatsFull ? 'All seats on your plan are in use. Deactivate someone else first.' : null)}
                              onClick={() => act(u, () => api.reactivate(u.id), `${label} can sign in again.`)}>
                              Reactivate
                            </Button>
                          ) : (
                            <Button size="sm" variant="danger" aria-label={`Deactivate ${label}`} disabledReason={manageReason ?? u.cannotDeactivateReason}
                              onClick={() => setOpen({ kind: 'deactivate', user: u })}>
                              Deactivate
                            </Button>
                          )}
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
        <InviteDialog roles={roles} sites={sites} onClose={() => setOpen(null)} onInvited={(u) => done(`An invite was sent to ${u.email}.`)} />
      ) : null}
      {open?.kind === 'deactivate' ? (
        <DeactivateDialog user={open.user} onClose={() => setOpen(null)} onDone={(u) => done(`${u.name ?? u.email} is deactivated.`)} />
      ) : null}
    </div>
  );
}

function DeactivateDialog({ user, onClose, onDone }: { user: User; onClose: () => void; onDone: (u: User) => void }) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = user.name ?? user.email;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      onDone(await api.deactivate(user.id));
    } catch (err) {
      setError(errorText(err, `${label} could not be deactivated.`));
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Deactivate ${label}?`} description="They're signed out straight away and can't sign in again. Their work history stays, and the seat is freed. You can reactivate them later." onClose={onClose}>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <div className="dialog-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" busy={busy} onClick={confirm}>{busy ? 'Deactivating…' : 'Deactivate'}</Button>
      </div>
    </Dialog>
  );
}

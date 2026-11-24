import { useState } from 'react';
import { useDebounced, useLoad } from '../../../../shared/hooks';
import { Button, Notice, PlusIcon, ShieldIcon, StatusPill, UsageMeter } from '../../../../shared/ui';
import { useApi } from '../api/context';
import { STATUS_LABELS, type Client, type ClientFilter } from '../api/tenancy';
import { BILLING_ONLY, OWNER_ONLY, SUPPORT_ONLY, canRequestSupport, useMe } from '../me';
import { ChangePlanDialog } from './ChangePlanDialog';
import { NewClientDialog } from './NewClientDialog';
import { RequestSupportDialog } from './RequestSupportDialog';
import { SuspendDialog } from './SuspendDialog';

const FILTERS: { value: ClientFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'suspended', label: 'Suspended' },
];

type Open = { kind: 'new' } | { kind: 'suspend'; client: Client } | { kind: 'plan'; client: Client } | { kind: 'support'; client: Client } | null;

export function ClientsPage() {
  const api = useApi();
  const me = useMe();
  const [filter, setFilter] = useState<ClientFilter>('all');
  const [search, setSearch] = useState('');
  const debounced = useDebounced(search);
  const [clients, reloadClients] = useLoad(() => api.listClients(filter, debounced), [api, filter, debounced]);
  const [summary, reloadSummary] = useLoad(() => api.summary(), [api]);
  const [open, setOpen] = useState<Open>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = (text: string) => {
    setOpen(null);
    setMessage(text);
    setActionError(null);
    reloadClients();
    reloadSummary();
  };

  async function reactivate(client: Client) {
    setActionError(null);
    try {
      await api.reactivate(client.id);
      refresh(`${client.name} is active again.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'The client could not be reactivated.');
    }
  }

  const s = summary.data;
  const tiles = [
    { label: 'Active clients', value: s?.active, note: s ? `${s.trial} on trial, ${s.suspended} suspended` : '' },
    { label: 'Seats in use', value: s?.seatsInUse, note: 'across all clients' },
    { label: 'Near a limit', value: s?.nearLimit, note: 'at or above 80% of their plan' },
    { label: 'On trial', value: s?.trial, note: 'trials last 14 days' },
  ];
  const rows = clients.data ?? [];
  const searching = debounced.trim() !== '' || filter !== 'all';

  return (
    <div className="page">
      <div className="page-head">
        <div style={{ flexGrow: 1 }}>
          <div className="eyebrow">Platform · Clients</div>
          <h1>Clients</h1>
        </div>
        <Button variant="primary" onClick={() => setOpen({ kind: 'new' })} disabledReason={me.canManageClients ? null : OWNER_ONLY}>
          <PlusIcon /> New client
        </Button>
      </div>

      {message ? <Notice kind="ok" action={<Button size="sm" onClick={() => setMessage(null)}>Dismiss</Button>}>{message}</Notice> : null}
      {actionError ? <Notice kind="error">{actionError}</Notice> : null}

      <div className="tiles">
        {tiles.map((t) => (
          <div key={t.label} className="card tile">
            <span className="tile-label">{t.label}</span>
            <span className="mono tile-value">{t.value ?? '–'}</span>
            <span className="tile-note">{t.note}</span>
          </div>
        ))}
      </div>

      <section className="card" aria-label="Client list">
        <div className="toolbar">
          <label htmlFor="client-search" className="visually-hidden">Search clients</label>
          <input id="client-search" className="input" style={{ maxWidth: 320 }} placeholder="Search client, sub-domain or owner email" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div role="group" aria-label="Filter by status" className="filters">
            {FILTERS.map((f) => (
              <Button key={f.value} size="sm" variant={filter === f.value ? 'primary' : 'ghost'} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        {clients.status === 'error' ? (
          <div style={{ padding: 16 }}>
            <Notice kind="error" action={<Button size="sm" onClick={reloadClients}>Try again</Button>}>Clients didn't load: {clients.error.message}</Notice>
          </div>
        ) : null}

        {clients.status === 'loading' && rows.length === 0 ? <p className="muted" style={{ padding: 16, margin: 0 }}>Loading clients…</p> : null}

        {clients.status === 'ready' && rows.length === 0 ? (
          <div className="empty">
            <strong>{searching ? 'No clients match' : 'No clients yet'}</strong>
            <span>{searching ? 'Try another search or filter.' : 'Create the first client to give a company its own workspace.'}</span>
          </div>
        ) : null}

        {rows.length > 0 ? (
          <div className="table-scroll">
            <table className="data" style={{ minWidth: 960 }}>
              <thead>
                <tr><th>Client</th><th>Plan</th><th>Users</th><th>Assets</th><th>Status</th><th>Region</th><th style={{ textAlign: 'right' }}>Actions</th></tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const status = STATUS_LABELS[c.status];
                  return (
                    <tr key={c.id}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <strong>{c.name}</strong>
                          <span className="mono muted" style={{ fontSize: 12 }}>{c.slug} · {c.ownerEmail}</span>
                        </div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{c.plan.name}</td>
                      <td><UsageMeter label={`${c.name} users`} {...c.usage.users} /></td>
                      <td><UsageMeter label={`${c.name} assets`} {...c.usage.assets} /></td>
                      <td>
                        <span title={c.suspendedReason ?? undefined}><StatusPill kind={status.kind}>{status.label}</StatusPill></span>
                      </td>
                      <td className="muted">{c.regionName}</td>
                      <td>
                        <div className="row-actions">
                          <Button size="sm" onClick={() => setOpen({ kind: 'support', client: c })} disabledReason={canRequestSupport(me) ? null : SUPPORT_ONLY} aria-label={`Request support access to ${c.name}`}><ShieldIcon /> Support</Button>
                          <Button size="sm" onClick={() => setOpen({ kind: 'plan', client: c })} disabledReason={me.canManageBilling ? null : BILLING_ONLY} aria-label={`Change plan for ${c.name}`}>Plan</Button>
                          {c.status === 'suspended' ? (
                            <Button size="sm" onClick={() => reactivate(c)} disabledReason={me.canManageClients ? null : OWNER_ONLY} aria-label={`Reactivate ${c.name}`}>Reactivate</Button>
                          ) : (
                            <Button size="sm" variant="danger" onClick={() => setOpen({ kind: 'suspend', client: c })} disabledReason={me.canManageClients ? null : OWNER_ONLY} aria-label={`Suspend ${c.name}`}>Suspend</Button>
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
        <p className="muted foot-note">Usage bars turn amber at 80% of the plan limit and red at 100%, when new items are blocked.</p>
      </section>

      {open?.kind === 'new' ? <NewClientDialog onClose={() => setOpen(null)} onCreated={(c) => refresh(`${c.name} was created on the ${c.plan.name} plan.`)} /> : null}
      {open?.kind === 'suspend' ? <SuspendDialog client={open.client} onClose={() => setOpen(null)} onDone={(c) => refresh(`${c.name} is suspended.`)} /> : null}
      {open?.kind === 'support' ? (
        <RequestSupportDialog clientId={open.client.id} onClose={() => setOpen(null)} onDone={(s) => {
          setOpen(null);
          setMessage(s.status === 'pending_approval' ? `${s.clientName}'s admins were asked to approve read and write access. Follow it under Support access.` : `Support session with ${s.clientName} started. Follow it under Support access.`);
        }} />
      ) : null}
      {open?.kind === 'plan' ? <ChangePlanDialog client={open.client} onClose={() => setOpen(null)} onDone={(c) => refresh(`${c.name} is now on the ${c.plan.name} plan.`)} /> : null}
    </div>
  );
}

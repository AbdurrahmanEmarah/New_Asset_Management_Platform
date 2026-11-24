import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { errorText } from '../../../../shared/errors';
import { useLoad, useNow } from '../../../../shared/hooks';
import { Button, Field, Notice, ShieldIcon, StatusPill } from '../../../../shared/ui';
import { useApi, useSupportApi } from '../api/context';
import { ACCESS_LABELS, PASS_STATUS, type StartedSupportPass, type SupportPass } from '../api/support';
import { SUPPORT_ONLY, canRequestSupport, useMe } from '../me';
import { RequestSupportDialog } from './RequestSupportDialog';

const when = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmt = (iso: string) => when.format(new Date(iso));

export function timeLeft(endsAt: string | null, now: number): string {
  if (!endsAt) return '–';
  const minutes = Math.ceil((new Date(endsAt).getTime() - now) / 60_000);
  if (minutes <= 0) return 'Ending now';
  if (minutes < 60) return `${minutes} min left`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min left` : `${h} h left`;
}

export function startedMessage(s: StartedSupportPass, clientName: string): string {
  return `Support pass for ${clientName} opened (${ACCESS_LABELS[s.pass.access].toLowerCase()}). It ends by itself at ${fmt(s.pass.expiresAt)}.`;
}

export function SupportPage() {
  const tenancy = useApi();
  const support = useSupportApi();
  const me = useMe();
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const [clients, reloadClients] = useLoad(() => tenancy.listClients('all', ''), [tenancy]);
  const clientId = params.get('client') ?? clients.data?.[0]?.id ?? null;
  const client = clients.data?.find((c) => c.id === clientId) ?? null;
  const [passes, reloadPasses] = useLoad(() => (clientId ? support.passes(clientId) : Promise.resolve([])), [support, clientId]);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ending, setEnding] = useState<string | null>(null);
  const requestReason = canRequestSupport(me) ? null : SUPPORT_ONLY;
  const rows = [...(passes.data ?? [])].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active'));

  async function end(p: SupportPass) {
    if (!clientId) return;
    setEnding(p.id);
    setActionError(null);
    try {
      await support.end(clientId, p.id);
      setMessage(`The support pass for ${client?.name ?? 'this client'} has ended.`);
      reloadPasses();
    } catch (err) {
      setActionError(errorText(err, 'The pass could not be ended.'));
    } finally {
      setEnding(null);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div style={{ flexGrow: 1 }}>
          <div className="eyebrow">Operations · Support access</div>
          <h1>Support access</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Platform staff can't see client data except during a time-limited support pass. Every pass needs a reason, is read-only unless
            the Platform Owner opens it with change access, and is logged in the client's own audit log.
          </p>
        </div>
      </div>

      {message ? <Notice kind="ok" action={<Button size="sm" onClick={() => setMessage(null)}>Dismiss</Button>}>{message}</Notice> : null}
      {actionError ? <Notice kind="error">{actionError}</Notice> : null}
      {clients.status === 'error' ? <Notice kind="error" action={<Button size="sm" onClick={reloadClients}>Try again</Button>}>Clients didn't load: {clients.error.message}</Notice> : null}

      <section className="card" aria-label="Support passes">
        <div className="toolbar">
          <Field label="Client" style={{ flex: '0 1 360px' }}>
            <select className="input" value={clientId ?? ''} onChange={(e) => { setParams({ client: e.target.value }); setMessage(null); }}>
              {clients.status === 'loading' && !clients.data ? <option value="">Loading clients…</option> : null}
              {(clients.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.slug})</option>)}
            </select>
          </Field>
          <span style={{ flexGrow: 1 }} />
          <Button variant="primary" disabledReason={requestReason ?? (client ? null : 'Choose a client first.')} onClick={() => { setRequesting(true); setMessage(null); }}>
            <ShieldIcon /> Request access
          </Button>
        </div>

        {passes.status === 'error' ? (
          <div style={{ padding: 16 }}>
            <Notice kind="error" action={<Button size="sm" onClick={reloadPasses}>Try again</Button>}>Support passes didn't load: {passes.error.message}</Notice>
          </div>
        ) : null}
        {passes.status === 'loading' && rows.length === 0 ? <p className="muted" style={{ padding: 16, margin: 0 }}>Loading support passes…</p> : null}
        {passes.status === 'ready' && rows.length === 0 ? (
          <div className="empty">
            <strong>{clients.data?.length === 0 ? 'No clients yet' : 'No support passes for this client'}</strong>
            <span>{clients.data?.length === 0 ? 'Create a client first.' : 'Request access when this client needs help. A pass ends by itself when its time is up.'}</span>
          </div>
        ) : null}
        {rows.length > 0 ? (
          <div className="table-scroll">
            <table className="data" style={{ minWidth: 900 }}>
              <thead><tr><th>Requested by and why</th><th>Access</th><th>Started</th><th>Status</th><th>Actions recorded</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
              <tbody>
                {rows.map((p) => {
                  const status = PASS_STATUS[p.status];
                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 360 }}>
                          <strong>{p.requestedByName}</strong>
                          <span className="muted" style={{ fontSize: 13 }}>{p.reason}</span>
                        </div>
                      </td>
                      <td>{ACCESS_LABELS[p.access]}</td>
                      <td className="mono muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{fmt(p.startedAt)}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                          <StatusPill kind={status.kind}>{status.label}</StatusPill>
                          <span className="muted mono" style={{ fontSize: 12 }}>
                            {p.status === 'active' ? timeLeft(p.expiresAt, now) : p.endedByName ? `by ${p.endedByName}` : p.endedAt ? fmt(p.endedAt) : ''}
                          </span>
                        </div>
                      </td>
                      <td className="mono">{p.actionCount}</td>
                      <td>
                        <div className="row-actions">
                          {p.status === 'active' ? (
                            <Button size="sm" variant="danger" busy={ending === p.id} disabledReason={requestReason} aria-label={`End support pass opened by ${p.requestedByName}`} onClick={() => end(p)}>End now</Button>
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
      </section>

      {requesting && client ? (
        <RequestSupportDialog client={client} onClose={() => setRequesting(false)}
          onDone={(s) => { setRequesting(false); setMessage(startedMessage(s, client.name)); reloadPasses(); }} />
      ) : null}
    </div>
  );
}

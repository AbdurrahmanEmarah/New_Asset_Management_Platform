import { useState } from 'react';
import { errorText } from '../../../../shared/errors';
import { useLoad } from '../../../../shared/hooks';
import { Button, Notice, StatusPill } from '../../../../shared/ui';
import { ACCESS_LABELS, PASS_STATUS, PERMISSIONS, type SupportPass } from '../api/access';
import { useApi } from '../api/context';
import { needs, useMe } from '../me';

const when = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmt = (iso: string) => when.format(new Date(iso));

/** Times Inventra support staff entered this company, and why. Admins can end an active pass early. */
export function SupportPassesPage() {
  const api = useApi();
  const me = useMe();
  const [passes, reload] = useLoad(() => api.supportPasses(), [api]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endReason = needs(me, PERMISSIONS.manageUsers, 'end support access');
  const rows = passes.data ?? [];

  async function end(p: SupportPass) {
    setBusyId(p.id);
    setError(null);
    setMessage(null);
    try {
      await api.endSupportPass(p.id);
      setMessage(`${p.requestedByName}'s support access has ended.`);
      reload();
    } catch (err) {
      setError(errorText(err, 'The support pass could not be ended.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Settings · Support access</div>
          <h1>Support access</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Inventra support can only see your data during a time-limited support pass, opened with a reason. Everything they do is in your audit log.
          </p>
        </div>
      </div>
      {message ? <Notice kind="ok" action={<Button size="sm" onClick={() => setMessage(null)}>Dismiss</Button>}>{message}</Notice> : null}
      {error ? <Notice kind="error">{error}</Notice> : null}
      <section className="card" aria-label="Support passes">
        {passes.status === 'error' ? (
          <div style={{ padding: 16 }}>
            <Notice kind="error" action={<Button size="sm" onClick={reload}>Try again</Button>}>Support passes didn't load: {passes.error.message}</Notice>
          </div>
        ) : null}
        {passes.status === 'loading' && rows.length === 0 ? <p className="muted" style={{ padding: 16, margin: 0 }}>Loading support passes…</p> : null}
        {passes.status === 'ready' && rows.length === 0 ? (
          <div className="empty"><strong>Support has never entered your workspace</strong><span>If you contact Inventra support and they need to look, their pass appears here.</span></div>
        ) : null}
        {rows.length > 0 ? (
          <div className="table-scroll">
            <table className="data" style={{ minWidth: 900 }}>
              <thead><tr><th>Who and why</th><th>Access</th><th>When</th><th>Status</th><th>Actions recorded</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
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
                      <td className="mono muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                        {fmt(p.startedAt)}<br />{p.status === 'active' ? `until ${fmt(p.expiresAt)}` : p.endedAt ? `ended ${fmt(p.endedAt)}` : ''}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                          <StatusPill kind={status.kind}>{status.label}</StatusPill>
                          {p.endedByName ? <span className="muted" style={{ fontSize: 12 }}>by {p.endedByName}</span> : null}
                        </div>
                      </td>
                      <td className="mono">{p.actionCount}</td>
                      <td>
                        <div className="row-actions">
                          {p.status === 'active' ? (
                            <Button size="sm" variant="danger" busy={busyId === p.id} disabledReason={endReason} aria-label={`End ${p.requestedByName}'s support access`} onClick={() => end(p)}>End now</Button>
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
    </div>
  );
}

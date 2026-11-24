import { useState } from 'react';
import { errorText } from '../../../../shared/errors';
import { useLoad, useNow, type Loadable } from '../../../../shared/hooks';
import { Button, Notice, ShieldIcon, StatusPill } from '../../../../shared/ui';
import { useSupportApi } from '../api/context';
import { ACCESS_LABELS, SESSION_STATUS, type SupportSession } from '../api/support';
import { SUPPORT_ONLY, canRequestSupport, useMe } from '../me';
import { RequestSupportDialog } from './RequestSupportDialog';

const when = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function timeLeft(endsAt: string | null, now: number): string {
  if (!endsAt) return '–';
  const minutes = Math.ceil((new Date(endsAt).getTime() - now) / 60_000);
  if (minutes <= 0) return 'Ending now';
  if (minutes < 60) return `${minutes} min left`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min left` : `${h} h left`;
}

export function SupportPage() {
  const api = useSupportApi();
  const me = useMe();
  const now = useNow();
  const [active, reloadActive] = useLoad(() => api.list('active'), [api]);
  const [past, reloadPast] = useLoad(() => api.list('past'), [api]);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ending, setEnding] = useState<string | null>(null);
  const requestReason = canRequestSupport(me) ? null : SUPPORT_ONLY;

  const refresh = (text: string) => {
    setMessage(text);
    setActionError(null);
    reloadActive();
    reloadPast();
  };

  async function end(s: SupportSession) {
    setEnding(s.id);
    setActionError(null);
    try {
      await api.end(s.id);
      refresh(`The session with ${s.clientName} has ended.`);
    } catch (err) {
      setActionError(errorText(err, 'The session could not be ended.'));
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
            Platform staff can't see client data unless a client's workspace is opened for a time-limited support session.
            Every session needs a reason, is read-only unless the client approves more, and is logged in the client's own audit log.
          </p>
        </div>
        <Button variant="primary" disabledReason={requestReason} onClick={() => { setRequesting(true); setMessage(null); }}>
          <ShieldIcon /> Request access
        </Button>
      </div>

      {message ? <Notice kind="ok" action={<Button size="sm" onClick={() => setMessage(null)}>Dismiss</Button>}>{message}</Notice> : null}
      {actionError ? <Notice kind="error">{actionError}</Notice> : null}

      <SessionTable
        title="Active and waiting"
        sessions={active}
        reload={reloadActive}
        empty={{ title: 'No open sessions', text: requestReason ? 'Support staff start sessions from here or from a client row.' : 'Request access when a client needs help. It ends by itself when the time is up.' }}
        timeColumn="Time left"
        time={(s) => (s.status === 'pending_approval' ? 'Not started' : timeLeft(s.endsAt, now))}
        action={(s) => (
          <Button size="sm" variant="danger" busy={ending === s.id} disabledReason={s.cannotEndReason} onClick={() => end(s)}
            aria-label={`${s.status === 'pending_approval' ? 'Withdraw request for' : 'End session with'} ${s.clientName}`}>
            {s.status === 'pending_approval' ? 'Withdraw' : 'End now'}
          </Button>
        )}
      />

      <SessionTable
        title="Past sessions"
        sessions={past}
        reload={reloadPast}
        empty={{ title: 'No past sessions', text: 'Sessions appear here once they end, expire or are denied.' }}
        timeColumn="Ended"
        time={(s) => (s.endedAt ? when.format(new Date(s.endedAt)) : '–')}
      />

      {requesting ? (
        <RequestSupportDialog
          onClose={() => setRequesting(false)}
          onDone={(s) => {
            setRequesting(false);
            refresh(s.status === 'pending_approval'
              ? `${s.clientName}'s admins were asked to approve read and write access.`
              : `Support session with ${s.clientName} started. It ends by itself in ${s.durationMinutes} minutes.`);
          }}
        />
      ) : null}
    </div>
  );
}

interface SessionTableProps {
  title: string;
  sessions: Loadable<SupportSession[]>;
  reload: () => void;
  empty: { title: string; text: string };
  timeColumn: string;
  time: (s: SupportSession) => string;
  action?: (s: SupportSession) => React.ReactNode;
}

function SessionTable({ title, sessions, reload, empty, timeColumn, time, action }: SessionTableProps) {
  const rows = sessions.data ?? [];
  return (
    <section className="card" aria-label={title}>
      <div className="toolbar"><h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{title}</h2></div>
      {sessions.status === 'error' ? (
        <div style={{ padding: 16 }}>
          <Notice kind="error" action={<Button size="sm" onClick={reload}>Try again</Button>}>{title} didn't load: {sessions.error.message}</Notice>
        </div>
      ) : null}
      {sessions.status === 'loading' && rows.length === 0 ? <p className="muted" style={{ padding: 16, margin: 0 }}>Loading sessions…</p> : null}
      {sessions.status === 'ready' && rows.length === 0 ? <div className="empty"><strong>{empty.title}</strong><span>{empty.text}</span></div> : null}
      {rows.length > 0 ? (
        <div className="table-scroll">
          <table className="data" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>Client</th><th>Reason</th><th>Access</th><th>Requested by</th><th>Status</th><th>{timeColumn}</th>
                {action ? <th style={{ textAlign: 'right' }}>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const status = SESSION_STATUS[s.status];
                return (
                  <tr key={s.id}>
                    <td><strong>{s.clientName}</strong></td>
                    <td className="muted" style={{ maxWidth: 320 }}>{s.reason}</td>
                    <td>{ACCESS_LABELS[s.access]}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 600 }}>{s.requestedByName}</span>
                        <span className="mono muted" style={{ fontSize: 12 }}>{when.format(new Date(s.requestedAt))}</span>
                      </div>
                    </td>
                    <td><StatusPill kind={status.kind}>{status.label}</StatusPill></td>
                    <td className="mono" style={{ whiteSpace: 'nowrap' }}>{time(s)}</td>
                    {action ? <td><div className="row-actions">{action(s)}</div></td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

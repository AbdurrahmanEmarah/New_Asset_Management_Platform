import { useLoad } from '../../../../shared/hooks';
import { Button, Notice } from '../../../../shared/ui';
import { useApi } from '../api/context';

const ACTIONS: Record<string, string> = {
  'client.created': 'Created client',
  'client.suspended': 'Suspended client',
  'client.reactivated': 'Reactivated client',
  'client.plan_changed': 'Changed plan',
};

const when = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function AuditPage() {
  const api = useApi();
  const [entries, reload] = useLoad(() => api.audit(), [api]);
  const rows = entries.data ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Platform · Audit log</div>
          <h1>Audit log</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Everything platform staff changed, newest first. Entries can't be edited or deleted.</p>
        </div>
      </div>
      {entries.status === 'error' ? <Notice kind="error" action={<Button size="sm" onClick={reload}>Try again</Button>}>The audit log didn't load: {entries.error.message}</Notice> : null}
      <section className="card">
        {entries.status === 'ready' && rows.length === 0 ? <div className="empty"><strong>Nothing recorded yet</strong><span>Actions such as creating or suspending a client appear here.</span></div> : null}
        {rows.length > 0 ? (
          <div className="table-scroll">
            <table className="data" style={{ minWidth: 760 }}>
              <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Client</th><th>Details</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className="mono muted" style={{ whiteSpace: 'nowrap' }}>{when.format(new Date(a.at))}</td>
                    <td style={{ fontWeight: 600 }}>{a.actorName}</td>
                    <td>{ACTIONS[a.action] ?? a.action}</td>
                    <td>{a.clientName ?? '–'}</td>
                    <td className="muted">{a.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

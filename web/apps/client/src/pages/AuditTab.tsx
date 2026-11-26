import { useLoad } from '../../../../shared/hooks';
import { Button, Notice, StatusPill } from '../../../../shared/ui';
import { PERMISSIONS, type AuditEntry } from '../api/access';
import { useApi } from '../api/context';
import { can, useMe } from '../me';

const when = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** "asset.updated" → "Updated". The details line carries the specifics. */
export function actionLabel(action: string): string {
  const verb = action.split('.').pop() ?? action;
  return verb.charAt(0).toUpperCase() + verb.slice(1).replace(/_/g, ' ');
}

const ACTOR: Record<AuditEntry['actorKind'], string | null> = { user: null, support: 'Inventra support', platform: 'Inventra platform', system: 'Automatic' };

/** The company audit log, filtered to one asset (Access GET /audit?subjectId=). */
export function AuditTab({ subjectId }: { subjectId: string }) {
  const api = useApi();
  const me = useMe();
  const allowed = can(me, PERMISSIONS.viewAudit);
  const [entries, reload] = useLoad(() => (allowed ? api.audit({ subjectId, take: 100 }) : Promise.resolve([])), [api, subjectId, allowed]);
  const rows = entries.data ?? [];

  if (!allowed) {
    return <section className="card empty"><strong>You can't see the audit log</strong><span>You need the audit.view permission to see this asset's history. Ask an Admin.</span></section>;
  }
  return (
    <section className="card" aria-label="Asset history">
      {entries.status === 'error' ? <div style={{ padding: 16 }}><Notice kind="error" action={<Button size="sm" onClick={reload}>Try again</Button>}>The history didn't load: {entries.error.message}</Notice></div> : null}
      {entries.status === 'loading' && rows.length === 0 ? <p className="muted" style={{ padding: 16, margin: 0 }}>Loading history…</p> : null}
      {entries.status === 'ready' && rows.length === 0 ? <div className="empty"><strong>No history yet</strong><span>Changes to this asset appear here, newest first.</span></div> : null}
      {rows.length > 0 ? (
        <ol className="history">
          {rows.map((e) => (
            <li key={e.id}>
              <span className="mono muted" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{when.format(new Date(e.at))}</span>
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span><strong>{e.actorName}</strong> · {actionLabel(e.action)}</span>
                <span className="muted" style={{ fontSize: 13 }}>{e.details}</span>
              </span>
              {ACTOR[e.actorKind] ? <StatusPill kind={e.actorKind === 'support' ? 'warn' : 'info'}>{ACTOR[e.actorKind]}</StatusPill> : <span />}
            </li>
          ))}
        </ol>
      ) : null}
      <p className="muted foot-note">From your company's audit log. Entries can't be edited or deleted.</p>
    </section>
  );
}

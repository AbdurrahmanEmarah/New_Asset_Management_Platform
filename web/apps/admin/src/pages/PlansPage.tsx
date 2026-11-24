import { useLoad } from '../../../../shared/hooks';
import { Button, Notice } from '../../../../shared/ui';
import { useApi } from '../api/context';

const fmt = new Intl.NumberFormat('en-US');

export function PlansPage() {
  const api = useApi();
  const [plans, reload] = useLoad(() => api.plans(), [api]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Platform · Plans &amp; limits</div>
          <h1>Plans &amp; limits</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>The limits the platform enforces for each plan. Editing plans arrives with billing.</p>
        </div>
      </div>
      {plans.status === 'error' ? <Notice kind="error" action={<Button size="sm" onClick={reload}>Try again</Button>}>Plans didn't load: {plans.error.message}</Notice> : null}
      <section className="card">
        <div className="table-scroll">
          <table className="data" style={{ minWidth: 720 }}>
            <thead><tr><th>Plan</th><th>Users</th><th>Assets</th><th>Storage</th><th>Modules</th></tr></thead>
            <tbody>
              {(plans.data ?? []).map((p) => (
                <tr key={p.key}>
                  <td><strong>{p.name}</strong>{p.isTrial ? <span className="muted"> · 14 days</span> : null}</td>
                  <td className="mono">{fmt.format(p.maxUsers)}</td>
                  <td className="mono">{fmt.format(p.maxAssets)}</td>
                  <td className="mono">{p.storageGb} GB</td>
                  <td>{p.modules.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {plans.status === 'loading' ? <p className="muted" style={{ padding: 16, margin: 0 }}>Loading plans…</p> : null}
      </section>
    </div>
  );
}

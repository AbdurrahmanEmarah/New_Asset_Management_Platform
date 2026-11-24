import { useState, type FormEvent } from 'react';
import { useLoad } from '../../../../shared/hooks';
import { Button, Dialog, Notice } from '../../../../shared/ui';
import { useApi } from '../api/context';
import type { Client } from '../api/tenancy';

const fmt = new Intl.NumberFormat('en-US');

export function ChangePlanDialog({ client, onClose, onDone }: { client: Client; onClose: () => void; onDone: (c: Client) => void }) {
  const api = useApi();
  const [plans] = useLoad(() => api.plans(), [api]);
  const [choice, setChoice] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!choice) {
      setError('Choose the new plan.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onDone(await api.changePlan(client.id, choice));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The plan could not be changed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Change plan for ${client.name}`} description={`Now on ${client.plan.name}: ${client.usage.users.used} users and ${fmt.format(client.usage.assets.used)} assets in use.`} onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error ? <Notice kind="error">{error}</Notice> : null}
        {plans.status === 'error' ? <Notice kind="error">Plans didn't load: {plans.error.message}</Notice> : null}
        <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <legend className="visually-hidden">New plan</legend>
          {(plans.data ?? []).filter((p) => !p.isTrial).map((p) => {
            const current = p.key === client.plan.key;
            return (
              <label key={p.key} className="plan-option" data-current={current || undefined}>
                <input type="radio" name="plan" value={p.key} checked={choice === p.key} disabled={current} onChange={() => setChoice(p.key)} />
                <span style={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                  <strong>{p.name}{current ? ' (current plan)' : ''}</strong>
                  <span className="muted" style={{ fontSize: 13 }}>{p.maxUsers} users · {fmt.format(p.maxAssets)} assets · {p.storageGb} GB · {p.modules.join(', ')}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <div className="dialog-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy}>{busy ? 'Saving…' : 'Change plan'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

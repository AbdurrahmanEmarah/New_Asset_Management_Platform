import { useState, type FormEvent } from 'react';
import { ApiError } from '../../../../shared/api/http';
import { Button, Dialog, Field, Notice } from '../../../../shared/ui';
import { useApi } from '../api/context';
import type { Client } from '../api/tenancy';

export function SuspendDialog({ client, onClose, onDone }: { client: Client; onClose: () => void; onDone: (c: Client) => void }) {
  const api = useApi();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Say why the client is suspended. Their owner will see this.");
      return;
    }
    setBusy(true);
    try {
      onDone(await api.suspend(client.id, reason.trim()));
    } catch (err) {
      if (err instanceof ApiError && err.field('reason')) setError(err.field('reason'));
      else setFormError(err instanceof Error ? err.message : 'The client could not be suspended.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Suspend ${client.name}?`} description="Their data is kept. The reason and the time are recorded in the audit log." onClose={onClose}>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {formError ? <Notice kind="error">{formError}</Notice> : null}
        <Field label="Reason (shown to the client's owner)" required error={error}>
          <textarea className="input" rows={3} value={reason} onChange={(e) => { setReason(e.target.value); setError(undefined); }} placeholder="e.g. Invoice INV-104 unpaid for 60 days." />
        </Field>
        <div className="dialog-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy}>{busy ? 'Suspending…' : 'Suspend client'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

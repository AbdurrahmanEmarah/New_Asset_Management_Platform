import { useState, type FormEvent } from 'react';
import { ApiError } from '../../../../shared/api/http';
import { errorText } from '../../../../shared/errors';
import { useLoad } from '../../../../shared/hooks';
import { Button, Dialog, Field, Notice, ShieldIcon } from '../../../../shared/ui';
import { useApi, useSupportApi } from '../api/context';
import { DURATIONS, type NewSupportSession, type SupportSession } from '../api/support';

type Errors = Partial<Record<keyof NewSupportSession, string>>;

export function validateSupport(form: NewSupportSession): Errors {
  const errors: Errors = {};
  if (!form.clientId) errors.clientId = 'Choose the client you need to help.';
  if (form.reason.trim().length < 10) errors.reason = "Say why you need access, e.g. the ticket number and the problem. The client's admins see this.";
  return errors;
}

export function RequestSupportDialog({ clientId, onClose, onDone }: { clientId?: string; onClose: () => void; onDone: (s: SupportSession) => void }) {
  const tenancy = useApi();
  const support = useSupportApi();
  const [clients] = useLoad(() => tenancy.listClients('all', ''), [tenancy]);
  const [form, setForm] = useState<NewSupportSession>({ clientId: clientId ?? '', reason: '', durationMinutes: 60, access: 'read' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fixed = clients.data?.find((c) => c.id === clientId);
  const set = <K extends keyof NewSupportSession>(key: K, value: NewSupportSession[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const duration = DURATIONS.find((d) => d.minutes === form.durationMinutes)?.adjective ?? `${form.durationMinutes}-minute`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateSupport(form);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      onDone(await support.request({ ...form, reason: form.reason.trim() }));
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        setErrors({ clientId: err.field('clientId'), reason: err.field('reason'), durationMinutes: err.field('durationMinutes'), access: err.field('access') });
      } else {
        setFormError(errorText(err, 'Support access could not be requested.'));
      }
      setBusy(false);
    }
  }

  const icon = (
    <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--warn-bg)', color: 'var(--warn)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <ShieldIcon />
    </div>
  );

  return (
    <Dialog
      icon={icon}
      title={fixed ? `Support access to ${fixed.name}` : 'Request support access'}
      description="You'll enter this client's workspace as support. Their admins see this session, its reason and everything you change in their audit log."
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {formError ? <Notice kind="error">{formError}</Notice> : null}
        {clientId ? null : (
          <Field label="Client" required error={errors.clientId}>
            <select className="input" value={form.clientId} onChange={(e) => set('clientId', e.target.value)}>
              <option value="">{clients.status === 'loading' ? 'Loading clients…' : 'Choose a client'}</option>
              {(clients.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.slug})</option>)}
            </select>
          </Field>
        )}
        {clients.status === 'error' && !clientId ? <Notice kind="error">Clients didn't load: {clients.error.message}</Notice> : null}
        <Field label="Reason (shown to the client)" required error={errors.reason}>
          <textarea className="input" rows={3} value={form.reason} placeholder="e.g. Ticket #4182: imported assets are missing their location." onChange={(e) => set('reason', e.target.value)} />
        </Field>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="Duration" error={errors.durationMinutes} style={{ flex: '1 1 160px' }}>
            <select className="input" value={form.durationMinutes} onChange={(e) => set('durationMinutes', Number(e.target.value))}>
              {DURATIONS.map((d) => <option key={d.minutes} value={d.minutes}>{d.label}</option>)}
            </select>
          </Field>
          <Field label="Access" error={errors.access} style={{ flex: '1 1 160px' }}
            hint={form.access === 'read' ? 'You can look but not change anything.' : "The session starts once one of the client's admins approves it."}>
            <select className="input" value={form.access} onChange={(e) => set('access', e.target.value as NewSupportSession['access'])}>
              <option value="read">Read-only</option>
              <option value="read_write">Read and write (needs the client's approval)</option>
            </select>
          </Field>
        </div>
        <div className="dialog-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy}>
            {busy ? 'Requesting…' : form.access === 'read' ? `Start ${duration} session` : 'Ask the client to approve'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

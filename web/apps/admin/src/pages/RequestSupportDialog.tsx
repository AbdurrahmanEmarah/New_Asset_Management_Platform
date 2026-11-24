import { useState, type FormEvent } from 'react';
import { ApiError } from '../../../../shared/api/http';
import { errorText } from '../../../../shared/errors';
import { Button, Dialog, Field, Notice, ShieldIcon } from '../../../../shared/ui';
import { useSupportApi } from '../api/context';
import { DURATIONS, type NewSupportPass, type StartedSupportPass } from '../api/support';
import type { Client } from '../api/tenancy';
import { CHANGE_ACCESS_OWNER_ONLY, isPlatformOwner, useMe } from '../me';

type Errors = Partial<Record<keyof NewSupportPass, string>>;

export function validateSupport(form: NewSupportPass): Errors {
  return form.reason.trim().length < 10 ? { reason: "Say why you need access, e.g. the ticket number and the problem. The client's admins see this." } : {};
}

export function RequestSupportDialog({ client, onClose, onDone }: { client: Client; onClose: () => void; onDone: (s: StartedSupportPass) => void }) {
  const support = useSupportApi();
  const me = useMe();
  const [form, setForm] = useState<NewSupportPass>({ reason: '', minutes: 60, access: 'read' });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const owner = isPlatformOwner(me);

  const set = <K extends keyof NewSupportPass>(key: K, value: NewSupportPass[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const duration = DURATIONS.find((d) => d.minutes === form.minutes)?.adjective ?? `${form.minutes}-minute`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateSupport(form);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      onDone(await support.start(client.id, { ...form, reason: form.reason.trim() }));
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        setErrors({ reason: err.field('reason'), minutes: err.field('minutes'), access: err.field('access') });
      } else {
        setFormError(errorText(err, 'Support access could not be opened.'));
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
    <Dialog icon={icon} title={`Support access to ${client.name}`}
      description="You'll enter this client's workspace as support. Their admins see this session, its reason and everything you change in their audit log."
      onClose={onClose}>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {formError ? <Notice kind="error">{formError}</Notice> : null}
        <Field label="Reason (shown to the client)" required error={errors.reason}>
          <textarea className="input" rows={3} value={form.reason} placeholder="e.g. Ticket #4182: imported assets are missing their location." onChange={(e) => set('reason', e.target.value)} />
        </Field>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="Duration" error={errors.minutes} style={{ flex: '1 1 160px' }}>
            <select className="input" value={form.minutes} onChange={(e) => set('minutes', Number(e.target.value))}>
              {DURATIONS.map((d) => <option key={d.minutes} value={d.minutes}>{d.label}</option>)}
            </select>
          </Field>
          <Field label="Access" error={errors.access} style={{ flex: '1 1 160px' }}
            hint={owner ? (form.access === 'read' ? 'You can look but not change anything.' : 'You can change data. Every change is in their audit log.') : CHANGE_ACCESS_OWNER_ONLY}>
            <select className="input" value={form.access} onChange={(e) => set('access', e.target.value as NewSupportPass['access'])}>
              <option value="read">Read-only</option>
              <option value="change" disabled={!owner}>Read and change (Platform Owner only)</option>
            </select>
          </Field>
        </div>
        <div className="dialog-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy}>{busy ? 'Opening…' : `Start ${duration} session`}</Button>
        </div>
      </form>
    </Dialog>
  );
}

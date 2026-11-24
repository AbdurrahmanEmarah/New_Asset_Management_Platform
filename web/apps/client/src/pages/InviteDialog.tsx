import { useState, type FormEvent } from 'react';
import { ApiError } from '../../../../shared/api/http';
import { errorText, isEmail } from '../../../../shared/errors';
import { Button, Dialog, Field, Notice } from '../../../../shared/ui';
import type { Role, Site, User } from '../api/access';
import { useApi } from '../api/context';
import { SiteChips } from '../components/SiteChips';
import { isOwner, useMe } from '../me';

type Errors = Partial<Record<'email' | 'roleIds' | 'siteIds', string>>;

/** The form: one or more roles plus one site choice, applied to each of those roles. */
interface InviteForm { email: string; roleIds: string[]; siteIds: string[] }

export function validateInvite(form: InviteForm): Errors {
  const errors: Errors = {};
  if (!isEmail(form.email)) errors.email = 'Enter their work email address, e.g. name@company.com.';
  if (form.roleIds.length === 0) errors.roleIds = 'Choose at least one role. It decides what they can do.';
  return errors;
}

export function InviteDialog({ roles, sites, onClose, onInvited }: { roles: Role[]; sites: Site[]; onClose: () => void; onInvited: (u: User) => void }) {
  const api = useApi();
  const me = useMe();
  const [form, setForm] = useState<InviteForm>({ email: '', roleIds: [], siteIds: [] });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ownerReason = isOwner(me) ? null : 'Only an Owner can make someone else an Owner.';

  function toggleRole(id: string) {
    setForm((f) => ({ ...f, roleIds: f.roleIds.includes(id) ? f.roleIds.filter((r) => r !== id) : [...f.roleIds, id] }));
    setErrors((e) => ({ ...e, roleIds: undefined }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateInvite(form);
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      onInvited(await api.invite({ email: form.email.trim(), roles: form.roleIds.map((roleId) => ({ roleId, siteIds: form.siteIds })) }));
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        setErrors({ email: err.field('email'), roleIds: err.field('roles') });
      } else {
        setFormError(errorText(err, 'The invite could not be sent.'));
      }
      setBusy(false);
    }
  }

  return (
    <Dialog title="Invite people" description="They get an email with a link to join. They choose their own name and password when they accept." onClose={onClose}>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {formError ? <Notice kind="error">{formError}</Notice> : null}
        <Field label="Email" required error={errors.email}>
          <input className="input" type="email" autoComplete="off" value={form.email} placeholder="name@company.com"
            onChange={(e) => { setForm({ ...form, email: e.target.value }); setErrors({ ...errors, email: undefined }); }} />
        </Field>

        <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}
          aria-describedby={errors.roleIds ? 'invite-roles-error' : undefined}>
          <legend style={{ fontSize: 13, fontWeight: 600, padding: 0, marginBottom: 6 }}>Roles<span aria-hidden="true" style={{ color: 'var(--fault)' }}> *</span></legend>
          <div className="check-list">
            {roles.map((r) => {
              const reason = r.locked ? ownerReason : null;
              return (
                <label key={r.id} className="check-row" title={reason ?? undefined}>
                  <input type="checkbox" checked={form.roleIds.includes(r.id)} disabled={Boolean(reason)} onChange={() => toggleRole(r.id)} aria-describedby={reason ? `why-${r.id}` : undefined} />
                  <span style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                    <span className="muted" style={{ fontSize: 12.5 }}>{reason ? <span id={`why-${r.id}`}>{reason}</span> : r.description}</span>
                  </span>
                </label>
              );
            })}
            {roles.length === 0 ? <span className="muted" style={{ padding: '8px 0' }}>Loading roles…</span> : null}
          </div>
          {errors.roleIds ? <span id="invite-roles-error" className="field-error">{errors.roleIds}</span> : null}
        </fieldset>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Sites</span>
          <SiteChips label="Sites they work at" sites={sites} value={form.siteIds} onChange={(siteIds) => setForm({ ...form, siteIds })} />
          <span className="field-hint">
            {form.siteIds.length === 0 ? 'Their roles apply at every site.' : 'Their roles apply only at these sites. Assets and work orders elsewhere are hidden from them.'}
          </span>
        </div>

        <div className="dialog-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy}>{busy ? 'Sending…' : 'Send invite'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

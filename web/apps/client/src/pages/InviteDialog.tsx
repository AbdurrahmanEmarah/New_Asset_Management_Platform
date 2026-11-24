import { useState, type FormEvent } from 'react';
import { ApiError } from '../../../../shared/api/http';
import { errorText, isEmail } from '../../../../shared/errors';
import { Button, Dialog, Field, Notice } from '../../../../shared/ui';
import type { InvitationLink, Role, Site } from '../api/access';
import { useApi } from '../api/context';
import { RolePicker, toAssignments, type RoleChoice } from '../components/RolePicker';

type Errors = Partial<Record<'email' | 'name' | 'roles', string>>;

export function validateInvite(form: { email: string; name: string } & RoleChoice): Errors {
  const errors: Errors = {};
  if (!form.name.trim()) errors.name = 'Enter their name, as colleagues know them.';
  if (!isEmail(form.email)) errors.email = 'Enter their work email address, e.g. name@company.com.';
  if (form.roleIds.length === 0) errors.roles = 'Choose at least one role. It decides what they can do.';
  return errors;
}

export function InviteDialog({ roles, sites, onClose, onInvited }: { roles: Role[]; sites: Site[]; onClose: () => void; onInvited: (link: InvitationLink) => void }) {
  const api = useApi();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [choice, setChoice] = useState<RoleChoice>({ roleIds: [], siteIds: [] });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateInvite({ email, name, ...choice });
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      onInvited(await api.invite({ email: email.trim(), name: name.trim(), roles: toAssignments(choice, roles) }));
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        setErrors({ email: err.field('email'), name: err.field('name'), roles: err.field('roles') });
      } else {
        setFormError(errorText(err, 'The invitation could not be made.'));
      }
      setBusy(false);
    }
  }

  return (
    <Dialog title="Invite people" description="You get a link to send them. They sign in or create an account with this email, then join." onClose={onClose}>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {formError ? <Notice kind="error">{formError}</Notice> : null}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="Name" required error={errors.name} style={{ flex: '1 1 180px' }}>
            <input className="input" autoComplete="off" value={name} onChange={(e) => { setName(e.target.value); setErrors({ ...errors, name: undefined }); }} />
          </Field>
          <Field label="Email" required error={errors.email} style={{ flex: '1 1 220px' }}>
            <input className="input" type="email" autoComplete="off" value={email} placeholder="name@company.com"
              onChange={(e) => { setEmail(e.target.value); setErrors({ ...errors, email: undefined }); }} />
          </Field>
        </div>
        <RolePicker roles={roles} sites={sites} value={choice} error={errors.roles}
          onChange={(next) => { setChoice(next); setErrors({ ...errors, roles: undefined }); }} />
        <div className="dialog-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy}>{busy ? 'Creating…' : 'Create invitation'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

import { useState, type FormEvent } from 'react';
import { ApiError } from '../../../../shared/api/http';
import { errorText } from '../../../../shared/errors';
import { Button, Dialog, Field, Notice } from '../../../../shared/ui';
import type { Role } from '../api/access';
import { useApi } from '../api/context';

export type RoleDialogMode = { kind: 'new' } | { kind: 'duplicate'; source: Role };

/** New role (empty) or Duplicate (POST /roles/{id}/copy: a custom role with the same permissions). */
export function RoleDialog({ mode, onClose, onCreated }: { mode: RoleDialogMode; onClose: () => void; onCreated: (r: Role) => void }) {
  const api = useApi();
  const copy = mode.kind === 'duplicate' ? mode : null;
  const [name, setName] = useState(copy ? `${copy.source.name} (copy)` : '');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setNameError('Give the role a name, e.g. "Site supervisor".');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const role = copy
        ? await api.copyRole(copy.source.id, name.trim())
        : await api.createRole({ name: name.trim(), description: description.trim(), permissions: [] });
      onCreated(role);
    } catch (err) {
      if (err instanceof ApiError && err.field('name')) setNameError(err.field('name'));
      else setFormError(errorText(err, 'The role could not be created.'));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={copy ? `Duplicate ${copy.source.name}` : 'New role'}
      description={copy ? 'The copy starts with the same permissions. Nobody has it until you give it to them.' : 'The role starts with no permissions. Tick what it allows after you create it.'}
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {formError ? <Notice kind="error">{formError}</Notice> : null}
        <Field label="Role name" required error={nameError}>
          <input className="input" value={name} maxLength={60} onChange={(e) => { setName(e.target.value); setNameError(undefined); }} />
        </Field>
        {copy ? null : (
          <Field label="Description" hint="One sentence on who this role is for.">
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        )}
        <div className="dialog-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy}>{busy ? 'Creating…' : copy ? 'Create copy' : 'Create role'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

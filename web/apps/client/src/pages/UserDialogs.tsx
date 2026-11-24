import { useState, type FormEvent } from 'react';
import { ApiError } from '../../../../shared/api/http';
import { errorText } from '../../../../shared/errors';
import { Button, CopyLink, Dialog, Notice } from '../../../../shared/ui';
import type { InvitationLink, Role, Site, User } from '../api/access';
import { useApi } from '../api/context';
import { RolePicker, toAssignments, type RoleChoice } from '../components/RolePicker';

const day = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/** The join link, shown once. Email sending arrives with the Notifications service. */
export function LinkDialog({ link, onClose }: { link: InvitationLink; onClose: () => void }) {
  return (
    <Dialog title={`Send ${link.user.name} their invitation`} description="This link is shown only now. Copy it and send it to them yourself, for example by chat or email." onClose={onClose}>
      <CopyLink url={link.acceptUrl} label="Invitation link" />
      <Notice kind="info">
        Inventra doesn't send emails yet; that arrives with Notifications. The link works once and expires on {day.format(new Date(link.expiresAt))}.
        If it's lost, use "New link" in the list.
      </Notice>
      <div className="dialog-actions"><Button variant="primary" onClick={onClose}>Done</Button></div>
    </Dialog>
  );
}

/** Confirms an action on one person and shows the server's refusal as written. */
export function ConfirmDialog({ title, description, action, danger, onClose, run }: {
  title: string; description: string; action: string; danger?: boolean; onClose: () => void; run: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog title={title} description={description} onClose={onClose}>
      {error ? <Notice kind="error">{error}</Notice> : null}
      <div className="dialog-actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} busy={busy} onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await run();
          } catch (err) {
            setError(errorText(err, 'That didn\'t work. Try again.'));
            setBusy(false);
          }
        }}>{busy ? 'Working…' : action}</Button>
      </div>
    </Dialog>
  );
}

function initialChoice(user: User): RoleChoice {
  const scoped = user.roles.find((r) => r.kind !== 'owner');
  return { roleIds: user.roles.map((r) => r.id), siteIds: scoped && !scoped.allSites ? scoped.siteIds : [] };
}

export function ChangeRolesDialog({ user, roles, sites, onClose, onDone }: { user: User; roles: Role[]; sites: Site[]; onClose: () => void; onDone: (u: User) => void }) {
  const api = useApi();
  const [choice, setChoice] = useState<RoleChoice>(() => initialChoice(user));
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scoped = user.roles.filter((r) => r.kind !== 'owner');
  const mixed = scoped.some((r) => r.siteIds.join() !== (scoped[0]?.siteIds ?? []).join());

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (choice.roleIds.length === 0) {
      setError('Choose at least one role. To remove all access, deactivate them instead.');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      onDone(await api.setRoles(user.id, toAssignments(choice, roles)));
    } catch (err) {
      if (err instanceof ApiError && err.field('roles')) setError(err.field('roles'));
      else setFormError(errorText(err, 'Their roles could not be changed.'));
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Roles for ${user.name}`} description="Changes apply the next time they load a page, and are recorded in the audit log." onClose={onClose}>
      <form onSubmit={submit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {formError ? <Notice kind="error">{formError}</Notice> : null}
        {mixed ? <Notice kind="info">Their roles currently apply at different sites. Saving applies this one site choice to every role.</Notice> : null}
        <RolePicker roles={roles} sites={sites} value={choice} error={error} onChange={(next) => { setChoice(next); setError(undefined); }} />
        <div className="dialog-actions">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={busy}>{busy ? 'Saving…' : 'Save roles'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

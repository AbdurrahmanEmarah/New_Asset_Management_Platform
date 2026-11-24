import { useState } from 'react';
import { errorText } from '../../../../shared/errors';
import { useLoad } from '../../../../shared/hooks';
import { Button, CopyLink, Dialog, Notice } from '../../../../shared/ui';
import { useSupportApi } from '../api/context';
import type { OwnerInvitation } from '../api/support';
import type { Client } from '../api/tenancy';
import { OWNER_ONLY, useMe } from '../me';

const when = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** The client's first Owner joins with a link. Until email sending arrives, staff pass it on themselves. */
export function OwnerInvitationDialog({ client, onClose }: { client: Client; onClose: () => void }) {
  const support = useSupportApi();
  const me = useMe();
  const [invitation, reload] = useLoad(() => support.ownerInvitation(client.id), [support, client.id]);
  const [fresh, setFresh] = useState<OwnerInvitation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inv = fresh ?? invitation.data;

  async function reissue() {
    setBusy(true);
    setError(null);
    try {
      setFresh(await support.reissueOwnerInvitation(client.id));
    } catch (err) {
      setError(errorText(err, 'A new link could not be made.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={`${client.name}: Owner invitation`} description="The first Owner joins with a link. Inventra doesn't send emails yet, so send it to them yourself." onClose={onClose}>
      {invitation.status === 'error' && !fresh ? (
        <Notice kind="error" action={<Button size="sm" onClick={reload}>Try again</Button>}>The invitation didn't load: {invitation.error.message}</Notice>
      ) : null}
      {!inv && invitation.status === 'loading' ? <p className="muted" style={{ margin: 0 }}>Loading…</p> : null}
      {inv ? (
        <>
          <p style={{ margin: 0 }}>
            <strong>{inv.name}</strong> <span className="mono muted">{inv.email}</span>
          </p>
          {inv.status === 'active' ? <Notice kind="ok">{inv.name} has joined, so there's no invitation to send.</Notice> : null}
          {inv.status === 'deactivated' ? <Notice kind="warn">{inv.name} is deactivated in this company. Their admins can reactivate them.</Notice> : null}
          {inv.status === 'invited' && inv.acceptUrl ? <CopyLink url={inv.acceptUrl} label="Invitation link (shown once)" /> : null}
          {inv.status === 'invited' && !inv.acceptUrl ? (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Not joined yet.{inv.expiresAt ? ` The current link expires on ${when.format(new Date(inv.expiresAt))}.` : ''} Links are shown only once; make a new one to send it again.
            </p>
          ) : null}
          {error ? <Notice kind="error">{error}</Notice> : null}
        </>
      ) : null}
      <div className="dialog-actions">
        <Button onClick={onClose}>Close</Button>
        {inv?.status === 'invited' ? (
          <Button variant="primary" busy={busy} disabledReason={me.canManageClients ? null : OWNER_ONLY} onClick={reissue}>
            {fresh ? 'Make another link' : 'Make a new link'}
          </Button>
        ) : null}
      </div>
    </Dialog>
  );
}

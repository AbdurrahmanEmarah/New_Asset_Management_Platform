import { useState } from 'react';
import { errorText } from '../../../../shared/errors';
import { useLoad } from '../../../../shared/hooks';
import { Button, Notice } from '../../../../shared/ui';
import type { AcceptedInvitation, AccessApi } from '../api/access';

const when = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Shown inside the sign-in card once the person is signed in: who invited them, and a Join button. */
export function JoinPage({ api, token, onJoined }: { api: AccessApi; token: string; onJoined: (result: AcceptedInvitation) => void }) {
  const [preview, reload] = useLoad(() => api.previewInvitation(token), [api, token]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (preview.status === 'error') {
    return <Notice kind="error" action={<Button size="sm" onClick={reload}>Try again</Button>}>{preview.error.message}</Notice>;
  }
  if (!preview.data) return <p className="muted" style={{ margin: 0 }}>Checking your invitation…</p>;
  const p = preview.data;

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      onJoined(await api.acceptInvitation(token));
    } catch (err) {
      setError(errorText(err, 'You could not join just now. Try again.'));
      setBusy(false);
    }
  }

  return (
    <>
      <p style={{ margin: 0 }}>
        <strong>{p.invitedByName}</strong> invited <strong>{p.name}</strong> ({p.email}) to join <strong>{p.companyName}</strong> as {p.roles.join(', ')}.
      </p>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>The invitation expires on {when.format(new Date(p.expiresAt))}.</p>
      {p.cannotAcceptReason ? <Notice kind="warn">{p.cannotAcceptReason}</Notice> : null}
      {error ? <Notice kind="error">{error}</Notice> : null}
      <Button variant="primary" busy={busy} disabledReason={p.cannotAcceptReason} onClick={accept}>
        {busy ? 'Joining…' : `Join ${p.companyName}`}
      </Button>
    </>
  );
}

import type { ReactNode } from 'react';
import { Button, Gate, Notice } from '../ui';
import { useAuth } from './AuthProvider';

interface AuthGateProps {
  title: string;
  badge?: string;
  /** One sentence above the Sign in button that says which account to use. */
  signInHint: string;
  children: ReactNode;
}

/** Shows the sign-in states (misconfigured, checking, signed out) and renders the app once signed in. */
export function AuthGate({ title, badge, signInHint, children }: AuthGateProps) {
  const auth = useAuth();
  const { state } = auth;
  const gate = (content: ReactNode) => <Gate title={title} badge={badge}>{content}</Gate>;

  if (state.status === 'misconfigured') return gate(<Notice kind="error">{state.error}</Notice>);
  if (state.status === 'loading') return gate(<p className="muted" style={{ margin: 0 }}>Checking your sign-in…</p>);
  if (state.status === 'signed-out') {
    return gate(
      <>
        {state.error ? <Notice kind="error">{state.error}</Notice> : null}
        <p className="muted" style={{ margin: 0 }}>{signInHint}</p>
        <Button variant="primary" onClick={() => void auth.signIn()}>Sign in</Button>
      </>,
    );
  }
  return <>{children}</>;
}

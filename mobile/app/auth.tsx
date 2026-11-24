import { Redirect } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { Screen } from '@/ui/Screen';
import { Loading } from '@/ui/States';

/** Where Keycloak sends the browser back to (inventra-field://auth, or /auth on the web). */
export default function AuthCallback() {
  const { session } = useAuth();
  if (session.status === 'signed-in') return <Redirect href="/" />;
  if (session.status === 'signed-out') return <Redirect href="/sign-in" />;
  return (
    <Screen>
      <Loading label="Finishing sign-in…" />
    </Screen>
  );
}

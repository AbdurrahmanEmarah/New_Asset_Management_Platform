import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { Loading } from '@/ui/States';
import { Text } from '@/ui/Text';

export function SignInScreen() {
  const { colors } = useTheme();
  const { session, config, cannotSignInReason, signIn, signInDemo } = useAuth();
  const error = session.status === 'signed-out' ? session.error : undefined;
  if (session.status === 'restoring') {
    return (
      <Screen edges={['top', 'bottom']}>
        <Loading label="Signing you back in…" />
      </Screen>
    );
  }
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={styles.body}>
        <View style={styles.brand}>
          <View style={[styles.mark, { backgroundColor: colors.brand }]}>
            <Text variant="title" style={{ color: colors.brandInk }}>
              I
            </Text>
          </View>
          <Text variant="label" color="muted">
            INVENTRA FIELD
          </Text>
          <Text variant="title">Sign in to see your jobs</Text>
          <Text color="muted">Use the account your company gave you.</Text>
        </View>

        {!config.ok ? (
          <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: colors.warnBg }]}>
            <Text variant="strong" style={{ color: colors.warn }}>
              Sign-in is not set up on this build
            </Text>
            <Text variant="small" style={{ color: colors.warn }}>
              {config.message}
            </Text>
          </View>
        ) : null}

        {error && config.ok ? (
          <View accessibilityRole="alert" style={[styles.notice, { backgroundColor: colors.faultBg }]}>
            <Text variant="small" style={{ color: colors.fault }}>
              {error}
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            label="Sign in"
            onPress={signIn}
            busy={session.status === 'signing-in'}
            disabledReason={config.ok ? cannotSignInReason : 'Sign-in is not set up yet (see above).'}
          />
          {signInDemo ? (
            <Button variant="ghost" label="Use sample data (development only)" onPress={signInDemo} />
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: 24, justifyContent: 'center', gap: 24, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brand: { gap: 8 },
  mark: { width: 48, height: 48, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  notice: { padding: 12, borderRadius: 8, gap: 4 },
  actions: { gap: 12 },
});

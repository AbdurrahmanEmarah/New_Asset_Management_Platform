import { ScrollView, StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { describeChange } from '@/jobs/jobs';
import { useOffline } from '@/offline/OfflineProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { Text } from '@/ui/Text';
import { ThemeSwitch } from '@/ui/ThemeSwitch';

export function MeScreen() {
  const { colors } = useTheme();
  const { session, signOut } = useAuth();
  const { state, sendNow } = useOffline();
  const user = session.status === 'signed-in' ? session.user : null;
  const waiting = state.pending.length;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="title" accessibilityRole="header">
          Me
        </Text>
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.surface }]}>
          <Text variant="strong">{user?.name ?? 'Signed in'}</Text>
          {user?.email ? <Text color="muted">{user.email}</Text> : null}
          {session.status === 'signed-in' && session.demo ? (
            <Text variant="small" color="muted">
              Using sample data. Nothing is sent to a real server.
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text variant="label" color="muted">
            THEME
          </Text>
          <ThemeSwitch />
        </View>

        <View style={styles.section}>
          <Text variant="label" color="muted">
            SAVED ON THIS PHONE
          </Text>
          <Text>
            {waiting === 0
              ? 'Everything is sent.'
              : `${waiting === 1 ? '1 change is' : `${waiting} changes are`} waiting to be sent.`}
          </Text>
          {state.pending.map((p) => (
            <Text key={p.id} variant="small" color="muted">
              {describeChange(p.change)}
              {p.lastError ? ` (last try: ${p.lastError})` : ''}
            </Text>
          ))}
          <Button
            variant="ghost"
            label="Send now"
            busy={state.sending}
            disabledReason={waiting === 0 ? 'Nothing is waiting to be sent.' : null}
            onPress={sendNow}
          />
        </View>

        <Button
          variant="ghost"
          label="Sign out"
          onPress={signOut}
          disabledReason={waiting > 0 ? 'Send the changes saved on this phone before signing out, so they are not lost.' : null}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 20 },
  card: { padding: 14, borderRadius: 10, borderWidth: 1, gap: 4 },
  section: { gap: 10 },
});

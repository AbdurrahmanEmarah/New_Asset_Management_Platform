import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { Button } from './Button';
import { Text } from './Text';

export function Loading({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={colors.action} size="large" />
      <Text color="muted">{label}</Text>
    </View>
  );
}

export function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <View style={styles.center} accessibilityRole="alert">
      <Text variant="heading" style={styles.centered}>
        {title}
      </Text>
      <Text color="muted" style={styles.centered}>
        {message}
      </Text>
      <Button label="Try again" onPress={onRetry} style={styles.wide} />
    </View>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.center}>
      <Text variant="heading" style={styles.centered}>
        {title}
      </Text>
      <Text color="muted" style={styles.centered}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  centered: { textAlign: 'center', maxWidth: 320 },
  wide: { alignSelf: 'stretch' },
});

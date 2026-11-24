import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radiusLg, touchTarget } from '@/theme/tokens';
import { Text } from './Text';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
  /** When set, the button is disabled and this sentence is shown under it. A button never silently does nothing. */
  disabledReason?: string | null;
  busy?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Button({ label, onPress, variant = 'primary', disabledReason, busy, icon, style, testID }: ButtonProps) {
  const { colors } = useTheme();
  const disabled = Boolean(disabledReason) || busy;
  const primary = variant === 'primary';
  const fg = primary ? colors.onAction : colors.text;
  return (
    <View style={[styles.wrap, style]}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={disabledReason ?? undefined}
        accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(busy) }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          primary
            ? { backgroundColor: colors.action, borderColor: colors.action }
            : { backgroundColor: colors.surface, borderColor: colors.line },
          disabled && { opacity: 0.5 },
          pressed && { opacity: 0.8 },
        ]}
      >
        {busy ? <ActivityIndicator color={fg} /> : icon}
        <Text variant="strong" style={{ color: fg }}>
          {label}
        </Text>
      </Pressable>
      {disabledReason ? (
        <Text variant="small" color="muted" style={styles.reason}>
          {disabledReason}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  button: {
    minHeight: touchTarget,
    paddingHorizontal: 16,
    borderRadius: radiusLg,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  reason: { textAlign: 'center' },
});

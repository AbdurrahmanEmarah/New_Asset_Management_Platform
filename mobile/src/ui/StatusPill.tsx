import { StyleSheet, View } from 'react-native';
import type { StatusKind } from '@/api/types';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/tokens';
import { Text } from './Text';

/** Each status has a colour and a shape, so status never depends on colour alone. */
export function StatusShape({ kind, color }: { kind: StatusKind; color: string }) {
  switch (kind) {
    case 'ok':
      return <View style={[styles.shape, { backgroundColor: color, borderRadius: 4 }]} />;
    case 'warn':
      return (
        <View
          style={{
            width: 0,
            height: 0,
            borderLeftWidth: 4.5,
            borderRightWidth: 4.5,
            borderBottomWidth: 8,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderBottomColor: color,
          }}
        />
      );
    case 'fault':
      return <View style={[styles.shape, { backgroundColor: color, borderRadius: 1 }]} />;
    case 'info':
      return <View style={[styles.shape, { borderColor: color, borderWidth: 2, borderRadius: 4 }]} />;
    case 'none':
      return <View style={{ width: 8, height: 2, backgroundColor: color }} />;
  }
}

export function StatusPill({ kind, label }: { kind: StatusKind; label: string }) {
  const { colors } = useTheme();
  const fg = colors[kind];
  const bg = colors[`${kind}Bg` as const];
  return (
    <View style={[styles.pill, { backgroundColor: bg }]} accessibilityLabel={label}>
      <StatusShape kind={kind} color={fg} />
      <Text variant="strong" style={{ color: fg, fontSize: 12, lineHeight: 16 }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  shape: { width: 8, height: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: radius,
    alignSelf: 'flex-start',
  },
});

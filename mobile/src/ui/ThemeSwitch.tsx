import { Pressable, StyleSheet, View } from 'react-native';
import { THEME_MODES } from '@/theme/theme';
import { useTheme } from '@/theme/ThemeProvider';
import { radiusLg, touchTarget } from '@/theme/tokens';
import { Text } from './Text';

/** System / Light / Dark. The choice is remembered on this device. */
export function ThemeSwitch() {
  const { mode, setMode, colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Theme" style={[styles.group, { borderColor: colors.line }]}>
      {THEME_MODES.map((m) => {
        const on = m.value === mode;
        return (
          <Pressable
            key={m.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={m.label}
            onPress={() => setMode(m.value)}
            style={[styles.option, on && { backgroundColor: colors.action }]}
          >
            <Text variant="strong" style={{ color: on ? colors.onAction : colors.text }}>
              {m.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', borderWidth: 2, borderRadius: radiusLg, padding: 2, gap: 2 },
  option: { flex: 1, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
});

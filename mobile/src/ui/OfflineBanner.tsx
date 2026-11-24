import { Pressable, StyleSheet, View } from 'react-native';
import { describeChange } from '@/jobs/jobs';
import { bannerText, useOffline } from '@/offline/OfflineProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, touchTarget } from '@/theme/tokens';
import { StatusShape } from './StatusPill';
import { Text } from './Text';

/** Shown on every screen while changes are waiting on the phone, and for changes the server refused. */
export function OfflineBanner() {
  const { colors } = useTheme();
  const { state, dismissConflict } = useOffline();
  const text = bannerText(state);
  if (!text && state.conflicts.length === 0) return null;
  return (
    <View>
      {text ? (
        <View
          accessibilityRole="summary"
          accessibilityLiveRegion="polite"
          style={[styles.row, { backgroundColor: state.offline ? colors.warnBg : colors.infoBg }]}
        >
          <StatusShape kind={state.offline ? 'warn' : 'info'} color={state.offline ? colors.warn : colors.info} />
          <Text variant="small" style={[styles.text, { color: state.offline ? colors.warn : colors.info }]}>
            {text}
          </Text>
        </View>
      ) : null}
      {state.conflicts.map((c) => (
        <View key={c.id} accessibilityRole="alert" style={[styles.row, { backgroundColor: colors.faultBg }]}>
          <StatusShape kind="fault" color={colors.fault} />
          <View style={styles.grow}>
            <Text variant="small" style={{ color: colors.fault, fontFamily: fonts.sansBold }}>
              Not saved: {describeChange(c.change)}
            </Text>
            <Text variant="small" style={{ color: colors.fault }}>
              {c.message}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Dismiss: ${c.message}`}
            onPress={() => dismissConflict(c.id)}
            style={styles.dismiss}
          >
            <Text variant="small" style={{ color: colors.fault, fontFamily: fonts.sansBold }}>
              OK
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  text: { flex: 1, fontFamily: fonts.sansBold },
  grow: { flex: 1 },
  dismiss: { minWidth: touchTarget, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
});

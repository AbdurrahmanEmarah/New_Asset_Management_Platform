import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { cannotCompleteReason, readingWarning } from '@/jobs/jobs';
import { useJob } from '@/jobs/useJob';
import { useOffline } from '@/offline/OfflineProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { EmptyState, ErrorState, Loading } from '@/ui/States';
import { Text } from '@/ui/Text';

export function CompleteJobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { load, reload, job, change } = useJob(id);
  const { state } = useOffline();
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const toJobs = () => router.dismissTo('/');

  if (finished) {
    const waiting = state.pending.some((p) => p.change.kind === 'job.complete' && p.change.jobId === id);
    return (
      <Screen>
        <View style={styles.done}>
          <View style={[styles.tick, { backgroundColor: colors.okBg }]}>
            <MaterialCommunityIcons name="check-bold" size={36} color={colors.ok} />
          </View>
          <Text variant="title" accessibilityRole="header">
            Job completed
          </Text>
          <Text color="muted" style={styles.centered}>
            {waiting
              ? 'Saved on this phone. It will be sent to the office automatically when you are back online.'
              : 'Sent to the office. The planner can see it now.'}
          </Text>
          <Button label="Back to my jobs" onPress={toJobs} style={styles.wide} />
        </View>
      </Screen>
    );
  }

  const header = (
    <View style={[styles.top, { borderBottomColor: colors.line }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to the job" onPress={() => router.back()} style={styles.iconButton}>
        <MaterialCommunityIcons name="chevron-left" size={28} color={colors.text} />
      </Pressable>
      <Text variant="strong">Complete {id}</Text>
    </View>
  );

  if (load.status === 'error' && !job) {
    return (
      <Screen>
        {header}
        <ErrorState title="Could not open this job" message={load.error.message} onRetry={reload} />
      </Screen>
    );
  }
  if (!job) {
    return (
      <Screen>
        {header}
        {load.status === 'loading' ? (
          <Loading label="Opening the job…" />
        ) : (
          <EmptyState title="Job not found" message={`There is no job ${id} assigned to you. Go back to My jobs.`} />
        )}
      </Screen>
    );
  }

  const reason = cannotCompleteReason(job);
  const warnings = job.readings.map((r) => ({ r, w: readingWarning(r) })).filter((x) => x.w);

  return (
    <Screen>
      {header}
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="heading">{job.title}</Text>
        <Text color="muted">
          {job.asset.name} · {job.asset.location}
        </Text>
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.surface }]}>
          <Text variant="label" color="muted">
            SUMMARY
          </Text>
          <Text>
            Checklist: {job.checklist.filter((s) => s.done).length} of {job.checklist.length} steps done
          </Text>
          {job.readings.map((r) => (
            <Text key={r.id}>
              {r.label}: {r.value || '—'} {r.unit}
            </Text>
          ))}
          {job.parts.map((p) => (
            <Text key={p.partNumber}>
              {p.name} × {p.quantity}
            </Text>
          ))}
        </View>
        {warnings.map(({ r, w }) => (
          <View key={r.id} style={[styles.card, { backgroundColor: colors.warnBg, borderColor: colors.warnBg }]}>
            <Text variant="strong" style={{ color: colors.warn }}>
              {r.label}: {r.value} {r.unit}
            </Text>
            <Text variant="small" style={{ color: colors.warn }}>
              {w} The planner will see this reading with the completed job.
            </Text>
          </View>
        ))}
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: colors.line, backgroundColor: colors.surface }]}>
        {saveError ? (
          <Text variant="small" accessibilityRole="alert" style={{ color: colors.fault }}>
            {saveError}
          </Text>
        ) : null}
        <Button
          label="Complete job"
          disabledReason={reason}
          busy={saving}
          onPress={() => {
            setSaving(true);
            setSaveError(null);
            change({ kind: 'job.complete', jobId: job.id }).then(
              () => setFinished(true),
              (error: unknown) => {
                setSaving(false);
                setSaveError(
                  `Could not save this on the phone: ${error instanceof Error ? error.message : String(error)}. Free some storage space and try again.`,
                );
              },
            );
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderBottomWidth: 1 },
  iconButton: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, gap: 12 },
  card: { padding: 14, borderRadius: 10, borderWidth: 1, gap: 6 },
  footer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, borderTopWidth: 1, gap: 8 },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  tick: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  centered: { textAlign: 'center', maxWidth: 320 },
  wide: { alignSelf: 'stretch' },
});

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { Job, Reading } from '@/api';
import { applyChanges, cannotCompleteReason, priorityLabel, readingRange, readingWarning, stateLabel } from '@/jobs/jobs';
import { useJob } from '@/jobs/useJob';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radiusLg, touchTarget } from '@/theme/tokens';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { EmptyState, ErrorState, Loading } from '@/ui/States';
import { StatusPill } from '@/ui/StatusPill';
import { Text } from '@/ui/Text';

export function JobDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { load, reload, job, change } = useJob(id);
  // What the technician is typing, before it is saved (on leaving the field).
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const header = (
    <View style={[styles.top, { borderBottomColor: colors.line }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to my jobs" onPress={back} style={styles.iconButton}>
        <MaterialCommunityIcons name="chevron-left" size={28} color={colors.text} />
      </Pressable>
      <Text variant="mono" color="action">
        {id}
      </Text>
      <View style={styles.grow} />
      {job ? <StatusPill kind={stateLabel[job.state].kind} label={stateLabel[job.state].label} /> : null}
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
  if (load.status === 'loading' && !job) {
    return (
      <Screen>
        {header}
        <Loading label="Opening the job…" />
      </Screen>
    );
  }
  if (!job) {
    return (
      <Screen>
        {header}
        <EmptyState title="Job not found" message={`There is no job ${id} assigned to you. It may have been reassigned. Go back to My jobs.`} />
      </Screen>
    );
  }

  // The reason uses what is typed now, so the button updates as the technician types.
  const withDrafts = applyChanges(
    job,
    Object.entries(drafts).map(([readingId, value]) => ({ kind: 'reading.set', jobId: job.id, readingId, value })),
  );
  const reason = cannotCompleteReason(withDrafts);
  const done = job.checklist.filter((s) => s.done).length;

  const saveReading = (reading: Reading) => {
    const value = drafts[reading.id];
    if (value === undefined) return;
    setDrafts(({ [reading.id]: _saved, ...rest }) => rest);
    if (value !== reading.value) void change({ kind: 'reading.set', jobId: job.id, readingId: reading.id, value });
  };

  return (
    <Screen>
      {header}
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.pad}>
          <Text variant="heading" accessibilityRole="header">
            {job.title}
          </Text>
          <Text variant="small" color="muted">
            <Text variant="mono" color="muted">
              {job.asset.tag}
            </Text>{' '}
            · {job.asset.name} · {job.asset.location}
          </Text>
          <StatusPill kind={priorityLabel[job.priority].kind} label={priorityLabel[job.priority].label} />
        </View>

        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.sectionHead}>
            <Text variant="label" color="muted">
              CHECKLIST
            </Text>
            <View style={styles.grow} />
            <Text variant="mono" color="muted" accessibilityLabel={`${done} of ${job.checklist.length} steps done`}>
              {done} / {job.checklist.length}
            </Text>
          </View>
          {job.checklist.map((s) => (
            <Pressable
              key={s.id}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: s.done, disabled: job.state === 'completed' }}
              accessibilityLabel={s.label}
              disabled={job.state === 'completed'}
              onPress={() => void change({ kind: 'checklist.set', jobId: job.id, stepId: s.id, done: !s.done })}
              style={[styles.step, { borderTopColor: colors.lineSoft }]}
            >
              <View
                style={[
                  styles.box,
                  { borderColor: s.done ? colors.action : colors.line, backgroundColor: s.done ? colors.action : colors.sunken },
                ]}
              >
                {s.done ? <MaterialCommunityIcons name="check-bold" size={16} color={colors.onAction} /> : null}
              </View>
              <Text style={styles.grow}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        {job.readings.length > 0 ? (
          <View style={[styles.pad, styles.gap]}>
            <Text variant="label" color="muted">
              READINGS
            </Text>
            {job.readings.map((r) => {
              const value = drafts[r.id] ?? r.value;
              const warning = readingWarning({ ...r, value });
              const range = readingRange(r);
              return (
                <View key={r.id} style={styles.field}>
                  <Text variant="strong" nativeID={`reading-${r.id}`}>
                    {r.label} ({r.unit})
                  </Text>
                  {range ? (
                    <Text variant="small" color="muted">
                      {range}
                    </Text>
                  ) : null}
                  <TextInput
                    accessibilityLabel={`${r.label} (${r.unit})`}
                    value={value}
                    editable={job.state !== 'completed'}
                    onChangeText={(text) => setDrafts((d) => ({ ...d, [r.id]: text }))}
                    onBlur={() => saveReading(r)}
                    inputMode="decimal"
                    keyboardType="decimal-pad"
                    placeholder="Type the reading"
                    placeholderTextColor={colors.muted}
                    style={[
                      styles.input,
                      { borderColor: warning ? colors.fault : colors.line, backgroundColor: colors.sunken, color: colors.text },
                    ]}
                  />
                  {warning ? (
                    <Text variant="small" accessibilityRole="alert" style={{ color: colors.fault, fontFamily: fonts.sansBold }}>
                      {warning}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {job.parts.length > 0 ? <Parts job={job} /> : null}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: colors.line, backgroundColor: colors.surface }]}>
        <Button
          label="Complete job"
          disabledReason={reason}
          onPress={() => {
            for (const r of job.readings) saveReading(r);
            router.push(`/job/${job.id}/complete`);
          }}
        />
      </View>
    </Screen>
  );
}

function Parts({ job }: { job: Job }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.pad, styles.gap]}>
      <Text variant="label" color="muted">
        PARTS USED
      </Text>
      {job.parts.map((p) => (
        <View key={p.partNumber} style={[styles.part, { borderColor: colors.line, backgroundColor: colors.surface }]}>
          <View style={styles.grow}>
            <Text>{p.name}</Text>
            <Text variant="mono" color="muted" style={{ fontSize: 12 }}>
              {p.partNumber}
            </Text>
          </View>
          <Text variant="mono">× {p.quantity}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderBottomWidth: 1, paddingRight: 16 },
  iconButton: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1 },
  scroll: { paddingVertical: 14, gap: 16 },
  pad: { paddingHorizontal: 16, gap: 6 },
  gap: { gap: 10 },
  section: { borderTopWidth: 1, borderBottomWidth: 1 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 14, borderTopWidth: 1 },
  box: { width: 26, height: 26, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  field: { gap: 6 },
  input: { minHeight: touchTarget, borderWidth: 2, borderRadius: radiusLg, paddingHorizontal: 12, fontSize: 16, fontFamily: fonts.mono },
  part: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderRadius: radiusLg },
  footer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, borderTopWidth: 1 },
});

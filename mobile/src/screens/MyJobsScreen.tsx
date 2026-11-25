import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { api, demoNetwork, type Job } from '@/api';
import { useLoad } from '@/hooks';
import { applyChanges, dueLabel, priorityLabel, stateLabel } from '@/jobs/jobs';
import { loadMyJobs } from '@/jobs/repository';
import { useOffline } from '@/offline/OfflineProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { touchTarget } from '@/theme/tokens';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { EmptyState, ErrorState, Loading } from '@/ui/States';
import { StatusPill } from '@/ui/StatusPill';
import { Text } from '@/ui/Text';

const dateFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

export function MyJobsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { state, sendNow } = useOffline();
  const [load, reload] = useLoad(() => loadMyJobs(api), []);
  const [online, setOnline] = useState(demoNetwork.isOnline());

  // Refresh when coming back to the list (e.g. after completing a job).
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) firstFocus.current = false;
      else reload();
    }, [reload]),
  );

  const toggleNetwork = () => {
    const next = !online;
    demoNetwork.setOnline(next);
    setOnline(next);
    if (next) {
      sendNow();
      reload();
    }
  };

  const pending = state.pending.map((p) => p.change);
  const jobs = load.data?.jobs.map((j) => applyChanges(j, pending)).filter((j) => j.state !== 'completed');

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.grow}>
          <Text variant="label" color="muted">
            {dateFormat.format(new Date()).toUpperCase()}
          </Text>
          <Text variant="title" accessibilityRole="header">
            My jobs
          </Text>
        </View>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: !online }}
          accessibilityLabel={online ? 'Pretend there is no signal (demo)' : 'Go back online (demo)'}
          onPress={toggleNetwork}
          style={styles.iconButton}
        >
          <MaterialCommunityIcons name={online ? 'wifi' : 'wifi-off'} size={24} color={online ? colors.text : colors.warn} />
        </Pressable>
      </View>
      <View style={styles.scan}>
        <Button
          label="Scan an asset"
          onPress={() => router.navigate('/scan')}
          icon={<MaterialCommunityIcons name="qrcode-scan" size={22} color={colors.onAction} />}
        />
      </View>

      {load.data?.savedAt ? (
        <Text variant="small" color="muted" style={styles.note}>
          No connection. Showing the jobs saved on this phone at {timeFormat.format(new Date(load.data.savedAt))}.
        </Text>
      ) : null}

      {load.status === 'error' && !load.data ? (
        <ErrorState title="Could not load your jobs" message={load.error.message} onRetry={reload} />
      ) : !jobs ? (
        <Loading label="Loading your jobs…" />
      ) : jobs.length === 0 ? (
        <EmptyState title="No jobs for you right now" message="New jobs show up here when a planner assigns them to you. Check again later." />
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(j) => j.id}
          contentContainerStyle={styles.list}
          refreshing={load.status === 'loading'}
          onRefresh={reload}
          renderItem={({ item }) => <JobCard job={item} onPress={() => router.push(`/job/${item.id}`)} />}
        />
      )}
    </Screen>
  );
}

function JobCard({ job, onPress }: { job: Job; onPress: () => void }) {
  const { colors } = useTheme();
  const st = stateLabel[job.state];
  const pr = priorityLabel[job.priority];
  const due = dueLabel(job.due);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${job.id}: ${job.title}. ${st.label}. ${pr.label}. Due ${due}.`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.line }, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.row}>
        <Text variant="mono" color="action">
          {job.id}
        </Text>
        <View style={styles.grow} />
        <StatusPill kind={st.kind} label={st.label} />
      </View>
      <Text variant="strong">{job.title}</Text>
      <Text variant="small" color="muted">
        {job.asset.name} · {job.asset.location}
      </Text>
      <View style={styles.row}>
        <StatusPill kind={pr.kind} label={pr.label} />
        <View style={styles.grow} />
        <Text variant="mono" color={due === 'Overdue' ? 'fault' : 'muted'}>
          {due}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  grow: { flex: 1 },
  iconButton: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  scan: { paddingHorizontal: 16, paddingBottom: 12 },
  note: { paddingHorizontal: 16, paddingBottom: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  card: { padding: 14, borderRadius: 10, borderWidth: 1, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});

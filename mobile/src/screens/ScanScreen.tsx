import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useIsFocused, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { api, type AssetSummary, type Job } from '@/api';
import { applyChanges, stateLabel } from '@/jobs/jobs';
import { tagFromQr, tagProblem } from '@/jobs/tags';
import { useOffline } from '@/offline/OfflineProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radiusLg, touchTarget } from '@/theme/tokens';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { StatusPill } from '@/ui/StatusPill';
import { Text } from '@/ui/Text';

type Lookup =
  | { status: 'idle' }
  | { status: 'loading'; tag: string }
  | { status: 'error'; tag: string; message: string }
  | { status: 'not-found'; tag: string }
  | { status: 'found'; tag: string; asset: AssetSummary; jobs: Job[] };

export function ScanScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const focused = useIsFocused();
  const { state } = useOffline();
  const [permission, requestPermission] = useCameraPermissions();
  const [typed, setTyped] = useState('');
  const [lookup, setLookup] = useState<Lookup>({ status: 'idle' });
  const [unreadable, setUnreadable] = useState<string | null>(null);

  const find = (tag: string) => {
    setLookup({ status: 'loading', tag });
    api.findAsset(tag).then(
      (found) => setLookup(found ? { status: 'found', tag, ...found } : { status: 'not-found', tag }),
      (error: unknown) =>
        setLookup({ status: 'error', tag, message: error instanceof Error ? error.message : String(error) }),
    );
  };

  const onScanned = (result: BarcodeScanningResult) => {
    const tag = tagFromQr(result.data);
    if (!tag) {
      setUnreadable('That QR code is not an Inventra asset tag. Scan the tag on the asset, or type its code below.');
      return;
    }
    setUnreadable(null);
    setTyped(tag);
    find(tag);
  };

  // Scan once, then wait until the technician asks to scan again.
  const scanning = focused && lookup.status === 'idle';
  const typedProblem = tagProblem(typed);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text variant="title" accessibilityRole="header">
          Scan an asset
        </Text>

        <View style={[styles.camera, { borderColor: colors.line, backgroundColor: colors.sunken }]}>
          {!permission ? (
            <Text color="muted" style={styles.centered}>
              Checking camera access…
            </Text>
          ) : !permission.granted ? (
            <View style={styles.cameraMessage}>
              <Text style={styles.centered}>
                {permission.canAskAgain
                  ? 'Allow the camera to scan the QR tag on an asset. You can also type the code below.'
                  : 'Camera access is off for Inventra. Turn it on in your phone’s Settings, or type the code below.'}
              </Text>
              {permission.canAskAgain ? <Button label="Allow camera" onPress={() => void requestPermission()} /> : null}
            </View>
          ) : scanning ? (
            <CameraView
              testID="camera"
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={onScanned}
            />
          ) : (
            <View style={styles.cameraMessage}>
              <Text color="muted" style={styles.centered}>
                Camera paused.
              </Text>
              <Button variant="ghost" label="Scan another tag" onPress={() => setLookup({ status: 'idle' })} />
            </View>
          )}
        </View>
        {unreadable ? (
          <Text variant="small" accessibilityRole="alert" style={{ color: colors.warn }}>
            {unreadable}
          </Text>
        ) : null}

        <View style={styles.field}>
          <Text variant="strong" nativeID="tag-label">
            Or type the asset tag
          </Text>
          <TextInput
            accessibilityLabel="Asset tag"
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="INV-00417"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            onSubmitEditing={() => {
              if (!typedProblem) find(typed.trim());
            }}
            style={[styles.input, { borderColor: colors.line, backgroundColor: colors.sunken, color: colors.text }]}
          />
          <Button
            label="Find asset"
            disabledReason={typedProblem}
            busy={lookup.status === 'loading'}
            onPress={() => find(typed.trim())}
          />
        </View>

        <Result
          lookup={lookup}
          pending={state.pending.map((p) => p.change)}
          onRetry={find}
          onOpen={(id) => router.push(`/job/${id}`)}
        />
      </ScrollView>
    </Screen>
  );
}

function Result({
  lookup,
  pending,
  onRetry,
  onOpen,
}: {
  lookup: Lookup;
  pending: Parameters<typeof applyChanges>[1];
  onRetry: (tag: string) => void;
  onOpen: (jobId: string) => void;
}) {
  const { colors } = useTheme();
  switch (lookup.status) {
    case 'idle':
      return null;
    case 'loading':
      return <Text color="muted">Looking up {lookup.tag}…</Text>;
    case 'error':
      return (
        <View accessibilityRole="alert" style={styles.gap}>
          <Text style={{ color: colors.fault }}>
            Could not look up {lookup.tag}: {lookup.message}
          </Text>
          <Button variant="ghost" label="Try again" onPress={() => onRetry(lookup.tag)} />
        </View>
      );
    case 'not-found':
      return (
        <Text accessibilityRole="alert">
          No asset has the tag {lookup.tag}. Check the code under the QR tag and try again.
        </Text>
      );
    case 'found': {
      const jobs = lookup.jobs.map((j) => applyChanges(j, pending)).filter((j) => j.state !== 'completed');
      return (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.surface }]}>
          <Text variant="mono" color="action">
            {lookup.asset.tag}
          </Text>
          <Text variant="strong">{lookup.asset.name}</Text>
          <Text variant="small" color="muted">
            {lookup.asset.location}
          </Text>
          {jobs.length === 0 ? (
            <Text color="muted">You have no open jobs on this asset.</Text>
          ) : (
            jobs.map((j) => (
              <Pressable
                key={j.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${j.id}: ${j.title}`}
                onPress={() => onOpen(j.id)}
                style={[styles.job, { borderTopColor: colors.lineSoft }]}
              >
                <View style={styles.grow}>
                  <Text variant="mono" color="action">
                    {j.id}
                  </Text>
                  <Text>{j.title}</Text>
                </View>
                <StatusPill kind={stateLabel[j.state].kind} label={stateLabel[j.state].label} />
              </Pressable>
            ))
          )}
        </View>
      );
    }
  }
}

const styles = StyleSheet.create({
  scroll: { padding: 16, gap: 14 },
  camera: { height: 280, borderRadius: radiusLg, borderWidth: 1, overflow: 'hidden', justifyContent: 'center' },
  cameraMessage: { padding: 16, gap: 12 },
  centered: { textAlign: 'center' },
  field: { gap: 8 },
  input: { minHeight: touchTarget, borderWidth: 2, borderRadius: radiusLg, paddingHorizontal: 12, fontSize: 16, fontFamily: fonts.mono },
  gap: { gap: 8 },
  card: { padding: 14, borderRadius: 10, borderWidth: 1, gap: 4 },
  job: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, borderTopWidth: 1, marginTop: 6, paddingTop: 6 },
  grow: { flex: 1 },
});

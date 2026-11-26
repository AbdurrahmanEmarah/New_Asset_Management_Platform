import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useIsFocused, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { AssetSummary } from '@/api/assets';
import { useAuth } from '@/auth/AuthProvider';
import { tagFromQr, tagProblem } from '@/jobs/tags';
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
  | { status: 'found'; tag: string; asset: AssetSummary };

export function ScanScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const focused = useIsFocused();
  const { assets } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [typed, setTyped] = useState('');
  const [lookup, setLookup] = useState<Lookup>({ status: 'idle' });
  const [unreadable, setUnreadable] = useState<string | null>(null);

  const find = (tag: string) => {
    if (!assets) return;
    setLookup({ status: 'loading', tag });
    assets.findByTag(tag).then(
      (asset) => {
        setLookup(asset ? { status: 'found', tag, asset } : { status: 'not-found', tag });
        if (asset) router.push(`/asset/${asset.id}`);
      },
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

        <Result lookup={lookup} onRetry={find} onOpen={(id) => router.push(`/asset/${id}`)} />
      </ScrollView>
    </Screen>
  );
}

function Result({ lookup, onRetry, onOpen }: { lookup: Lookup; onRetry: (tag: string) => void; onOpen: (assetId: string) => void }) {
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
      return <Text accessibilityRole="alert">No asset with tag {lookup.tag} at your sites. Check the code under the QR tag and try again.</Text>;
    case 'found':
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${lookup.asset.tag}: ${lookup.asset.name}`}
          onPress={() => onOpen(lookup.asset.id)}
          style={[styles.card, { borderColor: colors.line, backgroundColor: colors.surface }]}
        >
          <Text variant="mono" color="action">
            {lookup.asset.tag}
          </Text>
          <Text variant="strong">{lookup.asset.name}</Text>
          <Text variant="small" color="muted">
            {lookup.asset.typeName} · {lookup.asset.location}
          </Text>
          <StatusPill kind={lookup.asset.status.meaning} label={lookup.asset.status.label} />
        </Pressable>
      );
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
});

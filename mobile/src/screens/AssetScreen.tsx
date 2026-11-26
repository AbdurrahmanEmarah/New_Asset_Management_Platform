import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { Asset, AssetDocument, AssetsApi } from '@/api/assets';
import { formatSize, formatValue } from '@/assets/format';
import { takePhoto } from '@/assets/photos';
import { useAuth } from '@/auth/AuthProvider';
import { useLoad } from '@/hooks';
import { useOffline } from '@/offline/OfflineProvider';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts, radiusLg, touchTarget } from '@/theme/tokens';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { EmptyState, ErrorState, Loading } from '@/ui/States';
import { StatusPill } from '@/ui/StatusPill';
import { Text } from '@/ui/Text';

export function AssetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { assets } = useAuth();
  const [load, reload] = useLoad(() => (assets ? assets.getAsset(id) : Promise.resolve(null)), [id, assets]);

  const header = (
    <View style={[styles.top, { borderBottomColor: colors.line }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={styles.iconButton}
      >
        <MaterialCommunityIcons name="chevron-left" size={28} color={colors.text} />
      </Pressable>
      <Text variant="mono" color="action">
        {load.data?.tag ?? 'Asset'}
      </Text>
    </View>
  );

  if (load.status === 'error' && !load.data) {
    return (
      <Screen>
        {header}
        <ErrorState title="Could not open this asset" message={load.error.message} onRetry={reload} />
      </Screen>
    );
  }
  if (load.status === 'loading' && !load.data) {
    return (
      <Screen>
        {header}
        <Loading label="Opening the asset…" />
      </Screen>
    );
  }
  const asset = load.data;
  if (!asset || !assets) {
    return (
      <Screen>
        {header}
        <EmptyState title="Asset not found" message="This asset is not at your sites. It may have been moved or removed. Scan another tag." />
      </Screen>
    );
  }

  const fields = [...asset.fields].sort((a, b) => a.order - b.order);
  return (
    <Screen>
      {header}
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.pad}>
          <Text variant="heading" accessibilityRole="header">
            {asset.name}
          </Text>
          <Text variant="small" color="muted">
            <Text variant="mono" color="muted">
              {asset.tag}
            </Text>{' '}
            · {asset.typeName}
          </Text>
          <StatusPill kind={asset.status.meaning} label={asset.status.label} />
          <Text color="muted">{asset.location}</Text>
          {asset.parent ? (
            <Text variant="small" color="muted">
              Part of {asset.parent.tag} · {asset.parent.name}
            </Text>
          ) : null}
          {asset.retiredAt ? (
            <Text variant="small" style={{ color: colors.warn }}>
              This asset is retired.
            </Text>
          ) : null}
        </View>

        {fields.length > 0 ? (
          <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text variant="label" color="muted" style={styles.sectionHead}>
              DETAILS
            </Text>
            {fields.map((f) => (
              <View key={f.key} style={[styles.row, { borderTopColor: colors.lineSoft }]}>
                <Text color="muted" style={styles.grow}>
                  {f.label}
                </Text>
                <Text style={[styles.value, f.kind === 'number' || f.kind === 'date' ? { fontFamily: fonts.mono } : null]}>
                  {formatValue(f, asset.values[f.key])}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <Documents asset={asset} assets={assets} />
      </ScrollView>
    </Screen>
  );
}

function Documents({ asset, assets }: { asset: Asset; assets: AssetsApi }) {
  const { colors } = useTheme();
  const { state, saveChange } = useOffline();
  const waiting = state.pending.flatMap((p) => (p.change.kind === 'asset.photo' && p.change.assetId === asset.id ? [p.change] : []));
  // Reload when a waiting photo has been sent.
  const [load, reload] = useLoad(() => assets.listDocuments(asset.id), [asset.id, assets, waiting.length]);
  const [opening, setOpening] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [taking, setTaking] = useState(false);

  const open = (doc: AssetDocument) => {
    setOpening(doc.id);
    setProblem(null);
    assets
      .documentLink(doc.id)
      .then((url) => WebBrowser.openBrowserAsync(url))
      .catch((error: unknown) => setProblem(`Could not open ${doc.fileName}: ${error instanceof Error ? error.message : String(error)}`))
      .finally(() => setOpening(null));
  };

  const addPhoto = () => {
    setTaking(true);
    setProblem(null);
    takePhoto(asset.tag)
      .then(async (result) => {
        if (result.status === 'problem') setProblem(result.message);
        if (result.status !== 'taken') return;
        await saveChange({
          kind: 'asset.photo',
          assetId: asset.id,
          assetTag: asset.tag,
          uri: result.file.uri,
          fileName: result.file.name,
          contentType: result.file.type,
          sizeBytes: result.file.sizeBytes,
        });
      })
      .catch((error: unknown) => setProblem(`Could not take the photo: ${error instanceof Error ? error.message : String(error)}`))
      .finally(() => setTaking(false));
  };

  return (
    <View style={[styles.pad, styles.gap]}>
      <Text variant="label" color="muted">
        DOCUMENTS AND PHOTOS
      </Text>
      {load.status === 'error' && !load.data ? (
        <View accessibilityRole="alert" style={styles.gap}>
          <Text style={{ color: colors.fault }}>Could not load the documents: {load.error.message}</Text>
          <Button variant="ghost" label="Try again" onPress={reload} />
        </View>
      ) : !load.data ? (
        <Text color="muted">Loading documents…</Text>
      ) : load.data.length === 0 && waiting.length === 0 ? (
        <Text color="muted">No documents yet. Add a photo to show the asset’s condition.</Text>
      ) : (
        <>
          {load.data.map((d) => (
            <Pressable
              key={d.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${d.fileName}`}
              onPress={() => open(d)}
              disabled={opening === d.id}
              style={[styles.doc, { borderColor: colors.line, backgroundColor: colors.surface }]}
            >
              <MaterialCommunityIcons
                name={d.contentType === 'application/pdf' ? 'file-pdf-box' : 'image-outline'}
                size={24}
                color={colors.muted}
              />
              <View style={styles.grow}>
                <Text>{d.fileName}</Text>
                <Text variant="small" color="muted">
                  {formatSize(d.sizeBytes)} · {d.uploadedByName}
                </Text>
              </View>
              <Text variant="strong" color="action">
                {opening === d.id ? 'Opening…' : 'Open'}
              </Text>
            </Pressable>
          ))}
          {waiting.map((w) => (
            <View key={w.uri} style={[styles.doc, { borderColor: colors.line, borderStyle: 'dashed' }]}>
              <MaterialCommunityIcons name="cloud-upload-outline" size={24} color={colors.muted} />
              <View style={styles.grow}>
                <Text>{w.fileName}</Text>
                <Text variant="small" color="muted">
                  Saved on this phone. It will upload when there is signal.
                </Text>
              </View>
            </View>
          ))}
        </>
      )}
      {problem ? (
        <Text variant="small" accessibilityRole="alert" style={{ color: colors.fault }}>
          {problem}
        </Text>
      ) : null}
      <Button variant="ghost" label="Add a photo" busy={taking} onPress={addPhoto} />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderBottomWidth: 1 },
  iconButton: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingVertical: 14, gap: 16 },
  pad: { paddingHorizontal: 16, gap: 6 },
  gap: { gap: 10 },
  grow: { flex: 1 },
  section: { borderTopWidth: 1, borderBottomWidth: 1 },
  sectionHead: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 14, borderTopWidth: 1 },
  value: { flexShrink: 1, textAlign: 'right' },
  doc: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, padding: 12, borderWidth: 1, borderRadius: radiusLg },
});

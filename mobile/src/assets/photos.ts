import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { MAX_UPLOAD_BYTES, type LocalFile } from '@/api/assets';
import { formatSize } from './format';

export type PhotoResult = { status: 'taken'; file: LocalFile } | { status: 'cancelled' } | { status: 'problem'; message: string };

/** Opens the camera and returns the photo, kept somewhere it survives until it is uploaded. */
export async function takePhoto(assetTag: string): Promise<PhotoResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return {
      status: 'problem',
      message: permission.canAskAgain
        ? 'Allow the camera to take a photo of this asset.'
        : 'Camera access is off for Inventra. Turn it on in your phone’s Settings to add photos.',
    };
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, exif: false });
  if (result.canceled || !result.assets[0]) return { status: 'cancelled' };
  const shot = result.assets[0];
  if (shot.fileSize !== undefined && shot.fileSize > MAX_UPLOAD_BYTES) {
    return { status: 'problem', message: `This photo is ${formatSize(shot.fileSize)}. Photos can be up to 25 MB; take it again at a lower quality.` };
  }
  const type = shot.mimeType ?? 'image/jpeg';
  const extension = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const name = `${assetTag}-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
  return { status: 'taken', file: { uri: keep(shot.uri, name), name, type, sizeBytes: shot.fileSize } };
}

/**
 * The camera writes to a cache the phone may empty, so a photo waiting to be sent
 * is copied to the app's documents folder first. The web keeps the browser's own URL.
 */
function keep(uri: string, name: string): string {
  if (Platform.OS === 'web') return uri;
  try {
    const source = new File(uri);
    if (!source.exists) return uri;
    const dir = new Directory(Paths.document, 'pending-photos');
    if (!dir.exists) dir.create();
    const target = new File(dir, name);
    source.copy(target);
    return target.uri;
  } catch {
    return uri;
  }
}

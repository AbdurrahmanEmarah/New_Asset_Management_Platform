import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

/** Same key as the web apps (web/shared/theme/theme.ts). */
export const THEME_STORAGE_KEY = 'inventra.theme';

/** Out in the field the default is dark (Control Room), as in the Field app mockup. */
export const DEFAULT_MODE: ThemeMode = 'dark';

export const THEME_MODES: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function resolveTheme(mode: ThemeMode, systemScheme: string | null | undefined): ResolvedTheme {
  if (mode === 'system') return systemScheme === 'light' ? 'light' : 'dark';
  return mode;
}

export async function readStoredMode(): Promise<ThemeMode> {
  try {
    const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

export async function storeMode(mode: ThemeMode): Promise<void> {
  try {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Storage can be unavailable (private browser windows). The choice then lasts until the app closes.
  }
}
